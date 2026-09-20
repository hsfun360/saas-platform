// src/modules/golf/golf.routes.js
//
// Golf Management — core product service.
// Owns the `/api/golf` gateway seam and wires the standard contract:
// verify JWT (who) + require the module subscription (entitlement).
// Spec: docs/systems/golf-management.md

const express = require('express');
const router = express.Router();
const { verifyToken, requireModule, requireMenuAction } = require('../../platform/serviceContext');
const unitCourseRoutes = require('./unitCourse.routes');
const courseRoutes = require('./course.routes');
const transactionTypesRoutes = require('./transactionTypes.routes');

// Liveness probe — unauthenticated, so the gateway/monitoring can check the seam.
router.get('/health', (req, res) => res.json({ service: 'golf', status: 'ok' }));

// Everything below requires a valid token and an entitled, active workspace.
router.use(verifyToken);
router.use(requireModule('GOLF'));

// --- Master File Setup ---
router.use('/unit-courses', unitCourseRoutes);
router.use('/courses', courseRoutes);
router.use('/transaction-types', requireMenuAction('/golf/transaction-types'), transactionTypesRoutes);
router.use('/payment-types', requireMenuAction('/golf/payment-types'), require('./paymentTypes.routes'));

// --- Golf Specification (per-company settings singleton + advance-booking
// overrides; user decisions 2026-09-17) ---
const golfSettingController = require('./golfSetting.controller');
router.get('/settings', requireMenuAction('/golf/settings'), golfSettingController.get);
router.get('/settings/membership-types', requireMenuAction('/golf/settings'), golfSettingController.getMembershipTypes);
router.get('/settings/courses', requireMenuAction('/golf/settings'), golfSettingController.getCourses);
router.put('/settings', requireMenuAction('/golf/settings'), golfSettingController.save);

// --- Booking (dynamic tee sheet: availability + flight locks + bookings;
// user decisions 2026-09-20) ---
router.use('/bookings', requireMenuAction('/golf/bookings'), require('./bookings.routes'));

// --- Numbering Control (golf-owned series: booking / registration / bill /
// rain check; split per module 2026-08-05) ---
const { makeNumberingRouter } = require('../../platform/numberingController');
router.use(
    '/numbering-schemes',
    requireMenuAction('/golf/numbering'),
    makeNumberingRouter({
        model: require('./numberingScheme.model'),
        purposes: require('../saas/numberingScheme.constants').GOLF_NUMBERING_PURPOSES,
    }),
);

// Not-yet-built areas of the service still 501 rather than 404, so a caller can
// tell "wrong URL" from "planned but not implemented".
router.use((req, res) => res.status(501).json({ message: 'This part of Golf Management is not implemented yet.' }));

module.exports = router;
