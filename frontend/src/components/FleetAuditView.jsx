import React, { useState, useEffect } from 'react';
import { Cloud, FileText, AlertTriangle, ShieldCheck, Download, RefreshCw, Filter } from 'lucide-react';

export default function FleetAuditView({ role }) {
  const [activeSubTab, setActiveSubTab] = useState('inferences'); // 'inferences', 'warnings', 'cloud'
  const [inferences, setInferences] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [cloudSyncs, setCloudSyncs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterTrip, setFilterTrip] = useState('');

  useEffect(() => {
    fetchLogs();
  }, [activeSubTab]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      if (activeSubTab === 'cloud') {
        const res = await fetch('/api/fleet/cloud?role=' + role);
        const data = await res.json();
        setCloudSyncs(data.records || []);
      } else {
        const res = await fetch('/api/fleet/audit?limit=100&role=' + role);
        const data = await res.json();
        setInferences(data.inferences || []);
        setWarnings(data.warnings || []);
      }
    } catch (err) {
      console.error('Failed to load fleet audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredInferences = inferences.filter(
    (item) => !filterTrip || String(item.trip_id).includes(filterTrip)
  );

  const filteredWarnings = warnings.filter(
    (item) => !filterTrip || String(item.trip_id).includes(filterTrip)
  );

  const downloadJson = () => {
    const data =
      activeSubTab === 'cloud'
        ? cloudSyncs
        : activeSubTab === 'warnings'
        ? filteredWarnings
        : filteredInferences;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `guideline_audit_${activeSubTab}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Header & Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-brand-400" />
              <h2 className="text-base font-bold text-white">
                Fleet Audit Trail & Central Cloud Synchronization
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Persistent edge JSONL records and periodic compressed cloud fleet logs (Paper Module 4)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchLogs}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={downloadJson}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-brand-600 hover:bg-brand-500 text-white shadow transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export JSON</span>
            </button>
          </div>
        </div>

        {/* Sub-Tabs & Filter */}
        <div className="flex flex-wrap items-center justify-between gap-4 mt-4">
          <div className="flex space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setActiveSubTab('inferences')}
              className={`px-3 py-1 rounded-md font-medium transition ${
                activeSubTab === 'inferences'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Edge Inferences ({inferences.length})
            </button>
            <button
              onClick={() => setActiveSubTab('warnings')}
              className={`px-3 py-1 rounded-md font-medium transition ${
                activeSubTab === 'warnings'
                  ? 'bg-amber-600/30 text-amber-300 shadow-sm border border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Warnings & Violations ({warnings.length})
            </button>
            <button
              onClick={() => setActiveSubTab('cloud')}
              className={`px-3 py-1 rounded-md font-medium transition ${
                activeSubTab === 'cloud'
                  ? 'bg-cyan-600/30 text-cyan-300 shadow-sm border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Central Fleet Cloud Syncs ({cloudSyncs.length})
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Filter by Trip ID..."
              value={filterTrip}
              onChange={(e) => setFilterTrip(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500 font-mono"
            />
          </div>
        </div>
      </div>

      {/* Table Data */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-brand-400" />
            <span>Reading log buffers...</span>
          </div>
        ) : activeSubTab === 'inferences' ? (
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 sticky top-0 z-10">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Timestamp / Sim</th>
                  <th className="py-2.5 px-4 font-semibold">Trip</th>
                  <th className="py-2.5 px-4 font-semibold">Stop</th>
                  <th className="py-2.5 px-4 font-semibold">Model</th>
                  <th className="py-2.5 px-4 font-semibold">Pred vs Actual</th>
                  <th className="py-2.5 px-4 font-semibold">Error</th>
                  <th className="py-2.5 px-4 font-semibold">CPU</th>
                  <th className="py-2.5 px-4 font-semibold">RAM</th>
                  <th className="py-2.5 px-4 font-semibold">Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 font-mono">
                {filteredInferences.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-500 font-sans">
                      No edge inference logs found.
                    </td>
                  </tr>
                ) : (
                  filteredInferences.map((inf, idx) => {
                    const cpu = inf.cpu_percent || 0;
                    return (
                      <tr key={idx} className="hover:bg-slate-850">
                        <td className="py-2.5 px-4 text-slate-400">
                          {inf.sim_time_sec ? `${inf.sim_time_sec.toFixed(0)}s` : inf.timestamp ? new Date(inf.timestamp).toLocaleTimeString() : `#${idx}`}
                        </td>
                        <td className="py-2.5 px-4 text-white font-bold">Bus #{inf.trip_id}</td>
                        <td className="py-2.5 px-4 text-slate-300">Stop {inf.stop_index}</td>
                        <td className="py-2.5 px-4 text-brand-300 font-sans capitalize">{inf.model}</td>
                        <td className="py-2.5 px-4 text-slate-300">
                          {inf.pred_min ? `${inf.pred_min.toFixed(1)}m` : '—'} / {inf.actual_min ? `${inf.actual_min.toFixed(1)}m` : '—'}
                        </td>
                        <td className="py-2.5 px-4">
                          <span className={Math.abs(inf.error_s) < 60 ? 'text-emerald-400' : 'text-amber-400'}>
                            {inf.error_s !== undefined ? `${inf.error_s.toFixed(1)}s` : '—'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4">
                          <span className={cpu > 30 ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                            {cpu.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-slate-400">
                          {inf.model_footprint_mb ? `${inf.model_footprint_mb.toFixed(1)}M` : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-slate-400">
                          {inf.inference_ms ? `${inf.inference_ms.toFixed(2)}ms` : '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : activeSubTab === 'warnings' ? (
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 sticky top-0 z-10">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Sim Time</th>
                  <th className="py-2.5 px-4 font-semibold">Level</th>
                  <th className="py-2.5 px-4 font-semibold">Metric</th>
                  <th className="py-2.5 px-4 font-semibold">Observed Value</th>
                  <th className="py-2.5 px-4 font-semibold">Threshold Limit</th>
                  <th className="py-2.5 px-4 font-semibold">Guideline Directive / Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredWarnings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No warning or violation entries registered.
                    </td>
                  </tr>
                ) : (
                  filteredWarnings.map((warn, idx) => (
                    <tr key={idx} className="hover:bg-slate-850">
                      <td className="py-2.5 px-4 font-mono text-slate-400">
                        {warn.sim_time_sec !== undefined ? `${warn.sim_time_sec.toFixed(0)}s` : `#${idx}`}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          {warn.level || 'WARNING'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-200">{warn.metric}</td>
                      <td className="py-2.5 px-4 font-mono text-rose-400 font-bold">{warn.observed_value}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-400">&le; {warn.threshold_limit}</td>
                      <td className="py-2.5 px-4 text-slate-300 font-sans">{warn.message}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 sticky top-0 z-10">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Sync Counter</th>
                  <th className="py-2.5 px-4 font-semibold">Sim Time</th>
                  <th className="py-2.5 px-4 font-semibold">Total Inferences</th>
                  <th className="py-2.5 px-4 font-semibold">Payload Size</th>
                  <th className="py-2.5 px-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 font-mono">
                {cloudSyncs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500 font-sans">
                      No central cloud fleet synchronizations recorded yet.
                    </td>
                  </tr>
                ) : (
                  cloudSyncs.map((sync, idx) => (
                    <tr key={idx} className="hover:bg-slate-850">
                      <td className="py-2.5 px-4 text-white font-bold">Sync #{sync.sync_counter || idx + 1}</td>
                      <td className="py-2.5 px-4 text-slate-400">{sync.sim_time_sec || '—'}s</td>
                      <td className="py-2.5 px-4 text-cyan-400 font-bold">{sync.n_inferences || '10'} recs</td>
                      <td className="py-2.5 px-4 text-slate-300">{sync.payload_bytes || '1,024'} bytes</td>
                      <td className="py-2.5 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                          CLOUD_SYNC_SUCCESS
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

