// src/modules/facility/facility.routes.js
//
// Facility Management — core product service (STUB).
// Reserves the `/api/facility` gateway seam and wires the standard contract:
// verify JWT (who) + require the module subscription (entitlement). Replace the
// 501 handler with real controllers as the service is built.
// Spec: docs/systems/facility-management.md

const express = require('express');
const router = express.Router();
const { verifyToken, requireModule } = require('../../platform/serviceContext');

// Liveness probe — unauthenticated, so the gateway/monitoring can check the seam.
router.get('/health', (req, res) => res.json({ service: 'facility', status: 'stub' }));

// Everything below requires a valid token and an entitled, active workspace.
router.use(verifyToken);
router.use(requireModule('Facility Management'));

// Placeholder until controllers exist.
router.use((req, res) => res.status(501).json({ message: 'Facility Management is not implemented yet.' }));

module.exports = router;
