"""Logging Module - Module 4 of the Guideline Layer (paper Section VI-A).

Gathers profiling data in lightweight formats suited to edge devices and sends
it periodically to the cloud server for fleet-wide analysis (here: a local
`cloud/` directory simulating that server). This gives the operator a history
to spot inefficiency patterns over time.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

from .config import GuidelineConfig


class LoggingModule:
    def __init__(self, config: GuidelineConfig):
        self.config = config
        self.logs_dir: Path = config.results_dir / "logs"
        self.cloud_dir: Path = config.cloud_dir
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        self.cloud_dir.mkdir(parents=True, exist_ok=True)

        self.inference_path = self.logs_dir / "inferences.jsonl"
        self.warning_path = self.logs_dir / "warnings.jsonl"
        self.cloud_csv_path = self.cloud_dir / "fleet_log.csv"
        self.sync_counter = 0

        # records APPEND across models within one experiment run; the run
        # entry point (run_experiment.py) is responsible for clearing the
        # output directory at the start of a fresh run.
        if not self.cloud_csv_path.exists():
            with self.cloud_csv_path.open("w", newline="", encoding="utf-8") as f:
                csv.writer(f).writerow([
                    "sync_id", "device", "model", "sim_time_sec",
                    "n_inferences", "cpu_percent_avg", "ram_mb", "bw_kb_per_min",
                ])

    # ------------------------------------------------------------- local log
    def log_inference(self, record: dict) -> None:
        """Append one lightweight JSONL record per inference cycle."""
        with self.inference_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record, default=float) + "\n")

    def log_warning(self, record: dict) -> None:
        with self.warning_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record, default=float) + "\n")

    # ------------------------------------------------------- periodic "cloud"
    def maybe_sync(self, record: dict) -> bool:
        """Periodically push an aggregated record to the simulated cloud."""
        self.sync_counter += 1
        if self.sync_counter % self.config.log_sync_every != 0:
            return False
        with self.cloud_csv_path.open("a", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow([
                self.sync_counter,
                self.config.device_name,
                record.get("model", ""),
                round(record.get("sim_time_sec", 0.0), 1),
                self.sync_counter,
                round(record.get("cpu_percent", 0.0), 2),
                round(record.get("model_footprint_mb", 0.0), 3),
                round(record.get("bandwidth_kb_per_min", 0.0), 2),
            ])
        return True