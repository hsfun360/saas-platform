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

const SLICE1_MENUS = ['/facility/settings', '/facility/facility-types', '/facility/facilities', '/facility/closures',
    '/facility/participant-types', '/facility/transaction-types', '/facility/payment-types', '/facility/numbering', '/facility/bookings', '/facility/station', '/facility/no-show-charges', '/facility/suspensions'];

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

// --- Slice 2a catalogs (structures approved 2026-10-25) ---
router.use('/participant-types', requireMenuAction('/facility/participant-types'), require('./participantTypes.routes'));
router.use('/transaction-types', requireMenuAction('/facility/transaction-types'), require('./transactionTypes.routes'));
router.use('/payment-types', requireMenuAction('/facility/payment-types'), require('./paymentTypes.routes'));

// --- Slice 2b booking (structures approved 2026-10-25): the day grid, slot
// claims, bookings and the patron search all live behind the ONE Facility
// Bookings menu grant. ---
router.use('/bookings', requireMenuAction('/facility/bookings'), require('./bookings.routes'));
router.use('/patrons', requireAnyMenuAction(['/facility/bookings', '/facility/station']), require('./patrons.routes'));
// --- Slice 2c billing: the bill engine on a booking, a registration or an
// issue - either desk grant. ---
router.use('/bills', requireAnyMenuAction(['/facility/bookings', '/facility/station']), require('./bills.routes'));
// --- Slice 3 Control Station (structures approved 2026-10-26): its own menu. ---
router.use('/station', requireMenuAction('/facility/station'), require('./station.routes'));
// --- Slice 4 No show (structures approved 2026-10-26): the penalties and the
// booking suspensions, each its own menu. ---
const noShowRoutes = require('./noShow.routes');
router.use('/no-show-charges', requireMenuAction('/facility/no-show-charges'), noShowRoutes.chargesRouter);
router.use('/suspensions', requireMenuAction('/facility/suspensions'), noShowRoutes.suspensionsRouter);

// --- Numbering Control (facility-owned series: booking / registration / bill) ---
const { makeNumberingRouter } = require('../../platform/numberingController');
router.use(
    '/numbering-schemes',
    requireMenuAction('/facility/numbering'),
    makeNumberingRouter({
        model: require('./numberingScheme.model'),
        purposes: require('../../platform/numberingGateway').purposesFor('facility'),
    }),
);

// Not-yet-built areas of the service still 501 rather than 404, so a caller
// can tell "wrong URL" from "planned but not implemented".
router.use((req, res) => res.status(501).json({ message: 'This part of Facility Management is not implemented yet.' }));

module.exports = router;
