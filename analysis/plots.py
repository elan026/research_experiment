"""Plot generation for the PoC results.

Four figures, each mapped to a claim in the paper:
  1. eta_prediction.png      - accuracy of the ETA model (pred vs actual)
  2. resource_time_series.png- Monitoring Engine output over a trip, threshold
                               lines + violation markers (closed loop in action)
  3. model_comparison.png    - accuracy vs resource usage across models
  4. warnings.png            - threshold violations and alerts per model
"""

from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # headless-safe (no display needed)
import matplotlib.pyplot as plt
import numpy as np

from simulation import SimulationResult


def _style() -> None:
    plt.rcParams.update({
        "figure.dpi": 110,
        "font.size": 10,
        "axes.grid": True,
        "grid.alpha": 0.3,
        "axes.spines.top": False,
        "axes.spines.right": False,
    })


def plot_eta_prediction(result: SimulationResult, out_dir: Path) -> Path:
    _style()
    fig, ax = plt.subplots(figsize=(6.2, 5))
    actual = np.asarray(result.actual_min)
    pred = np.asarray(result.pred_min)
    acc = result.accuracy()
    ax.scatter(actual, pred, s=9, alpha=0.35, color="#1f77b4")
    lim = [0, max(actual.max(), pred.max()) * 1.05]
    ax.plot(lim, lim, "r--", lw=1.2, label="perfect prediction")
    ax.set_xlabel("Actual remaining time (min)")
    ax.set_ylabel("Predicted remaining time (min)")
    ax.set_title(f"ETA accuracy - {result.model_name} (layer {'on' if result.layer_enabled else 'off'})")
    ax.text(
        0.97, 0.03,
        f"MAE = {acc['mae_s']:.1f} s\nRMSE = {acc['rmse_s']:.1f} s\nR² = {acc['r2']:.3f}",
        transform=ax.transAxes, ha="right", va="bottom",
        bbox=dict(boxstyle="round", fc="white", alpha=0.85),
    )
    ax.set_xlim(lim)
    ax.set_ylim(lim)
    ax.legend(loc="upper left")
    fig.tight_layout()
    path = out_dir / "eta_prediction.png"
    fig.savefig(path)
    plt.close(fig)
    return path


def plot_resource_time_series(
    result: SimulationResult, cpu_threshold: float, bat_threshold: float, out_dir: Path
) -> Path:
    _style()
    m = result.metrics
    if not m:
        raise ValueError("no metrics to plot")
    cpu = [x.get("cpu_percent", 0.0) for x in m]
    bat = [x.get("battery_drain_pct_hr", 0.0) for x in m]
    ram = [x.get("model_footprint_mb", 0.0) for x in m]
    stop = [x["stop_index"] for x in m]
    viol_stops = [x["stop_index"] for x in m if x.get("violations")]
    viol_cpu = [x["cpu_percent"] for x in m if x.get("violations")]

    fig, axes = plt.subplots(3, 1, figsize=(9, 8), sharex=True)
    axes[0].plot(stop, cpu, color="#d62728", lw=1.4, label="sustained CPU %")
    axes[0].axhline(cpu_threshold, color="k", ls="--", lw=1, label=f"threshold {cpu_threshold:.0f}%")
    if viol_stops:
        axes[0].scatter(viol_stops, viol_cpu, marker="v", s=60, color="darkred", zorder=5, label="violation")
    axes[0].set_ylabel("CPU load (%)")
    axes[0].legend(loc="upper right", fontsize=8)
    axes[0].set_title(f"Guideline Layer monitoring - {result.model_name} (every inference cycle)")

    axes[1].plot(stop, bat, color="#ff7f0e", lw=1.4, label="battery drain %/hr")
    axes[1].axhline(bat_threshold, color="k", ls="--", lw=1, label=f"threshold {bat_threshold:.0f}%/hr")
    axes[1].set_ylabel("Battery drain (%/hr)")
    axes[1].legend(loc="upper right", fontsize=8)

    axes[2].plot(stop, ram, color="#2ca02c", lw=1.4, label="model footprint MB")
    axes[2].set_ylabel("Model RAM (MB)")
    axes[2].set_xlabel("Stop index along route")
    axes[2].legend(loc="upper right", fontsize=8)

    fig.tight_layout()
    path = out_dir / "resource_time_series.png"
    fig.savefig(path)
    plt.close(fig)
    return path


def plot_model_comparison(rows: list[dict], out_dir: Path) -> Path:
    """Grouped bars: accuracy and resource usage per model (layer-on runs)."""
    _style()
    on = [r for r in rows if r["layer"] == "on"]
    names = [r["model"] for r in on]

    fig, axes = plt.subplots(2, 2, figsize=(10, 7))
    # accuracy
    mae = [r["mae_s"] for r in on]
    axes[0, 0].bar(names, mae, color="#1f77b4")
    axes[0, 0].set_title("ETA accuracy (lower is better)")
    axes[0, 0].set_ylabel("MAE (s)")
    for i, v in enumerate(mae):
        axes[0, 0].text(i, v, f"{v:.1f}", ha="center", va="bottom", fontsize=9)
    # CPU
    cpu = [r["cpu_percent_avg"] for r in on]
    axes[0, 1].bar(names, cpu, color="#d62728")
    axes[0, 1].axhline(30.0, color="k", ls="--", lw=1, label="paper threshold 30%")
    axes[0, 1].set_title("Sustained CPU load (device model)")
    axes[0, 1].set_ylabel("CPU %")
    axes[0, 1].legend(fontsize=8)
    for i, v in enumerate(cpu):
        axes[0, 1].text(i, v, f"{v:.1f}", ha="center", va="bottom", fontsize=9)
    # RAM
    ram = [r["ram_model_mb"] for r in on]
    axes[1, 0].bar(names, ram, color="#2ca02c")
    axes[1, 0].set_title("Model memory footprint")
    axes[1, 0].set_ylabel("MB (serialized size)")
    for i, v in enumerate(ram):
        axes[1, 0].text(i, v, f"{v:.3f}", ha="center", va="bottom", fontsize=9)
    # bandwidth
    bw = [r["bandwidth_kb_per_min"] for r in on]
    axes[1, 1].bar(names, bw, color="#9467bd")
    axes[1, 1].set_title("Bandwidth (simulated payloads)")
    axes[1, 1].set_ylabel("KB/min")
    for i, v in enumerate(bw):
        axes[1, 1].text(i, v, f"{v:.2f}", ha="center", va="bottom", fontsize=9)

    fig.suptitle("Model comparison: accuracy vs resource profile (Guideline Layer ON)", y=1.0)
    fig.tight_layout()
    path = out_dir / "model_comparison.png"
    fig.savefig(path, bbox_inches="tight")
    plt.close(fig)
    return path


def plot_warnings(rows: list[dict], out_dir: Path) -> Path:
    _style()
    on = [r for r in rows if r["layer"] == "on"]
    names = [r["model"] for r in on]
    viol = [r["violations"] for r in on]
    warns = [r["warnings"] for r in on]

    fig, ax = plt.subplots(figsize=(7, 4.5))
    x = np.arange(len(names))
    w = 0.35
    ax.bar(x - w / 2, viol, w, label="threshold violations", color="#d62728")
    ax.bar(x + w / 2, warns, w, label="alerts raised (post-cooldown)", color="#ff7f0e")
    ax.set_xticks(x)
    ax.set_xticklabels(names)
    ax.set_ylabel("count")
    ax.set_title("Guideline Layer in action: violations detected, alerts raised")
    ax.legend()
    fig.tight_layout()
    path = out_dir / "warnings.png"
    fig.savefig(path)
    plt.close(fig)
    return path