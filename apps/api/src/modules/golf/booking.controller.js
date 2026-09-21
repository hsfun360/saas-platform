// Golf Booking (Golf Management → /golf/bookings) - the make-booking flow
// (user decisions 2026-09-20, modeled on the 2006 SRS screens):
//   1. context   - member no resolves standing + the bookable date window
//   2. availability - the dynamic tee sheet's 5 nearest flights per course
//   3. lock      - clicking a flight claims it (whole flight, incl. crossover)
//                  for GolfSetting.bookingLockMinutes while players are keyed
//   4. save      - re-validates EVERY rule server-side and books atomically
// All state-changing steps run in a transaction under a Postgres advisory
// lock on (company, course, playDate) - the single serialization point that
// makes double booking impossible in a multi-user (and future member-portal)
// environment.

const crypto = require('crypto');
const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const {
    getUserContext, getCallerPlacement, annotateCanModify, canModifyRecord, getCompanyProfile,
} = require('../../platform/serviceContext');
const { getGolfMemberStanding } = require('../../platform/membershipGateway');
const { enqueueEmail } = require('../notification/emailOutbox');
const { classifyDateRange, companyTimezone } = require('../../platform/calendarGateway');
const numberingGateway = require('../../platform/numberingGateway');
const availability = require('./bookingAvailability.service');
const { BOOKING_STATUSES, PLAYER_TYPES, PLAYER_TYPE_KEYS, HOLES_OPTIONS } = require('./booking.constants');
const Booking = require('./booking.model');
const BookingPlayer = require('./bookingPlayer.model');
const FlightLock = require('./flightLock.model');
const Course = require('./course.model');
const Golfer = require('./golfer.model');

function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

// One advisory lock key per (company, course, playDate) - every lock/save
// transaction for the same course-day serializes here.
async function advisoryLock(transaction, companyId, courseId, playDate) {
    await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', {
        replacements: { key: `golf-booking:${companyId}:${courseId}:${playDate}` },
        transaction,
    });
}

// Remove expired locks for a course-day (inside the advisory lock, so the
// unique cell index never falsely blocks a new claim).
async function sweepExpiredLocks(companyId, courseId, playDate, transaction) {
    await FlightLock.destroy({
        where: { companyId, courseId, playDate, expiresAt: { [Op.lte]: new Date() } },
        transaction,
    });
}

async function dayTypeOf(req, playDate) {
    const rows = await classifyDateRange(req, playDate, playDate);
    return rows.length ? rows[0].dayType : 'weekday';
}

// Find-or-create the member's golf.Golfer identity (lazy provisioning, like
// AR Debtor), refreshing the name/memberNo snapshots on contact.
async function ensureMemberGolfer(companyId, standing, stamps, transaction) {
    const [row] = await Golfer.findOrCreate({
        where: { companyId, golferType: 'member', sourceId: standing.memberId },
        defaults: {
            companyId, golferType: 'member', sourceId: standing.memberId,
            name: standing.name, memberNo: standing.memberNo, ...stamps,
        },
        transaction,
    });
    if (row.name !== standing.name || row.memberNo !== standing.memberNo) {
        row.name = standing.name;
        row.memberNo = standing.memberNo;
        await row.save({ transaction });
    }
    return row;
}

// '27 Sept 2026' from 'YYYY-MM-DD' - a fixed readable style for emails (UTC
// so the server timezone never shifts the date).
function playDateText(iso) {
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// Queue ONE booking email addressed to every recipient with an email address
// TOGETHER (user decision 2026-09-22: the addresses are concatenated in To:,
// so every player sees the rest were informed). Members and members-as-guests
// resolve their address through the membership seam; name-only guests have no
// address until registration. Deduped by address. NON-CRITICAL: an email
// problem must never abort the booking - the enqueue is caught and logged;
// the queued row still commits/rolls back with the caller's transaction.
async function queueBookingEmail({ companyId, templateKey, recipients, data, transaction }) {
    const company = await getCompanyProfile(companyId);
    const seen = new Set();
    const to = [];
    for (const r of recipients) {
        if (!r || !r.email) continue;
        const key = r.email.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        to.push(r.email);
    }
    if (!to.length) return;
    try {
        await enqueueEmail({
            templateKey,
            accountId: company ? company.accountId : null,
            companyId,
            to: to.join(', '),
            data: { companyName: company ? company.name : '', ...data },
        }, transaction);
    } catch (error) {
        console.error(`Error queueing ${templateKey} email:`, error);
    }
}

const PLAYER_TYPE_LABELS = new Map(PLAYER_TYPES.map((t) => [t.key, t.label]));

function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// The flight's player list as an email-safe HTML table (inline styles - email
// clients ignore stylesheets). Injected into the templates via {{{playersTable}}}.
function playersTableHtml(players) {
    const td = 'border: 1px solid #e2e8f0; padding: 6px 10px; font-size: 14px;';
    const th = `${td} background-color: #f8fafc; text-align: left;`;
    const rows = players.map((p) => `<tr>`
        + `<td style="${td}">${p.sortOrder}</td>`
        + `<td style="${td}">${escapeHtml(p.playerName)}</td>`
        + `<td style="${td}">${p.memberNo ? escapeHtml(p.memberNo) : '—'}</td>`
        + `<td style="${td}">${PLAYER_TYPE_LABELS.get(p.playerType) || p.playerType}</td>`
        + `</tr>`).join('');
    return `<table style="border-collapse: collapse; width: 100%; margin-top: 8px;">`
        + `<tr><th style="${th}">#</th><th style="${th}">Player</th><th style="${th}">Member No</th><th style="${th}">Type</th></tr>`
        + `${rows}</table>`;
}

// "08:05 (WEST, B260900001), 14:30 (EAST, ...)" - the flight list for a
// one-booking-per-day conflict message.
async function describeDayBookings(companyId, rows, { transaction } = {}) {
    const courses = await Course.findAll({
        where: { companyId, id: { [Op.in]: [...new Set(rows.map((r) => r.courseId))] } },
        attributes: ['id', 'courseCode'],
        transaction,
    });
    const codeById = new Map(courses.map((c) => [c.id, c.courseCode]));
    return rows
        .map((r) => `${availability.hhmm(r.startTime)} (${codeById.get(r.courseId) || 'course'}, ${r.bookingNo})`)
        .join(', ');
}

// One-booking-per-day check for a member standing (null = no conflict). The
// member's golfer identity may not exist yet (never booked) - no conflict.
async function dayBookingConflict(companyId, standing, playDate, { transaction } = {}) {
    const golfer = await Golfer.findOne({
        where: { companyId, golferType: 'member', sourceId: standing.memberId },
        transaction,
    });
    if (!golfer) return null;
    const rows = await availability.memberDayBookings(companyId, golfer.id, playDate, { transaction });
    if (!rows.length) return null;
    return `${standing.memberNo} already has a booking on ${playDate} - ${await describeDayBookings(companyId, rows, { transaction })}.`;
}

function bookingDto(b, players, courseByIdMap) {
    const course = courseByIdMap ? courseByIdMap.get(b.courseId) : null;
    return {
        id: b.id,
        bookingNo: b.bookingNo,
        courseId: b.courseId,
        courseCode: course ? course.courseCode : null,
        courseDescription: course ? course.description : null,
        playDate: b.playDate,
        holes: b.holes,
        startNine: b.startNine,
        startTime: availability.hhmm(b.startTime),
        crossNine: b.crossNine,
        crossTime: availability.hhmm(b.crossTime),
        contactMobile: b.contactMobile,
        remarks: b.remarks,
        status: b.status,
        cancelReason: b.cancelReason,
        canModify: b.get ? b.get('canModify') : undefined,
        players: (players || []).map((p) => ({
            sortOrder: p.sortOrder,
            playerType: p.playerType,
            memberNo: p.memberNo,
            playerName: p.playerName,
        })),
    };
}

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
    // One booking per day (default ON): prompt at search which flight the
    // member already holds on this date.
    if (!window.setting || window.setting.oneBookingPerDay !== false) {
        const conflict = await dayBookingConflict(companyId, standing, playDate);
        if (conflict) return { error: conflict, status: 409 };
    }
    return { companyId, memberNo, playDate, holes, players, standing, window, timezone };
}

// POST /api/golf/bookings/availability - the 5 nearest available flights per
// course (all courses, or one when courseId is given). The 2006 stored
// procedure, computed from the dynamic tee sheet.
exports.searchAvailability = async (req, res) => {
    try {
        const parsed = await parseSearch(req, req.body);
        if (parsed.error) return res.status(parsed.status).json({ message: parsed.error });
        const { companyId, playDate, holes, players, window } = parsed;
        const time = String(req.body.time || '');
        if (!TIME_RE.test(time)) return res.status(400).json({ message: 'Pick a preferred tee time.' });

        const courseWhere = { companyId, isActive: true };
        if (req.body.courseId) courseWhere.id = String(req.body.courseId);
        const courses = await Course.findAll({
            where: courseWhere,
            order: [['displaySequence', 'ASC'], ['courseCode', 'ASC']],
        });
        if (!courses.length) return res.status(400).json({ message: 'No active course to search.' });

        const dayType = await dayTypeOf(req, playDate);
        const { setting, minRules } = await availability.loadRules(companyId);
        const courseIds = courses.map((c) => c.id);
        const [occ, locks] = await Promise.all([
            availability.occupancy(companyId, courseIds, playDate),
            availability.activeLockCells(companyId, courseIds, playDate),
        ]);

        const groups = [];
        for (const course of courses) {
            const result = await availability.courseFlights({
                companyId, course, playDate, dayType, holes, players, setting, minRules, occ, locks,
            });
            if (!result) continue;
            const flights = availability.nearestFlights(result.flights, time, 5);
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

// POST /api/golf/bookings/locks - claim a flight (whole flight, including the
// crossover cell) while the player list is keyed.
exports.createLock = async (req, res) => {
    try {
        const parsed = await parseSearch(req, req.body);
        if (parsed.error) return res.status(parsed.status).json({ message: parsed.error });
        const { companyId, playDate, holes, players } = parsed;
        const teeTime = String(req.body.teeTime || '');
        if (!TIME_RE.test(teeTime)) return res.status(400).json({ message: 'Pick a flight to lock.' });
        const course = await Course.findOne({ where: { companyId, id: String(req.body.courseId || ''), isActive: true } });
        if (!course) return res.status(400).json({ message: 'Pick a course.' });

        const dayType = await dayTypeOf(req, playDate);
        const { setting, minRules } = await availability.loadRules(companyId);
        const callerId = getUserContext(req).userId;
        const lockMinutes = setting ? setting.bookingLockMinutes : 5;

        const out = await sequelize.transaction(async (transaction) => {
            await advisoryLock(transaction, companyId, course.id, playDate);
            await sweepExpiredLocks(companyId, course.id, playDate, transaction);

            const [occ, locks] = await Promise.all([
                availability.occupancy(companyId, [course.id], playDate, { transaction }),
                availability.activeLockCells(companyId, [course.id], playDate, { transaction }),
            ]);
            const result = await availability.courseFlights({
                companyId, course, playDate, dayType, holes, players, setting, minRules, occ, locks,
            });
            const flight = result ? result.flights.find((f) => f.teeTime === teeTime) : null;
            if (!flight) return { taken: true };

            const groupId = crypto.randomUUID();
            const expiresAt = new Date(Date.now() + lockMinutes * 60000);
            const rows = [{
                companyId, groupId, courseId: course.id, playDate, nine: 'first', teeTime: flight.teeTime, expiresAt, lockedBy: callerId,
            }];
            if (holes === 18 && flight.crossTime && flight.crossTime !== flight.teeTime) {
                rows.push({
                    companyId, groupId, courseId: course.id, playDate, nine: 'second', teeTime: flight.crossTime, expiresAt, lockedBy: callerId,
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
        for (let i = 0; i < rawPlayers.length; i += 1) {
            const line = rawPlayers[i] || {};
            const playerType = String(line.playerType || '');
            if (!PLAYER_TYPE_KEYS.includes(playerType)) return res.status(400).json({ message: `Player ${i + 1}: pick a player type.` });
            if (playerType === 'guest') {
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
        const startRow = lockRows.find((r) => r.nine === 'first');
        const crossRow = lockRows.find((r) => r.nine === 'second') || null;
        if (!startRow || startRow.lockedBy !== callerId) return res.status(409).json({ message: 'The flight lock is not yours - pick a flight again.' });
        const course = await Course.findOne({ where: { companyId, id: startRow.courseId } });
        if (!course) return res.status(400).json({ message: 'The locked course no longer exists.' });
        const playDate = String(startRow.playDate);
        const holes = Number(req.body.holes) === 18 || crossRow ? 18 : 9;

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
            await advisoryLock(transaction, companyId, course.id, playDate);

            // Lock still valid under the serialization point?
            const fresh = await FlightLock.findAll({ where: { companyId, groupId }, transaction });
            if (!fresh.length || fresh.some((r) => r.lockedBy !== callerId)) return { fail: 'The flight lock expired - pick a flight again.', status: 409 };
            if (fresh.every((r) => r.expiresAt <= new Date())) return { fail: 'The flight lock expired - pick a flight again.', status: 409 };

            const startTime = availability.hhmm(startRow.teeTime);
            const crossTime = crossRow ? availability.hhmm(crossRow.teeTime) : null;
            const t = availability.toMinutes(startTime);

            // Capacity re-check under the merge rule (our own lock excluded).
            const occ = await availability.occupancy(companyId, [course.id], playDate, { transaction });
            const set = await availability.resolveTeeTimeSet(course.id, dayType, playDate);
            if (!set) return { fail: 'The tee sheet for this date is no longer configured.', status: 409 };
            const CourseTeeTimeSlot = require('./courseTeeTimeSlot.model');
            const slots = await CourseTeeTimeSlot.findAll({ where: { teeTimeSetId: set.id }, transaction });
            const bySlotTime = new Map(slots.map((s) => [availability.hhmm(s.teeTime), s]));
            const startSlot = bySlotTime.get(startTime);
            if (!startSlot) return { fail: 'The flight time no longer exists on the tee sheet.', status: 409 };
            // Closure re-check (maintenance / tournament blocks saved while
            // the flight was locked must still stop the booking).
            const blocks = await availability.closureBlocks(course.id, playDate);
            if (availability.nineBlocked(blocks, 'first', t)) {
                return { fail: 'The flight is now blocked by a course closure.', status: 409 };
            }
            if (crossTime && availability.nineBlocked(blocks, 'second', availability.toMinutes(crossTime))) {
                return { fail: 'The crossover flight is now blocked by a course closure.', status: 409 };
            }
            const startOcc = occ.get(availability.cellKey(course.id, 'first', startTime));
            if (availability.seatsLeft(allowMerge, startOcc, startSlot.maxPlayers) < lines.length) {
                return { fail: 'The flight no longer has room for these players.', status: 409 };
            }
            if (crossTime) {
                const crossSlot = bySlotTime.get(crossTime);
                if (!crossSlot) return { fail: 'The crossover time no longer exists on the tee sheet.', status: 409 };
                const crossOcc = occ.get(availability.cellKey(course.id, 'second', crossTime));
                if (availability.seatsLeft(allowMerge, crossOcc, crossSlot.maxPlayers) < lines.length) {
                    return { fail: 'The crossover flight no longer has room for these players.', status: 409 };
                }
            }

            // Minimum players: own count OR the flight's total after joining.
            const existingPlayers = (startOcc && startOcc.players) || 0;
            const minPlayers = availability.resolveMinPlayers(setting, minRules, course.id, dayType, t);
            if (lines.length < minPlayers && !(existingPlayers > 0 && existingPlayers + lines.length >= minPlayers)) {
                return { fail: `This flight needs at least ${minPlayers} player(s).`, status: 400 };
            }

            // Guest control for this course/day/time.
            const gc = availability.resolveGuestControl(setting, guestRules, course.id, dayType, t);
            if (!gc.allowGuest && lines.some((l) => l.playerType === 'guest')) {
                return { fail: 'Guests are not allowed on this flight (guest control).', status: 400 };
            }
            if (!gc.allowMemberGuest && lines.some((l) => l.playerType === 'member-guest')) {
                return { fail: 'Members as guests are not allowed on this flight (guest control).', status: 400 };
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

            // One booking per day, re-checked under the advisory lock for the
            // BOOKER and every 'member' player line (member-as-guest exempt).
            if (!setting || setting.oneBookingPerDay !== false) {
                const bookerRows = await availability.memberDayBookings(companyId, booker.id, playDate, { transaction });
                if (bookerRows.length) {
                    return { fail: `${standing.memberNo} already has a booking on ${playDate} - ${await describeDayBookings(companyId, bookerRows, { transaction })}.`, status: 400 };
                }
                for (const line of lines) {
                    if (!line.standing || line.playerType !== 'member') continue;
                    const g = golferByMemberId.get(line.standing.memberId);
                    if (!g || g.id === booker.id) continue;
                    const rows = await availability.memberDayBookings(companyId, g.id, playDate, { transaction });
                    if (rows.length) {
                        return { fail: `Player ${line.sortOrder}: ${line.memberNo} already has a booking on ${playDate} - ${await describeDayBookings(companyId, rows, { transaction })}.`, status: 400 };
                    }
                }
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

            const booking = await Booking.create({
                companyId,
                bookingNo,
                courseId: course.id,
                playDate,
                holes,
                startNine: 'first',
                startTime,
                crossNine: crossTime ? 'second' : null,
                crossTime,
                bookerGolferId: booker.id,
                contactMobile,
                remarks,
                status: 'booked',
                ...stamps,
            }, { transaction });
            await BookingPlayer.bulkCreate(lines.map((l) => ({
                bookingId: booking.id,
                sortOrder: l.sortOrder,
                playerType: l.playerType,
                golferId: l.standing ? golferByMemberId.get(l.standing.memberId).id : null,
                playerName: l.playerName,
                memberNo: l.memberNo,
                ...stamps,
            })), { transaction });
            await FlightLock.destroy({ where: { companyId, groupId }, transaction });

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
                    courseName: `${course.courseCode}${course.description ? ' — ' + course.description : ''}`,
                    holes,
                    playersTable: playersTableHtml(lines),
                },
                transaction,
            });
            return { booking };
        });

        if (result.fail) return res.status(result.status).json({ message: result.fail });
        const players = await BookingPlayer.findAll({ where: { bookingId: result.booking.id }, order: [['sortOrder', 'ASC']] });
        res.status(201).json({
            message: `Booking ${result.booking.bookingNo} confirmed.`,
            booking: bookingDto(result.booking, players, new Map([[course.id, course]])),
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

        const rows = await Booking.findAll({
            where: { companyId, playDate },
            order: [['startTime', 'ASC'], ['bookingNo', 'ASC']],
        });
        await annotateCanModify(req, rows);
        const players = rows.length
            ? await BookingPlayer.findAll({ where: { bookingId: { [Op.in]: rows.map((r) => r.id) } }, order: [['sortOrder', 'ASC']] })
            : [];
        const byBooking = new Map();
        for (const p of players) {
            if (!byBooking.has(p.bookingId)) byBooking.set(p.bookingId, []);
            byBooking.get(p.bookingId).push(p);
        }
        const courses = await Course.findAll({ where: { companyId }, attributes: ['id', 'courseCode', 'description'] });
        const courseById = new Map(courses.map((c) => [c.id, c]));
        res.status(200).json({
            bookings: rows.map((b) => bookingDto(b, byBooking.get(b.id), courseById)),
            statuses: BOOKING_STATUSES,
            playerTypes: PLAYER_TYPES,
        });
    } catch (error) {
        console.error('Error listing golf bookings:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/golf/bookings/:id/cancel - free the flight.
exports.cancel = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const booking = await Booking.findOne({ where: { companyId, id: req.params.id } });
        if (!booking) return res.status(404).json({ message: 'Booking not found.' });
        if (booking.status !== 'booked') return res.status(400).json({ message: 'Only a booked booking can be cancelled.' });
        if (!(await canModifyRecord(req, booking))) return res.status(403).json({ message: 'You are not allowed to amend this booking.' });

        booking.status = 'cancelled';
        booking.cancelledAt = new Date();
        booking.cancelledBy = getUserContext(req).userId;
        booking.cancelReason = req.body.reason ? String(req.body.reason).slice(0, 255) : null;
        booking.updatedBy = getUserContext(req).userId;

        // Cancellation email to every member/member-guest player with an
        // address (name-only guests have none), atomic with the cancel.
        const players = await BookingPlayer.findAll({ where: { bookingId: booking.id }, order: [['sortOrder', 'ASC']] });
        const recipients = [];
        for (const p of players) {
            if (!p.memberNo) continue;
            const s = await getGolfMemberStanding(companyId, p.memberNo);
            if (s && s.email) recipients.push({ name: p.playerName, email: s.email });
        }
        const course = await Course.findOne({ where: { companyId, id: booking.courseId } });
        await sequelize.transaction(async (transaction) => {
            await booking.save({ transaction });
            await queueBookingEmail({
                companyId,
                templateKey: 'golf.booking.cancelled',
                recipients,
                data: {
                    bookingNo: booking.bookingNo,
                    playDateText: playDateText(String(booking.playDate)),
                    teeTime: availability.hhmm(booking.startTime),
                    courseName: course ? `${course.courseCode}${course.description ? ' — ' + course.description : ''}` : '',
                    cancelReason: booking.cancelReason || '',
                    playersTable: playersTableHtml(players),
                },
                transaction,
            });
        });
        res.status(200).json({ message: `Booking ${booking.bookingNo} cancelled.` });
    } catch (error) {
        console.error('Error cancelling golf booking:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
