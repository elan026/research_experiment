const express = require('express');
const router = express.Router();
const fleetLogController = require('../controllers/fleetLogController');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

router.get('/audit', requirePermission('read:audit'), fleetLogController.getAuditLogs);
router.get('/cloud-syncs', requirePermission('read:reports'), fleetLogController.getCloudFleetSyncs);

module.exports = router;

