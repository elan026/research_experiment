/**
 * Telemetry Controller.
 * Manages bus corridor telemetry, coordinates, and stream playback.
 */

const telemetryModel = require('../models/telemetryModel');
const pythonService = require('../services/pythonService');

function getCorridor(req, res) {
  const corridor = telemetryModel.getCorridor();
  res.json(corridor);
}

function getLatestTelemetry(req, res) {
  const latest = telemetryModel.getLatest();
  if (!latest) {
    return res.status(204).json({ message: 'No telemetry packets received yet.' });
  }
  res.json(latest);
}

function getRecentHistory(req, res) {
  const history = telemetryModel.getRecentHistory();
  res.json({
    count: history.length,
    history,
  });
}

async function setPlaybackSpeed(req, res, next) {
  try {
    const { speedMs } = req.body;
    const speed = Math.max(0, Math.min(Number(speedMs) || 40, 1000));
    await pythonService.sendCommand('SET_SPEED', { speed_ms: speed });
    res.json({ ok: true, speedMs: speed });
  } catch (err) {
    next(err);
  }
}

async function pauseStream(req, res, next) {
  try {
    await pythonService.sendCommand('PAUSE');
    res.json({ ok: true, state: 'PAUSED' });
  } catch (err) {
    next(err);
  }
}

async function resumeStream(req, res, next) {
  try {
    await pythonService.sendCommand('RESUME');
    res.json({ ok: true, state: 'RUNNING' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getCorridor,
  getLatestTelemetry,
  getRecentHistory,
  setPlaybackSpeed,
  pauseStream,
  resumeStream,
};

