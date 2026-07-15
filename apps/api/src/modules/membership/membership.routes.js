// src/modules/membership/membership.routes.js
//
// Membership Management — core product service.
// Reserves the `/api/membership` gateway seam and wires the standard contract:
// verify JWT (who) + require the module subscription (entitlement). Feature
// sub-routers mount below as the service is built.
// Spec: docs/systems/membership-management.md

const express = require('express');
const router = express.Router();
const { verifyToken, requireModule, requireMenuAction } = require('../../platform/serviceContext');
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
// requireMenuAction adds per-action RBAC on top of the entitlement: the caller's
// role must hold a grant to the screen (Menu.route), and the HTTP method maps to
// the granted action (GET view / POST create / PUT+PATCH edit / DELETE delete).
router.use('/statuses', requireMenuAction('/membership/statuses'), membershipStatusRoutes);
router.use('/fees', requireMenuAction('/membership/fees'), membershipFeeRoutes);
router.use('/types', requireMenuAction('/membership/types'), membershipTypeRoutes);

// --- Tax consumption (reads the Tax service via the gateway seam) ---
router.use('/tax', membershipTaxRoutes);

// Placeholder for seams not yet implemented.
router.use((req, res) => res.status(501).json({ message: 'This Membership Management endpoint is not implemented yet.' }));

module.exports = router;
