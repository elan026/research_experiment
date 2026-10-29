import React, { useState, useEffect } from 'react';
import { HardDrive, Cpu, BatteryCharging, Wifi, ShieldAlert, Check, RefreshCw } from 'lucide-react';

export default function DeviceProfilesView({ role, onThresholdsUpdated }) {
  const [profiles, setProfiles] = useState([]);
  const [activeProfileId, setActiveProfileId] = useState('embedded_telematics');
  const [thresholds, setThresholds] = useState({
    cpu_percent: 30.0,
    ram_mb: 500.0,
    battery_drain_pct_hr: 20.0,
    bandwidth_kb_per_min: 1024.0,
  });
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  const isEngineer = role === 'engineer';

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    try {
      const res = await fetch('/api/config/profiles');
      const data = await res.json();
      if (data.availableProfiles) {
        setProfiles(data.availableProfiles);
      }
      if (data.active) {
        setActiveProfileId(data.active.profile.id);
        setThresholds(data.active.currentThresholds);
      }
    } catch (err) {
      console.error('Failed to fetch hardware profiles:', err);
    }
  };

  const handleSelectProfile = async (profileId) => {
    if (!isEngineer) return;
    try {
      setSaving(true);
      const res = await fetch('/api/config/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': role,
        },
        body: JSON.stringify({ profileId }),
      });
      const data = await res.json();
      if (res.ok) {
        setActiveProfileId(profileId);
        setThresholds(data.active.currentThresholds);
        setStatusMsg({ type: 'success', text: data.message });
        if (onThresholdsUpdated) onThresholdsUpdated();
      } else {
        setStatusMsg({ type: 'error', text: data.message });
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Error applying hardware profile.' });
    } finally {
      setSaving(false);
      setTimeout(() => setStatusMsg(null), 4000);
    }
  };

  const handleCustomSubmit = async (e) => {
    e.preventDefault();
    if (!isEngineer) return;
    try {
      setSaving(true);
      const res = await fetch('/api/config/thresholds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': role,
        },
        body: JSON.stringify(thresholds),
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMsg({ type: 'success', text: data.message });
        if (onThresholdsUpdated) onThresholdsUpdated();
      } else {
        setStatusMsg({ type: 'error', text: data.message });
      }
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Failed to update custom thresholds.' });
    } finally {
      setSaving(false);
      setTimeout(() => setStatusMsg(null), 4000);
    }
  };

  return (
    <div className="space-y-6">
      {/* RBAC Notice if Operator */}
      {!isEngineer && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center justify-between text-xs text-amber-300">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <b>RBAC Policy:</b> You are signed in as <b>Operator</b> (read-only). Switch to <b>Engineer</b> role in the top bar to edit device hardware budgets.
            </span>
          </div>
        </div>
      )}

      {/* Profile Selection Cards */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-indigo-400" />
              <span>Target Edge Device Hardware Profiles</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Select target vehicle edge microprocessor class to automatically configure Guideline Layer budget thresholds
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {profiles.map((p) => {
            const isSelected = p.id === activeProfileId;
            return (
              <div
                key={p.id}
                onClick={() => handleSelectProfile(p.id)}
                className={`rounded-xl p-4 border transition-all ${
                  isSelected
                    ? 'bg-indigo-950/20 border-indigo-500 ring-1 ring-indigo-500/50 shadow-sm'
                    : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                } ${isEngineer ? 'cursor-pointer' : 'cursor-not-allowed opacity-90'}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-sm text-white">{p.name}</h3>
                  {isSelected && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Active
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mb-3">{p.description}</p>
                <div className="text-[11px] text-slate-500 mb-3 font-mono">
                  Hardware: <span className="text-slate-300">{p.targetHardware}</span>
                </div>

                <div className="bg-slate-900/80 rounded-lg p-2.5 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Max CPU:</span>
                    <span className="font-mono font-bold text-white">&le; {p.thresholds.cpu_percent}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">RAM Limit:</span>
                    <span className="font-mono text-slate-300">&le; {p.thresholds.ram_mb} MB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Battery Drain:</span>
                    <span className="font-mono text-slate-300">&le; {p.thresholds.battery_drain_pct_hr}%/hr</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Bandwidth:</span>
                    <span className="font-mono text-slate-300">&le; {p.thresholds.bandwidth_kb_per_min} KB/min</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Threshold Tuner Form */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <h3 className="text-sm font-bold text-white mb-1">
          Custom Hardware Threshold Tuner
        </h3>
        <p className="text-xs text-slate-400 mb-5">
          Fine-tune the threshold parameters that trigger Guideline Layer alerts and auto-remediations
        </p>

        {statusMsg && (
          <div
            className={`mb-5 p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
              statusMsg.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
            }`}
          >
            {statusMsg.text}
          </div>
        )}

        <form onSubmit={handleCustomSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* CPU Ceiling */}
            <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl">
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                CPU Limit Ceiling (%)
              </label>
              <input
                type="number"
                step="1"
                min="5"
                max="100"
                disabled={!isEngineer || saving}
                value={thresholds.cpu_percent}
                onChange={(e) =>
                  setThresholds({ ...thresholds, cpu_percent: parseFloat(e.target.value) || 0 })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-brand-500 focus:outline-none disabled:opacity-50"
              />
              <span className="text-[10px] text-slate-500 block mt-1.5">
                Standard IEEE reference: 30%
              </span>
            </div>

            {/* RAM Limit */}
            <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl">
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
                RAM Memory Ceiling (MB)
              </label>
              <input
                type="number"
                step="1"
                min="1"
                max="4096"
                disabled={!isEngineer || saving}
                value={thresholds.ram_mb}
                onChange={(e) =>
                  setThresholds({ ...thresholds, ram_mb: parseFloat(e.target.value) || 0 })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-brand-500 focus:outline-none disabled:opacity-50"
              />
              <span className="text-[10px] text-slate-500 block mt-1.5">
                Max model resident memory
              </span>
            </div>

            {/* Battery Drain */}
            <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl">
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                <BatteryCharging className="w-3.5 h-3.5 text-amber-400" />
                Max Battery Drain (%/hr)
              </label>
              <input
                type="number"
                step="0.5"
                min="1"
                max="50"
                disabled={!isEngineer || saving}
                value={thresholds.battery_drain_pct_hr}
                onChange={(e) =>
                  setThresholds({
                    ...thresholds,
                    battery_drain_pct_hr: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-brand-500 focus:outline-none disabled:opacity-50"
              />
              <span className="text-[10px] text-slate-500 block mt-1.5">
                Estimated power drain budget
              </span>
            </div>

            {/* Bandwidth */}
            <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl">
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                <Wifi className="w-3.5 h-3.5 text-blue-400" />
                Network Bandwidth (KB/min)
              </label>
              <input
                type="number"
                step="10"
                min="10"
                max="10240"
                disabled={!isEngineer || saving}
                value={thresholds.bandwidth_kb_per_min}
                onChange={(e) =>
                  setThresholds({
                    ...thresholds,
                    bandwidth_kb_per_min: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-brand-500 focus:outline-none disabled:opacity-50"
              />
              <span className="text-[10px] text-slate-500 block mt-1.5">
                Telemetry payload sync budget
              </span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={!isEngineer || saving}
              className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition disabled:opacity-50 shadow-md flex items-center gap-2"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>Apply Thresholds to Guideline Engine</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

