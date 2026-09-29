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
    getUserContext, getCallerPlacement, annotateCanModify, canModifyRecord, getCompanyProfile,
} = require('../../platform/serviceContext');
const { getGolfMemberStanding } = require('../../platform/membershipGateway');
const { enqueueEmail } = require('../notification/emailOutbox');
const { classifyDateRange, companyTimezone } = require('../../platform/calendarGateway');
const numberingGateway = require('../../platform/numberingGateway');
const availability = require('./bookingAvailability.service');
const { BOOKING_STATUSES, PLAYER_TYPES, PLAYER_TYPE_KEYS, HOLES_OPTIONS } = require('./booking.constants');
const BookingProfile = require('./bookingProfile.model');
const Player = require('./player.model');
const FlightLock = require('./flightLock.model');
const Course = require('./course.model');
const Golfer = require('./golfer.model');

function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

// One advisory lock key per (company, playDate) - every lock/save
// transaction for the same day serializes here. Day-wide (not per course)
// because rotation courses share physical nines.
async function advisoryLock(transaction, companyId, playDate) {
    await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', {
        replacements: { key: `golf-booking:${companyId}:${playDate}` },
        transaction,
    });
}

// Remove expired locks for a day (inside the advisory lock, so the unique
// cell index never falsely blocks a new claim).
async function sweepExpiredLocks(companyId, playDate, transaction) {
    await FlightLock.destroy({
        where: { companyId, playDate, expiresAt: { [Op.lte]: new Date() } },
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
    const rows = players.map((p, i) => `<tr>`
        + `<td style="${td}">${p.sortOrder || i + 1}</td>`
        + `<td style="${td}">${escapeHtml(p.playerName)}</td>`
        + `<td style="${td}">${p.memberNo ? escapeHtml(p.memberNo) : '—'}</td>`
        + `<td style="${td}">${PLAYER_TYPE_LABELS.get(p.playerType) || p.playerType}</td>`
        + `</tr>`).join('');
    return `<table style="border-collapse: collapse; width: 100%; margin-top: 8px;">`
        + `<tr><th style="${th}">#</th><th style="${th}">Player</th><th style="${th}">Member No</th><th style="${th}">Type</th></tr>`
        + `${rows}</table>`;
}

// The starting-nine Player records of a set of booking profiles, ordered by
// creation (creation order IS the keyed player order - see create()).
async function firstNineRecords(profileIds, { transaction } = {}) {
    if (!profileIds.length) return [];
    return Player.findAll({
        where: { bookingProfileId: { [Op.in]: profileIds }, secondNineFlag: 0 },
        order: [['createdAt', 'ASC'], ['id', 'ASC']],
        transaction,
    });
}

// "08:05 (WEST, B260900001), 14:30 (EAST, ...)" - the flight list for a
// one-booking-per-day conflict message. Start times come from the profiles'
// starting-nine Player records.
async function describeDayBookings(companyId, profiles, { transaction } = {}) {
    const courses = await Course.findAll({
        where: { companyId, id: { [Op.in]: [...new Set(profiles.map((r) => r.courseId))] } },
        attributes: ['id', 'courseCode'],
        transaction,
    });
    const codeById = new Map(courses.map((c) => [c.id, c.courseCode]));
    const firsts = await firstNineRecords(profiles.map((p) => p.id), { transaction });
    const timeByProfile = new Map();
    for (const f of firsts) {
        if (!timeByProfile.has(f.bookingProfileId)) timeByProfile.set(f.bookingProfileId, availability.hhmm(f.teeTime));
    }
    return profiles
        .map((r) => `${timeByProfile.get(r.id) || '—'} (${codeById.get(r.courseId) || 'course'}, ${r.bookingNo})`)
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

// DTO from a profile + its Player records (both nines). The flight fields
// are DERIVED from the records: start = the first-nine records' tee time,
// crossover = the paired second-nine records' tee time, holes = 18 when a
// pair exists. The dto shape matches the pre-revamp one so the web wizard
// and listing keep working unchanged.
function bookingDto(profile, records, courseByIdMap) {
    const course = courseByIdMap ? courseByIdMap.get(profile.courseId) : null;
    const rows = records || [];
    const firsts = rows.filter((r) => Number(r.secondNineFlag) === 0)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : (a.id < b.id ? -1 : 1)));
    const seconds = rows.filter((r) => Number(r.secondNineFlag) === 1);
    const startTime = firsts.length ? availability.hhmm(firsts[0].teeTime) : null;
    const crossTime = seconds.length ? availability.hhmm(seconds[0].teeTime) : null;
    return {
        id: profile.id,
        bookingNo: profile.bookingNo,
        bookingType: profile.bookingType,
        courseId: profile.courseId,
        courseCode: course ? course.courseCode : null,
        courseDescription: course ? course.description : null,
        playDate: profile.playDate,
        holes: seconds.length ? 18 : 9,
        startTime,
        crossTime,
        contactMobile: profile.contactMobile,
        remarks: profile.remarks,
        status: profile.status,
        cancelReason: profile.cancelReason,
        canModify: profile.get ? profile.get('canModify') : undefined,
        players: firsts.map((p, i) => ({
            sortOrder: i + 1,
            playerType: p.playerType,
            memberNo: p.memberNo,
            playerName: p.playerName,
            status: p.status,
            registrationNo: p.registrationNo,
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
// procedure, computed from the dynamic per-nine tee sheet.
exports.searchAvailability = async (req, res) => {
    try {
        const parsed = await parseSearch(req, req.body);
        if (parsed.error) return res.status(parsed.status).json({ message: parsed.error });
        const { companyId, playDate, holes, players } = parsed;
        const time = String(req.body.time || '');
        if (!TIME_RE.test(time)) return res.status(400).json({ message: 'Pick a preferred tee time.' });

        const dayType = await dayTypeOf(req, playDate);
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
            availability.occupancy(companyId, playDate),
            availability.activeLockCells(companyId, playDate),
        ]);

        const groups = [];
        for (const course of wanted) {
            const result = await availability.courseFlights({
                course, ctx, playDate, dayType, holes, players, setting, minRules, occ, locks,
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

        const dayType = await dayTypeOf(req, playDate);
        const { setting, minRules } = await availability.loadRules(companyId);
        const callerId = getUserContext(req).userId;
        const lockMinutes = setting ? setting.bookingLockMinutes : 5;

        const out = await sequelize.transaction(async (transaction) => {
            await advisoryLock(transaction, companyId, playDate);
            await sweepExpiredLocks(companyId, playDate, transaction);

            const ctx = await availability.dayContext(companyId, playDate, dayType, { transaction });
            const [occ, locks] = await Promise.all([
                availability.occupancy(companyId, playDate, { transaction }),
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
            if (availability.nineBlocked(day.blocks, 'first', t)) {
                return { fail: 'The flight is now blocked by a course closure.', status: 409 };
            }
            // Capacity re-check per NINE-cell under the merge rule.
            const occ = await availability.occupancy(companyId, playDate, { transaction });
            const startOcc = occ.get(availability.nineKey(course.firstNineId, startTime));
            if (availability.seatsLeft(allowMerge, startOcc, startSlot.maxPlayers) < lines.length) {
                return { fail: 'The flight no longer has room for these players.', status: 409 };
            }
            if (crossTime) {
                const target = availability.crossTarget(ctx, course, t);
                if (!target) return { fail: 'The crossover time no longer exists on the tee sheet.', status: 409 };
                const ct = availability.toMinutes(crossTime);
                if (availability.crossBlocked(ctx, course, target, ct)) {
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
            if (!gc.allowGuest && lines.some((l) => l.playerType === 'guest')) {
                return { fail: 'Guests are not allowed on this flight (guest control).', status: 400 };
            }
            if (!gc.allowMemberGuest && lines.some((l) => l.playerType === 'member-guest')) {
                return { fail: 'Members as guests are not allowed on this flight (guest control).', status: 400 };
            }

            // Guest quota (user decision 2026-09-28): the BOOKER's membership
            // type caps how many guests one booking may carry - member-as-
            // guest lines COUNT toward it. NULL = no limit; 0 = none at all.
            const guestCount = lines.filter((l) => l.playerType === 'guest' || l.playerType === 'member-guest').length;
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
            return { profile, records };
        });

        if (result.fail) return res.status(result.status).json({ message: result.fail });
        res.status(201).json({
            message: `Booking ${result.profile.bookingNo} confirmed.`,
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

        const rows = await BookingProfile.findAll({ where: { companyId, playDate } });
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
        const dtos = rows.map((b) => bookingDto(b, byProfile.get(b.id), courseById));
        dtos.sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || '')) || a.bookingNo.localeCompare(b.bookingNo));
        res.status(200).json({
            bookings: dtos,
            statuses: BOOKING_STATUSES,
            playerTypes: PLAYER_TYPES,
        });
    } catch (error) {
        console.error('Error listing golf bookings:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/golf/bookings/:id/cancel - free the flight. Cancels the profile
// and its still-BOOKED player records (already-registered players stay - the
// desk record reflects who physically plays).
exports.cancel = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const profile = await BookingProfile.findOne({ where: { companyId, id: req.params.id } });
        if (!profile) return res.status(404).json({ message: 'Booking not found.' });
        if (profile.status !== 'booked') return res.status(400).json({ message: 'Only a booked booking can be cancelled.' });
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
        const recipients = [];
        for (const p of firsts) {
            if (!p.memberNo) continue;
            const s = await getGolfMemberStanding(companyId, p.memberNo);
            if (s && s.email) recipients.push({ name: p.playerName, email: s.email });
        }
        const course = await Course.findOne({ where: { companyId, id: profile.courseId } });
        const startTime = firsts.length ? availability.hhmm(firsts[0].teeTime) : '';
        await sequelize.transaction(async (transaction) => {
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
            await queueBookingEmail({
                companyId,
                templateKey: 'golf.booking.cancelled',
                recipients,
                data: {
                    bookingNo: profile.bookingNo,
                    playDateText: playDateText(String(profile.playDate)),
                    teeTime: startTime,
                    courseName: course ? `${course.courseCode}${course.description ? ' — ' + course.description : ''}` : '',
                    cancelReason: profile.cancelReason || '',
                    playersTable: playersTableHtml(firsts),
                },
                transaction,
            });
        });
        res.status(200).json({ message: `Booking ${profile.bookingNo} cancelled.` });
    } catch (error) {
        console.error('Error cancelling golf booking:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
