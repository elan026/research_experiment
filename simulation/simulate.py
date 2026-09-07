"""Bus-trip simulation with the Guideline Layer running alongside the ETA model.

Mirrors the paper's workflow (Section VI-B): at each stop the ETA model
predicts remaining time to the terminal while the four Guideline Layer modules
run in parallel - monitoring resources, checking thresholds, raising warnings
and logging every inference cycle. Each model is also simulated with the layer
disabled to quantify the layer's own overhead (it must be negligible, since
the layer "enforces resource-aware design without requiring changes to the
underlying prediction model").
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Callable

import numpy as np
import pandas as pd

from guideline_layer import GuidelineConfig, GuidelineLayer
from models import EtaModel, FEATURE_COLS, TARGET_COL


@dataclass
class SimulationResult:
    model_name: str
    layer_enabled: bool
    n_inferences: int = 0
    wall_seconds: float = 0.0
    metrics: list[dict] = field(default_factory=list)
    warnings: list[dict] = field(default_factory=list)
    pred_min: list[float] = field(default_factory=list)
    actual_min: list[float] = field(default_factory=list)

    def accuracy(self) -> dict:
        y = np.asarray(self.actual_min) * 60.0
        p = np.asarray(self.pred_min) * 60.0
        err = y - p
        mae = float(np.mean(np.abs(err)))
        rmse = float(np.sqrt(np.mean(err**2)))
        ss_res = float(np.sum(err**2))
        ss_tot = float(np.sum((y - np.mean(y)) ** 2))
        r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0
        return {"mae_s": mae, "rmse_s": rmse, "r2": r2}


def simulate_model(
    model: EtaModel,
    test_df: pd.DataFrame,
    config: GuidelineConfig,
    layer_enabled: bool = True,
    layer: GuidelineLayer | None = None,
    on_event: Callable[[dict], None] | None = None,
) -> SimulationResult:
    """Run every test trip through the model, one inference per stop.

    `on_event` (optional) is called with a JSON-safe event dict for every
    observable step (profiling, trip start, per-stop inference with its
    violations/alerts, cloud syncs) so a live dashboard can mirror the
    simulation as it happens. Defaults to None - the CLI stays untouched.
    """
    result = SimulationResult(model_name=model.name, layer_enabled=layer_enabled)

    def emit(kind: str, **payload) -> None:
        if on_event is not None:
            on_event({"kind": kind, "model": model.name, "model_kind": model.kind,
                      "model_desc": model.description, **payload})

    if layer is None:
        layer = GuidelineLayer(config, enabled=layer_enabled)

    # per-model profiling: footprint + burst timing (real measurements)
    x_batch = test_df[FEATURE_COLS].head(16).values
    model_metrics = layer.measure_model(model, model.predict_values, x_batch)
    emit("profile", metrics={
        "model_footprint_mb": round(float(model_metrics["model_footprint_mb"]), 3),
        "inference_ms": round(float(model_metrics["inference_ms"]), 3),
        "burst_cpu_percent": round(float(model_metrics["burst_cpu_percent"]), 1),
        "macs_per_inference": round(float(model_metrics["macs_per_inference"]), 0),
        "cpu_percent": round(float(model_metrics["cpu_percent"]), 1),
        "battery_drain_pct_hr": round(float(model_metrics["battery_drain_pct_hr"]), 1),
    })

    t0 = time.perf_counter()

    trips = list(test_df.groupby("trip_id", sort=False))
    for trip_index, (trip_id, trip) in enumerate(trips, start=1):
        layer.monitor.reset_counters()
        n_stops = len(trip)
        emit("trip_start", trip_id=int(trip_id), trip_index=trip_index,
             trips_total=len(trips), n_stops=n_stops)
        sim_elapsed = 0.0
        for _, stop in trip.iterrows():
            x = stop[FEATURE_COLS].to_numpy().reshape(1, -1)
            pred = float(model.predict_values(x)[0])
            actual = float(stop[TARGET_COL])

            # sim-time between stops: this stop's segment duration (approx.
            # from the trip's elapsed progression) - use a fixed cadence step
            # for the resource model.
            layer.advance_time(config.inference_cadence_sec)
            sim_elapsed += config.inference_cadence_sec

            # register network payload for this inference cycle
            layer.monitor.register_payload(layer.monitor.gps_payload_bytes())

            metrics = {
                "trip_id": int(trip_id),
                "stop_index": int(stop["stop_index"]),
                "pred_min": pred,
                "actual_min": actual,
                "error_s": (pred - actual) * 60.0,
                "model": model.name,
                "sim_time_sec": layer.sim_time_sec,
                **{k: float(v) for k, v in model_metrics.items()},
            }
            check = layer.run_inference(metrics)

            result.metrics.append(check.metrics)
            result.pred_min.append(pred)
            result.actual_min.append(actual)
            for ev in check.warnings:
                result.warnings.append(ev.to_dict())

            # periodic cloud sync payload
            synced = bool(metrics.get("synced", False))
            if layer.logger is not None and layer.logger.sync_counter % config.log_sync_every == 0:
                layer.monitor.register_payload(layer.monitor.sync_payload_bytes())

            emit("inference",
                 trip_id=int(trip_id), trip_index=trip_index, trips_total=len(trips),
                 stop_index=int(stop["stop_index"]), n_stops=n_stops,
                 pred_min=round(pred, 2), actual_min=round(actual, 2),
                 error_s=round((pred - actual) * 60.0, 1),
                 sim_time_sec=round(layer.sim_time_sec, 0),
                 cpu_percent=round(float(metrics.get("cpu_percent", 0.0)), 1),
                 battery_drain_pct_hr=round(float(metrics.get("battery_drain_pct_hr", 0.0)), 2),
                 bandwidth_kb_per_min=round(float(metrics.get("bandwidth_kb_per_min", 0.0)), 1),
                 model_footprint_mb=round(float(metrics.get("model_footprint_mb", 0.0)), 3),
                 inference_ms=round(float(model_metrics["inference_ms"]), 3),
                 violations=[v.to_dict() for v in check.violations],
                 alerts=[w.to_dict() for w in check.warnings],
                 synced=synced,
                 )

    result.wall_seconds = time.perf_counter() - t0
    result.n_inferences = len(result.metrics)
    return result


def simulate_with_and_without(
    model: EtaModel,
    test_df: pd.DataFrame,
    config: GuidelineConfig,
) -> tuple[SimulationResult, SimulationResult]:
    """Run the simulation twice: layer enabled and disabled (overhead check)."""
    layer = GuidelineLayer(config, enabled=True)
    with_layer = simulate_model(model, test_df, config, layer_enabled=True, layer=layer)
    # fresh layer so logs are not double-written
    without_layer = simulate_model(model, test_df, config, layer_enabled=False)
    return with_layer, without_layer