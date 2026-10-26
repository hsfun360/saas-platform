const express = require('express');
const { validate } = require('../../platform/validate');
const router = express.Router();
const controller = require('./classLifecycle.controller');
const s = require('./class.schemas');

// Mounted at /api/facility/class-lifecycle (slice 5c) behind the Class
// Schedule OR Control Station menu grant: the patron's cancellation of a
// seat (preview, then cancel) and the waitlist (join, offer, confirm,
// withdraw). The parent facility router applies verifyToken +
// requireModule('FACILITY').
router.get('/enrolments/:id/cancel-preview', validate(s.cancelPreview), controller.cancelPreview);
router.post('/enrolments/:id/cancel', validate(s.cancelEnrolment), controller.cancelEnrolment);
router.post('/waitlist', validate(s.waitlistJoin), controller.join);
router.post('/waitlist/:id/offer', validate(s.waitlistAction), controller.offer);
router.post('/waitlist/:id/confirm', validate(s.waitlistAction), controller.confirm);
router.post('/waitlist/:id/withdraw', validate(s.waitlistAction), controller.withdraw);

module.exports = router;
