// Golf Booking (Golf Management → /golf/bookings) - the make-booking flow
// (user decisions 2026-09-20, revamped 2026-09-29 to the per-nine model):
//   1. context   - member no resolves standing + the bookable date window
//   2. availability - the dynamic tee sheet's 5 nearest flights per course
//   3. lock      - clicking a flight claims it (both nines for 18 holes)
//                  for GolfSetting.bookingLockMinutes while players are keyed
//   4. save      - re-validates EVERY rule server-side and books atomically:
//                  ONE BookingProfile header + golf.Player records (one per
//                  golfer per NINE - an 18-hole play is a linked pair)
// All state-changing steps run in a transaction under a Postgres advisory
// lock on (company, playDate) - one serialization point for the whole day,
// because courses SHARE physical nines under composite rotation.

const crypto = require('crypto');
const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const {
    getUserContext, getCallerPlacement, annotateCanModify, canModifyRecord,
} = require('../../platform/serviceContext');
const { getGolfMemberStanding } = require('../../platform/membershipGateway');
const { companyTimezone } = require('../../platform/calendarGateway');
const numberingGateway = require('../../platform/numberingGateway');
const availability = require('./bookingAvailability.service');
const { BOOKING_STATUSES, HOLES_OPTIONS } = require('./booking.constants');
// Player types come from the club's master (2026-10-15), judged by base identity.
const playerTypes = require('./playerType.service');
// Flight-booking approval for requires-approval player types (2026-10-15).
const bookingApproval = require('./bookingApproval.service');
const workflowGateway = require('../../platform/workflowGateway');
const BookingProfile = require('./bookingProfile.model');
const Player = require('./player.model');
const FlightLock = require('./flightLock.model');
const Course = require('./course.model');
const Golfer = require('./golfer.model');
const GolfSession = require('./golfSession.model');
const noShow = require('./noShowCharge.service');
// Named-caddy requests (2026-10-18): listed per booking, cancelled with it.
const caddyRequests = require('./caddyRequest.service');
const bookingChange = require('./bookingChange.service');
const BookingChange = require('./bookingChange.model');

const {
    companyIdOf, DATE_RE, TIME_RE, advisoryLock, sweepExpiredLocks, dayTypeOf, ensureMemberGolfer,
    playDateText, queueBookingEmail, playersTableHtml, describeDayBookings, dayBookingConflict,
    juniorViolation, bookingLimitFor, sessionOf, memberDaySessions, sessionBookingConflict, bookingDto,
} = require('./bookingShared');

// GET /api/golf/bookings/context?memberNo= - resolve the booking maker and
// the window/course choices the search form depends on.
exports.getContext = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const memberNo = String(req.query.memberNo || '').trim();
        if (!memberNo) return res.status(400).json({ message: 'Key in a member number.' });

        const standing = await getGolfMemberStanding(companyId, memberNo);
        if (!standing) return res.status(404).json({ message: `No member found with number '${memberNo}'.` });

        const timezone = await companyTimezone(req);
        const window = await availability.bookingWindow(companyId, standing.membershipTypeId, timezone);
        const courses = await Course.findAll({
            where: { companyId, isActive: true },
            attributes: ['id', 'courseCode', 'description'],
            order: [['displaySequence', 'ASC'], ['courseCode', 'ASC']],
        });
        res.status(200).json({
            member: {
                memberNo: standing.memberNo,
                name: standing.name,
                membershipTypeCategory: standing.membershipTypeCategory,
                isGolfAllow: standing.isGolfAllow,
                statusLabel: standing.statusLabel,
                actionControl: standing.actionControl,
            },
            window: { dateFrom: window.dateFrom, dateTo: window.dateTo, effectiveDays: window.effectiveDays },
            courses,
            meta: {
                holesOptions: HOLES_OPTIONS,
                lockMinutes: window.setting ? window.setting.bookingLockMinutes : 5,
            },
        });
    } catch (error) {
        console.error('Error resolving golf booking context:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Shared search validation for availability + lock endpoints. Returns
// { error, status } or the parsed inputs + standing + window.
async function parseSearch(req, body) {
    const companyId = companyIdOf(req);
    if (!companyId) return { error: 'Select a workspace first.', status: 400 };
    const memberNo = String(body.memberNo || '').trim();
    if (!memberNo) return { error: 'Key in a member number.', status: 400 };
    const playDate = String(body.playDate || '');
    if (!DATE_RE.test(playDate)) return { error: 'Pick a play date.', status: 400 };
    const holes = Number(body.holes);
    if (!HOLES_OPTIONS.includes(holes)) return { error: 'Pick 9 or 18 holes.', status: 400 };
    const players = Number(body.players);
    if (!Number.isInteger(players) || players < 1 || players > 10) return { error: 'Number of players must be between 1 and 10.', status: 400 };

    const standing = await getGolfMemberStanding(companyId, memberNo);
    if (!standing) return { error: `No member found with number '${memberNo}'.`, status: 404 };
    if (standing.actionControl === 'barred') return { error: `Member ${standing.memberNo} (${standing.statusLabel || 'status'}) is barred from booking.`, status: 400 };

    const timezone = await companyTimezone(req);
    const window = await availability.bookingWindow(companyId, standing.membershipTypeId, timezone);
    if (playDate < window.dateFrom || playDate > window.dateTo) {
        return { error: `This member can book from ${window.dateFrom} to ${window.dateTo} (advance window).`, status: 400 };
    }
    // Booking limit by day type (user decisions 2026-10-01). 'day' prompts at
    // search which flight the member already holds; 'session' cannot block
    // the whole search (it depends on the chosen time), so the member's
    // already-taken sessions are returned for the availability FILTER, and
    // lock/create re-check hard.
    const dayType = await dayTypeOf(req, playDate);
    const limitMode = bookingLimitFor(window.setting, dayType);
    // Change booking (2026-10-14): the booking being moved is left out of its
    // own one-per-day / session evidence and of the capacity counts.
    const excludeProfileId = body.excludeBookingId ? String(body.excludeBookingId) : null;
    let sessions = [];
    let takenSessionIds = new Set();
    if (limitMode === 'day') {
        const conflict = await dayBookingConflict(companyId, standing, playDate, { excludeProfileId });
        if (conflict) return { error: conflict, status: 409 };
    } else if (limitMode === 'session') {
        sessions = await GolfSession.findAll({ where: { companyId }, order: [['startTime', 'ASC']] });
        const golfer = await Golfer.findOne({ where: { companyId, golferType: 'member', sourceId: standing.memberId } });
        if (golfer) {
            const taken = await memberDaySessions(companyId, golfer.id, playDate, sessions, { excludeProfileId });
            takenSessionIds = new Set(taken.keys());
        }
    }
    return { companyId, memberNo, playDate, holes, players, standing, window, timezone, dayType, limitMode, sessions, takenSessionIds, excludeProfileId };
}

// POST /api/golf/bookings/availability - the 5 nearest available flights per
// course (all courses, or one when courseId is given). The 2006 stored
// procedure, computed from the dynamic per-nine tee sheet.
exports.searchAvailability = async (req, res) => {
    try {
        const parsed = await parseSearch(req, req.body);
        if (parsed.error) return res.status(parsed.status).json({ message: parsed.error });
        const { companyId, playDate, holes, players } = parsed;
        const time = String(req.body.time || '');
        if (!TIME_RE.test(time)) return res.status(400).json({ message: 'Pick a preferred tee time.' });

        const dayType = parsed.dayType;
        const { setting, minRules } = await availability.loadRules(companyId);
        // The context spans ALL active courses even for a one-course search -
        // nine ownership (whose grid rules a crossover landing) needs them.
        const ctx = await availability.dayContext(companyId, playDate, dayType);
        if (!ctx.courses.length) return res.status(400).json({ message: 'No active course to search.' });
        const wanted = req.body.courseId
            ? ctx.courses.filter((c) => c.id === String(req.body.courseId))
            : ctx.courses;
        if (!wanted.length) return res.status(400).json({ message: 'No active course to search.' });

        const [occ, locks] = await Promise.all([
            availability.occupancy(companyId, playDate, { ctx, excludeBookingProfileId: parsed.excludeProfileId }),
            availability.activeLockCells(companyId, playDate),
        ]);

        const groups = [];
        for (const course of wanted) {
            const result = await availability.courseFlights({
                course, ctx, playDate, dayType, holes, players, setting, minRules, occ, locks,
            });
            if (!result) continue;
            // Per-session limit: hide flights in sessions the member already
            // booked (show expected results - the wizard never offers a
            // flight the save would refuse).
            let open = result.flights;
            if (parsed.limitMode === 'session' && parsed.takenSessionIds.size) {
                open = open.filter((f) => {
                    const s = sessionOf(parsed.sessions, f.teeTime);
                    return !s || !parsed.takenSessionIds.has(s.id);
                });
            }
            const flights = availability.nearestFlights(open, time, 5);
            groups.push({
                courseId: course.id,
                courseCode: course.courseCode,
                description: course.description,
                flights,
            });
        }
        res.status(200).json({ playDate, dayType, groups, memberWarning: parsed.standing.actionControl === 'warning' ? `Member status '${parsed.standing.statusLabel}' carries a warning.` : null });
    } catch (error) {
        console.error('Error searching golf availability:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/golf/bookings/locks - claim a flight (both nines for 18 holes)
// while the player list is keyed.
exports.createLock = async (req, res) => {
    try {
        const parsed = await parseSearch(req, req.body);
        if (parsed.error) return res.status(parsed.status).json({ message: parsed.error });
        const { companyId, playDate, holes, players } = parsed;
        const teeTime = String(req.body.teeTime || '');
        if (!TIME_RE.test(teeTime)) return res.status(400).json({ message: 'Pick a flight to lock.' });
        const course = await Course.findOne({ where: { companyId, id: String(req.body.courseId || ''), isActive: true } });
        if (!course) return res.status(400).json({ message: 'Pick a course.' });
        // Per-session limit: the clicked flight's session must be free for
        // the BOOKER (availability already hides these; a stale client or
        // direct call lands here). Re-checked for every member line at save.
        if (parsed.limitMode === 'session') {
            const conflict = await sessionBookingConflict(companyId, parsed.standing, playDate, teeTime, parsed.sessions, { excludeProfileId: parsed.excludeProfileId });
            if (conflict) return res.status(409).json({ message: conflict });
        }

        const dayType = parsed.dayType;
        const { setting, minRules } = await availability.loadRules(companyId);
        const callerId = getUserContext(req).userId;
        const lockMinutes = setting ? setting.bookingLockMinutes : 5;

        const out = await sequelize.transaction(async (transaction) => {
            await advisoryLock(transaction, companyId, playDate);
            await sweepExpiredLocks(companyId, playDate, transaction);

            const ctx = await availability.dayContext(companyId, playDate, dayType, { transaction });
            const [occ, locks] = await Promise.all([
                availability.occupancy(companyId, playDate, { transaction, ctx, excludeBookingProfileId: parsed.excludeProfileId }),
                availability.activeLockCells(companyId, playDate, { transaction }),
            ]);
            const result = await availability.courseFlights({
                course, ctx, playDate, dayType, holes, players, setting, minRules, occ, locks,
            });
            const flight = result ? result.flights.find((f) => f.teeTime === teeTime) : null;
            if (!flight) return { taken: true };

            const groupId = crypto.randomUUID();
            const expiresAt = new Date(Date.now() + lockMinutes * 60000);
            const rows = [{
                companyId, groupId, courseId: course.id, unitCourseId: course.firstNineId, playDate, teeTime: flight.teeTime, expiresAt, lockedBy: callerId,
            }];
            if (holes === 18 && flight.crossTime) {
                rows.push({
                    companyId, groupId, courseId: course.id, unitCourseId: course.secondNineId, playDate, teeTime: flight.crossTime, expiresAt, lockedBy: callerId,
                });
            }
            await FlightLock.bulkCreate(rows, { transaction });
            return { groupId, expiresAt, flight };
        });

        if (out.taken) return res.status(409).json({ message: 'That flight was just taken - refresh the available times.' });
        res.status(201).json({
            groupId: out.groupId,
            expiresAt: out.expiresAt.toISOString(),
            lockMinutes,
            teeTime: out.flight.teeTime,
            crossTime: out.flight.crossTime,
            seatsLeft: out.flight.seatsLeft,
            existingPlayers: out.flight.existingPlayers,
            minPlayers: out.flight.minPlayers,
        });
    } catch (error) {
        console.error('Error locking golf flight:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/golf/bookings/locks/:groupId - release a lock (user backs out).
exports.releaseLock = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        await FlightLock.destroy({ where: { companyId, groupId: req.params.groupId, lockedBy: getUserContext(req).userId } });
        res.status(200).json({ message: 'Lock released.' });
    } catch (error) {
        console.error('Error releasing golf flight lock:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/golf/bookings - final save. The flight comes from the caller's
// LOCK (authoritative), and every rule is re-validated under the advisory
// lock before the booking exists.
exports.create = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const callerId = getUserContext(req).userId;
        const groupId = String(req.body.lockGroupId || '');
        if (!groupId) return res.status(400).json({ message: 'The flight lock is missing - pick a flight again.' });

        const memberNo = String(req.body.memberNo || '').trim();
        const standing = await getGolfMemberStanding(companyId, memberNo);
        if (!standing) return res.status(404).json({ message: `No member found with number '${memberNo}'.` });
        if (standing.actionControl === 'barred') return res.status(400).json({ message: `Member ${standing.memberNo} (${standing.statusLabel || 'status'}) is barred from booking.` });

        // Parse + resolve the player lines before touching the lock.
        const rawPlayers = Array.isArray(req.body.players) ? req.body.players : [];
        if (!rawPlayers.length) return res.status(400).json({ message: 'Key in at least one player.' });
        if (rawPlayers.length > 10) return res.status(400).json({ message: 'Too many players.' });
        const lines = [];
        const types = playerTypes.pickable(await playerTypes.catalog(companyId));
        for (let i = 0; i < rawPlayers.length; i += 1) {
            const line = rawPlayers[i] || {};
            const playerType = String(line.playerType || '');
            if (!playerTypes.findType(types, playerType)) return res.status(400).json({ message: `Player ${i + 1}: pick a player type.` });
            if (playerTypes.needsGuestName(types, playerType)) {
                const guestName = String(line.guestName || '').trim();
                if (!guestName) return res.status(400).json({ message: `Player ${i + 1}: key in the guest name (or 'Guest').` });
                lines.push({ sortOrder: i + 1, playerType, standing: null, playerName: guestName, memberNo: null });
            } else {
                const no = String(line.memberNo || '').trim();
                if (!no) return res.status(400).json({ message: `Player ${i + 1}: key in the member number.` });
                const ps = await getGolfMemberStanding(companyId, no);
                if (!ps) return res.status(404).json({ message: `Player ${i + 1}: no member found with number '${no}'.` });
                if (ps.actionControl === 'barred') return res.status(400).json({ message: `Player ${i + 1}: member ${ps.memberNo} (${ps.statusLabel || 'status'}) is barred.` });
                lines.push({ sortOrder: i + 1, playerType, standing: ps, playerName: ps.name, memberNo: ps.memberNo });
            }
        }
        const contactMobile = req.body.contactMobile ? String(req.body.contactMobile).slice(0, 30) : null;
        const remarks = req.body.remarks ? String(req.body.remarks).slice(0, 255) : null;

        // The lock names the flight - never trust the client for the cells.
        const lockRows = await FlightLock.findAll({ where: { companyId, groupId } });
        if (!lockRows.length) return res.status(409).json({ message: 'The flight lock expired - pick a flight again.' });
        const course = await Course.findOne({ where: { companyId, id: lockRows[0].courseId } });
        if (!course) return res.status(400).json({ message: 'The locked course no longer exists.' });
        const startRow = lockRows.find((r) => r.unitCourseId === course.firstNineId);
        const crossRow = lockRows.find((r) => r.unitCourseId === course.secondNineId) || null;
        if (!startRow || startRow.lockedBy !== callerId) return res.status(409).json({ message: 'The flight lock is not yours - pick a flight again.' });
        const playDate = String(startRow.playDate);
        const holes = crossRow ? 18 : 9;

        // Window re-check for the BOOKER.
        const timezone = await companyTimezone(req);
        const window = await availability.bookingWindow(companyId, standing.membershipTypeId, timezone);
        if (playDate < window.dateFrom || playDate > window.dateTo) {
            return res.status(400).json({ message: `This member can book from ${window.dateFrom} to ${window.dateTo} (advance window).` });
        }

        const dayType = await dayTypeOf(req, playDate);
        const { setting, minRules, guestRules } = await availability.loadRules(companyId);
        const placement = await getCallerPlacement(req);
        const stamps = { createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId };
        const allowMerge = setting ? setting.allowBookingMerge === true : false;

        const result = await sequelize.transaction(async (transaction) => {
            await advisoryLock(transaction, companyId, playDate);

            // Lock still valid under the serialization point?
            const fresh = await FlightLock.findAll({ where: { companyId, groupId }, transaction });
            if (!fresh.length || fresh.some((r) => r.lockedBy !== callerId)) return { fail: 'The flight lock expired - pick a flight again.', status: 409 };
            if (fresh.every((r) => r.expiresAt <= new Date())) return { fail: 'The flight lock expired - pick a flight again.', status: 409 };

            const startTime = availability.hhmm(startRow.teeTime);
            const crossTime = crossRow ? availability.hhmm(crossRow.teeTime) : null;
            const t = availability.toMinutes(startTime);

            const ctx = await availability.dayContext(companyId, playDate, dayType, { transaction });
            const day = ctx.byCourse.get(course.id);
            if (!day || !day.set || !day.slots.length) return { fail: 'The tee sheet for this date is no longer configured.', status: 409 };
            const startSlot = day.slots.find((s) => availability.hhmm(s.teeTime) === startTime);
            if (!startSlot) return { fail: 'The flight time no longer exists on the tee sheet.', status: 409 };
            // Slot-role re-check (2026-09-28): crossover-only and front-desk
            // slots never take a BOOKED tee-off, even if a stale client sends
            // one (availability already hides them).
            if (startSlot.isCrossoverOnly === true) {
                return { fail: 'That flight time is closed for crossover - no new tee-offs.', status: 400 };
            }
            if (startSlot.isFrontDesk === true) {
                return { fail: 'That flight time is reserved for front-desk registration - it cannot be booked in advance.', status: 400 };
            }
            // Closure re-check (maintenance / tournament blocks saved while
            // the flight was locked must still stop the booking).
            if (availability.nineBlocked(ctx.nineBlocks.get(course.firstNineId), t)) {
                return { fail: 'The flight is now blocked by a course closure.', status: 409 };
            }
            // Capacity re-check per NINE-cell under the merge rule.
            const occ = await availability.occupancy(companyId, playDate, { transaction, ctx });
            const startOcc = occ.get(availability.nineKey(course.firstNineId, startTime));
            if (availability.seatsLeft(allowMerge, startOcc, startSlot.maxPlayers) < lines.length) {
                return { fail: 'The flight no longer has room for these players.', status: 409 };
            }
            if (crossTime) {
                const target = availability.crossTarget(ctx, course, t);
                if (!target) return { fail: 'The crossover time no longer exists on the tee sheet.', status: 409 };
                const ct = availability.toMinutes(crossTime);
                if (availability.crossBlocked(ctx, course, ct)) {
                    return { fail: 'The crossover flight is now blocked by a course closure.', status: 409 };
                }
                const crossOcc = occ.get(availability.nineKey(course.secondNineId, crossTime));
                if (availability.seatsLeft(allowMerge, crossOcc, target.slot.maxPlayers) < lines.length) {
                    return { fail: 'The crossover flight no longer has room for these players.', status: 409 };
                }
            }

            // Minimum players: own count OR the flight's total after joining.
            const existingPlayers = (startOcc && startOcc.players) || 0;
            const dayOfWeek = availability.dayOfWeekOf(playDate);
            const minPlayers = availability.resolveMinPlayers(setting, minRules, course.id, dayType, t, dayOfWeek);
            if (lines.length < minPlayers && !(existingPlayers > 0 && existingPlayers + lines.length >= minPlayers)) {
                return { fail: `This flight needs at least ${minPlayers} player(s).`, status: 400 };
            }

            // Guest control for this course/day/time (day-of-week rules beat
            // weekday/weekend, e.g. a Sunday guest ban).
            const gc = availability.resolveGuestControl(setting, guestRules, course.id, dayType, t, dayOfWeek);
            const baseOf = (l) => playerTypes.baseOf(types, l.playerType);
            if (!gc.allowGuest && lines.some((l) => baseOf(l) === 'guest' || baseOf(l) === 'affiliate')) {
                return { fail: 'Guests are not allowed on this flight (guest control).', status: 400 };
            }
            if (!gc.allowMemberGuest && lines.some((l) => baseOf(l) === 'member-guest')) {
                return { fail: 'Members as guests are not allowed on this flight (guest control).', status: 400 };
            }

            // Guest quota (user decision 2026-09-28): the BOOKER's membership
            // type caps how many guests one booking may carry - member-as-
            // guest lines COUNT toward it. NULL = no limit; 0 = none at all.
            const guestCount = lines.filter((l) => playerTypes.isGuestLike(types, l.playerType)).length;
            const quota = standing.guestQuota;
            if (guestCount > 0 && quota !== null && quota !== undefined && guestCount > quota) {
                return {
                    fail: quota === 0
                        ? `Membership type ${standing.membershipTypeCategory || ''} cannot bring guests.`.replace('  ', ' ')
                        : `Membership type ${standing.membershipTypeCategory || ''} can bring up to ${quota} guest(s) per booking - this booking has ${guestCount} (members as guests count).`.replace('  ', ' '),
                    status: 400,
                };
            }

            // Provision golfer identities (booker + every member line).
            const booker = await ensureMemberGolfer(companyId, standing, stamps, transaction);
            const golferByMemberId = new Map();
            for (const line of lines) {
                if (line.standing && !golferByMemberId.has(line.standing.memberId)) {
                    const g = await ensureMemberGolfer(companyId, line.standing, stamps, transaction);
                    golferByMemberId.set(line.standing.memberId, g);
                }
            }

            // Playing rights + round quotas (spec 2.3.4 / 2.3.5, 2026-10-15):
            // every line judged by its target; the booker's guest-round cap
            // counts this booking's guest lines.
            {
                const rights = require('./playingRights.service');
                const bookerLine = { label: `Player 1 (${standing.memberNo})`, playerType: 'member', golferId: booker.id, membershipTypeId: standing.membershipTypeId };
                const judged = lines.map((l) => ({
                    label: `Player ${l.sortOrder}${l.memberNo ? ' (' + l.memberNo + ')' : ''}`,
                    playerType: l.playerType,
                    golferId: l.standing ? golferByMemberId.get(l.standing.memberId).id : null,
                    membershipTypeId: l.standing ? l.standing.membershipTypeId : null,
                }));
                if (!judged.some((j) => j.golferId === booker.id)) judged.unshift(bookerLine);
                const rightsFail = await rights.checkBooking(companyId, {
                    course, playDate, teeTime: startTime, dayType, lines: judged,
                    bookerGolferId: booker.id, bookingGuestCount: guestCount, transaction,
                });
                if (rightsFail) return { fail: rightsFail, status: 400 };
            }

            // Handicap control (Tropicana procedure 2, user decisions
            // 2026-09-29): limit caps + accompaniment, evaluated over the
            // WHOLE flight (these lines + players already seated in the
            // cell). Name-only guests have no identity yet - they are
            // re-checked (as a warning) at registration.
            if (setting && setting.handicapControlEnabled === true) {
                const handicap = require('./handicapControl.service');
                const rules = await handicap.loadHandicapRules(companyId);
                const standings = new Map();
                const added = [];
                for (const line of lines) {
                    if (!line.standing) continue;
                    const g = golferByMemberId.get(line.standing.memberId);
                    if (!g) continue;
                    standings.set(line.standing.memberNo, line.standing);
                    added.push(await handicap.describeGolfer(companyId, g, { standingByMemberNo: standings, transaction }));
                }
                if (added.length) {
                    const seated = await handicap.describeSeatedPlayers(companyId, {
                        unitCourseId: course.firstNineId, playDate, teeTime: startTime, transaction,
                    });
                    const messages = handicap.evaluateFlight({
                        ...rules,
                        courseId: course.id,
                        dayType,
                        dayOfWeek,
                        holes,
                        teeTime: startTime,
                        players: added,
                        companions: [...added, ...seated],
                    });
                    if (messages.length) return { fail: messages.join(' '), status: 400 };
                }
            }

            // Booking limit, re-checked under the advisory lock for the
            // BOOKER and every 'member' player line (member-as-guest exempt).
            // 'day' = one active booking per play date; 'session' = one per
            // GolfSession band, judged by the flight's START time.
            const limitMode = bookingLimitFor(setting, dayType);
            if (limitMode === 'day') {
                const bookerRows = await availability.memberDayBookings(companyId, booker.id, playDate, { transaction });
                if (bookerRows.length) {
                    return { fail: `${standing.memberNo} already has a booking on ${playDate} - ${await describeDayBookings(companyId, bookerRows, { transaction })}.`, status: 400 };
                }
                for (const line of lines) {
                    if (!line.standing || !playerTypes.isMemberBase(types, line.playerType)) continue;
                    const g = golferByMemberId.get(line.standing.memberId);
                    if (!g || g.id === booker.id) continue;
                    const rows = await availability.memberDayBookings(companyId, g.id, playDate, { transaction });
                    if (rows.length) {
                        return { fail: `Player ${line.sortOrder}: ${line.memberNo} already has a booking on ${playDate} - ${await describeDayBookings(companyId, rows, { transaction })}.`, status: 400 };
                    }
                }
            } else if (limitMode === 'session') {
                const sessions = await GolfSession.findAll({ where: { companyId }, order: [['startTime', 'ASC']], transaction });
                const startHHMM = availability.hhmm(startRow.teeTime);
                const session = sessionOf(sessions, startHHMM);
                if (session) {
                    const checks = [{ golfer: booker, label: standing.memberNo, prefix: '' }];
                    for (const line of lines) {
                        if (!line.standing || !playerTypes.isMemberBase(types, line.playerType)) continue;
                        const g = golferByMemberId.get(line.standing.memberId);
                        if (!g || g.id === booker.id) continue;
                        checks.push({ golfer: g, label: line.memberNo, prefix: `Player ${line.sortOrder}: ` });
                    }
                    for (const check of checks) {
                        const taken = await memberDaySessions(companyId, check.golfer.id, playDate, sessions, { transaction });
                        const clash = taken.get(session.id);
                        if (clash) {
                            return { fail: `${check.prefix}${check.label} already has a ${session.name} session booking on ${playDate} - ${clash.startTime} (${clash.profile.bookingNo}).`, status: 400 };
                        }
                    }
                }
            }

            // Junior-booking control (refuse): a junior player must be with
            // their principal (or, lacking one, an adult member). Covers the
            // booker and every member / member-as-guest player line.
            if (setting && setting.juniorBookingControlEnabled === true) {
                const parties = [{
                    memberId: standing.memberId, isJunior: standing.isJunior === true,
                    principalMemberId: standing.principalMemberId || null, label: standing.memberNo, prefix: '',
                }];
                for (const line of lines) {
                    if (!line.standing) continue;
                    parties.push({
                        memberId: line.standing.memberId, isJunior: line.standing.isJunior === true,
                        principalMemberId: line.standing.principalMemberId || null,
                        label: line.memberNo, prefix: `Player ${line.sortOrder}: `,
                    });
                }
                const violation = juniorViolation(parties);
                if (violation) return { fail: violation, status: 400 };
            }

            // Booking number from the golf-booking series (gapless: the
            // counter rides this transaction).
            let bookingNo = null;
            const issued = await numberingGateway.issueNumber(req, 'golf-booking', { transaction });
            if (issued && issued.number) bookingNo = issued.number;
            else if (issued && issued.manual) {
                bookingNo = String(req.body.bookingNo || '').trim();
                if (!bookingNo) return { fail: 'The Booking No. scheme is manual - key in a booking number.', status: 400 };
            } else {
                return { fail: 'Configure the Booking No. numbering scheme first (Golf Management → Numbering Control).', status: 400 };
            }

            const profile = await BookingProfile.create({
                companyId,
                bookingNo,
                bookingType: 'flight',
                courseId: course.id,
                playDate,
                bookerGolferId: booker.id,
                contactMobile,
                remarks,
                status: 'booked',
                ...stamps,
            }, { transaction });

            // One Player record per golfer per NINE. Creation order encodes
            // the keyed player order (no sortOrder column - user decision
            // 2026-09-29), so createdAt is offset per line to stay distinct.
            const base = Date.now();
            const records = [];
            for (const l of lines) {
                const shared = {
                    companyId,
                    bookingProfileId: profile.id,
                    courseId: course.id,
                    playDate,
                    playerType: l.playerType,
                    golferId: l.standing ? golferByMemberId.get(l.standing.memberId).id : null,
                    playerName: l.playerName,
                    memberNo: l.memberNo,
                    status: 'booked',
                    ...stamps,
                };
                const first = await Player.create({
                    ...shared,
                    secondNineFlag: 0,
                    unitCourseId: course.firstNineId,
                    teeTime: startTime,
                    createdAt: new Date(base + (l.sortOrder - 1) * 2),
                }, { transaction });
                records.push(first);
                if (crossTime) {
                    records.push(await Player.create({
                        ...shared,
                        secondNineFlag: 1,
                        firstNinePlayerId: first.id,
                        unitCourseId: course.secondNineId,
                        teeTime: crossTime,
                        createdAt: new Date(base + (l.sortOrder - 1) * 2 + 1),
                    }, { transaction }));
                }
            }
            await FlightLock.destroy({ where: { companyId, groupId }, transaction });

            // Approval (2026-10-15): a player of a requires-approval type puts
            // the booking in pending-approval (seats held) while the chain
            // decides; no chain = booked at once.
            const approvalCodes = bookingApproval.approvalCodes(types, lines);
            if (approvalCodes.length) {
                const wf = await workflowGateway.startWorkflow(req, bookingApproval.PURPOSE, {
                    entityId: profile.id,
                    entityLabel: `Booking ${bookingNo} - ${standing.name} (${standing.memberNo}) ${playDate} ${startTime}`,
                    context: bookingApproval.contextFor({ course, dayType, holes, teeTime: startTime, lines, types, codes: approvalCodes }),
                    transaction,
                });
                if (wf) {
                    profile.status = 'pending-approval';
                    profile.workflowInstanceId = wf.instanceId;
                    await profile.save({ transaction });
                    await queueBookingEmail({
                        companyId,
                        templateKey: 'golf.booking.pending',
                        recipients: [standing],
                        data: {
                            bookingNo, playDateText: playDateText(playDate), teeTime: startTime, crossTime: crossTime || '',
                            courseName: `${course.courseCode}${course.description ? ' - ' + course.description : ''}`, holes,
                            approvalTypes: approvalCodes.map((c) => playerTypes.labelOf(types, c)).join(', '),
                        },
                        transaction,
                    });
                    return { profile, records, pending: approvalCodes };
                }
            }

            // ONE confirmation email addressed to every player with an
            // address (booker included; the queued row commits only with the
            // booking).
            await queueBookingEmail({
                companyId,
                templateKey: 'golf.booking.confirmed',
                recipients: [standing, ...lines.filter((l) => l.standing).map((l) => l.standing)],
                data: {
                    bookingNo,
                    playDateText: playDateText(playDate),
                    teeTime: startTime,
                    crossTime: crossTime || '',
                    courseName: `${course.courseCode}${course.description ? ' - ' + course.description : ''}`,
                    holes,
                    playersTable: playersTableHtml(lines, playerTypes.labelsOf(types)),
                },
                transaction,
            });
            return { profile, records };
        });

        if (result.fail) return res.status(result.status).json({ message: result.fail });
        res.status(201).json({
            message: result.pending
                ? `Booking ${result.profile.bookingNo} awaits approval (${result.pending.map((c) => playerTypes.labelOf(types, c)).join(', ')} bookings need it) - the flight is held meanwhile.`
                : `Booking ${result.profile.bookingNo} confirmed.`,
            booking: bookingDto(result.profile, result.records, new Map([[course.id, course]])),
        });
    } catch (error) {
        console.error('Error creating golf booking:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/golf/bookings?playDate= - the day's bookings for the listing.
exports.list = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const playDate = String(req.query.playDate || '');
        if (!DATE_RE.test(playDate)) return res.status(400).json({ message: 'Pick a play date.' });

        // Ordinary flight bookings only - group / tournament bookings have
        // their own screen (their header carries only the first play day).
        const rows = await BookingProfile.findAll({ where: { companyId, playDate, bookingType: 'flight' } });
        await annotateCanModify(req, rows);
        const records = rows.length
            ? await Player.findAll({
                where: { bookingProfileId: { [Op.in]: rows.map((r) => r.id) } },
                order: [['secondNineFlag', 'ASC'], ['createdAt', 'ASC'], ['id', 'ASC']],
            })
            : [];
        const byProfile = new Map();
        for (const p of records) {
            if (!byProfile.has(p.bookingProfileId)) byProfile.set(p.bookingProfileId, []);
            byProfile.get(p.bookingProfileId).push(p);
        }
        const courses = await Course.findAll({ where: { companyId }, attributes: ['id', 'courseCode', 'description'] });
        const courseById = new Map(courses.map((c) => [c.id, c]));
        // The booker's identity (the change flow searches as the booker) and
        // the amendment count, one query each for the whole day.
        const bookerIds = [...new Set(rows.map((r) => r.bookerGolferId).filter(Boolean))];
        const bookers = bookerIds.length
            ? await Golfer.findAll({ where: { companyId, id: { [Op.in]: bookerIds } }, attributes: ['id', 'memberNo', 'name'] })
            : [];
        const bookerById = new Map(bookers.map((g) => [g.id, g]));
        const changeRows = rows.length
            ? await BookingChange.findAll({
                where: { bookingProfileId: { [Op.in]: rows.map((r) => r.id) } },
                attributes: ['bookingProfileId', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
                group: ['bookingProfileId'],
                raw: true,
            })
            : [];
        const changeCountById = new Map(changeRows.map((r) => [r.bookingProfileId, Number(r.count)]));
        // Named-caddy requests (2026-10-18): live + fulfilled per booking.
        const requestsById = await caddyRequests.byBookings(companyId, rows.map((r) => r.id));
        const dtos = rows.map((b) => {
            const booker = bookerById.get(b.bookerGolferId);
            return {
                ...bookingDto(b, byProfile.get(b.id), courseById, {
                    bookerMemberNo: booker ? booker.memberNo : null,
                    bookerName: booker ? booker.name : null,
                    changeCount: changeCountById.get(b.id) || 0,
                }),
                caddyRequests: requestsById.get(b.id) || [],
            };
        });
        dtos.sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || '')) || a.bookingNo.localeCompare(b.bookingNo));
        res.status(200).json({
            bookings: dtos,
            statuses: BOOKING_STATUSES,
            // The club's pickable player types (active, not affiliate-base).
            playerTypes: playerTypes.asVocabulary(playerTypes.pickable(await playerTypes.catalog(companyId))),
            // Named-caddy requests (2026-10-18) show only while the station is on.
            caddyManagementEnabled: await caddyRequests.enabled(companyId),
        });
    } catch (error) {
        console.error('Error listing golf bookings:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// The cancellation-notice verdict for a booking (user decisions 2026-10-06):
// is a cancel made NOW inside the notice window, and what would it cost the
// booker? Shared by the preview (so the confirm dialog shows the expected
// result) and the cancel itself (re-evaluated server-side at commit time).
// `firsts` = the booking's still-BOOKED starting-nine records (the players
// a cancel actually frees - already-registered players are never charged).
async function lateCancelContext(req, companyId, profile, firsts) {
    const cfg = await noShow.config(companyId);
    if (!cfg) return { cfg: null, late: false };
    const teeTime = firsts.length ? availability.hhmm(firsts[0].teeTime) : null;
    const timezone = await companyTimezone(req);
    const { late, deadline } = noShow.lateness(cfg, String(profile.playDate), teeTime, timezone);
    if (!late) return { cfg, late: false, deadline };
    const booker = await Golfer.findOne({ where: { companyId, id: profile.bookerGolferId } });
    const priced = firsts.length ? await noShow.quote(req, cfg, String(profile.playDate), firsts.length) : { error: 'No booked players remain on this booking.' };
    return { cfg, late: true, deadline, booker, priced };
}

// GET /api/golf/bookings/:id/cancel-preview - what cancelling NOW means, so
// the confirm dialog states the outcome before the user commits (show
// expected results): inside the notice window? charged or refused? how much?
exports.cancelPreview = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const profile = await BookingProfile.findOne({ where: { companyId, id: req.params.id } });
        if (!profile) return res.status(404).json({ message: 'Booking not found.' });
        if (profile.status === 'pending-approval') return res.status(200).json({ controlled: false, late: false, pending: true });
        if (profile.status !== 'booked') return res.status(400).json({ message: 'Only a booked booking can be cancelled.' });
        const firsts = await Player.findAll({
            where: { bookingProfileId: profile.id, secondNineFlag: 0, status: 'booked' },
            order: [['createdAt', 'ASC'], ['id', 'ASC']],
        });
        const ctx = await lateCancelContext(req, companyId, profile, firsts);
        if (!ctx.cfg) return res.status(200).json({ controlled: false, late: false });
        const out = {
            controlled: true,
            late: ctx.late,
            noticeHours: ctx.cfg.noticeHours,
            deadline: ctx.deadline,
            action: ctx.cfg.lateAction,
        };
        if (ctx.late) {
            out.booker = ctx.booker ? { name: ctx.booker.name, memberNo: ctx.booker.memberNo, isMember: ctx.booker.golferType === 'member' } : null;
            out.playerCount = firsts.length;
            if (ctx.priced.error) out.chargeError = ctx.priced.error;
            else {
                out.charge = {
                    description: ctx.priced.description,
                    quantity: ctx.priced.quantity,
                    unitAmount: ctx.priced.unitAmount,
                    amount: ctx.priced.amount,
                    taxAmount: ctx.priced.taxAmount,
                    totalAmount: ctx.priced.totalAmount,
                };
            }
        }
        res.status(200).json(out);
    } catch (error) {
        console.error('Error previewing golf booking cancel:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/golf/bookings/:id/cancel { reason, waiveCharge?, waiveReason? }
// - free the flight. Cancels the profile and its still-BOOKED player records
// (already-registered players stay - the desk record reflects who physically
// plays). Inside the cancellation-notice window (control ON): 'refuse'
// rejects the cancel; 'charge' raises the no-show charge to the booker
// (waivable with a reason) and posts it to AR after the cancel commits.
exports.cancel = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const profile = await BookingProfile.findOne({ where: { companyId, id: req.params.id } });
        if (!profile) return res.status(404).json({ message: 'Booking not found.' });
        const wasPending = profile.status === 'pending-approval';
        if (profile.status !== 'booked' && !wasPending) return res.status(400).json({ message: 'Only a booked booking can be cancelled.' });
        if (!(await canModifyRecord(req, profile))) return res.status(403).json({ message: 'You are not allowed to amend this booking.' });

        const callerId = getUserContext(req).userId;
        profile.status = 'cancelled';
        profile.cancelledAt = new Date();
        profile.cancelledBy = callerId;
        profile.cancelReason = req.body.reason ? String(req.body.reason).slice(0, 255) : null;
        profile.updatedBy = callerId;

        // Cancellation email to every member/member-guest player with an
        // address (name-only guests have none), atomic with the cancel.
        const records = await Player.findAll({
            where: { bookingProfileId: profile.id },
            order: [['secondNineFlag', 'ASC'], ['createdAt', 'ASC'], ['id', 'ASC']],
        });
        const firsts = records.filter((r) => Number(r.secondNineFlag) === 0);
        const bookedFirsts = firsts.filter((r) => r.status === 'booked');
        const recipients = [];
        for (const p of firsts) {
            if (!p.memberNo) continue;
            const s = await getGolfMemberStanding(companyId, p.memberNo);
            if (s && s.email) recipients.push({ name: p.playerName, email: s.email });
        }

        // Cancellation notice (re-evaluated here, never trusted from the
        // preview): refuse, or price the late-cancel charge to raise below.
        // A pending booking withdraws from approval and cancels freely (it
        // never stood); a booked one is judged against the notice policy.
        const ctx = wasPending ? { late: false } : await lateCancelContext(req, companyId, profile, bookedFirsts);
        let penalty = null;
        if (ctx.late) {
            if (ctx.cfg.lateAction === 'refuse') {
                return res.status(400).json({ message: `Bookings need ${ctx.cfg.noticeHours} hours' notice to cancel - the notice period for ${profile.bookingNo} ended ${ctx.deadline.date} ${ctx.deadline.time}. The booking stands; players who do not turn up are recorded as no-shows.` });
            }
            if (!ctx.booker) return res.status(409).json({ message: 'The booker\'s golfer identity no longer exists - the late-cancellation charge cannot be raised.' });
            if (ctx.priced.error) return res.status(400).json({ message: `Late cancellation cannot be charged: ${ctx.priced.error}` });
            const waive = req.body.waiveCharge === true;
            const waiveReason = waive && req.body.waiveReason ? String(req.body.waiveReason).trim().slice(0, 255) : '';
            if (waive && !waiveReason) return res.status(400).json({ message: 'Give a reason for waiving the late-cancellation charge.' });
            penalty = { booker: ctx.booker, priced: ctx.priced, waive: waive ? { reason: waiveReason } : null };
        }

        const course = await Course.findOne({ where: { companyId, id: profile.courseId } });
        const startTime = firsts.length ? availability.hhmm(firsts[0].teeTime) : '';
        const placement = await getCallerPlacement(req);
        const stamps = { createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId };
        let chargeRow = null;
        await sequelize.transaction(async (transaction) => {
            if (wasPending) {
                await workflowGateway.cancelForEntity(bookingApproval.ENTITY_TYPE, profile.id, transaction);
                profile.workflowInstanceId = null;
            }
            await profile.save({ transaction });
            await Player.update({
                status: 'cancelled',
                cancelledAt: new Date(),
                cancelledBy: callerId,
                cancelReason: profile.cancelReason,
                updatedBy: callerId,
            }, {
                where: { bookingProfileId: profile.id, status: 'booked' },
                transaction,
            });
            await caddyRequests.onBookingCancelled(companyId, profile.id, callerId, { transaction });
            if (penalty) {
                chargeRow = await noShow.raise({
                    req, profile, booker: penalty.booker, players: bookedFirsts,
                    chargeReason: 'late-cancel', priced: penalty.priced, waive: penalty.waive, stamps, transaction,
                });
            }
            await queueBookingEmail({
                companyId,
                templateKey: 'golf.booking.cancelled',
                recipients,
                data: {
                    bookingNo: profile.bookingNo,
                    playDateText: playDateText(String(profile.playDate)),
                    teeTime: startTime,
                    courseName: course ? `${course.courseCode}${course.description ? ' - ' + course.description : ''}` : '',
                    cancelReason: profile.cancelReason || '',
                    playersTable: playersTableHtml(firsts, playerTypes.labelsOf(await playerTypes.catalog(companyId))),
                },
                transaction,
            });
        });

        // The charge posts to AR AFTER the cancel committed (the no-show fact
        // survives an AR hiccup; the listing retries pending rows).
        let suffix = '';
        if (chargeRow) {
            if (chargeRow.status === 'waived') suffix = ` Late-cancellation charge waived (${chargeRow.waiveReason}).`;
            else {
                const posted = await noShow.postPending(req, chargeRow);
                suffix = posted.status === 'posted'
                    ? ` Late-cancellation charge ${Number(posted.totalAmount).toFixed(2)} posted to ${posted.bookerName} (${posted.arDocNo}).`
                    : ` Late-cancellation charge ${Number(posted.totalAmount).toFixed(2)} recorded as pending - ${posted.remarks}`;
            }
        }
        res.status(200).json({ message: `Booking ${profile.bookingNo} cancelled.${suffix}` });
    } catch (error) {
        console.error('Error cancelling golf booking:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---- change booking (2026-10-14) -------------------------------------------
// POST /api/golf/bookings/:id/change-preview - what the change means before
// it is saved (the moved flight, players added / dropped, the notice-window
// verdict and any late-change charge), in one sentence the desk confirms.
exports.changePreview = async (req, res) => {
    try {
        const out = await bookingChange.preview(req, req.params.id, req.body);
        if (out.error) return res.status(out.status || 400).json({ message: out.error });
        res.status(200).json(out.preview);
    } catch (error) {
        console.error('Error previewing golf booking change:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/golf/bookings/:id/change - apply the change (re-judged under the
// day lock); the booking number is unchanged, the history gains a row.
exports.change = async (req, res) => {
    try {
        const out = await bookingChange.apply(req, req.params.id, req.body);
        if (out.error) return res.status(out.status || 400).json({ message: out.error });
        res.status(200).json(out);
    } catch (error) {
        console.error('Error changing golf booking:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/golf/bookings/:id/changes - the booking's amendment history.
exports.listChanges = async (req, res) => {
    try {
        const out = await bookingChange.history(req, req.params.id);
        if (out.error) return res.status(out.status || 400).json({ message: out.error });
        res.status(200).json(out);
    } catch (error) {
        console.error('Error listing golf booking changes:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
