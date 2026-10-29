import React from 'react';
import { Navigation, Compass, Gauge, MapPin } from 'lucide-react';

const STOPS = [
  'ISCON', 'Pakwaan', 'GuruDwara', 'Thaltej', 'Zydus',
  'Kargil', 'Sola', 'Gota', 'Vaishnodevi', 'Khoraj',
  'Adalaj', 'Sargasan', 'Raksha-Shakti', 'Bhaijipura', 'PDPU'
];

export default function CorridorMap({ telemetry, corridor }) {
  const currentStopIdx = telemetry ? telemetry.stop_index : 0;
  const totalStops = 15;
  const direction = telemetry ? telemetry.direction : 'NB';
  const currStopName = STOPS[currentStopIdx] || `Stop ${currentStopIdx + 1}`;
  const nextStopName = currentStopIdx + 1 < totalStops ? STOPS[currentStopIdx + 1] : 'Terminal';

  // SVG route geometry
  const width = 940;
  const pad = 50;
  const getX = (idx) => pad + ((width - pad * 2) * idx) / (totalStops - 1);
  const busX = getX(Math.min(currentStopIdx, totalStops - 1));

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-3 border-b border-slate-800">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Navigation className="w-4 h-4 text-brand-400" />
            <span>ISCON ↔ PDPU Corridor Live Spatial Twin</span>
          </h2>
          <p className="text-xs text-slate-400">
            32.5 km Urban Arterial Corridor · 15 Physical Transit Stations · Ahmedabad, India
          </p>
        </div>

        {/* Corridor HUD Badges */}
        <div className="flex items-center gap-2 text-xs">
          <div className="bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 flex items-center gap-2">
            <Compass className="w-3.5 h-3.5 text-brand-400" />
            <span className="text-slate-400">Heading:</span>
            <span className="text-white font-semibold">
              {direction === 'NB' ? 'NorthBound (ISCON ➔ PDPU)' : 'SouthBound (PDPU ➔ ISCON)'}
            </span>
          </div>
          <div className="bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 flex items-center gap-2">
            <Gauge className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-400">Speed:</span>
            <span className="text-emerald-400 font-semibold font-mono">
              {telemetry ? `${telemetry.avg_speed_kmh} km/h` : '0.0 km/h'}
            </span>
          </div>
          <div className="bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-slate-400">Distance Rem:</span>
            <span className="text-amber-400 font-semibold font-mono">
              {telemetry ? `${telemetry.dist_remaining_km} km` : '— km'}
            </span>
          </div>
        </div>
      </div>

      {/* SVG Route Visualization */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-4 overflow-x-auto">
        <svg viewBox="0 0 940 130" className="w-full min-w-[700px] h-32 select-none">
          {/* Main Corridor Line */}
          <line
            x1={pad}
            y1={50}
            x2={width - pad}
            y2={50}
            stroke="#1e293b"
            strokeWidth={4}
            strokeLinecap="round"
          />
          {/* Traversed segment */}
          <line
            x1={pad}
            y1={50}
            x2={busX}
            y2={50}
            stroke="#4f46e5"
            strokeWidth={4}
            strokeLinecap="round"
          />

          {/* Bus Stops */}
          {STOPS.map((name, idx) => {
            const x = getX(idx);
            const isPassed = idx < currentStopIdx;
            const isCurrent = idx === currentStopIdx;

            return (
              <g key={name}>
                <circle
                  cx={x}
                  cy={50}
                  r={isCurrent ? 7 : 5}
                  className={`transition-all duration-300 ${
                    isCurrent
                      ? 'fill-amber-400 stroke-white stroke-2'
                      : isPassed
                      ? 'fill-brand-500 stroke-slate-900 stroke-2'
                      : 'fill-slate-800 stroke-slate-700 stroke-2'
                  }`}
                />
                <text
                  x={x}
                  y={idx % 2 === 0 ? 76 : 94}
                  className={`text-[9.5px] font-medium text-center ${
                    isCurrent ? 'fill-amber-300 font-bold' : isPassed ? 'fill-slate-300' : 'fill-slate-500'
                  }`}
                  textAnchor="middle"
                >
                  {name}
                </text>
              </g>
            );
          })}

          {/* Animated Bus Marker */}
          <g transform={`translate(${busX}, 50)`} className="transition-all duration-500 ease-out">
            <circle r={14} fill="#4f46e5" className="animate-ping opacity-25" />
            <circle r={11} fill="#4f46e5" stroke="#ffffff" strokeWidth={2.5} />
            <text
              y={-20}
              className="text-[10.5px] font-bold fill-white"
              textAnchor="middle"
            >
              Bus #{telemetry ? telemetry.trip_id : '01'}
            </text>
          </g>
        </svg>

        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/80 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            <span>Current Station: <b className="text-white">{currStopName}</b> (Stop {currentStopIdx + 1} of {totalStops})</span>
          </div>
          <div>
            <span>Next Arrival: <b className="text-brand-300">{nextStopName}</b></span>
          </div>
        </div>
      </div>
    </div>
  );
}

