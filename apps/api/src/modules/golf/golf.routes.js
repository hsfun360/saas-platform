// src/modules/golf/golf.routes.js
//
// Golf Management - core product service.
// Owns the `/api/golf` gateway seam and wires the standard contract:
// verify JWT (who) + require the module subscription (entitlement).
// Spec: docs/systems/golf-management.md

const express = require('express');
const router = express.Router();
const { verifyToken, requireModule, requireMenuAction } = require('../../platform/serviceContext');
const unitCourseRoutes = require('./unitCourse.routes');
const courseRoutes = require('./course.routes');
const transactionTypesRoutes = require('./transactionTypes.routes');

// Liveness probe - unauthenticated, so the gateway/monitoring can check the seam.
router.get('/health', (req, res) => res.json({ service: 'golf', status: 'ok' }));

// Everything below requires a valid token and an entitled, active workspace.
router.use(verifyToken);
router.use(requireModule('GOLF'));

// --- Master File Setup ---
// The two master files are menu-gated like every other golf route (2026-10-12;
// they were entitlement-only before). The Courses screen reads the nines for
// its pickers, so unit-course READS pass on either menu; writes need their own.
const { requireAnyMenuAction } = require('../../platform/serviceContext');
router.use('/unit-courses', (req, res, next) => (
    req.method === 'GET'
        ? requireAnyMenuAction(['/golf/unit-courses', '/golf/courses'])(req, res, next)
        : requireMenuAction('/golf/unit-courses')(req, res, next)
), unitCourseRoutes);
router.use('/courses', requireMenuAction('/golf/courses'), courseRoutes);
// Course Closure is a standalone menu (2026-09-30): closure keying is
// grantable without the Unit Course setup grant.
router.use('/closures', requireMenuAction('/golf/closures'), require('./closures.routes'));
router.use('/transaction-types', requireMenuAction('/golf/transaction-types'), transactionTypesRoutes);
router.use('/payment-types', requireMenuAction('/golf/payment-types'), require('./paymentTypes.routes'));
// Player Type master (spec 2.3.1, 2026-10-15): the club's player categories.
router.use('/player-types', requireMenuAction('/golf/player-types'), require('./playerTypes.routes'));
// Affiliated / reciprocal clubs and the letter-of-introduction visits moved
// to the Membership service on 2026-10-16 (/api/membership/affiliated-*);
// golf books the visit's flight through platform/golfGateway.js.
// Buggy management (2026-10-17): the type master and the fleet register are
// Common Setup menus; the station is a Front Desk menu with its own grant.
router.use('/buggy-types', requireMenuAction('/golf/buggy-types'), require('./buggyTypes.routes'));
router.use('/buggies', requireMenuAction('/golf/buggies'), require('./buggies.routes'));
router.use('/buggy-station', requireMenuAction('/golf/buggy-station'), require('./buggyStation.routes'));
// Caddy management slice 1 (2026-10-17): grades, groups and the caddy
// register (leave records, notes, badge QR sheet) - Common Setup menus.
router.use('/caddy-grades', requireMenuAction('/golf/caddy-grades'), require('./caddyGrades.routes'));
router.use('/caddy-groups', requireMenuAction('/golf/caddy-groups'), require('./caddyGroups.routes'));
router.use('/caddies', requireMenuAction('/golf/caddies'), require('./caddies.routes'));
// Caddy Station (slice 2, 2026-10-17): a Front Desk menu with its own grant.
router.use('/caddy-station', requireMenuAction('/golf/caddy-station'), require('./caddyStation.routes'));
// Caddy Rounds (slice 3, 2026-10-18): the rounds-of-service report, its own menu.
router.use('/caddy-rounds', requireMenuAction('/golf/caddy-rounds'), require('./caddyRounds.routes'));

// --- Golfers master (handicap index + status maintenance; user decisions
// 2026-09-29 - the fields the handicap-control rules read) ---
const { validate } = require('../../platform/validate');
const golferController = require('./golfer.controller');
const golferSchemas = require('./golfer.schemas');
router.get('/golfers', requireMenuAction('/golf/golfers'), golferController.list);
router.patch('/golfers/:id', requireMenuAction('/golf/golfers'), validate(golferSchemas.update), golferController.update);

// --- Golf Specification (per-company settings singleton + advance-booking
// overrides; user decisions 2026-09-17) ---
const golfSettingController = require('./golfSetting.controller');
const golfSettingSchemas = require('./golfSetting.schemas');
router.get('/settings', requireMenuAction('/golf/settings'), golfSettingController.get);
router.get('/settings/membership-types', requireMenuAction('/golf/settings'), golfSettingController.getMembershipTypes);
router.get('/settings/courses', requireMenuAction('/golf/settings'), golfSettingController.getCourses);
router.get('/settings/no-show-types', requireMenuAction('/golf/settings'), golfSettingController.getNoShowTypes);
router.get('/settings/rule-targets', requireMenuAction('/golf/settings'), golfSettingController.getRuleTargets);
router.put('/settings', requireMenuAction('/golf/settings'), validate(golfSettingSchemas.save), golfSettingController.save);

// --- Booking (dynamic tee sheet: availability + flight locks + bookings;
// user decisions 2026-09-20) ---
router.use('/bookings', requireMenuAction('/golf/bookings'), require('./bookings.routes'));

// --- Group / Tournament Booking (user decisions 2026-10-07): header, play
// days (start formats), reserved flights, roster and draw ---
router.use('/group-bookings', requireMenuAction('/golf/group-bookings'), require('./groupBookings.routes'));

// --- Front Desk operations (registration + billing + settlement; user
// decisions 2026-09-26). The API path names the OPERATIONS; the screen that
// drives them is the Tee Time Sheet menu (renamed from Front Desk 2026-10-06
// - Front Desk is now the menu GROUP, the counter where golfers register and
// pay), so the grant is '/golf/tee-time-sheet' ---
router.use('/front-desk', requireMenuAction('/golf/tee-time-sheet'), require('./frontdesk.routes'));

// --- No-show Charges (cancellation-notice / no-show penalties; user
// decisions 2026-10-06) - a standalone menu so finance can post/waive the
// charges without the tee-sheet grants ---
router.use('/no-show-charges', requireMenuAction('/golf/no-show-charges'), require('./noShowCharges.routes'));

// --- Rain Checks (user decisions 2026-10-15) - the standalone listing; the
// issue and redeem doors live on the front desk (Tee Time Sheet grant) ---
router.use('/rain-checks', requireMenuAction('/golf/rain-checks'), require('./rainChecks.routes'));

// --- Numbering Control (golf-owned series: booking / registration / bill /
// rain check; split per module 2026-08-05) ---
const { makeNumberingRouter } = require('../../platform/numberingController');
router.use(
    '/numbering-schemes',
    requireMenuAction('/golf/numbering'),
    makeNumberingRouter({
        model: require('./numberingScheme.model'),
        purposes: require('../../platform/numberingGateway').purposesFor('golf'),
    }),
);

// Not-yet-built areas of the service still 501 rather than 404, so a caller can
// tell "wrong URL" from "planned but not implemented".
router.use((req, res) => res.status(501).json({ message: 'This part of Golf Management is not implemented yet.' }));

module.exports = router;
