// src/modules/golf/golf.routes.js
//
// Golf Management — core product service.
// Owns the `/api/golf` gateway seam and wires the standard contract:
// verify JWT (who) + require the module subscription (entitlement).
// Spec: docs/systems/golf-management.md

const express = require('express');
const router = express.Router();
const { verifyToken, requireModule } = require('../../platform/serviceContext');
const unitCourseRoutes = require('./unitCourse.routes');
const courseRoutes = require('./course.routes');

// Liveness probe — unauthenticated, so the gateway/monitoring can check the seam.
router.get('/health', (req, res) => res.json({ service: 'golf', status: 'ok' }));

// Everything below requires a valid token and an entitled, active workspace.
router.use(verifyToken);
router.use(requireModule('Golf Management'));

// --- Master File Setup ---
router.use('/unit-courses', unitCourseRoutes);
router.use('/courses', courseRoutes);

// Not-yet-built areas of the service still 501 rather than 404, so a caller can
// tell "wrong URL" from "planned but not implemented".
router.use((req, res) => res.status(501).json({ message: 'This part of Golf Management is not implemented yet.' }));

module.exports = router;
