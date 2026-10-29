/**
 * Fleet Log & Audit Controller.
 * Reads persistent JSONL logs and fleet synchronization records.
 */

const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.resolve(__dirname, '../../../results/latest/logs');
const CLOUD_DIR = path.resolve(__dirname, '../../../results/latest/cloud');

function getAuditLogs(req, res) {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const logFile = path.join(LOGS_DIR, 'inferences.jsonl');
  const warningsFile = path.join(LOGS_DIR, 'warnings.jsonl');

  const inferences = readJsonlTail(logFile, limit);
  const warnings = readJsonlTail(warningsFile, limit);

  res.json({
    totalInferences: inferences.length,
    totalWarnings: warnings.length,
    inferences,
    warnings,
  });
}

function getCloudFleetSyncs(req, res) {
  const fleetFile = path.join(CLOUD_DIR, 'fleet_log.csv');
  if (!fs.existsSync(fleetFile)) {
    return res.json({ records: [] });
  }

  const content = fs.readFileSync(fleetFile, 'utf8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',');
  const records = lines.slice(1).map((line) => {
    const values = line.split(',');
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h.trim()] = values[idx] ? values[idx].trim() : null;
    });
    return obj;
  });

  res.json({
    count: records.length,
    records,
  });
}

function readJsonlTail(filePath, maxLines) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    const lines = text.trim().split('\n').filter(Boolean);
    const sliced = lines.slice(-maxLines);
    return sliced.map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return { raw: l };
      }
    });
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
    return [];
  }
}

module.exports = {
  getAuditLogs,
  getCloudFleetSyncs,
};

