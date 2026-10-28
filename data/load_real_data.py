"""Real-world empirical data loader for ISCON-PDPU corridor transit dataset.

Extracts real bus trips from 'Dataset for Advanced Public Transportation System
under Limited Infrastructure Support', computing the exact feature set required
by ETA prediction models and the Guideline Layer.
"""

from __future__ import annotations

import argparse
from datetime import datetime
import glob
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATASET_DIR = (
    ROOT
    / "Dataset for Advanced Public Transportation System under Limited Infrastructure Support"
    / "data"
    / "NpData"
    / "Git_ISCON_PDPU"
)
OUT_PATH = ROOT / "data" / "real_bus_trips.csv"


def load_real_trips(dataset_dir: Path | str = DEFAULT_DATASET_DIR) -> pd.DataFrame:
    dataset_path = Path(dataset_dir)
    if not dataset_path.exists():
        raise FileNotFoundError(f"Dataset directory not found: {dataset_path}")

    nb_stops_path = dataset_path / "BusStops.NorthBound.npy"
    sb_stops_path = dataset_path / "BusStops.SouthBound.npy"

    if not nb_stops_path.exists() or not sb_stops_path.exists():
        raise FileNotFoundError("BusStops npy files not found in dataset directory.")

    nb_stops = {
        s["id"]: s for s in np.load(nb_stops_path, allow_pickle=True)
    }
    sb_stops = {
        s["id"]: s for s in np.load(sb_stops_path, allow_pickle=True)
    }

    trip_files = sorted(glob.glob(str(dataset_path / "*.BusStopsRecord.npy")))
    if not trip_files:
        raise ValueError(f"No *.BusStopsRecord.npy files found in {dataset_path}")

    base_reference_date = datetime(2017, 12, 1)
    rows = []

    for trip_idx, tf in enumerate(trip_files):
        fname = Path(tf).name.replace(".BusStopsRecord.npy", "")
        # Filename pattern: DD_MM_YYYY__HH_MM_SS
        try:
            parts = fname.split("__")
            d_parts = [int(p) for p in parts[0].split("_")]
            t_parts = [int(p) for p in parts[1].split("_")]
            trip_dt = datetime(
                d_parts[2], d_parts[1], d_parts[0], t_parts[0], t_parts[1], t_parts[2]
            )
        except Exception:
            trip_dt = base_reference_date

        dow = trip_dt.weekday()
        day_offset = (trip_dt - base_reference_date).days

        data = np.load(tf, allow_pickle=True)
        if len(data) < 3:
            continue

        ids = [d["id"] for d in data]
        direction = "NB" if ids[-1] > ids[0] else "SB"
        stops_dict = nb_stops if direction == "NB" else sb_stops

        dist_map = {
            d["id"]: stops_dict[d["id"]]["distanceFromOrigin"]
            for d in data
            if d["id"] in stops_dict
        }
        if len(dist_map) < len(data):
            continue

        start_epoch = float(data[0]["epoch"])
        end_epoch = float(data[-1]["epoch"])
        total_trip_sec = (end_epoch - start_epoch) / 1000.0

        if total_trip_sec <= 0:
            continue

        origin_sid = data[0]["id"]
        terminal_sid = data[-1]["id"]

        for i, d in enumerate(data):
            curr_epoch = float(d["epoch"])
            elapsed_sec = max(0.0, (curr_epoch - start_epoch) / 1000.0)
            remaining_sec = max(0.0, (end_epoch - curr_epoch) / 1000.0)

            curr_sid = d["id"]
            if direction == "NB":
                dist_remaining_km = max(
                    0.0, (dist_map[terminal_sid] - dist_map[curr_sid]) / 1000.0
                )
                dist_so_far_km = max(
                    0.0, (dist_map[curr_sid] - dist_map[origin_sid]) / 1000.0
                )
            else:
                dist_remaining_km = max(
                    0.0, (dist_map[curr_sid] - dist_map[terminal_sid]) / 1000.0
                )
                dist_so_far_km = max(
                    0.0, (dist_map[origin_sid] - dist_map[curr_sid]) / 1000.0
                )

            # Local time calculation
            cur_dt = datetime.fromtimestamp(curr_epoch / 1000.0)
            hour = cur_dt.hour + (cur_dt.minute / 60.0) + (cur_dt.second / 3600.0)
            is_peak = int((7.5 <= hour <= 10.0) or (16.5 <= hour <= 19.5))

            if is_peak:
                traffic_index = 1.45 if direction == "SB" else 1.35
            else:
                traffic_index = 1.0

            avg_speed_so_far_kmh = (
                (dist_so_far_km / (elapsed_sec / 3600.0))
                if elapsed_sec > 15.0
                else 0.0
            )

            rows.append(
                {
                    "trip_id": trip_idx,
                    "direction": direction,
                    "day": day_offset,
                    "dow": dow,
                    "stop_index": i,
                    "hour": round(hour, 4),
                    "is_peak": is_peak,
                    "weather_code": 0,
                    "traffic_index": traffic_index,
                    "dist_remaining_km": round(dist_remaining_km, 3),
                    "stops_remaining": int(len(data) - 1 - i),
                    "elapsed_min": round(elapsed_sec / 60.0, 3),
                    "avg_speed_so_far_kmh": round(avg_speed_so_far_kmh, 2),
                    "eta_remaining_min": round(remaining_sec / 60.0, 3),
                }
            )

    df = pd.DataFrame(rows)
    return df


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dataset-dir",
        type=Path,
        default=DEFAULT_DATASET_DIR,
        help="Path to NpData/Git_ISCON_PDPU directory",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=OUT_PATH,
        help="Path to output CSV file",
    )
    args = parser.parse_args()

    df = load_real_trips(args.dataset_dir)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(args.out, index=False)
    print(
        f"Processed {len(df)} real stop observations from {df['trip_id'].nunique()} trips -> {args.out}"
    )


if __name__ == "__main__":
    main()

