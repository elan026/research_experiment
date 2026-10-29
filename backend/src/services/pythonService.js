/**
 * Python Engine Service Bridge.
 * Spawns and manages the Python Guideline Layer runtime process,
 * mediating commands and broadcasting real-time telemetry events.
 */

const { spawn } = require('child_process');
const path = require('path');
const telemetryModel = require('../models/telemetryModel');

const PYTHON_SCRIPT = path.resolve(__dirname, '../../engine/runner.py');
let pythonProcess = null;
const wsSubscribers = new Set();
let engineStatus = {
  initialized: false,
  activeModel: 'mlp',
  closedLoopEnabled: true,
  currentTrip: null,
  totals: { inferences: 0, violations: 0, alerts: 0, syncs: 0 },
};

function initPythonEngine() {
  if (pythonProcess) return;

  console.log(`[Python Engine] Spawning runtime: python ${PYTHON_SCRIPT}`);
  pythonProcess = spawn('python', [PYTHON_SCRIPT], {
    cwd: path.resolve(__dirname, '../../..'),
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  });

  pythonProcess.stdout.on('data', (chunk) => {
    const lines = chunk.toString().split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const event = JSON.parse(trimmed);
        handleEngineEvent(event);
      } catch (err) {
        console.log('[Python Raw]:', trimmed);
      }
    }
  });

  pythonProcess.stderr.on('data', (chunk) => {
    console.error('[Python Stderr]:', chunk.toString());
  });

  pythonProcess.on('exit', (code) => {
    console.warn(`[Python Engine] Exited with code ${code}. Restarting in 3s...`);
    pythonProcess = null;
    engineStatus.initialized = false;
    setTimeout(initPythonEngine, 3000);
  });
}

function handleEngineEvent(event) {
  if (event.type === 'INIT_DONE') {
    engineStatus.initialized = true;
    engineStatus.activeModel = event.data.active_model;
    console.log('[Python Engine] Ready. Train obs:', event.data.train_observations, 'Test obs:', event.data.test_observations);
  } else if (event.type === 'TRIP_START') {
    engineStatus.currentTrip = {
      tripId: event.trip_id,
      tripIndex: event.trip_index,
      tripsTotal: event.trips_total,
      nStops: event.n_stops,
    };
  } else if (event.type === 'TELEMETRY_INFERENCE') {
    telemetryModel.updateLatest(event);
    engineStatus.activeModel = event.model;
    engineStatus.totals = event.totals;
  }

  // Broadcast to all active WebSocket clients
  const message = JSON.stringify(event);
  for (const ws of wsSubscribers) {
    if (ws.readyState === 1 /* OPEN */) {
      ws.send(message);
    }
  }
}

function sendCommand(action, payload = {}) {
  return new Promise((resolve, reject) => {
    if (!pythonProcess || !engineStatus.initialized) {
      return reject(new Error('Python Guideline Layer engine is not initialized.'));
    }
    const cmdStr = JSON.stringify({ action, ...payload }) + '\n';
    pythonProcess.stdin.write(cmdStr, (err) => {
      if (err) return reject(err);
      resolve({ sent: true, action });
    });
  });
}

function registerWebSocket(ws) {
  wsSubscribers.add(ws);
  // Send initial state snapshot
  ws.send(JSON.stringify({
    type: 'SNAPSHOT',
    status: engineStatus,
    latestTelemetry: telemetryModel.getLatest(),
    corridor: telemetryModel.getCorridor(),
  }));

  ws.on('close', () => {
    wsSubscribers.delete(ws);
  });
}

function getEngineStatus() {
  return engineStatus;
}

module.exports = {
  initPythonEngine,
  sendCommand,
  registerWebSocket,
  getEngineStatus,
};

