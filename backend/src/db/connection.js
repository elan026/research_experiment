/**
 * MySQL Database Connection & Persistence Service.
 * Implements connection pooling, query execution, and audit trail persistence.
 */

const mysql = require('mysql2/promise');

let pool = null;
let isConnected = false;

const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'guideline_transit',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

async function initDatabase() {
  try {
    pool = mysql.createPool(dbConfig);
    // Test connectivity
    const connection = await pool.getConnection();
    console.log(`[MySQL DB] Successfully connected to MySQL at ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
    connection.release();
    isConnected = true;
  } catch (err) {
    console.warn(`[MySQL DB] Database connection deferred (${err.code || err.message}). Fallback to JSONL file storage.`);
    isConnected = false;
  }
}

async function query(sql, params = []) {
  if (!isConnected || !pool) return null;
  try {
    const [rows] = await pool.execute(sql, params);
    return rows;
  } catch (err) {
    console.error('[MySQL DB Query Error]:', err.message);
    return null;
  }
}

async function logInference(telemetry) {
  if (!isConnected || !pool) return;
  const sql = `
    INSERT INTO inferences 
      (trip_id, direction, stop_index, stops_remaining, dist_remaining_km, avg_speed_kmh, elapsed_min, pred_min, actual_min, error_seconds, model_name, cpu_percent, ram_mb, battery_drain_pct_hr, bandwidth_kb_min, latency_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const m = telemetry.metrics || {};
  const params = [
    telemetry.trip_id,
    telemetry.direction || 'NB',
    telemetry.stop_index,
    telemetry.stops_remaining || 0,
    telemetry.dist_remaining_km || 0,
    telemetry.avg_speed_kmh || 0,
    telemetry.elapsed_min || 0,
    telemetry.pred_min,
    telemetry.actual_min,
    telemetry.error_s || 0,
    telemetry.model,
    m.cpu_percent || 0,
    m.ram_mb || 0,
    m.battery_drain_pct_hr || 0,
    m.bandwidth_kb_per_min || 0,
    m.inference_ms || 0,
  ];
  return query(sql, params);
}

async function logRemediation(event) {
  if (!isConnected || !pool) return;
  const sql = `
    INSERT INTO remediation_directives (action, trigger_reason, from_model, to_model, executed_by_role, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  const params = [
    event.action,
    event.trigger,
    event.from_model,
    event.to_model,
    'system_closed_loop',
    event.reason,
  ];
  return query(sql, params);
}

module.exports = {
  initDatabase,
  query,
  logInference,
  logRemediation,
  isDbConnected: () => isConnected,
};

