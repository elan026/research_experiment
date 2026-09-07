"""Guideline Layer - the closed-loop orchestrator (paper Fig. 2 and Section VI).

Runs alongside an ETA model without modifying it. For every inference cycle it
executes the four-step loop:

    observe  -> Monitoring Engine samples CPU/RAM/battery/bandwidth
    compare  -> Threshold Checker compares against the benchmarks
    escalate -> Warning System raises alerts with remediation hints
    log      -> Logging Module stores records and syncs to the cloud

The ETA model itself is untouched - this layer is purely additive, which is
the paper's central design claim.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from .config import GuidelineConfig
from .logging_module import LoggingModule
from .monitoring import MonitoringEngine
from .thresholds import ThresholdChecker, Violation
from .warnings import WarningEvent, WarningSystem


@dataclass
class CheckResult:
    metrics: dict
    violations: list[Violation] = field(default_factory=list)
    warnings: list[WarningEvent] = field(default_factory=list)


class GuidelineLayer:
    def __init__(self, config: GuidelineConfig, enabled: bool = True):
        self.config = config
        self.enabled = enabled
        self.monitor = MonitoringEngine(config)
        self.checker = ThresholdChecker(config.thresholds)
        self.warning_system = WarningSystem(config)
        # a disabled layer (overhead comparison) must not touch log files
        self.logger = LoggingModule(config) if enabled else None
        self.sim_time_sec = 0.0
        self.n_checks = 0
        self.n_violations = 0
        self.n_warnings = 0

    # ------------------------------------------------------------ public API
    def advance_time(self, seconds: float) -> None:
        self.sim_time_sec += seconds
        self.monitor.advance_sim_time(seconds)

    def measure_model(self, model: Any, predict_fn: Callable, x_batch) -> dict:
        """One-time per-model profiling: footprint + burst timing + compute."""
        from models.eta_models import estimate_macs

        metrics = self.monitor.measure_inference_burst(predict_fn, x_batch)
        # footprint of the trained estimator (not the wrapper holding lambdas)
        estimator = getattr(model, "estimator", model)
        metrics["model_footprint_mb"] = self.monitor.model_footprint_mb(estimator)
        metrics["process_rss_mb"] = self.monitor.process_rss_mb()
        metrics["macs_per_inference"] = estimate_macs(estimator)
        metrics["cpu_percent"] = self.monitor.sustained_cpu_percent(
            metrics["macs_per_inference"]
        )
        metrics["battery_drain_pct_hr"] = self.monitor.battery_drain_pct_per_hr(
            metrics["cpu_percent"]
        )
        return metrics

    def run_inference(self, metrics: dict) -> CheckResult:
        """One inference cycle through the closed loop.

        `metrics` must contain the prediction result (pred, actual, error) and
        any per-cycle payloads already registered with the monitoring engine.
        """
        if not self.enabled:
            return CheckResult(metrics=metrics)

        self.n_checks += 1
        metrics["sim_time_sec"] = self.sim_time_sec
        metrics["cpu_percent"] = self.monitor.sustained_cpu_percent(
            metrics.get("macs_per_inference", 0.0)
        )
        metrics["battery_drain_pct_hr"] = self.monitor.battery_drain_pct_per_hr(
            metrics["cpu_percent"]
        )
        metrics["bandwidth_kb_per_min"] = self.monitor.bandwidth_kb_per_min()
        metrics["model_footprint_mb"] = metrics.get("model_footprint_mb", 0.0)

        # 1-2. observe + compare
        violations = self.checker.check(metrics)

        # 3. escalate (with cooldown + remediation hints)
        warnings: list[WarningEvent] = []
        for v in violations:
            ev = self.warning_system.process(v, self.sim_time_sec)
            if ev is not None:
                warnings.append(ev)

        self.n_violations += len(violations)
        self.n_warnings += len(warnings)

        # 4. log locally, sync periodically to the simulated cloud
        record = dict(metrics)
        record["violations"] = [v.to_dict() for v in violations]
        self.logger.log_inference(record)
        for ev in warnings:
            self.logger.log_warning(ev.to_dict())
        synced = self.logger.maybe_sync(record)

        # surface the violations in the returned metrics too (for the analysis)
        metrics["violations"] = record["violations"]
        metrics["synced"] = bool(synced)

        return CheckResult(metrics=metrics, violations=violations, warnings=warnings)

    def disable(self) -> None:
        self.enabled = False