"""Aggregate simulation results into per-model summary tables.

Produces the numbers behind the paper's comparison story: each model's
accuracy (MAE/RMSE/R2) alongside its profiled resource usage (CPU, RAM,
battery, bandwidth) and its threshold violations / warnings - the resource
report that the Guideline Layer emits alongside the ETA prediction
(paper Section VI-B, Output Stage).
"""

from __future__ import annotations

import csv
from pathlib import Path

import numpy as np

from simulation import SimulationResult


def summarize_run(results: list[SimulationResult]) -> list[dict]:
    """One summary row per (model, layer-enabled) simulation."""
    rows = []
    for r in results:
        acc = r.accuracy()
        cpu = [m.get("cpu_percent", 0.0) for m in r.metrics]
        bat = [m.get("battery_drain_pct_hr", 0.0) for m in r.metrics]
        bw = [m.get("bandwidth_kb_per_min", 0.0) for m in r.metrics]
        fp = [m.get("model_footprint_mb", 0.0) for m in r.metrics]
        n_viol = sum(len(m.get("violations", [])) for m in r.metrics)
        rows.append({
            "model": r.model_name,
            "layer": "on" if r.layer_enabled else "off",
            "n_inferences": r.n_inferences,
            "wall_sec": round(r.wall_seconds, 3),
            "mae_s": round(acc["mae_s"], 2),
            "rmse_s": round(acc["rmse_s"], 2),
            "r2": round(acc["r2"], 4),
            "cpu_percent_avg": round(float(np.mean(cpu)), 2),
            "cpu_percent_max": round(float(np.max(cpu)), 2),
            "ram_model_mb": round(float(np.mean(fp)), 3),
            "battery_pct_hr": round(float(np.mean(bat)), 2),
            "bandwidth_kb_per_min": round(float(np.mean(bw)), 2),
            "violations": n_viol,
            "warnings": len(r.warnings),
        })
    return rows


def write_summary_csv(rows: list[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    cols = list(rows[0].keys())
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)


def accuracy_columns(rows: list[dict]) -> dict[str, dict]:
    """Accuracy + resource figures per model, layer-on runs only."""
    out = {}
    for r in rows:
        if r["layer"] == "on":
            out[r["model"]] = r
    return out