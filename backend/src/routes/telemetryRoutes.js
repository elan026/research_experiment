const express = require('express');
const router = express.Router();
const telemetryController = require('../controllers/telemetryController');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

router.get('/corridor', requirePermission('read:telemetry'), telemetryController.getCorridor);
router.get('/latest', requirePermission('read:telemetry'), telemetryController.getLatestTelemetry);
router.get('/history', requirePermission('read:telemetry'), telemetryController.getRecentHistory);

// Stream controls
router.post('/speed', requirePermission('write:actuation'), telemetryController.setPlaybackSpeed);
router.post('/pause', requirePermission('write:actuation'), telemetryController.pauseStream);
router.post('/resume', requirePermission('write:actuation'), telemetryController.resumeStream);

module.exports = router;

