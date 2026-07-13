// src/modules/membership/membership.routes.js
//
// Membership Management — core product service.
// Reserves the `/api/membership` gateway seam and wires the standard contract:
// verify JWT (who) + require the module subscription (entitlement). Feature
// sub-routers mount below as the service is built.
// Spec: docs/systems/membership-management.md

const express = require('express');
const router = express.Router();
const { verifyToken, requireModule } = require('../../platform/serviceContext');
const membershipStatusRoutes = require('./membershipStatus.routes');
const membershipFeeRoutes = require('./membershipFee.routes');
const membershipTypeRoutes = require('./membershipType.routes');
const membershipTaxRoutes = require('./membershipTax.routes');

// Liveness probe — unauthenticated, so the gateway/monitoring can check the seam.
router.get('/health', (req, res) => res.json({ service: 'membership', status: 'ok' }));

// Everything below requires a valid token and an entitled, active workspace.
router.use(verifyToken);
router.use(requireModule('Membership Management'));

// --- Master File Setup ---
router.use('/statuses', membershipStatusRoutes);
router.use('/fees', membershipFeeRoutes);
router.use('/types', membershipTypeRoutes);

// --- Tax consumption (reads the Tax service via the gateway seam) ---
router.use('/tax', membershipTaxRoutes);

// Placeholder for seams not yet implemented.
router.use((req, res) => res.status(501).json({ message: 'This Membership Management endpoint is not implemented yet.' }));

module.exports = router;
