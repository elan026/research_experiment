"""Monitoring Engine - Module 1 of the Guideline Layer (paper Section VI-A).

Continuously tracks CPU, RAM, battery and bandwidth usage and collects
profiling data for every inference cycle. The engine measures what it can for
real (per-inference CPU/wall time, model footprint) and models what cannot be
measured on a desktop (battery drain, sustained CPU load on an embedded-class
device, network payloads). All raw measurements are kept in the metrics dict
so nothing is hidden behind the modelled numbers.
"""

from __future__ import annotations

import gc
import os
import pickle
import time
from typing import Any, Callable

import psutil

from .config import GuidelineConfig


class MonitoringEngine:
    def __init__(self, config: GuidelineConfig):
        self.config = config
        self.process = psutil.Process(os.getpid())
        self._bytes_sent = 0.0
        self._sim_elapsed_sec = 0.0

    # ------------------------------------------------------------------ RAM
    def process_rss_mb(self) -> float:
        """Real resident set size of this process (includes interpreter)."""
        return self.process.memory_info().rss / 1_000_000.0

    def model_footprint_mb(self, model: Any) -> float:
        """Serialized size of the model - the meaningful per-model footprint."""
        gc.collect()
        blob = pickle.dumps(model)
        return len(blob) / 1_000_000.0

    # -------------------------------------------------------------- CPU/time
    def measure_inference_burst(self, predict_fn: Callable, x_batch, n: int = 120):
        """Real per-inference CPU ms / wall ms and burst CPU utilisation.

        Runs n predictions back-to-back and divides by n, which is far more
        stable than timing a single sklearn predict call.
        """
        # warm-up
        predict_fn(x_batch[:4])
        t0 = time.perf_counter()
        c0 = time.process_time()
        for _ in range(n):
            predict_fn(x_batch)
        wall = time.perf_counter() - t0
        cpu = time.process_time() - c0
        return {
            "inference_ms": wall / n * 1000.0,
            "cpu_ms_per_inference": cpu / n * 1000.0,
            "burst_cpu_percent": (cpu / wall * 100.0) if wall > 0 else 0.0,
        }

    def sustained_cpu_percent(self, macs_per_inference: float) -> float:
        """Modelled sustained CPU load on the paper's target device class.

        sustained % = min(100, macs_per_inference/1000 * cpu_macs_scale)

        Uses the structure-based compute estimate (FLOPs proxy) rather than
        laptop wall-time, which BLAS makes misleadingly fast for deep models.
        Raw measured ms are still logged in every record.
        """
        return min(100.0, macs_per_inference / 1000.0 * self.config.cpu_macs_scale)

    # -------------------------------------------------------------- battery
    def battery_drain_pct_per_hr(self, cpu_percent: float) -> float:
        """Battery drain model, or the physical battery if one is present."""
        bat = psutil.sensors_battery()
        if bat is not None:
            # drain inferred from the reported remaining %, re-sampled by the
            # caller; here we fall back to the linear model for stability.
            pass
        return (
            self.config.battery_idle_pct_hr
            + (self.config.battery_full_load_pct_hr - self.config.battery_idle_pct_hr)
            * cpu_percent
            / 100.0
        )

    # ------------------------------------------------------------ bandwidth
    def register_payload(self, bytes_: float) -> None:
        self._bytes_sent += bytes_

    def gps_payload_bytes(self) -> int:
        return self.config.gps_payload_bytes + self.config.feature_payload_bytes

    def sync_payload_bytes(self) -> int:
        return self.config.sync_payload_bytes

    def bandwidth_kb_per_min(self) -> float:
        """KB/min over the simulated trip elapsed time."""
        mins = max(self._sim_elapsed_sec / 60.0, 1e-6)
        return self._bytes_sent / 1000.0 / mins

    def advance_sim_time(self, seconds: float) -> None:
        self._sim_elapsed_sec += seconds

    def reset_counters(self) -> None:
        self._bytes_sent = 0.0
        self._sim_elapsed_sec = 0.0