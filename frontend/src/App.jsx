import React, { useState, useEffect, useRef } from 'react';
import Navbar from './components/Navbar';
import CorridorMap from './components/CorridorMap';
import DualOutputStage from './components/DualOutputStage';
import ClosedLoopActuator from './components/ClosedLoopActuator';
import BenchmarkView from './components/BenchmarkView';
import DeviceProfilesView from './components/DeviceProfilesView';
import FleetAuditView from './components/FleetAuditView';
import { Play, Pause, FastForward, Radio, ShieldCheck, Activity } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('console'); // 'console', 'benchmarks', 'profiles', 'audit'
  const [role, setRole] = useState('engineer'); // 'operator' | 'engineer' (Default to engineer for full access)
  const [wsConnected, setWsConnected] = useState(false);
  const [guidelineStatus, setGuidelineStatus] = useState(null);
  const [latestTelemetry, setLatestTelemetry] = useState(null);
  const [corridor, setCorridor] = useState(null);
  const [activeProfile, setActiveProfile] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(40);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  // Initial data load (Corridor, Profile, Status)
  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      const [corrRes, profRes, statusRes] = await Promise.all([
        fetch('/api/telemetry/corridor'),
        fetch('/api/config/profiles'),
        fetch('/api/guideline/status'),
      ]);
      if (corrRes.ok) setCorridor(await corrRes.json());
      if (profRes.ok) {
        const pData = await profRes.json();
        setActiveProfile(pData.active);
      }
      if (statusRes.ok) setGuidelineStatus(await statusRes.json());
    } catch (err) {
      console.warn('Initial REST load error:', err);
    }
  };

  // WebSocket Connection Management
  useEffect(() => {
    let unmounted = false;

    const connectWs = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (unmounted) return;
        setWsConnected(true);
        console.log('[WebSocket] Connected to Guideline Layer telemetry stream.');
      };

      ws.onmessage = (event) => {
        if (unmounted) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'SNAPSHOT') {
            if (data.status) setGuidelineStatus(data.status);
            if (data.latestTelemetry) setLatestTelemetry(data.latestTelemetry);
            if (data.corridor) setCorridor(data.corridor);
          } else if (data.type === 'TELEMETRY_INFERENCE') {
            setLatestTelemetry(data);
          } else if (data.type === 'TRIP_START') {
            console.log(`[Corridor] Trip #${data.trip_id} departed (${data.trip_index}/${data.trips_total})`);
          }
        } catch (err) {
          console.error('[WebSocket] Parsing error:', err);
        }
      };

      ws.onclose = () => {
        if (unmounted) return;
        setWsConnected(false);
        console.warn('[WebSocket] Disconnected. Reconnecting in 2s...');
        reconnectTimeoutRef.current = setTimeout(connectWs, 2000);
      };

      ws.onerror = (err) => {
        console.warn('[WebSocket] Error observed, socket closing.');
        ws.close();
      };
    };

    connectWs();

    return () => {
      unmounted = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // Actions
  const handleModelChange = async (model) => {
    try {
      const res = await fetch('/api/guideline/model', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': role,
        },
        body: JSON.stringify({ model }),
      });
      if (res.ok) {
        setLatestTelemetry((prev) => (prev ? { ...prev, model } : null));
      }
    } catch (err) {
      console.error('Failed to set model:', err);
    }
  };

  const handleToggleClosedLoop = async (enabled) => {
    try {
      const res = await fetch('/api/guideline/closed-loop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': role,
        },
        body: JSON.stringify({ enabled }),
      });
      if (res.ok) {
        setLatestTelemetry((prev) =>
          prev ? { ...prev, closed_loop_enabled: enabled } : null
        );
      }
    } catch (err) {
      console.error('Failed to toggle closed loop:', err);
    }
  };

  const handleManualRemediate = async (action) => {
    try {
      await fetch('/api/guideline/remediate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': role,
        },
        body: JSON.stringify({ action }),
      });
    } catch (err) {
      console.error('Failed to trigger remediation:', err);
    }
  };

  const handleTogglePause = async () => {
    const action = isPaused ? 'resume' : 'pause';
    try {
      await fetch(`/api/telemetry/${action}`, {
        method: 'POST',
        headers: { 'x-user-role': role },
      });
      setIsPaused(!isPaused);
    } catch (err) {
      console.error('Failed to toggle pause:', err);
    }
  };

  const handleSpeedSelect = async (speedMs) => {
    try {
      await fetch('/api/telemetry/speed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': role,
        },
        body: JSON.stringify({ speedMs }),
      });
      setPlaybackSpeed(speedMs);
    } catch (err) {
      console.error('Failed to change playback speed:', err);
    }
  };

  const handleThresholdsUpdated = () => {
    fetchInitialData();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        role={role}
        setRole={setRole}
        engineStatus={guidelineStatus}
        latestTelemetry={latestTelemetry}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Stream Status & Corridor HUD Bar (Always visible on console) */}
        {activeTab === 'console' && (
          <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs shadow-sm">
            {/* Live Feed Status */}
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 font-semibold text-slate-300">
                <Radio
                  className={`w-4 h-4 ${
                    wsConnected ? 'text-emerald-400 animate-pulse' : 'text-rose-400'
                  }`}
                />
                <span>
                  Telemetry Stream:{' '}
                  <b className={wsConnected ? 'text-emerald-400' : 'text-rose-400'}>
                    {wsConnected ? 'LIVE (1.0 Hz)' : 'Connecting...'}
                  </b>
                </span>
              </span>

              {latestTelemetry && (
                <span className="text-slate-400 hidden sm:inline">
                  · Bus Trip <b className="text-white font-mono font-bold">#{latestTelemetry.trip_id}</b>
                  {' '}(Stop {latestTelemetry.stop_index + 1}/15)
                </span>
              )}
            </div>

            {/* Stream Playback Controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleTogglePause}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              >
                {isPaused ? <Play className="w-3.5 h-3.5 text-emerald-400" /> : <Pause className="w-3.5 h-3.5 text-amber-400" />}
                <span>{isPaused ? 'Resume' : 'Pause'}</span>
              </button>

              <div className="flex items-center bg-slate-950 rounded border border-slate-800 p-0.5">
                {[
                  { label: '1x (80ms)', speed: 80 },
                  { label: '2x (40ms)', speed: 40 },
                  { label: '5x (10ms)', speed: 10 },
                ].map((s) => (
                  <button
                    key={s.speed}
                    onClick={() => handleSpeedSelect(s.speed)}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                      playbackSpeed === s.speed
                        ? 'bg-brand-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 1: Operations Console */}
        {activeTab === 'console' && (
          <div className="space-y-6">
            {/* 1. Spatial Corridor Twin */}
            <CorridorMap telemetry={latestTelemetry} corridor={corridor} />

            {/* 2. Dual Output Stage (Paper Stage 1 ETA + Stage 2 Hardware Awareness) */}
            <DualOutputStage
              telemetry={latestTelemetry}
              activeProfile={activeProfile}
            />

            {/* 3. Guideline Layer 4 Modules & Autonomous Closed-Loop Actuator */}
            <ClosedLoopActuator
              guidelineStatus={guidelineStatus}
              latestTelemetry={latestTelemetry}
              role={role}
              onModelChange={handleModelChange}
              onToggleClosedLoop={handleToggleClosedLoop}
              onManualRemediate={handleManualRemediate}
            />
          </div>
        )}

        {/* Tab 2: Empirical Benchmarks */}
        {activeTab === 'benchmarks' && <BenchmarkView />}

        {/* Tab 3: Device Hardware Budgets */}
        {activeTab === 'profiles' && (
          <DeviceProfilesView
            role={role}
            onThresholdsUpdated={handleThresholdsUpdated}
          />
        )}

        {/* Tab 4: Fleet Audit & Cloud Logs */}
        {activeTab === 'audit' && <FleetAuditView role={role} />}
      </main>

      {/* Production Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-900/60 py-4 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <div>
            <b>Guideline Layer for ETA Prediction in Smart Transportation</b> · Resource-Aware Edge AI Platform
          </div>
          <div className="flex items-center gap-4">
            <span>ISCON ↔ PDPU Corridor Dataset (Ahmedabad)</span>
            <span>·</span>
            <span>REST API: Port 5000</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
