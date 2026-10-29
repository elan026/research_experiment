import React from 'react';
import { Activity, Cpu, ShieldCheck, Cloud, User, Terminal, HardDrive } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, role, setRole, engineStatus, latestTelemetry }) {
  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-brand-500/25">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-white tracking-tight">Guideline Layer</span>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30">
                  Operations Console
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Resource-Aware Edge AI Platform · ISCON–PDPU Corridor
              </p>
            </div>
          </div>

          {/* Module Live Health Indicators */}
          <div className="hidden lg:flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700/60 text-slate-300">
              <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span>Monitoring Engine: <b className="text-emerald-400 font-medium">Active</b></span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700/60 text-slate-300">
              <Cpu className="w-3.5 h-3.5 text-indigo-400" />
              <span>Threshold Checker: <b className="text-indigo-400 font-medium">&le; 30% CPU</b></span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700/60 text-slate-300">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
              <span>Closed Loop: <b className="text-amber-400 font-medium">Enforced</b></span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700/60 text-slate-300">
              <Cloud className="w-3.5 h-3.5 text-cyan-400" />
              <span>Fleet Cloud: <b className="text-cyan-400 font-medium">Synced</b></span>
            </div>
          </div>

          {/* Role Switcher (RBAC) */}
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-1 text-xs">
              <button
                onClick={() => setRole('operator')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-colors ${
                  role === 'operator'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>Operator</span>
              </button>
              <button
                onClick={() => setRole('engineer')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-colors ${
                  role === 'engineer'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Engineer</span>
              </button>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex space-x-1 border-t border-slate-800/80 pt-2 pb-2">
          {[
            { id: 'console', label: 'Corridor Operations' },
            { id: 'benchmarks', label: 'Model Benchmarks & Resources' },
            { id: 'profiles', label: 'Device Hardware Budgets' },
            { id: 'audit', label: 'Fleet Audit & Cloud Logs' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                activeTab === tab.id
                  ? 'bg-slate-800 text-white border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}

