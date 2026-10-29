import React from 'react';
import { BarChart3, TrendingUp, Cpu, Award, CheckCircle, AlertTriangle, ArrowRight, ShieldCheck } from 'lucide-react';

const BENCHMARK_DATA = [
  {
    name: 'Gradient Boosting (GBDT)',
    tag: 'Recommended (Optimal Pareto)',
    type: 'Decision Ensemble',
    mae_sec: 140.8,
    mae_min: 2.35,
    r2: 0.918,
    cpu_percent: 1.23,
    ram_mb: 2.8,
    battery_pct_hr: 0.12,
    violations: 0,
    alerts: 0,
    compliant: true,
    hardwareVerdict: 'Perfect fit for Edge Microprocessors',
  },
  {
    name: 'Linear Ridge Regression',
    tag: 'Lightweight Baseline',
    type: 'Linear Model',
    mae_sec: 144.3,
    mae_min: 2.41,
    r2: 0.916,
    cpu_percent: 0.45,
    ram_mb: 1.2,
    battery_pct_hr: 0.05,
    violations: 0,
    alerts: 0,
    compliant: true,
    hardwareVerdict: 'Ultra-low overhead IoT node ready',
  },
  {
    name: 'Multi-Layer Perceptron (MLP)',
    tag: 'Deep Neural Network',
    type: 'Deep Learning',
    mae_sec: 151.1,
    mae_min: 2.52,
    r2: 0.924,
    cpu_percent: 45.43,
    ram_mb: 14.5,
    battery_pct_hr: 4.80,
    violations: 107,
    alerts: 27,
    compliant: false,
    hardwareVerdict: 'Breaches 30% Embedded Limit Ceiling',
  },
];

export default function BenchmarkView() {
  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-brand-400" />
              <h2 className="text-lg font-bold text-white">
                Empirical Research Benchmark: Accuracy vs Hardware Footprint
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Evaluated on 457 real bus observations across the 32.5 km ISCON–PDPU Transit Corridor (Ahmedabad)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold flex items-center gap-1.5">
              <Award className="w-4 h-4" /> Pareto Winner: Gradient Boosting
            </span>
          </div>
        </div>

        {/* Paper Insight Callout */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs text-slate-300 space-y-2">
          <div className="flex items-center gap-2 text-brand-400 font-bold">
            <ShieldCheck className="w-4 h-4" />
            <span>Research Paper Core Empirical Finding:</span>
          </div>
          <p className="leading-relaxed">
            While Deep Learning architectures (MLP/LSTM) achieve marginally competitive statistical metrics, they consume
            <b className="text-rose-400"> 45.43% CPU</b> continuously, triggering <b className="text-rose-400">107 hardware violations</b> against
            the standard 30% vehicle telematics threshold. In contrast, <b>Gradient Boosted Trees (GBDT)</b> delivers superior
            MAE (140.8s) while requiring only <b className="text-emerald-400">1.23% CPU</b>—a <b>97.3% reduction in energy and processing strain</b>.
          </p>
        </div>
      </div>

      {/* Benchmark Matrix Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800">
          <h3 className="text-sm font-bold text-white">
            Comparative Performance & Resource Matrix
          </h3>
          <p className="text-xs text-slate-400">
            Hardware measurements gathered via the Guideline Layer Monitoring Engine
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-5 font-semibold">Model Architecture</th>
                <th className="py-3 px-4 font-semibold">MAE (Error)</th>
                <th className="py-3 px-4 font-semibold">R² Score</th>
                <th className="py-3 px-4 font-semibold">CPU Utilization</th>
                <th className="py-3 px-4 font-semibold">RAM Usage</th>
                <th className="py-3 px-4 font-semibold">Violations</th>
                <th className="py-3 px-5 font-semibold text-right">Guideline Verdict</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {BENCHMARK_DATA.map((row) => (
                <tr
                  key={row.name}
                  className={`transition-colors ${
                    !row.compliant ? 'bg-rose-950/10' : 'hover:bg-slate-850'
                  }`}
                >
                  <td className="py-4 px-5">
                    <div className="font-bold text-white text-sm">{row.name}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                      <span>{row.type}</span>
                      <span className="text-slate-600">·</span>
                      <span className={row.compliant ? 'text-emerald-400' : 'text-amber-400'}>
                        {row.tag}
                      </span>
                    </div>
                  </td>
                  <td className="py-4 px-4 font-mono">
                    <div className="font-bold text-white">{row.mae_sec.toFixed(1)}s</div>
                    <div className="text-[11px] text-slate-400">({row.mae_min.toFixed(2)} min)</div>
                  </td>
                  <td className="py-4 px-4 font-mono font-semibold text-slate-200">
                    {row.r2.toFixed(3)}
                  </td>
                  <td className="py-4 px-4 font-mono">
                    <div
                      className={`font-bold ${
                        row.cpu_percent > 30 ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {row.cpu_percent.toFixed(2)}%
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {row.cpu_percent > 30 ? 'Ceiling: 30%' : 'Within budget'}
                    </div>
                  </td>
                  <td className="py-4 px-4 font-mono text-slate-300">
                    {row.ram_mb.toFixed(1)} MB
                  </td>
                  <td className="py-4 px-4 font-mono">
                    {row.violations > 0 ? (
                      <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold">
                        {row.violations} breaches
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        0 breaches
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-5 text-right">
                    {row.compliant ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-medium">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> Compliant
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-500/10 text-rose-300 border border-rose-500/20 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> Unviable on Edge
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Visual Resource Contrast Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* CPU Consumption Comparison */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
          <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-indigo-400" />
            <span>Processor Strain vs 30% Edge Ceiling</span>
          </h4>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300 font-medium">Multi-Layer Perceptron (MLP)</span>
                <span className="text-rose-400 font-mono font-bold">45.43% CPU (151% of limit)</span>
              </div>
              <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-rose-500 rounded-full" style={{ width: '90%' }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300 font-medium">Gradient Boosting (GBDT)</span>
                <span className="text-emerald-400 font-mono font-bold">1.23% CPU (4% of limit)</span>
              </div>
              <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: '4%' }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300 font-medium">Linear Ridge</span>
                <span className="text-brand-400 font-mono font-bold">0.45% CPU (1.5% of limit)</span>
              </div>
              <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-brand-500 rounded-full" style={{ width: '1.5%' }}></div>
              </div>
            </div>
          </div>
        </div>

        {/* Closed-Loop Remediation Mechanism */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <h4 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-brand-400" />
              <span>Closed-Loop Remediation Workflow</span>
            </h4>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              When an operator deploys a resource-heavy deep neural network on an edge bus unit, the Guideline Layer executes the following automated protection:
            </p>

            <ol className="text-xs space-y-2.5 text-slate-300">
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center font-bold text-[10px] text-brand-400 shrink-0 mt-0.5">1</span>
                <span><b>Monitoring Engine</b> tracks 45.4% CPU spike across 3 consecutive bus stop inferences.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center font-bold text-[10px] text-brand-400 shrink-0 mt-0.5">2</span>
                <span><b>Threshold Checker</b> flags limit breach against the vehicle telematics profile (30.0% max).</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center font-bold text-[10px] text-brand-400 shrink-0 mt-0.5">3</span>
                <span><b>Warning & Actuation System</b> issues immediate hot-swap directive to fallback to Gradient Boosting.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center font-bold text-[10px] text-brand-400 shrink-0 mt-0.5">4</span>
                <span><b>Logging Module</b> records audit entry and transmits compressed sync packet to cloud fleet management.</span>
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

