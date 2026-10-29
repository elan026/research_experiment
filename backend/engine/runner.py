"""Guideline Layer Real-Time Engine Runner for Node.js backend.

Runs the real ETA prediction models on real ISCON-PDPU bus corridor trips,
profiled continuously by the four Guideline Layer modules:
  1. Monitoring Engine
  2. Threshold Checker
  3. Warning System
  4. Logging Module
With active closed-loop feedback support (auto-remediation / model fallback).
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

# Add project root to path
ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

import numpy as np
import pandas as pd

from data.load_real_data import load_real_trips
from guideline_layer import GuidelineConfig, GuidelineLayer
from models import MODEL_REGISTRY, TARGET_COL, load_model


class GuidelineRunner:
    def __init__(self):
        self.config = GuidelineConfig()
        self.layer = GuidelineLayer(self.config, enabled=True)
        self.active_model_name = "mlp"  # start with deep model to demonstrate breach & closed loop
        self.closed_loop_auto_remediate = True
        self.trained_models = {}
        self.test_df = None
        self.train_df = None
        self.is_running = False
        self.paused = False
        self.playback_speed_ms = 40.0
        self.current_trip_idx = 0
        self.current_stop_idx = 0
        self.total_inferences = 0
        self.total_violations = 0
        self.total_alerts = 0
        self.total_syncs = 0
        self.last_remediation = None

    def initialize(self):
        """Load real empirical data and train all models."""
        df = load_real_trips()
        trips_all = df["trip_id"].unique()
        rng = np.random.default_rng(42)
        test_trips = set(rng.choice(trips_all, size=max(1, int(len(trips_all) * 0.25)), replace=False))
        self.test_df = df[df["trip_id"].isin(test_trips)].reset_index(drop=True)
        self.train_df = df[~df["trip_id"].isin(test_trips)].reset_index(drop=True)
        y_train = self.train_df[TARGET_COL]

        for name in ["linear", "gradient_boosting", "mlp"]:
            m = load_model(name)
            m.fit(self.train_df, y_train)
            self.trained_models[name] = m

        return {
            "status": "ready",
            "train_observations": len(self.train_df),
            "test_observations": len(self.test_df),
            "total_trips": int(df["trip_id"].nunique()),
            "test_trips": len(test_trips),
            "models": list(self.trained_models.keys()),
            "active_model": self.active_model_name,
            "thresholds": self.config.thresholds.to_dict(),
        }

    def set_model(self, model_name: str):
        if model_name in self.trained_models:
            self.active_model_name = model_name
            return True, f"Active model set to {model_name}"
        return False, f"Unknown model {model_name}"

    def set_closed_loop(self, enabled: bool):
        self.closed_loop_auto_remediate = enabled
        return True, f"Closed-loop auto remediation: {'ENABLED' if enabled else 'DISABLED'}"

    def set_thresholds(self, cpu=None, ram=None, battery=None, bandwidth=None):
        if cpu is not None:
            self.config.thresholds.cpu_percent = float(cpu)
        if ram is not None:
            self.config.thresholds.ram_mb = float(ram)
        if battery is not None:
            self.config.thresholds.battery_drain_pct_hr = float(battery)
        if bandwidth is not None:
            self.config.thresholds.bandwidth_kb_per_min = float(bandwidth)
        return self.config.thresholds.to_dict()

    def run_single_inference(self, row: pd.Series):
        """Execute one real inference cycle supervised by the Guideline Layer."""
        from models import FEATURE_COLS

        model = self.trained_models[self.active_model_name]
        x = row[FEATURE_COLS].to_numpy().reshape(1, -1)
        pred_min = float(model.predict_values(x)[0])
        actual_min = float(row[TARGET_COL])
        error_s = (pred_min - actual_min) * 60.0

        # Measure baseline model footprint and timing
        x_batch = self.test_df[FEATURE_COLS].head(16).values
        model_metrics = self.layer.measure_model(model, model.predict_values, x_batch)

        # Advance sim time and register network payload
        self.layer.advance_time(self.config.inference_cadence_sec)
        self.layer.monitor.register_payload(self.layer.monitor.gps_payload_bytes())

        metrics = {
            "trip_id": int(row["trip_id"]),
            "stop_index": int(row["stop_index"]),
            "pred_min": pred_min,
            "actual_min": actual_min,
            "error_s": error_s,
            "model": self.active_model_name,
            "sim_time_sec": self.layer.sim_time_sec,
            **{k: float(v) for k, v in model_metrics.items()},
        }

        # Closed-loop evaluation
        check = self.layer.run_inference(metrics)
        self.total_inferences += 1
        violations = [v.to_dict() for v in check.violations]
        alerts = [w.to_dict() for w in check.warnings]
        self.total_violations += len(violations)
        self.total_alerts += len(alerts)

        # Cloud sync
        synced = False
        if self.layer.logger is not None and self.layer.logger.sync_counter % self.config.log_sync_every == 0:
            self.layer.monitor.register_payload(self.layer.monitor.sync_payload_bytes())
            self.total_syncs += 1
            synced = True

        remediated = False
        remediation_event = None

        # Closed-Loop Actuation: Auto-remediation if enabled
        if self.closed_loop_auto_remediate and len(alerts) > 0 and self.active_model_name == "mlp":
            # The heavy deep model breached the threshold -> Closed Loop Actuates Model Fallback
            prev_model = self.active_model_name
            self.active_model_name = "gradient_boosting"
            remediated = True
            remediation_event = {
                "action": "AUTO_MODEL_FALLBACK",
                "trigger": "CPU_THRESHOLD_BREACH",
                "from_model": prev_model,
                "to_model": "gradient_boosting",
                "reason": "CPU load exceeded 30% ceiling. Guideline Layer actuated hot-swap to lightweight GBDT.",
                "timestamp": time.time(),
            }
            self.last_remediation = remediation_event

        payload = {
            "type": "TELEMETRY_INFERENCE",
            "trip_id": int(row["trip_id"]),
            "direction": str(row.get("direction", "NB")),
            "stop_index": int(row["stop_index"]),
            "stops_remaining": int(row["stops_remaining"]),
            "dist_remaining_km": round(float(row["dist_remaining_km"]), 2),
            "avg_speed_kmh": round(float(row["avg_speed_so_far_kmh"]), 1),
            "elapsed_min": round(float(row["elapsed_min"]), 2),
            "pred_min": round(pred_min, 2),
            "actual_min": round(actual_min, 2),
            "error_s": round(error_s, 1),
            "model": self.active_model_name,
            "model_kind": model.kind,
            "metrics": {
                "cpu_percent": round(float(check.metrics.get("cpu_percent", 0.0)), 1),
                "ram_mb": round(float(check.metrics.get("model_footprint_mb", 0.0)), 3),
                "battery_drain_pct_hr": round(float(check.metrics.get("battery_drain_pct_hr", 0.0)), 2),
                "bandwidth_kb_per_min": round(float(check.metrics.get("bandwidth_kb_per_min", 0.0)), 1),
                "inference_ms": round(float(model_metrics.get("inference_ms", 0.0)), 3),
                "macs": round(float(model_metrics.get("macs_per_inference", 0.0)), 0),
            },
            "violations": violations,
            "alerts": alerts,
            "synced": synced,
            "remediated": remediated,
            "remediation_event": remediation_event,
            "closed_loop_enabled": self.closed_loop_auto_remediate,
            "totals": {
                "inferences": self.total_inferences,
                "violations": self.total_violations,
                "alerts": self.total_alerts,
                "syncs": self.total_syncs,
            },
        }
        return payload


def main():
    runner = GuidelineRunner()
    init_res = runner.initialize()
    print(json.dumps({"type": "INIT_DONE", "data": init_res}), flush=True)

    # Process standard input line by line for commands
    import threading

    def command_listener():
        while True:
            try:
                line = sys.stdin.readline()
                if not line:
                    break
                cmd = json.loads(line.strip())
                action = cmd.get("action")
                if action == "SET_MODEL":
                    ok, msg = runner.set_model(cmd.get("model"))
                    print(json.dumps({"type": "ACK", "action": action, "ok": ok, "message": msg}), flush=True)
                elif action == "SET_CLOSED_LOOP":
                    ok, msg = runner.set_closed_loop(bool(cmd.get("enabled", True)))
                    print(json.dumps({"type": "ACK", "action": action, "ok": ok, "message": msg}), flush=True)
                elif action == "SET_THRESHOLDS":
                    th = runner.set_thresholds(
                        cpu=cmd.get("cpu"),
                        ram=cmd.get("ram"),
                        battery=cmd.get("battery"),
                        bandwidth=cmd.get("bandwidth")
                    )
                    print(json.dumps({"type": "ACK", "action": action, "ok": True, "thresholds": th}), flush=True)
                elif action == "SET_SPEED":
                    runner.playback_speed_ms = float(cmd.get("speed_ms", 40.0))
                    print(json.dumps({"type": "ACK", "action": action, "ok": True}), flush=True)
                elif action == "PAUSE":
                    runner.paused = True
                    print(json.dumps({"type": "ACK", "action": action, "ok": True}), flush=True)
                elif action == "RESUME":
                    runner.paused = False
                    print(json.dumps({"type": "ACK", "action": action, "ok": True}), flush=True)
                elif action == "STOP":
                    runner.is_running = False
                    print(json.dumps({"type": "ACK", "action": action, "ok": True}), flush=True)
            except Exception as e:
                print(json.dumps({"type": "ERROR", "error": str(e)}), flush=True)

    t = threading.Thread(target=command_listener, daemon=True)
    t.start()

    # Continuous telemetry stream loop across test trips
    runner.is_running = True
    trips = list(runner.test_df.groupby("trip_id", sort=False))

    while runner.is_running:
        for trip_idx, (trip_id, trip) in enumerate(trips, 1):
            if not runner.is_running:
                break
            runner.layer.monitor.reset_counters()
            print(json.dumps({
                "type": "TRIP_START",
                "trip_id": int(trip_id),
                "trip_index": trip_idx,
                "trips_total": len(trips),
                "n_stops": len(trip),
            }), flush=True)

            for _, row in trip.iterrows():
                while runner.paused and runner.is_running:
                    time.sleep(0.1)
                if not runner.is_running:
                    break

                res = runner.run_single_inference(row)
                print(json.dumps(res), flush=True)

                if runner.playback_speed_ms > 0:
                    time.sleep(runner.playback_speed_ms / 1000.0)

        # Loop continuously like a live fleet feed
        time.sleep(1.0)


if __name__ == "__main__":
    main()

