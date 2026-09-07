"""Warning System - Module 3 of the Guideline Layer (paper Section VI-A).

Alerts the developer / fleet operator when thresholds are exceeded and, where
possible, recommends a concrete remediation (quantization for RAM, pruning for
CPU, ...). Implements a cooldown so the same metric is not spammed, and
escalates repeated violations from warning to critical.
"""

from __future__ import annotations

import time as _time
from dataclasses import dataclass, field

from .config import GuidelineConfig
from .thresholds import Violation


@dataclass
class WarningEvent:
    metric: str
    value: float
    limit: float
    severity: str
    hint: str
    sim_time_sec: float
    count: int = 1

    def to_dict(self) -> dict:
        return {
            "metric": self.metric,
            "value": round(self.value, 3),
            "limit": self.limit,
            "severity": self.severity,
            "hint": self.hint,
            "sim_time_sec": round(self.sim_time_sec, 1),
            "count": self.count,
        }


class WarningSystem:
    def __init__(self, config: GuidelineConfig):
        self.config = config
        self._last_alert: dict[str, float] = {}   # metric -> sim time of last alert
        self._repeat_count: dict[str, int] = {}

    def process(self, violation: Violation, sim_time_sec: float) -> WarningEvent | None:
        """Return a WarningEvent if this violation should alert now."""
        metric = violation.metric
        last = self._last_alert.get(metric, -1e9)
        if sim_time_sec - last < self.config.warning_cooldown_sec:
            self._repeat_count[metric] = self._repeat_count.get(metric, 0) + 1
            return None  # suppressed by cooldown (still logged silently)

        self._last_alert[metric] = sim_time_sec
        self._repeat_count[metric] = 0

        severity = violation.severity
        # escalate: repeated past alerts for the same metric move to critical
        if self._repeat_count.get(metric, 0) > 3 and severity == "warning":
            severity = "critical"

        return WarningEvent(
            metric=metric,
            value=violation.value,
            limit=violation.limit,
            severity=severity,
            hint=violation.hint,
            sim_time_sec=sim_time_sec,
        )