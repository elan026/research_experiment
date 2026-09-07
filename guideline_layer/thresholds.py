"""Threshold Checker - Module 2 of the Guideline Layer (paper Section VI-A).

Compares the resource usage reported by the Monitoring Engine against the
configured thresholds (CPU > 30%, RAM > 500 MB, ...) and produces typed
violation records. Thresholds can be tailored per device class.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from .config import Thresholds


@dataclass
class Violation:
    metric: str
    value: float
    limit: float
    severity: str  # "warning" | "critical"
    hint: str      # remediation suggestion, per paper's Warning System spec

    def to_dict(self) -> dict:
        return {
            "metric": self.metric,
            "value": round(self.value, 3),
            "limit": self.limit,
            "severity": self.severity,
            "hint": self.hint,
        }


# Remediation hints recommended by the paper: quantization if RAM is the issue,
# pruning if CPU is too high, etc.
REMEDIATION_HINTS = {
    "cpu_percent": "CPU sustained load too high - consider pruning the model, "
                   "reducing inference frequency, or switching to a lighter "
                   "architecture (e.g., XGBoost instead of a deep network).",
    "ram_mb": "Model footprint too large - consider quantization (e.g., int8 "
              "weights) or knowledge distillation to shrink the model.",
    "battery_drain_pct_hr": "Battery draining too fast - reduce inference "
                            "frequency, batch processing, or defer work until "
                            "the device is charging.",
    "bandwidth_kb_per_min": "Bandwidth usage too high - increase the cloud "
                            "log-sync interval, compress payloads, or move "
                            "inference fully on-device (Edge AI).",
}


class ThresholdChecker:
    def __init__(self, thresholds: Thresholds):
        self.thresholds = thresholds

    def check(self, metrics: dict) -> list[Violation]:
        """Compare one inference cycle's metrics against the thresholds."""
        violations: list[Violation] = []

        cpu = metrics.get("cpu_percent", 0.0)
        if cpu > self.thresholds.cpu_percent:
            violations.append(Violation(
                "cpu_percent", cpu, self.thresholds.cpu_percent,
                severity="critical" if cpu > 2 * self.thresholds.cpu_percent else "warning",
                hint=REMEDIATION_HINTS["cpu_percent"],
            ))

        ram = metrics.get("model_footprint_mb", 0.0)
        if ram > self.thresholds.ram_mb:
            violations.append(Violation(
                "ram_mb", ram, self.thresholds.ram_mb,
                severity="critical" if ram > 2 * self.thresholds.ram_mb else "warning",
                hint=REMEDIATION_HINTS["ram_mb"],
            ))

        bat = metrics.get("battery_drain_pct_hr", 0.0)
        if bat > self.thresholds.battery_drain_pct_hr:
            violations.append(Violation(
                "battery_drain_pct_hr", bat, self.thresholds.battery_drain_pct_hr,
                severity="warning", hint=REMEDIATION_HINTS["battery_drain_pct_hr"],
            ))

        bw = metrics.get("bandwidth_kb_per_min", 0.0)
        if bw > self.thresholds.bandwidth_kb_per_min:
            violations.append(Violation(
                "bandwidth_kb_per_min", bw, self.thresholds.bandwidth_kb_per_min,
                severity="warning", hint=REMEDIATION_HINTS["bandwidth_kb_per_min"],
            ))

        return violations