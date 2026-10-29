/**
 * Production Express + WebSocket Server for Guideline Layer Smart Transit Platform.
 */

require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');

const guidelineRoutes = require('./src/routes/guidelineRoutes');
const telemetryRoutes = require('./src/routes/telemetryRoutes');
const configRoutes = require('./src/routes/configRoutes');
const fleetLogRoutes = require('./src/routes/fleetLogRoutes');
const errorHandler = require('./src/middleware/errorHandler');
const pythonService = require('./src/services/pythonService');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/guideline', guidelineRoutes);
app.use('/api/telemetry', telemetryRoutes);
app.use('/api/config', configRoutes);
app.use('/api/fleet', fleetLogRoutes);

// Healthcheck
app.get('/health', (req, res) => {
  res.json({
    status: 'HEALTHY',
    service: 'Guideline Layer Operations Platform',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Centralized error handling
app.use(errorHandler);

// WebSocket Server for Real-Time Telemetry Broadcasting
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  console.log(`[WebSocket] Client connected from ${req.socket.remoteAddress}`);
  pythonService.registerWebSocket(ws);
});

// Initialize Python Engine Runtime
pythonService.initPythonEngine();

// Start Server
server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  Guideline Layer Smart Transit Platform Backend`);
  console.log(`  REST API  : http://localhost:${PORT}`);
  console.log(`  WebSocket : ws://localhost:${PORT}/ws`);
  console.log(`  UI        : http://localhost:${PORT}/`);
  console.log(`=======================================================`);
});

// Handle port already in use with a clean message
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[ERROR] Port ${PORT} is already in use.`);
    console.error(`  Run this to free it:`);
    console.error(`  netstat -ano | findstr :${PORT} | findstr LISTENING`);
    console.error(`  then: taskkill /F /PID <the PID from above>\n`);
    process.exit(1);
  } else {
    throw err;
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nGracefully shutting down Guideline Layer backend...');
  server.close(() => process.exit(0));
});

