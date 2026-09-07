"""Synthetic bus-route data generator for the Guideline Layer PoC.

Generates a realistic urban bus corridor: one route with N stops, several
trips/day across many days. Ground-truth segment travel times come from a
physics-based model (distance / speed) modulated by time-of-day traffic,
weather, stop dwell and noise. The features emitted at each stop are exactly
what an ETA model would observe in the field; the target is the remaining
travel time (in minutes) to the terminal - i.e. the ETA a passenger sees.

All randomness is seeded so experiments are reproducible.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = ROOT / "data" / "bus_trips.csv"

WEATHER_FACTOR = {0: 1.00, 1: 1.25, 2: 1.12}  # clear, rain, fog
N_STOPS = 18


def traffic_index(hour: float, dow: int, rng: np.random.Generator) -> float:
    """Peak-hour traffic multiplier: morning 7.5-10, evening 16.5-19.5."""
    base = 1.0
    if 7.5 <= hour <= 10.0:
        base += 0.45
    elif 16.5 <= hour <= 19.5:
        base += 0.35
    if dow >= 5:  # weekends lighter
        base *= 0.85
    return float(max(0.7, min(1.9, base + rng.uniform(-0.05, 0.12))))


def generate_trips(n_days: int = 30, trips_per_day: int = 16, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)

    # corridor geometry: cumulative km along the route
    seg_km = rng.uniform(0.9, 1.6, N_STOPS - 1)
    cum_km = np.concatenate([[0.0], np.cumsum(seg_km)])
    # per-segment cruise speed (km/h) - road class varies along the corridor
    seg_speed = rng.uniform(18.0, 26.0, N_STOPS - 1)

    rows = []
    trip_id = 0
    for day in range(n_days):
        dow = day % 7
        # more departures during peak hours
        starts = rng.choice([7.5, 8.5, 9.5, 12.0, 17.5, 18.5, 20.0], size=trips_per_day)
        starts += rng.uniform(-0.4, 0.4, trips_per_day)
        starts = np.sort(np.clip(starts, 6.5, 20.5))

        for start_hr in starts:
            weather = int(rng.choice([0, 1, 2], p=[0.72, 0.18, 0.10]))
            wf = WEATHER_FACTOR[weather]
            traf = traffic_index(start_hr, dow, rng)

            # precompute this trip's segment durations (seconds)
            seg_sec = np.zeros(N_STOPS - 1)
            t = start_hr * 3600.0
            for j in range(N_STOPS - 1):
                dwell = rng.uniform(20, 45)
                if 7.5 <= t / 3600.0 <= 10.0 or 16.5 <= t / 3600.0 <= 19.5:
                    dwell *= 1.3
                seg = (seg_km[j] / seg_speed[j]) * 3600.0 * traf * wf
                seg_sec[j] = seg + dwell
                t += seg + dwell

            total_sec = seg_sec.sum()
            elapsed = 0.0
            for i in range(N_STOPS):
                remaining_sec = total_sec - elapsed
                row = {
                    "trip_id": trip_id,
                    "day": day,
                    "dow": dow,
                    "stop_index": i,
                    "hour": start_hr + elapsed / 3600.0,
                    "is_peak": int(7.5 <= t / 3600.0 <= 10.0 or 16.5 <= t / 3600.0 <= 19.5),
                    "weather_code": weather,
                    "traffic_index": traf,
                    "dist_remaining_km": float(cum_km[-1] - cum_km[i]),
                    "stops_remaining": int(N_STOPS - 1 - i),
                    "elapsed_min": elapsed / 60.0,
                    "avg_speed_so_far_kmh": (
                        float(cum_km[i] / max(elapsed / 3600.0, 1e-6)) if i > 0 else 0.0
                    ),
                    "eta_remaining_min": remaining_sec / 60.0,
                }
                rows.append(row)
                if i < N_STOPS - 1:
                    elapsed += seg_sec[i]
                    t += seg_sec[i]
            trip_id += 1

    df = pd.DataFrame(rows)
    return df


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--trips", type=int, default=16)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--out", type=Path, default=OUT_PATH)
    args = parser.parse_args()

    df = generate_trips(args.days, args.trips, args.seed)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(args.out, index=False)
    print(f"Wrote {len(df)} stop-observations ({df['trip_id'].nunique()} trips) -> {args.out}")


if __name__ == "__main__":
    main()