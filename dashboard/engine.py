"""Live simulation engine for the dashboard.

Runs the *real* PoC pipeline - synthetic data -> model training -> per-model
profiling -> trip-by-trip simulation with the Guideline Layer closed loop
(guideline_layer/layer.run_inference) - inside a background worker thread.

Every observable step is pushed into a thread-safe event deque:

    data_start / data_done        dataset generation + train/test split
    train_start / train_done      training each ETA model
    model_start                   about to simulate this model
    profile                       real footprint / latency measurements
    trip_start                    a new bus trip begins
    inference                     one inference cycle (with violations/alerts)
    model_done                    per-model accuracy summary
    run_done                      full run summary rows (from analysis.summarize_run)
    status / error / stopped      lifecycle messages

The FastAPI layer drains the deque on its event loop and applies each event to
`self.state`, so all shared state is mutated from a single (asyncio) thread and
no locks are needed for the REST/WebSocket reads.
"""

from __future__ import annotations

import shutil
import threading
import time
from collections import deque
from pathlib import Path
from typing import Any, Callable, Optional

import numpy as np

from analysis.analyze import summarize_run
from data.make_data import N_STOPS, generate_trips
from guideline_layer import GuidelineConfig
from models import MODEL_REGISTRY, TARGET_COL, load_model
from simulation import simulate_model

ROOT = Path(__file__).resolve().parent.parent
RES_DIR = ROOT / "results" / "dashboard"

# --------------------------------------------------------------------------
# Dataset presets exposed in the UI (days x trips/day of synthetic data).
# "quick" is a plumbing check - the tiny dataset cannot train the deep MLP
# well, so it is omitted there by default.
# --------------------------------------------------------------------------
PRESETS: dict[str, dict] = {
    "quick": {
        "label": "Quick (plumbing check)",
        "days": 3, "trips": 4, "seed": 42, "speed_ms": 20,
        "models": ["linear", "gradient_boosting"],
    },
    "demo": {
        "label": "Demo (recommended)",
        "days": 10, "trips": 10, "seed": 42, "speed_ms": 40,
        "models": ["linear", "gradient_boosting", "mlp"],
    },
    "full": {
        "label": "Full benchmark",
        "days": 20, "trips": 14, "seed": 42, "speed_ms": 0,
        "models": ["linear", "gradient_boosting", "mlp"],
    },
}

# Plain-language names used in the narration sentences.
METRIC_LABELS = {
    "cpu_percent": "CPU load",
    "ram_mb": "model memory",
    "battery_drain_pct_hr": "battery drain",
    "bandwidth_kb_per_min": "network bandwidth",
}


class _StopRun(Exception):
    """Raised inside the worker to abort a simulation cleanly."""


def _new_model_state(name: str) -> dict:
    meta = MODEL_REGISTRY[name]
    return {
        "name": name,
        "kind": meta.kind,
        "desc": meta.description,
        "finished": False,
        "inferences": 0,
        "violations": 0,
        "alerts": 0,
        "syncs": 0,
        "trip_id": None,
        "trip_index": 0,
        "trips_total": 0,
        "stop_index": 0,
        "n_stops": N_STOPS,
        "cpu_last": 0.0,
        "ram_last": 0.0,
        "battery_last": 0.0,
        "bw_last": 0.0,
        "inference_ms_last": 0.0,
        "sum_abs_err": 0.0,
        "rolling_mae_s": 0.0,
        "cpu_series": [],
        "err_series": [],
        "profile": None,
        "accuracy": None,
        "message": "",
    }


def _fresh_state() -> dict:
    cfg = GuidelineConfig()
    t = cfg.thresholds
    return {
        "status": "idle",           # idle | running | done | error | stopped
        "message": "Nothing has run yet. Open the **Live Run** tab and press Start.",
        "stage": 0,                 # 0 idle, 1 dataset, 2 training, 3 simulating, 4 done
        "params": None,
        "thresholds": {
            "cpu_percent": {"limit": t.cpu_percent, "unit": "%"},
            "ram_mb": {"limit": t.ram_mb, "unit": "MB"},
            "battery_drain_pct_hr": {"limit": t.battery_drain_pct_hr, "unit": "%/hr"},
            "bandwidth_kb_per_min": {"limit": t.bandwidth_kb_per_min, "unit": "KB/min"},
        },
        "config": {
            "device_name": cfg.device_name,
            "inference_cadence_sec": cfg.inference_cadence_sec,
            "warning_cooldown_sec": cfg.warning_cooldown_sec,
            "log_sync_every": cfg.log_sync_every,
            "cpu_macs_scale": cfg.cpu_macs_scale,
        },
        "registry": [
            {"name": n, "kind": MODEL_REGISTRY[n].kind, "desc": MODEL_REGISTRY[n].description}
            for n in MODEL_REGISTRY
        ],
        "data": None,
        "expected_inferences": 0,
        "trained": [],
        "current_model": None,
        "models": {},
        "totals": {"inferences": 0, "violations": 0, "alerts": 0, "syncs": 0,
                   "log_records": 0},
        "results": None,
        "wall_sec": None,
        "error": None,
        "stopped_at_model": None,
        "artifacts": {
            "logs_dir": str(RES_DIR / "logs"),
            "cloud_dir": str(RES_DIR / "cloud"),
            "inferences_path": str(RES_DIR / "logs" / "inferences.jsonl"),
            "warnings_path": str(RES_DIR / "logs" / "warnings.jsonl"),
            "cloud_path": str(RES_DIR / "cloud" / "fleet_log.csv"),
        },
    }


class RunEngine:
    """Owns the worker thread and the event deque; state is applied by the
    asyncio loop (see `drain`/`apply`) so REST+WS reads never race."""

    def __init__(self) -> None:
        self._events: deque = deque()
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self.state = _fresh_state()

    # ------------------------------------------------------------- control
    def start(self, params: dict) -> tuple[bool, str]:
        with threading.Lock():
            busy = self._thread is not None and self._thread.is_alive()
        if busy:
            return False, "A simulation is already running - stop it first."
        self._stop.clear()
        self.state = _fresh_state()
        self.state["status"] = "running"
        self.state["params"] = dict(params)
        self._thread = threading.Thread(
            target=self._worker, args=(params,), daemon=True, name="dash-sim"
        )
        self._thread.start()
        return True, ""

    def request_stop(self) -> None:
        self._stop.set()

    def _emit(self, ev: dict, throttle_ms: float = 0.0) -> None:
        if self._stop.is_set():
            raise _StopRun
        self._events.append(ev)
        if throttle_ms > 0 and ev["kind"] == "inference":
            time.sleep(throttle_ms / 1000.0)

    # ------------------------------------------------------------ the run
    def _worker(self, params: dict) -> None:
        self._t0 = time.perf_counter()
        models = list(params["models"])
        days, trips, seed = int(params["days"]), int(params["trips"]), int(params["seed"])
        speed_ms = float(params.get("speed_ms", 0))
        try:
            emit = lambda ev: self._emit(ev, speed_ms)  # noqa: E731

            cfg = GuidelineConfig()
            cfg.results_dir = RES_DIR
            cfg.cloud_dir = RES_DIR / "cloud"
            if RES_DIR.exists():
                shutil.rmtree(RES_DIR)
            RES_DIR.mkdir(parents=True, exist_ok=True)

            emit({"kind": "data_start", "text":
                  f"Step 1/4 - generating {days} days x {trips} trips/day of "
                  f"synthetic bus data (seed {seed})..."})
            df = generate_trips(days, trips, seed)
            rng = np.random.default_rng(seed)
            trips_all = df["trip_id"].unique()
            test_trips = set(rng.choice(
                trips_all, size=int(len(trips_all) * 0.2), replace=False))
            test_df = df[df["trip_id"].isin(test_trips)].reset_index(drop=True)
            train_df = df[~df["trip_id"].isin(test_trips)].reset_index(drop=True)
            y_train = train_df[TARGET_COL]
            n_test_trips = len(test_trips)
            emit({"kind": "data_done", "text":
                  f"Dataset ready: {len(train_df)} training observations across "
                  f"{len(trips_all) - n_test_trips} trips; {len(test_df)} "
                  f"held-out test observations across {n_test_trips} trips. "
                  "The models have never seen the test trips - that is how we "
                  "measure real prediction error.",
                  "train_n": int(len(train_df)), "test_n": int(len(test_df)),
                  "n_test_trips": n_test_trips,
                  "expected_inferences": n_test_trips * N_STOPS * len(models),
                  "days": days, "trips": trips, "seed": seed,
                  "total_trips": int(len(trips_all))})

            trained = {}
            for name in models:
                emit({"kind": "train_start", "model": name,
                      "text": f"Step 2/4 - training the {name} model on "
                              f"{len(train_df)} historical observations..."})
                m = load_model(name)
                m.fit(train_df, y_train)
                trained[name] = m
                emit({"kind": "train_done", "model": name,
                      "text": f"{name} model trained. Training happens on the "
                              "laptop; only the finished model would be "
                              "deployed to the bus's onboard device."})

            results = []
            for idx, name in enumerate(models, start=1):
                emit({"kind": "model_start", "model": name,
                      "text": f"Step 3/4 - simulating {n_test_trips} unseen "
                              f"trips with the **{name}** model and the "
                              "Guideline Layer watching every prediction...",
                      "model_index": idx, "models_total": len(models)})
                result = simulate_model(
                    trained[name], test_df, cfg, layer_enabled=True,
                    on_event=emit)
                results.append(result)
                acc = result.accuracy()
                emit({"kind": "model_done", "model": name,
                      "text": f"{name} finished: mean error "
                              f"{acc['mae_s']:.0f} s over {result.n_inferences} "
                              "predictions.",
                      "n_inferences": int(result.n_inferences),
                      "mae_s": round(acc["mae_s"], 1),
                      "rmse_s": round(acc["rmse_s"], 1),
                      "r2": round(acc["r2"], 3),
                      "wall_sec": round(result.wall_seconds, 2)})

            rows = summarize_run(results)
            for row in rows:
                meta = MODEL_REGISTRY.get(row["model"])
                if meta:
                    row["kind"] = meta.kind
                    row["desc"] = meta.description
            wall = time.perf_counter() - self._t0
            emit({"kind": "run_done", "rows": rows,
                  "wall_sec": round(wall, 1),
                  "text": "Simulation complete. The Results tab summarises "
                          "what happened for every model."})
            emit({"kind": "status", "status": "done", "text": "Run finished."})
        except _StopRun:
            self._events.append({"kind": "stopped", "text": "Run stopped by the user."})
        except Exception as exc:  # noqa: BLE001 - surface anything to the UI
            import traceback
            self._events.append({"kind": "error",
                                 "text": f"The Python simulation failed: {exc}",
                                 "message": str(exc),
                                 "detail": traceback.format_exc()})

    # --------------------------------------------------- asyncio-side API
    def drain(self, max_n: int = 300) -> list[dict]:
        out: list[dict] = []
        while out.__len__() < max_n:
            try:
                out.append(self._events.popleft())
            except IndexError:
                break
        return out

    def snapshot(self) -> dict:
        return self.state

    # ------------------------------------------------------- state reducer
    def apply(self, ev: dict) -> None:
        s = self.state
        kind = ev["kind"]
        text = ev.get("text")
        if text:
            s["message"] = text

        if kind == "data_start":
            s["stage"] = 1
        elif kind == "data_done":
            s["data"] = {"train_n": ev["train_n"], "test_n": ev["test_n"],
                         "n_test_trips": ev["n_test_trips"],
                         "total_trips": ev["total_trips"],
                         "days": ev["days"], "trips": ev["trips"], "seed": ev["seed"]}
            s["expected_inferences"] = int(ev["expected_inferences"])
        elif kind == "train_start":
            s["stage"] = 2
        elif kind == "train_done":
            if ev["model"] not in s["trained"]:
                s["trained"].append(ev["model"])
        elif kind == "model_start":
            s["stage"] = 3
            s["current_model"] = ev["model"]
            s["models"][ev["model"]] = _new_model_state(ev["model"])
            s["stopped_at_model"] = None
        elif kind == "profile":
            st = s["models"].get(ev["model"])
            if st:
                st["profile"] = ev["metrics"]
                st["cpu_last"] = ev["metrics"]["cpu_percent"]
                st["battery_last"] = ev["metrics"]["battery_drain_pct_hr"]
                st["ram_last"] = ev["metrics"]["model_footprint_mb"]
                st["message"] = text
        elif kind == "trip_start":
            st = s["models"].get(ev["model"])
            if st:
                st["trip_id"] = ev["trip_id"]
                st["trip_index"] = ev["trip_index"]
                st["trips_total"] = ev["trips_total"]
                st["stop_index"] = -1
                st["n_stops"] = ev["n_stops"]
        elif kind == "inference":
            self._apply_inference(s, ev)
        elif kind == "model_done":
            st = s["models"].get(ev["model"])
            if st:
                st["finished"] = True
                st["accuracy"] = {"mae_s": ev["mae_s"], "rmse_s": ev["rmse_s"],
                                  "r2": ev["r2"], "wall_sec": ev["wall_sec"],
                                  "n_inferences": ev["n_inferences"]}
            if s["current_model"] == ev["model"]:
                s["current_model"] = None
        elif kind == "run_done":
            s["results"] = ev["rows"]
            s["wall_sec"] = ev["wall_sec"]
            s["stage"] = 4
        elif kind == "status":
            if ev.get("status"):
                s["status"] = ev["status"]
        elif kind == "error":
            s["status"] = "error"
            s["error"] = {"message": ev.get("message"), "detail": ev.get("detail")}
        elif kind == "stopped":
            s["status"] = "stopped"
            s["stage"] = max(s["stage"] - 1, 0)
            s["stopped_at_model"] = s["current_model"]

    def _apply_inference(self, s: dict, ev: dict) -> None:
        name = ev["model"]
        st = s["models"].setdefault(name, _new_model_state(name))
        tot = s["totals"]

        st["inferences"] += 1
        tot["inferences"] += 1
        tot["log_records"] += 1
        n_viol = len(ev["violations"])
        n_alert = len(ev["alerts"])
        st["violations"] += n_viol
        tot["violations"] += n_viol
        st["alerts"] += n_alert
        tot["alerts"] += n_alert
        tot["log_records"] += n_alert
        if ev["synced"]:
            st["syncs"] += 1
            tot["syncs"] += 1
        st["log_records"] = st["inferences"] + st["alerts"]

        st["trip_id"] = ev["trip_id"]
        st["trip_index"] = ev["trip_index"]
        st["trips_total"] = ev["trips_total"]
        st["stop_index"] = ev["stop_index"]
        st["n_stops"] = ev["n_stops"]
        st["cpu_last"] = ev["cpu_percent"]
        st["ram_last"] = ev["model_footprint_mb"]
        st["battery_last"] = ev["battery_drain_pct_hr"]
        st["bw_last"] = ev["bandwidth_kb_per_min"]
        st["inference_ms_last"] = ev["inference_ms"]
        st["sum_abs_err"] += abs(ev["error_s"])
        st["rolling_mae_s"] = st["sum_abs_err"] / st["inferences"]
        if len(st["cpu_series"]) < 4000:
            st["cpu_series"].append(ev["cpu_percent"])
            st["err_series"].append(round(ev["error_s"], 1))
