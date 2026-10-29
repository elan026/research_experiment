const express = require('express');
const router = express.Router();
const configController = require('../controllers/configController');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

router.get('/profiles', requirePermission('read:guideline'), configController.getProfiles);
router.post('/profile', requirePermission('write:thresholds'), configController.selectProfile);
router.put('/thresholds', requirePermission('write:thresholds'), configController.updateThresholds);

module.exports = router;

