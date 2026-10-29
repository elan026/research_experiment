import React from 'react';
import { Clock, Cpu, HardDrive, BatteryCharging, Wifi, AlertTriangle, CheckCircle, Zap } from 'lucide-react';

export default function DualOutputStage({ telemetry, activeProfile }) {
  if (!telemetry) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-500">
        <Clock className="w-8 h-8 mx-auto mb-2 animate-spin text-brand-400" />
        <p className="text-sm">Awaiting real-time telemetry feed from ISCON-PDPU corridor...</p>
      </div>
    );
  }

  const {
    pred_min,
    actual_min,
    error_s,
    elapsed_min,
    stops_remaining,
    dist_remaining_km,
    model,
    model_kind,
    metrics = {},
    violations = [],
    alerts = [],
  } = telemetry;

  const thresholds = activeProfile?.currentThresholds || {
    cpu_percent: 30.0,
    ram_mb: 500.0,
    battery_drain_pct_hr: 20.0,
    bandwidth_kb_per_min: 1024.0,
  };

  const cpu = metrics.cpu_percent || 0;
  const ram = metrics.ram_mb || 0;
  const battery = metrics.battery_drain_pct_hr || 0;
  const bandwidth = metrics.bandwidth_kb_per_min || 0;
  const latency = metrics.inference_ms || 0;
  const macs = metrics.macs || 0;

  const isCpuBreached = cpu > thresholds.cpu_percent;
  const hasViolations = violations.length > 0 || alerts.length > 0;

  // Format ETA into min + sec
  const formatMinSec = (decimalMins) => {
    if (decimalMins === undefined || decimalMins === null) return '—';
    const totalSecs = Math.round(decimalMins * 60);
    const m = Math.floor(totalSecs / 60);
    const s = Math.abs(totalSecs % 60);
    return `${m}m ${s.toString().padStart(2, '0')}s`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* ========================================================================= */}
      {/* OUTPUT 1: Primary Application Stage - Real-Time Spatial ETA Prediction */}
      {/* ========================================================================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between shadow-sm">
        <div>
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded border border-brand-500/20">
                Paper Output Stage 1
              </span>
              <h3 className="text-base font-bold text-white mt-1">
                Spatial ETA Prediction
              </h3>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 font-mono text-slate-300">
              Model: <b className="text-brand-300 capitalize">{model.replace('_', ' ')}</b> ({model_kind})
            </span>
          </div>

          {/* Primary ETA Display */}
          <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 mb-4">
            <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
              <span>Predicted Corridor Travel Time to PDPU:</span>
              <span className="text-brand-400 font-mono">{pred_min.toFixed(2)} min</span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-extrabold text-white font-mono tracking-tight">
                {formatMinSec(pred_min)}
              </span>
              <span className="text-xs text-slate-500">
                (Ground Truth: <b className="text-slate-300 font-mono">{formatMinSec(actual_min)}</b>)
              </span>
            </div>

            {/* Error delta & status bar */}
            <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
              <span className="text-slate-400">Prediction Residual ($\Delta$ Error):</span>
              <span
                className={`font-mono font-semibold px-2 py-0.5 rounded ${
                  Math.abs(error_s) < 60
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : Math.abs(error_s) < 180
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                }`}
              >
                {error_s > 0 ? `+${error_s.toFixed(1)}s` : `${error_s.toFixed(1)}s`}
              </span>
            </div>
          </div>

          {/* Spatial Telemetry Context Grid */}
          <div className="grid grid-cols-3 gap-2.5 text-xs">
            <div className="bg-slate-950/60 border border-slate-800 p-2.5 rounded-lg">
              <span className="text-slate-500 block text-[11px]">Distance Remaining</span>
              <span className="text-white font-mono font-bold text-sm">{dist_remaining_km} km</span>
            </div>
            <div className="bg-slate-950/60 border border-slate-800 p-2.5 rounded-lg">
              <span className="text-slate-500 block text-[11px]">Stops Remaining</span>
              <span className="text-white font-mono font-bold text-sm">{stops_remaining} stops</span>
            </div>
            <div className="bg-slate-950/60 border border-slate-800 p-2.5 rounded-lg">
              <span className="text-slate-500 block text-[11px]">Elapsed Trip Time</span>
              <span className="text-white font-mono font-bold text-sm">{elapsed_min.toFixed(1)} min</span>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
          <span>Inference Frequency: 1.0 Hz (Every Bus Stop)</span>
          <span>Sample: Real ISCON–PDPU Corridor Data</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* OUTPUT 2: Guideline Layer Stage - Hardware Resource Awareness Report */}
      {/* ========================================================================= */}
      <div
        className={`bg-slate-900 border rounded-xl p-5 flex flex-col justify-between shadow-sm transition-colors ${
          isCpuBreached
            ? 'border-rose-500/50 bg-rose-950/10'
            : hasViolations
            ? 'border-amber-500/40'
            : 'border-slate-800'
        }`}
      >
        <div>
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                Paper Output Stage 2
              </span>
              <h3 className="text-base font-bold text-white mt-1 flex items-center gap-2">
                <span>Hardware Awareness Report</span>
                {isCpuBreached ? (
                  <span className="text-xs px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold animate-pulse flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Budget Breached
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Budget Compliant
                  </span>
                )}
              </h3>
            </div>
            <span className="text-xs text-slate-400">
              Limit: <b className="text-white font-mono">&le; {thresholds.cpu_percent}% CPU</b>
            </span>
          </div>

          {/* CPU Resource Awareness Bar (Core Thesis of Paper) */}
          <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-slate-300 font-medium flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                Processor Load (Edge CPU Utilization)
              </span>
              <span
                className={`font-mono font-bold text-sm ${
                  isCpuBreached ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {cpu.toFixed(1)}%
              </span>
            </div>

            {/* Gauge Track with 30% Threshold Marker */}
            <div className="relative w-full h-4 bg-slate-800 rounded-full overflow-hidden border border-slate-700/60">
              <div
                className={`h-full transition-all duration-300 ${
                  isCpuBreached
                    ? 'bg-gradient-to-r from-amber-500 to-rose-600'
                    : 'bg-gradient-to-r from-emerald-500 to-indigo-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(2, (cpu / 60) * 100))}%` }}
              />
              {/* Threshold mark at (30 / 60) * 100 = 50% */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-rose-400 z-10"
                style={{ left: `${(thresholds.cpu_percent / 60) * 100}%` }}
                title={`Threshold Limit: ${thresholds.cpu_percent}%`}
              />
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1.5">
              <span>0%</span>
              <span className="text-rose-400 font-medium font-mono">
                ▲ Limit Ceiling: {thresholds.cpu_percent}%
              </span>
              <span>60%+</span>
            </div>
          </div>

          {/* Hardware Telemetry Counters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            {/* RAM */}
            <div className="bg-slate-950/60 border border-slate-800 p-2.5 rounded-lg">
              <span className="text-slate-500 flex items-center gap-1 text-[11px] mb-1">
                <HardDrive className="w-3 h-3 text-cyan-400" /> RAM Footprint
              </span>
              <span className="text-white font-mono font-bold">{ram.toFixed(2)} MB</span>
              <span className="text-[10px] text-slate-500 block">&le; {thresholds.ram_mb} MB</span>
            </div>

            {/* Battery */}
            <div className="bg-slate-950/60 border border-slate-800 p-2.5 rounded-lg">
              <span className="text-slate-500 flex items-center gap-1 text-[11px] mb-1">
                <BatteryCharging className="w-3 h-3 text-amber-400" /> Battery Drain
              </span>
              <span className="text-white font-mono font-bold">{battery.toFixed(2)} %/h</span>
              <span className="text-[10px] text-slate-500 block">&le; {thresholds.battery_drain_pct_hr}%/h</span>
            </div>

            {/* Bandwidth */}
            <div className="bg-slate-950/60 border border-slate-800 p-2.5 rounded-lg">
              <span className="text-slate-500 flex items-center gap-1 text-[11px] mb-1">
                <Wifi className="w-3 h-3 text-blue-400" /> Bandwidth
              </span>
              <span className="text-white font-mono font-bold">{bandwidth.toFixed(1)} KB/m</span>
              <span className="text-[10px] text-slate-500 block">&le; {thresholds.bandwidth_kb_per_min} KB</span>
            </div>

            {/* Latency & MACs */}
            <div className="bg-slate-950/60 border border-slate-800 p-2.5 rounded-lg">
              <span className="text-slate-500 flex items-center gap-1 text-[11px] mb-1">
                <Zap className="w-3 h-3 text-indigo-400" /> Latency / MACs
              </span>
              <span className="text-white font-mono font-bold">{latency.toFixed(2)} ms</span>
              <span className="text-[10px] text-slate-500 block">{(macs / 1000).toFixed(0)}k MACs</span>
            </div>
          </div>
        </div>

        {/* Warning or Remediation Status Banner */}
        {alerts.length > 0 ? (
          <div className="mt-4 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="truncate">
              <b>Threshold Alert:</b> {alerts[0].message || 'Resource constraint breached by active model.'}
            </div>
          </div>
        ) : (
          <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-emerald-400 flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5 shrink-0" />
            <span>Guideline Layer Threshold Checker verified: In-budget execution.</span>
          </div>
        )}
      </div>
    </div>
  );
}

