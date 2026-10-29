const express = require('express');
const router = express.Router();
const guidelineController = require('../controllers/guidelineController');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

// Public/Operator & Engineer
router.get('/status', requirePermission('read:guideline'), guidelineController.getGuidelineStatus);

// Engineer-only scoped routes
router.post('/model', requirePermission('write:actuation'), guidelineController.setModel);
router.post('/closed-loop', requirePermission('write:actuation'), guidelineController.setClosedLoop);
router.post('/remediate', requirePermission('write:actuation'), guidelineController.triggerManualRemediation);

module.exports = router;

