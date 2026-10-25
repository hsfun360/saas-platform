// src/modules/facility/facility.routes.js
//
// Facility Management - core product service.
// Owns the `/api/facility` gateway seam and wires the standard contract:
// verify JWT (who) + require the module subscription (entitlement) + the
// per-screen menu grant. Spec: docs/systems/facility-management.md.

const express = require('express');
const router = express.Router();
const { verifyToken, requireModule, requireMenuAction, requireAnyMenuAction } = require('../../platform/serviceContext');
const { validate } = require('../../platform/validate');

// Liveness probe - unauthenticated, so the gateway/monitoring can check the seam.
router.get('/health', (req, res) => res.json({ service: 'facility', status: 'ok' }));

// Everything below requires a valid token and an entitled, active workspace.
router.use(verifyToken);
router.use(requireModule('FACILITY'));

const SLICE1_MENUS = ['/facility/settings', '/facility/facility-types', '/facility/facilities', '/facility/closures'];

// --- Vocabularies for every slice-1 screen ---
const facilityTypeController = require('./facilityType.controller');
router.get('/meta', requireAnyMenuAction(SLICE1_MENUS), facilityTypeController.getMeta);

// --- Facility Specification (settings singleton + sessions) ---
const settingController = require('./facilitySetting.controller');
const settingSchemas = require('./facilitySetting.schemas');
router.get('/settings', requireMenuAction('/facility/settings'), settingController.get);
router.put('/settings', requireMenuAction('/facility/settings'), validate(settingSchemas.save), settingController.save);

// --- Facility Types (+ slot sets). The Facilities and Closures screens read
// the types for their pickers, so READS pass on any of the three menus;
// writes need the Facility Types grant. ---
router.use('/facility-types', (req, res, next) => (
    req.method === 'GET'
        ? requireAnyMenuAction(['/facility/facility-types', '/facility/facilities', '/facility/closures'])(req, res, next)
        : requireMenuAction('/facility/facility-types')(req, res, next)
), require('./facilityTypes.routes'));

// --- Facilities (units). The Closures screen reads them for its picker. ---
router.use('/facilities', (req, res, next) => (
    req.method === 'GET'
        ? requireAnyMenuAction(['/facility/facilities', '/facility/closures'])(req, res, next)
        : requireMenuAction('/facility/facilities')(req, res, next)
), require('./facilities.routes'));

// --- Facility Closures - its own menu, grantable without the setup grants. ---
router.use('/closure-plans', requireMenuAction('/facility/closures'), require('./closures.routes'));

// Not-yet-built areas of the service still 501 rather than 404, so a caller
// can tell "wrong URL" from "planned but not implemented".
router.use((req, res) => res.status(501).json({ message: 'This part of Facility Management is not implemented yet.' }));

module.exports = router;
