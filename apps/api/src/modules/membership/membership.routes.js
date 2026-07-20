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
const transactionTypesRoutes = require('./transactionTypes.routes');
const membershipTaxRoutes = require('./membershipTax.routes');
const membershipsRoutes = require('./memberships.routes');
const membersRoutes = require('./members.routes');
const memberPortalRoutes = require('./memberPortal.routes');
const agentPortalRoutes = require('./agentPortal.routes');
const salesAgenciesRoutes = require('./salesAgencies.routes');
const salesAgentsRoutes = require('./salesAgents.routes');

// Liveness probe — unauthenticated, so the gateway/monitoring can check the seam.
router.get('/health', (req, res) => res.json({ service: 'membership', status: 'ok' }));

// --- Member Portal (the member's own surface, NOT staff) ---
// Mounted before the staff auth wall: registration is public (the signed
// registration token is the credential) and /me does its own verifyToken.
// A portal member holds no workspace, so the module/menu gates below would
// wrongly reject them.
router.use('/portal', memberPortalRoutes);
// The Sales Agent portal follows the same rules (public register + own /me).
router.use('/agent-portal', agentPortalRoutes);

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
router.use('/transaction-types', requireMenuAction('/membership/transaction-types'), transactionTypesRoutes);

// --- Sales Management (SRS 2.2) ---
router.use('/sales-agencies', requireMenuAction('/membership/sales-agencies'), salesAgenciesRoutes);
router.use('/sales-agents', requireMenuAction('/membership/sales-agents'), salesAgentsRoutes);

// --- Membership / Member CRM (SRS 2.3) ---
// Memberships own all member CRUD (nominees/dependents are managed from that
// screen); the members mount is the flat read-only search screen.
router.use('/memberships', requireMenuAction('/membership/memberships'), membershipsRoutes);
router.use('/members', requireMenuAction('/membership/members'), membersRoutes);

// --- Tax consumption (reads the Tax service via the gateway seam) ---
router.use('/tax', membershipTaxRoutes);

// Placeholder for seams not yet implemented.
router.use((req, res) => res.status(501).json({ message: 'This Membership Management endpoint is not implemented yet.' }));

module.exports = router;
