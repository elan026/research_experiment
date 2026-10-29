"""Guideline Layer - configuration.

Mirrors Section VI-D of the paper: the four reference profiling benchmarks are
practical starting points, not hard-and-fast rules, and thresholds should be
adjusted per device class (smartphone vs ESP32).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


@dataclass
class Thresholds:
    """The four profiling benchmarks proposed in the paper (Section VI-D).

    cpu_percent            - sustained CPU load ceiling (paper: 30%)
    ram_mb                 - model memory footprint ceiling (paper: 500 MB)
    battery_drain_pct_hr   - battery drain ceiling (paper: 20%/hr)
    bandwidth_kb_per_min   - network ceiling (paper: 1 MB/min = 1024 KB/min)
    """

    cpu_percent: float = 30.0
    ram_mb: float = 500.0
    battery_drain_pct_hr: float = 20.0
    bandwidth_kb_per_min: float = 1024.0

    def to_dict(self) -> dict:
        return {
            "cpu_percent": float(self.cpu_percent),
            "ram_mb": float(self.ram_mb),
            "battery_drain_pct_hr": float(self.battery_drain_pct_hr),
            "bandwidth_kb_per_min": float(self.bandwidth_kb_per_min),
        }


@dataclass
class GuidelineConfig:
    """Runtime configuration for the Guideline Layer."""

    device_name: str = "edge-device-01"
    thresholds: Thresholds = field(default_factory=Thresholds)

    # Deployed inference cadence in simulated-time seconds. ETA is refreshed
    # every N seconds of bus time (e.g., every 30 s) rather than continuously.
    inference_cadence_sec: float = 30.0

    # CPU calibration -------------------------------------------------------
    # Real per-inference wall/CPU ms are measured and logged on this laptop,
    # but laptop BLAS hides the compute cost of deep models (a matrix multiply
    # is microseconds). For the paper's target hardware - embedded-class
    # devices (Arduino / ESP32-class microcontrollers) - the meaningful proxy
    # is the model's per-inference compute, estimated from its structure
    # (multiply-accumulate operations, see models/eta_models.estimate_macs).
    #
    #   sustained_cpu_percent = min(100, macs_per_inference/1000 * cpu_macs_scale)
    #
    # cpu_macs_scale is calibrated so a deep model lands above the paper's 30%
    # ceiling while lightweight models stay well below; tune per device.
    cpu_macs_scale: float = 1.3

    # Battery model ---------------------------------------------------------
    # Linear model: drain(%/hr) = idle + (full_load - idle) * cpu_percent/100.
    # Only used when no physical battery is present (typical desktop); if
    # psutil.sensors_battery() reports one, it is used directly.
    battery_idle_pct_hr: float = 3.0
    battery_full_load_pct_hr: float = 25.0

    # Payload / bandwidth model ---------------------------------------------
    gps_payload_bytes: int = 180        # GPS fix + vehicle id broadcast
    feature_payload_bytes: int = 220    # feature packet sent with each inference
    sync_payload_bytes: int = 2048      # periodic cloud log-sync payload
    log_sync_every: int = 10            # sync cloud logs every N inferences

    # Output locations
    results_dir: Path = ROOT / "results" / "latest"
    cloud_dir: Path = ROOT / "results" / "latest" / "cloud"

    # Warning system cooldown (simulated seconds between repeated alerts of the
    # same metric) - avoids alert spam, mirrors production alerting practice.
    warning_cooldown_sec: float = 120.0