import React, { useState } from 'react';
import {
  Activity,
  Cpu,
  ShieldCheck,
  Cloud,
  RefreshCw,
  Zap,
  Sliders,
  CheckCircle2,
  AlertOctagon,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

export default function ClosedLoopActuator({
  guidelineStatus,
  latestTelemetry,
  role,
  onModelChange,
  onToggleClosedLoop,
  onManualRemediate,
}) {
  const [loadingAction, setLoadingAction] = useState(false);

  const activeModel = latestTelemetry?.model || guidelineStatus?.activeModel || 'mlp';
  const closedLoopEnabled =
    latestTelemetry?.closed_loop_enabled !== undefined
      ? latestTelemetry.closed_loop_enabled
      : guidelineStatus?.closedLoopAutoRemediation ?? true;

  const remediationEvent = latestTelemetry?.remediation_event;
  const totals = latestTelemetry?.totals || guidelineStatus?.totals || {
    inferences: 0,
    violations: 0,
    alerts: 0,
    syncs: 0,
  };

  const handleModelSelect = async (modelName) => {
    try {
      setLoadingAction(true);
      await onModelChange(modelName);
    } finally {
      setLoadingAction(false);
    }
  };

  const handleToggle = async () => {
    try {
      setLoadingAction(true);
      await onToggleClosedLoop(!closedLoopEnabled);
    } finally {
      setLoadingAction(false);
    }
  };

  const handleRemediate = async () => {
    try {
      setLoadingAction(true);
      await onManualRemediate('FALLBACK_GBDT');
    } finally {
      setLoadingAction(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-brand-400" />
            <h2 className="text-base font-bold text-white">
              Guideline Layer Architecture & Autonomous Closed-Loop
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time empirical supervision, threshold violation detection, and closed-loop actuation
          </p>
        </div>

        {/* Closed-Loop Auto-Remediation Toggle */}
        <div className="flex items-center gap-3 bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800">
          <div className="text-right">
            <span className="block text-xs font-semibold text-white">
              Closed-Loop Remediation
            </span>
            <span className="block text-[10px] text-slate-400">
              {closedLoopEnabled ? 'Autonomous Auto-Fallback' : 'Manual Intervention Only'}
            </span>
          </div>

          <button
            onClick={handleToggle}
            disabled={role !== 'engineer' && false}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              closedLoopEnabled ? 'bg-brand-600' : 'bg-slate-700'
            }`}
            title="Toggle autonomous closed-loop fallback"
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                closedLoopEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* 4 Core Guideline Layer Modules (Paper Architecture) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Module 1: Monitoring Engine */}
        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5">
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Activity className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Live
            </span>
          </div>
          <h4 className="text-xs font-bold text-white mb-1">1. Monitoring Engine</h4>
          <p className="text-[11px] text-slate-400 leading-snug">
            Probes CPU, memory, battery drain, and network payload per bus station inference.
          </p>
          <div className="mt-2.5 pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-400 flex justify-between">
            <span>Inferences Probed:</span>
            <span className="text-emerald-400 font-bold">{totals.inferences}</span>
          </div>
        </div>

        {/* Module 2: Threshold Checker */}
        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5">
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Cpu className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Active
            </span>
          </div>
          <h4 className="text-xs font-bold text-white mb-1">2. Threshold Checker</h4>
          <p className="text-[11px] text-slate-400 leading-snug">
            Enforces hardware resource ceilings (e.g. CPU &le; 30% budget for vehicle telematics).
          </p>
          <div className="mt-2.5 pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-400 flex justify-between">
            <span>Violations Logged:</span>
            <span className="text-rose-400 font-bold">{totals.violations}</span>
          </div>
        </div>

        {/* Module 3: Warning & Actuation System */}
        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5">
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
              Supervising
            </span>
          </div>
          <h4 className="text-xs font-bold text-white mb-1">3. Warning & Actuation</h4>
          <p className="text-[11px] text-slate-400 leading-snug">
            Emits deduplicated alerts & triggers closed-loop model hot-swapping upon overload.
          </p>
          <div className="mt-2.5 pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-400 flex justify-between">
            <span>Alert Directives:</span>
            <span className="text-amber-400 font-bold">{totals.alerts}</span>
          </div>
        </div>

        {/* Module 4: Logging & Fleet Sync */}
        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5">
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Cloud className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              Synchronized
            </span>
          </div>
          <h4 className="text-xs font-bold text-white mb-1">4. Logging & Fleet Sync</h4>
          <p className="text-[11px] text-slate-400 leading-snug">
            Persists JSONL audit trails on edge and syncs compressed telemetry batches to central cloud.
          </p>
          <div className="mt-2.5 pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-400 flex justify-between">
            <span>Cloud Batches Synced:</span>
            <span className="text-cyan-400 font-bold">{totals.syncs}</span>
          </div>
        </div>
      </div>

      {/* Model Selection & Demonstration Controls */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Active Edge ML Model Runtime
            </h3>
            <p className="text-[11px] text-slate-400">
              Switch models to test the Guideline Layer's real-time violation detection and fallback
            </p>
          </div>

          {activeModel === 'mlp' && (
            <button
              onClick={handleRemediate}
              disabled={loadingAction}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-500 text-white shadow transition"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Actuate Remediation (Fallback to GBDT)</span>
            </button>
          )}
        </div>

        {/* Model Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Deep MLP */}
          <div
            onClick={() => handleModelSelect('mlp')}
            className={`cursor-pointer rounded-xl p-3.5 border transition-all ${
              activeModel === 'mlp'
                ? 'bg-rose-950/20 border-rose-500 shadow-sm'
                : 'bg-slate-900 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-bold text-xs text-white">Multi-Layer Perceptron (MLP)</span>
              {activeModel === 'mlp' && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  Active
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mb-2">
              Deep Neural Network (64-32 architecture). High accuracy ($R^2=0.924$).
            </p>
            <div className="bg-slate-950 p-2 rounded-lg text-[10px] space-y-1">
              <div className="flex justify-between text-slate-300">
                <span>CPU Consumption:</span>
                <span className="text-rose-400 font-bold font-mono">~45.4% (BREACH)</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Hardware Status:</span>
                <span className="text-rose-400 font-semibold">Exceeds 30% Ceiling</span>
              </div>
            </div>
          </div>

          {/* Gradient Boosting */}
          <div
            onClick={() => handleModelSelect('gradient_boosting')}
            className={`cursor-pointer rounded-xl p-3.5 border transition-all ${
              activeModel === 'gradient_boosting'
                ? 'bg-emerald-950/20 border-emerald-500 shadow-sm'
                : 'bg-slate-900 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-bold text-xs text-white">Gradient Boosting (GBDT)</span>
              {activeModel === 'gradient_boosting' && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Active (Recommended)
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mb-2">
              Optimized Decision Ensemble. Paper's optimal Pareto choice ($R^2=0.918$).
            </p>
            <div className="bg-slate-950 p-2 rounded-lg text-[10px] space-y-1">
              <div className="flex justify-between text-slate-300">
                <span>CPU Consumption:</span>
                <span className="text-emerald-400 font-bold font-mono">~1.2% (SAFE)</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Hardware Status:</span>
                <span className="text-emerald-400 font-semibold">97% CPU Savings</span>
              </div>
            </div>
          </div>

          {/* Linear Model */}
          <div
            onClick={() => handleModelSelect('linear')}
            className={`cursor-pointer rounded-xl p-3.5 border transition-all ${
              activeModel === 'linear'
                ? 'bg-brand-950/20 border-brand-500 shadow-sm'
                : 'bg-slate-900 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-bold text-xs text-white">Linear Ridge Regression</span>
              {activeModel === 'linear' && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-300 border border-brand-500/30">
                  Active
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mb-2">
              Linear baseline. Ultra-low computation, minimal embedded footprint ($R^2=0.916$).
            </p>
            <div className="bg-slate-950 p-2 rounded-lg text-[10px] space-y-1">
              <div className="flex justify-between text-slate-300">
                <span>CPU Consumption:</span>
                <span className="text-blue-400 font-bold font-mono">~0.45% (SAFE)</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Hardware Status:</span>
                <span className="text-blue-400 font-semibold">Negligible Overhead</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Autonomous Remediation Proof Banner */}
      {remediationEvent && (
        <div className="bg-gradient-to-r from-indigo-950/60 via-slate-900 to-emerald-950/60 border border-indigo-500/40 rounded-xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300 shrink-0 mt-0.5">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="flex-1 text-xs">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-bold text-white">
                Autonomous Closed-Loop Directive Executed
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono">
                {remediationEvent.action}
              </span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              {remediationEvent.reason}
            </p>
            <div className="mt-2 flex items-center gap-2 font-mono text-[11px] text-slate-400">
              <span className="px-2 py-0.5 rounded bg-slate-800 text-rose-300">
                From: {remediationEvent.from_model}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
              <span className="px-2 py-0.5 rounded bg-slate-800 text-emerald-300">
                To: {remediationEvent.to_model}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

