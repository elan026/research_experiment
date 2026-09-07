"""One-command experiment runner for the Guideline Layer PoC.

    python run_experiment.py            # full run
    python run_experiment.py --quick    # small data, fast iteration
    python run_experiment.py --models linear,mlp --seed 7

Pipeline (mirrors paper Section VI-B):
  data -> train ETA models -> simulate trips with Guideline Layer ON/OFF
        -> analyse resources & accuracy -> plots -> results/report.md
"""

from __future__ import annotations

import argparse
import shutil
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

import pandas as pd  # noqa: E402

from analysis.analyze import summarize_run, write_summary_csv  # noqa: E402
from analysis.plots import (  # noqa: E402
    plot_eta_prediction,
    plot_model_comparison,
    plot_resource_time_series,
    plot_warnings,
)
from analysis.report import generate_html_gallery, generate_report  # noqa: E402
from data.make_data import generate_trips  # noqa: E402
from guideline_layer import GuidelineConfig  # noqa: E402
from models import MODEL_REGISTRY, TARGET_COL, load_model  # noqa: E402
from models.eta_models import MLP_HIDDEN_DEFAULT, build_mlp  # noqa: E402
from simulation import simulate_with_and_without  # noqa: E402


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--quick", action="store_true",
                   help="small data + fewer boosting iterations for fast iteration")
    p.add_argument("--days", type=int, default=None, help="days of synthetic data")
    p.add_argument("--trips", type=int, default=None, help="trips per day")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--models", type=str, default="linear,gradient_boosting,mlp",
                   help="comma-separated models from: " + ",".join(MODEL_REGISTRY))
    p.add_argument("--cpu-threshold", type=float, default=None,
                   help="override the paper's 30% CPU threshold")
    p.add_argument("--macs-scale", type=float, default=None,
                   help="override cpu_macs_scale (device CPU calibration)")
    p.add_argument("--out", type=Path, default=ROOT / "results" / "latest",
                   help="output directory (default: results/latest)")
    return p.parse_args()


def main() -> None:
    args = parse_args()

    days = args.days or (5 if args.quick else 30)
    trips = args.trips or (8 if args.quick else 16)

    # quick mode is for plumbing checks: the tiny dataset cannot train a useful
    # deep model, so skip mlp unless the user explicitly asks for it.
    if args.quick and args.models == "linear,gradient_boosting,mlp":
        args.models = "linear,gradient_boosting"

    models = [m.strip() for m in args.models.split(",") if m.strip()]
    for m in models:
        if m not in MODEL_REGISTRY:
            raise SystemExit(f"Unknown model '{m}'. Available: {list(MODEL_REGISTRY)}")
    _ = (MLP_HIDDEN_DEFAULT, build_mlp)  # keep imports meaningful

    config = GuidelineConfig()
    if args.cpu_threshold is not None:
        config.thresholds.cpu_percent = args.cpu_threshold
    if args.macs_scale is not None:
        config.cpu_macs_scale = args.macs_scale
    config.results_dir = args.out
    config.cloud_dir = args.out / "cloud"

    # fresh output directory BEFORE the simulation writes its logs
    if args.out.exists():
        shutil.rmtree(args.out)
    args.out.mkdir(parents=True, exist_ok=True)

    t0 = time.perf_counter()

    # ---------------------------------------------------------------- data
    print(f"[1/5] Generating synthetic data ({days} days x {trips} trips/day)...")
    df = generate_trips(days, trips, args.seed)

    # split by trip to avoid leakage
    trips_all = df["trip_id"].unique()
    rng = __import__("numpy").random.default_rng(args.seed)
    test_trips = set(rng.choice(trips_all, size=int(len(trips_all) * 0.2), replace=False))
    test_df = df[df["trip_id"].isin(test_trips)].reset_index(drop=True)
    train_df = df[~df["trip_id"].isin(test_trips)].reset_index(drop=True)
    y_train = train_df[TARGET_COL]
    print(f"       {len(train_df)} train / {len(test_df)} test stop-observations")

    # --------------------------------------------------------------- train
    print("[2/5] Training ETA models...")
    trained = {}
    for name in models:
        model = load_model(name)
        model.fit(train_df, y_train)
        trained[name] = model
        print(f"       {name:<18} trained")

    # ----------------------------------------------------------- simulate
    print("[3/5] Simulating trips with Guideline Layer ON and OFF...")
    all_results = []
    for name in models:
        with_layer, without_layer = simulate_with_and_without(trained[name], test_df, config)
        all_results.extend([with_layer, without_layer])
        acc = with_layer.accuracy()
        print(f"       {name:<18} MAE={acc['mae_s']:.1f}s  "
              f"violations={sum(len(m.get('violations', [])) for m in with_layer.metrics)}")

    # ------------------------------------------------------------- analyze
    print("[4/5] Analysing results and generating plots...")
    rows = summarize_run(all_results)

    plots_dir = args.out / "plots"
    plots_dir.mkdir(parents=True, exist_ok=True)

    # figures
    demo = next((r for r in all_results if r.model_name == "gradient_boosting" and r.layer_enabled), all_results[0])
    plot_eta_prediction(demo, plots_dir)
    heavy = next((r for r in all_results if r.model_name == "mlp" and r.layer_enabled), demo)
    plot_resource_time_series(heavy, config.thresholds.cpu_percent,
                              config.thresholds.battery_drain_pct_hr, plots_dir)
    plot_model_comparison(rows, plots_dir)
    plot_warnings(rows, plots_dir)

    write_summary_csv(rows, args.out / "analysis" / "summary.csv")
    data_desc = f"{days} days x {trips} trips/day, seed {args.seed}"
    report_path = generate_report(rows, all_results, config, data_desc,
                                  args.out / "report.md")
    gallery_path = generate_html_gallery(rows, report_path)

    # --------------------------------------------------------------- report
    print("[5/5] Done in {:.1f}s".format(time.perf_counter() - t0))
    print(f"\nResults written to: {args.out}")
    print(f"  report : {report_path}")
    print(f"  gallery: {gallery_path}")
    for f in sorted(plots_dir.glob("*.png")):
        print(f"  plot   : {f}")

    print("\n=== Summary (Guideline Layer ON) ===")
    hdr = f"{'model':<18}{'MAE(s)':>8}{'R2':>8}{'CPU%':>7}{'RAM(MB)':>9}{'Batt%/hr':>10}{'BW KB/m':>9}{'viol':>6}{'alerts':>8}"
    print(hdr)
    print("-" * len(hdr))
    for r in rows:
        if r["layer"] == "on":
            print(f"{r['model']:<18}{r['mae_s']:>8.1f}{r['r2']:>8.3f}{r['cpu_percent_avg']:>7.1f}"
                  f"{r['ram_model_mb']:>9.2f}{r['battery_pct_hr']:>10.1f}{r['bandwidth_kb_per_min']:>9.2f}"
                  f"{r['violations']:>6}{r['warnings']:>8}")


if __name__ == "__main__":
    main()