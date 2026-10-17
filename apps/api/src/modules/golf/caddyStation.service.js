// Caddy Station (user decisions 2026-10-17; spec 球僮 2.2 + the starter-hut
// spec triaged) - the day's check-in queue and the rounds of caddy service
// assigned against the flights of the day.
//
// THE RULES (the buggy station's, applied to caddies):
//   - assigning never bills anything: the caddy fee is a bill line and the
//     station DERIVES the caddy SLOTS of a flight from the PAID caddy-fee
//     lines (buggyStation.service.buildSlots with noun 'caddy': a single line
//     is one slot, two shared lines pair into one, unpaired or unpaid lines
//     are blocked); a consumed line is never assigned twice;
//   - NO caddy without a caddy-fee line (user decision: a complimentary caddy
//     carries a zero-priced caddy-fee item);
//   - a caddy must be CHECKED IN today (present, not out, not on leave) and
//     the grade's playersPerCaddy caps the golfers of the slot;
//   - the QUEUE is FIFO by `queuedAt` (the check-in time); a completed round
//     sends the caddy to the back; assigning a caddy who is NOT the head of
//     the queue needs `requestedByName` (the player picked their caddy);
//   - completion records the holes played (the round the club settles pay
//     from, outside the system); a SWAP ends the first assignment as
//     'swapped' with the reason deciding `countsAsRound`, and opens a new
//     assignment for the replacement with the same golfers and fee lines.

const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { getUserContext, getCallerPlacement } = require('../../platform/serviceContext');
const { companyTimezoneById } = require('../../platform/calendarGateway');
const availability = require('./bookingAvailability.service');
const station = require('./buggyStation.service');
const GolfSetting = require('./golfSetting.model');
const Course = require('./course.model');
const Player = require('./player.model');
const BookingProfile = require('./bookingProfile.model');
const GolfCaddy = require('./caddy.model');
const GolfCaddyGrade = require('./caddyGrade.model');
const GolfCaddyLeave = require('./caddyLeave.model');
const GolfCaddyAttendance = require('./caddyAttendance.model');
const GolfCaddyAssignment = require('./caddyAssignment.model');
const GolfCaddyAssignmentPlayer = require('./caddyAssignmentPlayer.model');
const { CADDY_CHARGE_TYPE_KEY } = require('./transactionType.constants');
const { SWAP_REASONS, SWAP_REASON_KEYS } = require('./caddy.constants');
const caddySvc = require('./caddy.service');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LIVE_ASSIGNMENT_STATUSES = ['assigned', 'completed'];

function fail(message, status = 400) {
    return { error: message, status };
}

function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

async function callerStamps(req) {
    const placement = await getCallerPlacement(req);
    const callerId = getUserContext(req).userId;
    return { createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId };
}

async function enabled(companyId, { transaction } = {}) {
    const setting = await GolfSetting.findOne({ where: { companyId }, attributes: ['caddyManagementEnabled'], transaction });
    return !!(setting && setting.caddyManagementEnabled === true);
}

// The club-local calendar date (the work date of a check-in).
async function clubToday(companyId) {
    return availability.clubNow(await companyTimezoneById(companyId)).date;
}

// ---------------------------------------------------------------------------
// PURE: the queue (unit-tested).

// Present attendance rows in queue order (earliest queuedAt first).
function queueOrder(rows) {
    return rows
        .filter((r) => r.status === 'present')
        .slice()
        .sort((a, b) => new Date(a.queuedAt) - new Date(b.queuedAt) || String(a.caddyNo).localeCompare(String(b.caddyNo)));
}

// The head of the queue, or null.
function nextUp(rows) {
    const q = queueOrder(rows);
    return q.length ? q[0] : null;
}

// Does the reason count the swapped-out caddy's round?
function countsAsRound(reason) {
    const r = SWAP_REASONS.find((x) => x.key === reason);
    return r ? r.countsAsRound === true : false;
}

// ---------------------------------------------------------------------------
// Lookups

function tokenFromCode(code) {
    const raw = String(code || '').trim();
    if (!raw) return { token: null, caddyNo: null };
    const m = raw.match(/[?&]c=([A-Za-z0-9]+)/);
    if (m) return { token: m[1], caddyNo: null };
    if (/^[0-9a-f]{32}$/i.test(raw)) return { token: raw.toLowerCase(), caddyNo: null };
    return { token: null, caddyNo: raw.toUpperCase() };
}

const CADDY_INCLUDE = [{ model: GolfCaddyGrade, as: 'grade', attributes: ['id', 'code', 'name', 'playersPerCaddy'] }];

async function findCaddy(companyId, ref, { transaction } = {}) {
    if (ref && ref.id) return GolfCaddy.findOne({ where: { companyId, id: ref.id }, include: CADDY_INCLUDE, transaction });
    const { token, caddyNo } = tokenFromCode(ref && (ref.code || ref.qrToken || ref.caddyNo));
    if (token) return GolfCaddy.findOne({ where: { companyId, qrToken: token }, include: CADDY_INCLUDE, transaction });
    if (caddyNo) return GolfCaddy.findOne({ where: { companyId, caddyNo }, include: CADDY_INCLUDE, transaction });
    return null;
}

function caddyBrief(c) {
    return {
        id: c.id,
        caddyNo: c.caddyNo,
        name: c.name,
        status: c.status,
        photo: c.photo || null,
        languages: c.languages || null,
        grade: c.grade ? { id: c.grade.id, code: c.grade.code, name: c.grade.name, playersPerCaddy: Number(c.grade.playersPerCaddy) } : null,
    };
}

function attendanceDto(a, caddy = null) {
    return {
        id: a.id,
        caddyId: a.caddyId,
        caddyNo: a.caddyNo,
        workDate: a.workDate,
        checkedInAt: a.checkedInAt,
        checkedOutAt: a.checkedOutAt,
        queuedAt: a.queuedAt,
        status: a.status,
        remarks: a.remarks || null,
        caddy: caddy ? caddyBrief(caddy) : undefined,
    };
}

function assignmentDto(a) {
    return {
        id: a.id,
        caddyId: a.caddyId,
        caddyNo: a.caddyNo,
        caddyName: a.caddy ? a.caddy.name : undefined,
        playDate: a.playDate,
        courseId: a.courseId,
        bookingProfileId: a.bookingProfileId,
        teeTime: a.teeTime ? availability.hhmm(a.teeTime) : null,
        holes: a.holes,
        assignedAt: a.assignedAt,
        requestedByName: a.requestedByName === true,
        status: a.status,
        holesPlayed: a.holesPlayed,
        completedAt: a.completedAt,
        completionNote: a.completionNote,
        swapReason: a.swapReason,
        swapHole: a.swapHole,
        countsAsRound: a.countsAsRound,
        replacedByAssignmentId: a.replacedByAssignmentId,
        replacesAssignmentId: a.replacesAssignmentId,
        players: (a.players || []).map((p) => ({ playerId: p.playerId, golferId: p.golferId, playerName: p.playerName, memberNo: p.memberNo, billItemId: p.billItemId })),
    };
}

// ---------------------------------------------------------------------------
// Flight facts (the buggy station's helpers, caddy-fee lines)

async function consumedLineIds(playerIds, { transaction } = {}) {
    if (!playerIds.length) return new Set();
    const rows = await GolfCaddyAssignmentPlayer.findAll({
        where: { playerId: { [Op.in]: playerIds } },
        include: [{ model: GolfCaddyAssignment, as: 'assignment', attributes: ['status'], where: { status: { [Op.in]: LIVE_ASSIGNMENT_STATUSES } }, required: true }],
        attributes: ['billItemId'],
        transaction,
    });
    return new Set(rows.map((r) => r.billItemId));
}

async function liveAssignmentsOf(companyId, playerIds, { transaction } = {}) {
    if (!playerIds.length) return [];
    const rows = await GolfCaddyAssignmentPlayer.findAll({ where: { playerId: { [Op.in]: playerIds } }, attributes: ['caddyAssignmentId'], transaction });
    const ids = [...new Set(rows.map((r) => r.caddyAssignmentId))];
    if (!ids.length) return [];
    return GolfCaddyAssignment.findAll({
        where: { companyId, id: { [Op.in]: ids }, status: { [Op.in]: LIVE_ASSIGNMENT_STATUSES } },
        include: [{ model: GolfCaddyAssignmentPlayer, as: 'players' }, { model: GolfCaddy, as: 'caddy', attributes: ['id', 'name'] }],
        order: [['assignedAt', 'ASC']],
        transaction,
    });
}

async function flightView(companyId, { course, playDate, teeTime }, players, { transaction } = {}) {
    const playerIds = players.map((p) => p.playerId);
    const [feeLines, consumed, assignments] = await Promise.all([
        station.feeLinesOf(companyId, playerIds, { transaction, chargeType: CADDY_CHARGE_TYPE_KEY }),
        consumedLineIds(playerIds, { transaction }),
        liveAssignmentsOf(companyId, playerIds, { transaction }),
    ]);
    const { slots, noFee } = station.buildSlots({ players, feeLines, consumed, noun: 'caddy' });
    const withCaddy = new Set(assignments.filter((a) => a.status === 'assigned').flatMap((a) => a.players.map((p) => p.playerId)));
    return {
        key: station.flightKey(course.id, teeTime),
        courseId: course.id,
        courseCode: course.courseCode,
        courseDescription: course.description || null,
        playDate,
        teeTime: availability.hhmm(teeTime),
        players: players.map((p) => ({ ...p, withCaddy: withCaddy.has(p.playerId) })),
        slots,
        noFee: noFee.map((p) => ({ playerId: p.playerId, playerName: p.playerName, memberNo: p.memberNo || null })),
        assignments: assignments.map(assignmentDto),
        feeLines: feeLines.map((l) => ({ billItemId: l.billItemId, playerId: l.playerId, usageType: l.usageType, quantity: l.quantity, paid: l.paid, billNo: l.billNo, code: l.code, consumed: consumed.has(l.billItemId) })),
    };
}

// ---------------------------------------------------------------------------
// The day's attendance

async function attendanceOf(companyId, workDate, { transaction } = {}) {
    return GolfCaddyAttendance.findAll({
        where: { companyId, workDate },
        include: [{ model: GolfCaddy, as: 'caddy', include: CADDY_INCLUDE }],
        transaction,
    });
}

function board(rows) {
    const present = rows.filter((r) => r.status === 'present');
    const out = rows.filter((r) => r.status === 'out');
    const off = rows.filter((r) => r.status === 'off');
    return {
        checkedIn: rows.length,
        available: present.length,
        onCourse: out.length,
        checkedOut: off.length,
        queue: queueOrder(rows).map((r) => attendanceDto(r, r.caddy)),
        out: out.map((r) => attendanceDto(r, r.caddy)),
    };
}

// GET /caddy-station/day?playDate=&courseId=
async function day(req, query) {
    const companyId = companyIdOf(req);
    if (!companyId) return fail('Select a workspace first.');
    const playDate = String(query.playDate || '');
    if (!DATE_RE.test(playDate)) return fail('Pick a play date.');
    const courseFilter = query.courseId ? String(query.courseId) : null;
    const [isEnabled, courses, rows, attendance] = await Promise.all([
        enabled(companyId),
        Course.findAll({ where: { companyId }, order: [['displaySequence', 'ASC'], ['courseCode', 'ASC']] }),
        Player.findAll({
            where: { companyId, playDate, secondNineFlag: 0, status: 'registered', ...(courseFilter ? { courseId: courseFilter } : {}) },
            order: [['teeTime', 'ASC'], ['createdAt', 'ASC'], ['id', 'ASC']],
        }),
        attendanceOf(companyId, playDate),
    ]);
    const courseById = new Map(courses.map((c) => [c.id, c]));
    const byFlight = new Map();
    for (const r of rows) {
        const key = station.flightKey(r.courseId, r.teeTime);
        if (!byFlight.has(key)) byFlight.set(key, { course: courseById.get(r.courseId), teeTime: r.teeTime, players: [] });
        byFlight.get(key).players.push(station.playerFacts(r));
    }
    const profileIds = [...new Set(rows.map((r) => r.bookingProfileId).filter(Boolean))];
    const profiles = profileIds.length ? await BookingProfile.findAll({ where: { companyId, id: { [Op.in]: profileIds } }, attributes: ['id', 'bookingNo', 'groupName'] }) : [];
    const profileById = new Map(profiles.map((p) => [p.id, p]));
    const flights = [];
    for (const f of byFlight.values()) {
        if (!f.course) continue;
        const view = await flightView(companyId, { course: f.course, playDate, teeTime: f.teeTime }, f.players);
        view.bookingNos = [...new Set(f.players.map((p) => p.bookingProfileId).filter(Boolean).map((id) => (profileById.get(id) || {}).bookingNo).filter(Boolean))];
        view.groupName = [...new Set(f.players.map((p) => p.bookingProfileId).filter(Boolean).map((id) => (profileById.get(id) || {}).groupName).filter(Boolean))][0] || null;
        flights.push(view);
    }
    flights.sort((a, b) => a.teeTime.localeCompare(b.teeTime) || a.courseCode.localeCompare(b.courseCode));
    // Who could still check in today: active caddies not yet checked in and not on leave.
    const onLeave = await caddySvc.caddyIdsOnLeave(companyId, playDate);
    const checkedIn = new Set(attendance.map((a) => a.caddyId));
    const roster = await GolfCaddy.findAll({ where: { companyId, status: 'active' }, include: CADDY_INCLUDE, order: [['caddyNo', 'ASC']] });
    return {
        enabled: isEnabled,
        playDate,
        courses: courses.map((c) => ({ id: c.id, courseCode: c.courseCode, description: c.description || null, isActive: c.isActive !== false })),
        flights,
        board: board(attendance),
        notCheckedIn: roster.filter((c) => !checkedIn.has(c.id)).map((c) => ({ ...caddyBrief(c), onLeaveType: onLeave.get(c.id) || null })),
        swapReasons: SWAP_REASONS,
    };
}

// GET /caddy-station/resolve?code= - the caddy, today's attendance, the open round.
async function resolve(req, query) {
    const companyId = companyIdOf(req);
    if (!companyId) return fail('Select a workspace first.');
    const caddy = await findCaddy(companyId, { code: query.code });
    if (!caddy) return fail(`No caddy matches '${String(query.code || '').trim()}'.`, 404);
    const workDate = DATE_RE.test(String(query.playDate || '')) ? String(query.playDate) : await clubToday(companyId);
    const [attendance, open] = await Promise.all([
        GolfCaddyAttendance.findOne({ where: { companyId, caddyId: caddy.id, workDate } }),
        GolfCaddyAssignment.findOne({ where: { companyId, caddyId: caddy.id, status: 'assigned' }, include: [{ model: GolfCaddyAssignmentPlayer, as: 'players' }] }),
    ]);
    return { caddy: caddyBrief(caddy), attendance: attendance ? attendanceDto(attendance) : null, openAssignment: open ? assignmentDto(open) : null, workDate };
}

// ---------------------------------------------------------------------------
// POST /caddy-station/check-in { caddy: { id | code }, workDate?, remarks? }

async function checkIn(req, body) {
    const companyId = companyIdOf(req);
    if (!companyId) return fail('Select a workspace first.');
    if (!(await enabled(companyId))) return fail('Caddy management is switched off (Golf Specification).', 409);
    const workDate = DATE_RE.test(String(body.workDate || '')) ? String(body.workDate) : await clubToday(companyId);
    const stamps = await callerStamps(req);
    const result = await sequelize.transaction(async (transaction) => {
        const caddy = await findCaddy(companyId, body.caddy || {}, { transaction });
        if (!caddy) return fail(`No caddy matches '${String((body.caddy || {}).code || '').trim()}'.`, 404);
        if (caddy.status !== 'active') return fail(`Caddy ${caddy.caddyNo} is ${caddy.status} and cannot check in.`, 409);
        const leaves = await GolfCaddyLeave.findAll({ where: { caddyId: caddy.id, dateFrom: { [Op.lte]: workDate }, dateTo: { [Op.gte]: workDate } }, transaction });
        if (leaves.length) return fail(`Caddy ${caddy.caddyNo} is on ${leaves[0].leaveType} leave on ${workDate}.`, 409);
        const existing = await GolfCaddyAttendance.findOne({ where: { caddyId: caddy.id, workDate }, transaction, lock: transaction.LOCK.UPDATE });
        const now = new Date();
        if (existing) {
            if (existing.status !== 'off') return fail(`Caddy ${caddy.caddyNo} is already checked in${existing.status === 'out' ? ' and on the course' : ''}.`, 409);
            // Back after a check-out: rejoin the queue at the back.
            Object.assign(existing, { status: 'present', queuedAt: now, checkedOutAt: null, checkedOutBy: null, updatedBy: stamps.updatedBy });
            await existing.save({ transaction });
            return { row: existing, caddy, rejoined: true };
        }
        const row = await GolfCaddyAttendance.create({
            companyId, caddyId: caddy.id, caddyNo: caddy.caddyNo, workDate, checkedInAt: now, checkedInBy: stamps.updatedBy,
            queuedAt: now, status: 'present', remarks: typeof body.remarks === 'string' ? body.remarks.trim().slice(0, 255) || null : null, ...stamps,
        }, { transaction });
        return { row, caddy, rejoined: false };
    });
    if (result.error) return result;
    return { message: `Caddy ${result.caddy.caddyNo} ${result.rejoined ? 'back in the queue' : 'checked in'}.`, attendance: attendanceDto(result.row, result.caddy) };
}

// POST /caddy-station/check-out { caddy: { id | code } | attendanceId }
async function checkOut(req, body) {
    const companyId = companyIdOf(req);
    if (!companyId) return fail('Select a workspace first.');
    if (!(await enabled(companyId))) return fail('Caddy management is switched off (Golf Specification).', 409);
    const callerId = getUserContext(req).userId;
    const result = await sequelize.transaction(async (transaction) => {
        const found = await attendanceRow(companyId, body, { transaction });
        if (found.error) return found;
        const { row, caddy } = found;
        if (row.status === 'out') return fail(`Caddy ${caddy.caddyNo} is on the course - complete the round first.`, 409);
        if (row.status === 'off') return fail(`Caddy ${caddy.caddyNo} is already checked out.`, 409);
        Object.assign(row, { status: 'off', checkedOutAt: new Date(), checkedOutBy: callerId, updatedBy: callerId });
        await row.save({ transaction });
        return { row, caddy };
    });
    if (result.error) return result;
    return { message: `Caddy ${result.caddy.caddyNo} checked out.`, attendance: attendanceDto(result.row, result.caddy) };
}

async function attendanceRow(companyId, body, { transaction }) {
    let row = null;
    if (body.attendanceId) {
        row = await GolfCaddyAttendance.findOne({ where: { companyId, id: String(body.attendanceId) }, transaction, lock: transaction.LOCK.UPDATE });
        if (!row) return fail('Attendance record not found.', 404);
    }
    const caddy = row
        ? await GolfCaddy.findOne({ where: { companyId, id: row.caddyId }, include: CADDY_INCLUDE, transaction })
        : await findCaddy(companyId, body.caddy || {}, { transaction });
    if (!caddy) return fail(`No caddy matches '${String((body.caddy || {}).code || '').trim()}'.`, 404);
    if (!row) {
        const workDate = DATE_RE.test(String(body.workDate || '')) ? String(body.workDate) : await clubToday(companyId);
        row = await GolfCaddyAttendance.findOne({ where: { companyId, caddyId: caddy.id, workDate }, transaction, lock: transaction.LOCK.UPDATE });
        if (!row) return fail(`Caddy ${caddy.caddyNo} has not checked in on ${workDate}.`, 409);
    }
    return { row, caddy };
}

// ---------------------------------------------------------------------------
// POST /caddy-station/assign { caddy: { id | code } | next: true, playerIds, requestedByName? }

async function assign(req, body) {
    const companyId = companyIdOf(req);
    if (!companyId) return fail('Select a workspace first.');
    if (!(await enabled(companyId))) return fail('Caddy management is switched off (Golf Specification).', 409);
    const playerIds = [...new Set((Array.isArray(body.playerIds) ? body.playerIds : []).map((v) => String(v)))];
    if (!playerIds.length) return fail('Pick the golfer(s) the caddy goes to.');
    const requestedByName = body.requestedByName === true;
    const stamps = await callerStamps(req);

    const result = await sequelize.transaction(async (transaction) => {
        const rows = await Player.findAll({ where: { companyId, id: { [Op.in]: playerIds }, secondNineFlag: 0 }, transaction });
        if (rows.length !== playerIds.length) return fail('A picked golfer no longer exists.', 404);
        const notRegistered = rows.filter((r) => r.status !== 'registered');
        if (notRegistered.length) return fail(`${notRegistered.map((r) => r.playerName).join(', ')} ${notRegistered.length > 1 ? 'are' : 'is'} not registered.`, 409);
        const first = rows[0];
        const sameFlight = rows.every((r) => r.courseId === first.courseId && String(r.playDate) === String(first.playDate) && availability.hhmm(r.teeTime) === availability.hhmm(first.teeTime));
        if (!sameFlight) return fail('The golfers of one caddy must be in the same flight.');
        const course = await Course.findOne({ where: { companyId, id: first.courseId }, transaction });
        if (!course) return fail('The flight\'s course no longer exists.', 404);
        const playDate = String(first.playDate);

        // The day's queue, locked so two stations cannot hand out the same head.
        const attendance = await GolfCaddyAttendance.findAll({ where: { companyId, workDate: playDate }, transaction, lock: transaction.LOCK.UPDATE });
        const head = nextUp(attendance);
        let caddy;
        let att;
        if (body.next === true) {
            if (!head) return fail('No caddy is waiting in the queue - check one in first.', 409);
            caddy = await GolfCaddy.findOne({ where: { companyId, id: head.caddyId }, include: CADDY_INCLUDE, transaction });
            att = head;
        } else {
            caddy = await findCaddy(companyId, body.caddy || {}, { transaction });
            if (!caddy) return fail(`No caddy matches '${String((body.caddy || {}).code || '').trim()}'.`, 404);
            att = attendance.find((a) => a.caddyId === caddy.id) || null;
            if (!att) return fail(`Caddy ${caddy.caddyNo} has not checked in on ${playDate}.`, 409);
            if (att.status === 'out') return fail(`Caddy ${caddy.caddyNo} is already on the course - complete or swap that round first.`, 409);
            if (att.status === 'off') return fail(`Caddy ${caddy.caddyNo} has checked out - check in again to rejoin the queue.`, 409);
            // FIFO: out of turn only when the player asked for this caddy.
            if (head && head.caddyId !== caddy.id && !requestedByName) {
                return fail(`Caddy ${head.caddyNo} is next in the queue - assign ${caddy.caddyNo} out of turn only when the player asked for them (tick "Player requested this caddy").`, 409);
            }
        }
        if (caddy.status !== 'active') return fail(`Caddy ${caddy.caddyNo} is ${caddy.status}.`, 409);
        const open = await GolfCaddyAssignment.findOne({ where: { companyId, caddyId: caddy.id, status: 'assigned' }, transaction, lock: transaction.LOCK.UPDATE });
        if (open) return fail(`Caddy ${caddy.caddyNo} is already on the course - complete or swap that round first.`, 409);
        const cap = caddy.grade ? Number(caddy.grade.playersPerCaddy) || 1 : 1;
        if (playerIds.length > cap) return fail(`Caddy ${caddy.caddyNo} (${caddy.grade ? caddy.grade.name : 'grade'}) serves ${cap} golfer${cap === 1 ? '' : 's'} - ${playerIds.length} picked.`);

        const players = await station.flightPlayers(companyId, { courseId: first.courseId, playDate: first.playDate, teeTime: first.teeTime }, { transaction });
        const view = await flightView(companyId, { course, playDate, teeTime: first.teeTime }, players, { transaction });
        const already = view.players.filter((p) => playerIds.includes(p.playerId) && p.withCaddy);
        if (already.length) return fail(`${already.map((p) => p.playerName).join(', ')} already ${already.length > 1 ? 'have' : 'has'} a caddy - swap or complete that round first.`, 409);
        const want = new Set(playerIds);
        const slot = view.slots.find((s) => s.riders.length === want.size && s.riders.every((r) => want.has(r.playerId)));
        if (!slot) {
            const feeLess = new Set(view.noFee.map((p) => p.playerId));
            const noFeeNames = rows.filter((r) => feeLess.has(r.id)).map((r) => r.playerName);
            if (noFeeNames.length) return fail(`${noFeeNames.join(', ')} ${noFeeNames.length > 1 ? 'have' : 'has'} no caddy fee on the bill - a complimentary caddy needs a complimentary caddy-fee item.`, 409);
            const partial = view.slots.find((s) => s.riders.some((r) => want.has(r.playerId)));
            if (partial && partial.blockReason) return fail(partial.blockReason, 409);
            return fail(`${rows.map((r) => r.playerName).join(', ')} ${rows.length > 1 ? 'do' : 'does'} not form one caddy slot as picked - assign the slots the fees define.`, 409);
        }
        if (!slot.issuable) return fail(slot.blockReason, 409);
        const billItemByPlayer = new Map();
        for (const id of slot.billItemIds) {
            const line = view.feeLines.find((l) => l.billItemId === id);
            if (line && !billItemByPlayer.has(line.playerId)) billItemByPlayer.set(line.playerId, id);
        }
        const shape = await Promise.all(rows.map((r) => Player.findOne({ where: { firstNinePlayerId: r.id }, attributes: ['id'], transaction })));
        const holes = shape.some(Boolean) ? 18 : 9;
        const now = new Date();
        const created = await GolfCaddyAssignment.create({
            companyId, caddyId: caddy.id, caddyNo: caddy.caddyNo, caddyAttendanceId: att.id,
            playDate: first.playDate, courseId: first.courseId, bookingProfileId: first.bookingProfileId || null, teeTime: first.teeTime,
            holes, assignedAt: now, assignedBy: stamps.updatedBy, requestedByName: body.next === true ? false : requestedByName, status: 'assigned', ...stamps,
        }, { transaction });
        await GolfCaddyAssignmentPlayer.bulkCreate(rows.map((r) => ({
            caddyAssignmentId: created.id, playerId: r.id, golferId: r.golferId || null, playerName: r.playerName, memberNo: r.memberNo || null,
            billItemId: billItemByPlayer.get(r.id) || slot.billItemIds[0],
        })), { transaction });
        att.status = 'out';
        att.updatedBy = stamps.updatedBy;
        await att.save({ transaction });
        const full = await GolfCaddyAssignment.findOne({ where: { id: created.id }, include: [{ model: GolfCaddyAssignmentPlayer, as: 'players' }, { model: GolfCaddy, as: 'caddy', attributes: ['id', 'name'] }], transaction });
        return { assignment: full, caddy, names: rows.map((r) => r.playerName) };
    });
    if (result.error) return result;
    return { message: `Caddy ${result.caddy.caddyNo} ${result.caddy.name} assigned to ${result.names.join(' and ')}.`, assignment: assignmentDto(result.assignment) };
}

// The open assignment named by caddy / code or by assignmentId (locked, no include).
async function openAssignmentOf(companyId, body, { transaction }) {
    let open = null;
    if (body.assignmentId) {
        open = await GolfCaddyAssignment.findOne({ where: { companyId, id: String(body.assignmentId) }, transaction, lock: transaction.LOCK.UPDATE });
        if (!open) return fail('Round not found.', 404);
        if (open.status !== 'assigned') return fail(`That round was already ${open.status}.`, 409);
    }
    const caddy = open
        ? await GolfCaddy.findOne({ where: { companyId, id: open.caddyId }, include: CADDY_INCLUDE, transaction })
        : await findCaddy(companyId, body.caddy || {}, { transaction });
    if (!caddy) return fail(`No caddy matches '${String((body.caddy || {}).code || '').trim()}'.`, 404);
    if (!open) {
        open = await GolfCaddyAssignment.findOne({ where: { companyId, caddyId: caddy.id, status: 'assigned' }, transaction, lock: transaction.LOCK.UPDATE });
        if (!open) return fail(`Caddy ${caddy.caddyNo} is not on the course.`, 409);
    }
    open.players = await GolfCaddyAssignmentPlayer.findAll({ where: { caddyAssignmentId: open.id }, transaction });
    return { open, caddy };
}

// Send the caddy back to the queue (or leave them off) after a round.
async function backToQueue(companyId, open, callerId, { transaction, checkOut = false }) {
    const att = open.caddyAttendanceId ? await GolfCaddyAttendance.findOne({ where: { id: open.caddyAttendanceId }, transaction, lock: transaction.LOCK.UPDATE }) : null;
    if (!att) return;
    const now = new Date();
    if (checkOut) Object.assign(att, { status: 'off', checkedOutAt: now, checkedOutBy: callerId });
    else Object.assign(att, { status: 'present', queuedAt: now });
    att.updatedBy = callerId;
    await att.save({ transaction });
}

// POST /caddy-station/complete { caddy | assignmentId, holesPlayed?, note?, checkOut? }
async function complete(req, body) {
    const companyId = companyIdOf(req);
    if (!companyId) return fail('Select a workspace first.');
    if (!(await enabled(companyId))) return fail('Caddy management is switched off (Golf Specification).', 409);
    const callerId = getUserContext(req).userId;
    const result = await sequelize.transaction(async (transaction) => {
        const found = await openAssignmentOf(companyId, body, { transaction });
        if (found.error) return found;
        const { open, caddy } = found;
        const holesPlayed = body.holesPlayed === undefined || body.holesPlayed === null || body.holesPlayed === '' ? open.holes : Number(body.holesPlayed);
        if (!Number.isInteger(holesPlayed) || holesPlayed < 0 || holesPlayed > open.holes) return fail(`Holes played must be a whole number from 0 to ${open.holes}.`);
        Object.assign(open, {
            status: 'completed', holesPlayed, completedAt: new Date(), completedBy: callerId, countsAsRound: true,
            completionNote: typeof body.note === 'string' ? body.note.trim().slice(0, 255) || null : null, updatedBy: callerId,
        });
        await open.save({ transaction });
        await backToQueue(companyId, open, callerId, { transaction, checkOut: body.checkOut === true });
        return { open, caddy };
    });
    if (result.error) return result;
    return { message: `Caddy ${result.caddy.caddyNo} completed ${result.open.holesPlayed} of ${result.open.holes} holes${body.checkOut === true ? ' and checked out' : ' - back in the queue'}.`, assignment: assignmentDto(result.open) };
}

// POST /caddy-station/swap { caddy | assignmentId, newCaddy: { id | code } | next: true,
//                            swapReason, swapHole?, requestedByName? }
async function swap(req, body) {
    const companyId = companyIdOf(req);
    if (!companyId) return fail('Select a workspace first.');
    if (!(await enabled(companyId))) return fail('Caddy management is switched off (Golf Specification).', 409);
    const swapReason = String(body.swapReason || '');
    if (!SWAP_REASON_KEYS.includes(swapReason)) return fail('Pick the reason for the swap.');
    const swapHole = body.swapHole === null || body.swapHole === undefined || body.swapHole === '' ? null : Number(body.swapHole);
    if (swapHole !== null && (!Number.isInteger(swapHole) || swapHole < 1 || swapHole > 18)) return fail('The hole must be a whole number from 1 to 18.');
    const requestedByName = body.requestedByName === true;
    const stamps = await callerStamps(req);
    const result = await sequelize.transaction(async (transaction) => {
        const found = await openAssignmentOf(companyId, body, { transaction });
        if (found.error) return found;
        const { open: old, caddy: oldCaddy } = found;
        const attendance = await GolfCaddyAttendance.findAll({ where: { companyId, workDate: String(old.playDate) }, transaction, lock: transaction.LOCK.UPDATE });
        const head = nextUp(attendance);
        let next;
        let att;
        if (body.next === true) {
            if (!head) return fail('No caddy is waiting in the queue - check one in first.', 409);
            next = await GolfCaddy.findOne({ where: { companyId, id: head.caddyId }, include: CADDY_INCLUDE, transaction });
            att = head;
        } else {
            next = await findCaddy(companyId, body.newCaddy || {}, { transaction });
            if (!next) return fail(`No caddy matches '${String((body.newCaddy || {}).code || '').trim()}'.`, 404);
            if (next.id === oldCaddy.id) return fail('Pick a different caddy as the replacement.');
            att = attendance.find((a) => a.caddyId === next.id) || null;
            if (!att) return fail(`Caddy ${next.caddyNo} has not checked in on ${old.playDate}.`, 409);
            if (att.status !== 'present') return fail(`Caddy ${next.caddyNo} is ${att.status === 'out' ? 'on the course' : 'checked out'}.`, 409);
            if (head && head.caddyId !== next.id && !requestedByName) {
                return fail(`Caddy ${head.caddyNo} is next in the queue - assign ${next.caddyNo} out of turn only when the player asked for them.`, 409);
            }
        }
        if (next.status !== 'active') return fail(`Caddy ${next.caddyNo} is ${next.status}.`, 409);
        const cap = next.grade ? Number(next.grade.playersPerCaddy) || 1 : 1;
        if (old.players.length > cap) return fail(`Caddy ${next.caddyNo} serves ${cap} golfer${cap === 1 ? '' : 's'} - the round has ${old.players.length}.`);
        const now = new Date();
        const created = await GolfCaddyAssignment.create({
            companyId, caddyId: next.id, caddyNo: next.caddyNo, caddyAttendanceId: att.id,
            playDate: old.playDate, courseId: old.courseId, bookingProfileId: old.bookingProfileId, teeTime: old.teeTime, holes: old.holes,
            assignedAt: now, assignedBy: stamps.updatedBy, requestedByName: body.next === true ? false : requestedByName, status: 'assigned',
            replacesAssignmentId: old.id, ...stamps,
        }, { transaction });
        await GolfCaddyAssignmentPlayer.bulkCreate(old.players.map((p) => ({
            caddyAssignmentId: created.id, playerId: p.playerId, golferId: p.golferId, playerName: p.playerName, memberNo: p.memberNo, billItemId: p.billItemId,
        })), { transaction });
        Object.assign(old, {
            status: 'swapped', swapReason, swapHole, countsAsRound: countsAsRound(swapReason), holesPlayed: swapHole,
            completedAt: now, completedBy: stamps.updatedBy, replacedByAssignmentId: created.id, updatedBy: stamps.updatedBy,
        });
        await old.save({ transaction });
        // The swapped-out caddy goes back in the queue (unwell / complaint
        // cases: the desk checks them out from the board).
        await backToQueue(companyId, old, stamps.updatedBy, { transaction, checkOut: false });
        att.status = 'out';
        att.updatedBy = stamps.updatedBy;
        await att.save({ transaction });
        const full = await GolfCaddyAssignment.findOne({ where: { id: created.id }, include: [{ model: GolfCaddyAssignmentPlayer, as: 'players' }, { model: GolfCaddy, as: 'caddy', attributes: ['id', 'name'] }], transaction });
        return { created: full, old, next };
    });
    if (result.error) return result;
    const reason = SWAP_REASONS.find((r) => r.key === swapReason);
    return {
        message: `Caddy ${result.old.caddyNo} swapped for ${result.next.caddyNo}${swapHole ? ` at hole ${swapHole}` : ''} (${reason.label.toLowerCase()}${reason.countsAsRound ? '' : ' - the round does not count'}).`,
        assignment: assignmentDto(result.created),
        swappedAssignment: assignmentDto(result.old),
    };
}

// ---------------------------------------------------------------------------
// The caddy tags the Tee Time Sheet shows per player: { [playerId]: { caddyNo, status, assignmentId } }.
async function caddyTagsByPlayer(companyId, playerIds, { transaction } = {}) {
    const out = new Map();
    if (!playerIds.length) return out;
    const rows = await liveAssignmentsOf(companyId, playerIds, { transaction });
    for (const a of rows) {
        for (const p of a.players) {
            const cur = out.get(p.playerId);
            if (!cur || (cur.status !== 'assigned' && a.status === 'assigned') || (cur.status === a.status && new Date(a.assignedAt) > new Date(cur.assignedAt))) {
                out.set(p.playerId, { caddyNo: a.caddyNo, caddyName: a.caddy ? a.caddy.name : null, status: a.status, assignmentId: a.id, assignedAt: a.assignedAt });
            }
        }
    }
    return out;
}

module.exports = {
    queueOrder, nextUp, countsAsRound, tokenFromCode, enabled,
    day, resolve, checkIn, checkOut, assign, complete, swap,
    caddyTagsByPlayer, assignmentDto, attendanceDto, caddyBrief,
};
