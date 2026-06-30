// src/modules/membership/membership.routes.js
//
// Membership Management — core product service (STUB).
// Reserves the `/api/membership` gateway seam and wires the standard contract:
// verify JWT (who) + require the module subscription (entitlement). Replace the
// 501 handler with real controllers as the service is built.
// Spec: docs/systems/membership-management.md

const express = require('express');
const router = express.Router();
const { verifyToken, requireModule } = require('../../platform/serviceContext');

// Liveness probe — unauthenticated, so the gateway/monitoring can check the seam.
router.get('/health', (req, res) => res.json({ service: 'membership', status: 'stub' }));

// Everything below requires a valid token and an entitled, active workspace.
router.use(verifyToken);
router.use(requireModule('Membership Management'));

// Placeholder until controllers exist.
router.use((req, res) => res.status(501).json({ message: 'Membership Management is not implemented yet.' }));

module.exports = router;
