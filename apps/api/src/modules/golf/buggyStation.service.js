// Buggy Station (user decisions 2026-10-17; spec 2.1.4 / 2.1.5 / 2.1.9 / 2.1.10
// triaged) - issuing, returning and swapping the club's buggies against the
// flights of the day.
//
// THE RULE: issuing never bills anything. The buggy fee is a bill line charged
// at registration (the compulsory-course auto-charge, a tile, a package
// element); the station DERIVES who is owed a buggy from those lines:
//   - a 'single' usage fee line is ONE slot for that player;
//   - two 'shared' usage fee lines in the same flight PAIR into one slot for
//     both riders (same booking first, then seat order; a line with quantity
//     2 pairs with itself - one player paying the whole shared buggy);
//   - an unpaired shared line is a slot waiting for a partner and is NOT
//     issuable (user decision: stop the issue until the partner's shared fee
//     is paid, or the desk switches the player to the single fee);
//   - a slot is issuable only when every fee line it consumes is on a
//     SETTLED bill (paid);
//   - a player with no buggy fee line is listed as such; on a course that is
//     NOT buggy-compulsory the station may still issue them a unit without a
//     fee line (recorded with billItemId NULL and a warning); on a compulsory
//     course that is refused.
// A fee line is CONSUMED once a rider row of a live issue (out or returned)
// references it; a swapped issue's rows no longer count (the replacement's
// rows do), so a swap never double-consumes.

const crypto = require('crypto');
const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { getUserContext, getCallerPlacement } = require('../../platform/serviceContext');
const availability = require('./bookingAvailability.service');
const GolfSetting = require('./golfSetting.model');
const Course = require('./course.model');
const Player = require('./player.model');
const BookingProfile = require('./bookingProfile.model');
const Bill = require('./bill.model');
const BillItem = require('./billItem.model');
const GolfTransactionType = require('./transactionType.model');
const GolfBuggy = require('./buggy.model');
const GolfBuggyType = require('./buggyType.model');
const GolfBuggyIssue = require('./buggyIssue.model');
const GolfBuggyIssueRider = require('./buggyIssueRider.model');
const { BUGGY_CHARGE_TYPE_KEY } = require('./transactionType.constants');
const { CONDITION_OUT_KEYS, CONDITION_IN_KEYS } = require('./buggy.constants');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LIVE_ISSUE_STATUSES = ['out', 'returned'];

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

// The station door: GolfSetting.buggyManagementEnabled.
async function enabled(companyId, { transaction } = {}) {
    const setting = await GolfSetting.findOne({ where: { companyId }, attributes: ['buggyManagementEnabled'], transaction });
    return !!(setting && setting.buggyManagementEnabled === true);
}

function newQrToken() {
    return crypto.randomBytes(16).toString('hex');
}

// ---------------------------------------------------------------------------
// PURE: the slot pairing rule (unit-tested).
//
// players  - the flight's registered starting-nine players in SEAT ORDER:
//            [{ playerId, playerName, memberNo, golferId, bookingProfileId }]
// feeLines - buggy-fee bill lines of those players (voided bills excluded):
//            [{ billItemId, playerId, usageType: 'single'|'shared', quantity, paid, billNo }]
// consumed - Set of billItemIds already taken by a live issue.
// Returns { slots, noFee } where a slot is
//   { key, usageType, riders: [player], billItemIds, paid, complete, issuable, blockReason }
function buildSlots({ players, feeLines, consumed }) {
    const byPlayer = new Map(players.map((p) => [p.playerId, p]));
    // Order players: bookings grouped in order of first appearance, then seat
    // order inside the booking - a shared pair prefers its own booking.
    const bookingRank = new Map();
    players.forEach((p) => {
        const k = p.bookingProfileId || `walkin:${p.playerId}`;
        if (!bookingRank.has(k)) bookingRank.set(k, bookingRank.size);
    });
    const seatRank = new Map(players.map((p, i) => [p.playerId, i]));
    const rankOf = (playerId) => {
        const p = byPlayer.get(playerId);
        const k = p && p.bookingProfileId ? p.bookingProfileId : `walkin:${playerId}`;
        return [(bookingRank.get(k) ?? 9999), (seatRank.get(playerId) ?? 9999)];
    };
    const open = feeLines
        .filter((l) => byPlayer.has(l.playerId) && !consumed.has(l.billItemId))
        .slice()
        .sort((a, b) => {
            const [ba, sa] = rankOf(a.playerId);
            const [bb, sb] = rankOf(b.playerId);
            return ba - bb || sa - sb || String(a.billItemId).localeCompare(String(b.billItemId));
        });
    const slots = [];
    // A player "has a fee" whether or not its line is already consumed (an
    // issued rider is not fee-less).
    const feePlayers = new Set(feeLines.filter((l) => byPlayer.has(l.playerId)).map((l) => l.playerId));
    // Singles: one slot per seat unit (quantity).
    for (const l of open) {
        if (l.usageType !== 'single') continue;
        const qty = Math.max(1, Number(l.quantity) || 1);
        for (let n = 0; n < qty; n += 1) {
            slots.push(makeSlot('single', [byPlayer.get(l.playerId)], [l], true));
        }
    }
    // Shared: expand to seat units, pair consecutively.
    const units = [];
    for (const l of open) {
        if (l.usageType !== 'shared') continue;
        const qty = Math.max(1, Number(l.quantity) || 1);
        for (let n = 0; n < qty; n += 1) units.push(l);
    }
    for (let i = 0; i < units.length; i += 2) {
        const a = units[i];
        const b = units[i + 1];
        const lines = b ? (a.billItemId === b.billItemId ? [a] : [a, b]) : [a];
        const riderIds = [...new Set(lines.map((l) => l.playerId))];
        slots.push(makeSlot('shared', riderIds.map((id) => byPlayer.get(id)), lines, !!b));
    }
    const noFee = players.filter((p) => !feePlayers.has(p.playerId));
    return { slots, noFee };
}

function makeSlot(usageType, riders, lines, complete) {
    const paid = lines.every((l) => l.paid === true);
    let blockReason = null;
    if (!complete) {
        blockReason = `${riders[0].playerName} has a shared buggy fee with no partner in this flight - pair another shared fee or switch the player to the single fee.`;
    } else if (!paid) {
        const unpaid = lines.filter((l) => !l.paid);
        blockReason = `Buggy fee not yet paid - ${unpaid.map((l) => `${(riders.find((r) => r.playerId === l.playerId) || {}).playerName || 'player'} (bill ${l.billNo || 'open'})`).join(', ')}.`;
    }
    const key = lines.map((l) => l.billItemId).sort().join('+');
    return {
        key,
        usageType,
        riders: riders.map((r) => ({ playerId: r.playerId, playerName: r.playerName, memberNo: r.memberNo || null, golferId: r.golferId || null })),
        billItemIds: lines.map((l) => l.billItemId),
        paid,
        complete,
        issuable: complete && paid,
        blockReason,
    };
}

// ---------------------------------------------------------------------------
// Flight facts

function flightKey(courseId, teeTime) {
    return `${courseId}|${availability.hhmm(teeTime)}`;
}

// The buggy-fee lines of a set of players (through their non-voided bills).
async function feeLinesOf(companyId, playerIds, { transaction } = {}) {
    if (!playerIds.length) return [];
    const bills = await Bill.findAll({
        where: { companyId, playerId: { [Op.in]: playerIds }, status: { [Op.ne]: 'voided' } },
        attributes: ['id', 'playerId', 'billNo', 'status'],
        transaction,
    });
    if (!bills.length) return [];
    const billById = new Map(bills.map((b) => [b.id, b]));
    const items = await BillItem.findAll({
        where: { billId: { [Op.in]: bills.map((b) => b.id) } },
        attributes: ['id', 'billId', 'transactionTypeId', 'quantity'],
        transaction,
    });
    if (!items.length) return [];
    const types = await GolfTransactionType.findAll({
        where: { companyId, id: { [Op.in]: [...new Set(items.map((i) => i.transactionTypeId))] }, chargeType: BUGGY_CHARGE_TYPE_KEY },
        attributes: ['id', 'usageType', 'transactionType'],
        transaction,
    });
    const typeById = new Map(types.map((t) => [t.id, t]));
    return items
        .filter((i) => typeById.has(i.transactionTypeId))
        .map((i) => {
            const bill = billById.get(i.billId);
            const type = typeById.get(i.transactionTypeId);
            return {
                billItemId: i.id,
                playerId: bill.playerId,
                usageType: type.usageType === 'shared' ? 'shared' : 'single',
                quantity: Number(i.quantity) || 1,
                paid: bill.status === 'settled',
                billNo: bill.billNo,
                code: type.transactionType,
            };
        });
}

// Fee lines already taken by a live issue (out or returned).
async function consumedLineIds(playerIds, { transaction } = {}) {
    if (!playerIds.length) return new Set();
    const rows = await GolfBuggyIssueRider.findAll({
        where: { playerId: { [Op.in]: playerIds }, billItemId: { [Op.ne]: null } },
        include: [{ model: GolfBuggyIssue, as: 'issue', attributes: ['status'], where: { status: { [Op.in]: LIVE_ISSUE_STATUSES } }, required: true }],
        attributes: ['billItemId'],
        transaction,
    });
    return new Set(rows.map((r) => r.billItemId));
}

// Live issues (out or returned) of a set of players, with riders.
async function liveIssuesOf(companyId, playerIds, { transaction } = {}) {
    if (!playerIds.length) return [];
    const riders = await GolfBuggyIssueRider.findAll({
        where: { playerId: { [Op.in]: playerIds } },
        attributes: ['buggyIssueId'],
        transaction,
    });
    const issueIds = [...new Set(riders.map((r) => r.buggyIssueId))];
    if (!issueIds.length) return [];
    return GolfBuggyIssue.findAll({
        where: { companyId, id: { [Op.in]: issueIds }, status: { [Op.in]: LIVE_ISSUE_STATUSES } },
        include: [{ model: GolfBuggyIssueRider, as: 'riders' }],
        order: [['issuedAt', 'ASC']],
        transaction,
    });
}

function playerFacts(p) {
    return {
        playerId: p.id,
        playerName: p.playerName,
        memberNo: p.memberNo || null,
        golferId: p.golferId || null,
        bookingProfileId: p.bookingProfileId || null,
        registrationNo: p.registrationNo || null,
        status: p.status,
    };
}

// The registered players of one flight (course + tee time + date), seat order.
async function flightPlayers(companyId, { courseId, playDate, teeTime }, { transaction } = {}) {
    const rows = await Player.findAll({
        where: { companyId, courseId, playDate, teeTime, secondNineFlag: 0, status: 'registered' },
        order: [['createdAt', 'ASC'], ['id', 'ASC']],
        transaction,
    });
    return rows.map(playerFacts);
}

// Everything the station needs about one flight: slots, issues, fee-less players.
async function flightView(companyId, { course, playDate, teeTime }, players, { transaction } = {}) {
    const playerIds = players.map((p) => p.playerId);
    const [feeLines, consumed, issues] = await Promise.all([
        feeLinesOf(companyId, playerIds, { transaction }),
        consumedLineIds(playerIds, { transaction }),
        liveIssuesOf(companyId, playerIds, { transaction }),
    ]);
    const { slots, noFee } = buildSlots({ players, feeLines, consumed });
    const issuedPlayerIds = new Set(issues.filter((i) => i.status === 'out').flatMap((i) => i.riders.map((r) => r.playerId)));
    return {
        key: flightKey(course.id, teeTime),
        courseId: course.id,
        courseCode: course.courseCode,
        courseDescription: course.description || null,
        buggyCompulsory: course.buggyCompulsory === true,
        playDate,
        teeTime: availability.hhmm(teeTime),
        players: players.map((p) => ({ ...p, onBuggy: issuedPlayerIds.has(p.playerId) })),
        slots,
        noFee: noFee.map((p) => ({ playerId: p.playerId, playerName: p.playerName, memberNo: p.memberNo || null, onBuggy: issuedPlayerIds.has(p.playerId) })),
        issues: issues.map(issueDto),
        feeLines: feeLines.map((l) => ({ billItemId: l.billItemId, playerId: l.playerId, usageType: l.usageType, quantity: l.quantity, paid: l.paid, billNo: l.billNo, code: l.code, consumed: consumed.has(l.billItemId) })),
    };
}

// ---------------------------------------------------------------------------
// GET /buggy-station/day?playDate=&courseId=

async function day(req, query) {
    const companyId = companyIdOf(req);
    if (!companyId) return fail('Select a workspace first.');
    const playDate = String(query.playDate || '');
    if (!DATE_RE.test(playDate)) return fail('Pick a play date.');
    const courseFilter = query.courseId ? String(query.courseId) : null;
    const isEnabled = await enabled(companyId);

    const [courses, rows] = await Promise.all([
        Course.findAll({ where: { companyId }, order: [['displaySequence', 'ASC'], ['courseCode', 'ASC']] }),
        Player.findAll({
            where: { companyId, playDate, secondNineFlag: 0, status: 'registered', ...(courseFilter ? { courseId: courseFilter } : {}) },
            order: [['teeTime', 'ASC'], ['createdAt', 'ASC'], ['id', 'ASC']],
        }),
    ]);
    const courseById = new Map(courses.map((c) => [c.id, c]));
    const byFlight = new Map();
    for (const r of rows) {
        const key = flightKey(r.courseId, r.teeTime);
        if (!byFlight.has(key)) byFlight.set(key, { course: courseById.get(r.courseId), teeTime: r.teeTime, players: [] });
        byFlight.get(key).players.push(playerFacts(r));
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

    const fleet = await fleetCounts(companyId);
    const outIssues = await GolfBuggyIssue.findAll({
        where: { companyId, status: 'out' },
        include: [{ model: GolfBuggyIssueRider, as: 'riders' }],
        order: [['issuedAt', 'ASC']],
    });
    return {
        enabled: isEnabled,
        playDate,
        courses: courses.map((c) => ({ id: c.id, courseCode: c.courseCode, description: c.description || null, buggyCompulsory: c.buggyCompulsory === true, isActive: c.isActive !== false })),
        flights,
        fleet,
        out: outIssues.map(issueDto),
    };
}

async function fleetCounts(companyId, { transaction } = {}) {
    const rows = await GolfBuggy.findAll({ where: { companyId, status: 'active' }, attributes: ['location'], transaction });
    const counts = { active: rows.length, inDepot: 0, onCourse: 0, maintenance: 0 };
    for (const r of rows) {
        if (r.location === 'on-course') counts.onCourse += 1;
        else if (r.location === 'maintenance') counts.maintenance += 1;
        else counts.inDepot += 1;
    }
    return counts;
}

// Active units in the depot (the picker / "next free").
async function available(req) {
    const companyId = companyIdOf(req);
    if (!companyId) return fail('Select a workspace first.');
    const rows = await GolfBuggy.findAll({
        where: { companyId, status: 'active', location: 'in-depot' },
        include: [{ model: GolfBuggyType, as: 'buggyType', attributes: ['id', 'code', 'name', 'seats'] }],
        order: [['buggyNo', 'ASC']],
    });
    return { buggies: rows.map(buggyBrief) };
}

function buggyBrief(b) {
    return {
        id: b.id,
        buggyNo: b.buggyNo,
        status: b.status,
        location: b.location,
        buggyTypeId: b.buggyTypeId,
        buggyType: b.buggyType ? { id: b.buggyType.id, code: b.buggyType.code, name: b.buggyType.name, seats: b.buggyType.seats } : null,
    };
}

// ---------------------------------------------------------------------------
// Resolving a scanned / typed code to a unit: the QR token (raw, or inside a
// station URL's ?b=), else the buggy number.

function tokenFromCode(code) {
    const raw = String(code || '').trim();
    if (!raw) return { token: null, buggyNo: null };
    const m = raw.match(/[?&]b=([A-Za-z0-9]+)/);
    if (m) return { token: m[1], buggyNo: null };
    if (/^[0-9a-f]{32}$/i.test(raw)) return { token: raw.toLowerCase(), buggyNo: null };
    return { token: null, buggyNo: raw.toUpperCase() };
}

async function findBuggy(companyId, ref, { transaction } = {}) {
    const include = [{ model: GolfBuggyType, as: 'buggyType', attributes: ['id', 'code', 'name', 'seats'] }];
    if (ref && ref.id) return GolfBuggy.findOne({ where: { companyId, id: ref.id }, include, transaction });
    const { token, buggyNo } = tokenFromCode(ref && (ref.code || ref.qrToken || ref.buggyNo));
    if (token) return GolfBuggy.findOne({ where: { companyId, qrToken: token }, include, transaction });
    if (buggyNo) return GolfBuggy.findOne({ where: { companyId, buggyNo }, include, transaction });
    return null;
}

// GET /buggy-station/resolve?code= - the unit and its open outing.
async function resolve(req, query) {
    const companyId = companyIdOf(req);
    if (!companyId) return fail('Select a workspace first.');
    const buggy = await findBuggy(companyId, { code: query.code });
    if (!buggy) return fail(`No buggy matches '${String(query.code || '').trim()}'.`, 404);
    const openIssue = await GolfBuggyIssue.findOne({
        where: { companyId, buggyId: buggy.id, status: 'out' },
        include: [{ model: GolfBuggyIssueRider, as: 'riders' }],
    });
    return { buggy: buggyBrief(buggy), openIssue: openIssue ? issueDto(openIssue) : null };
}

// ---------------------------------------------------------------------------
// POST /buggy-station/issue { buggy: { id | code }, playerIds, conditionOut?, remarksOut? }

async function issue(req, body) {
    const companyId = companyIdOf(req);
    if (!companyId) return fail('Select a workspace first.');
    if (!(await enabled(companyId))) return fail('Buggy management is switched off (Golf Specification).', 409);
    const playerIds = [...new Set((Array.isArray(body.playerIds) ? body.playerIds : []).map((v) => String(v)))];
    if (!playerIds.length) return fail('Pick the rider(s) the buggy goes to.');
    const conditionOut = CONDITION_OUT_KEYS.includes(body.conditionOut) ? body.conditionOut : 'good';
    const remarksOut = typeof body.remarksOut === 'string' ? body.remarksOut.trim().slice(0, 255) || null : null;
    const stamps = await callerStamps(req);
    const warnings = [];

    const result = await sequelize.transaction(async (transaction) => {
        const buggy = await findBuggy(companyId, body.buggy || {}, { transaction });
        if (!buggy) return fail(`No buggy matches '${String((body.buggy || {}).code || '').trim()}'.`, 404);
        if (buggy.status !== 'active') return fail(`Buggy ${buggy.buggyNo} is retired.`, 409);
        if (buggy.location === 'maintenance') return fail(`Buggy ${buggy.buggyNo} is in maintenance.`, 409);
        const openIssue = await GolfBuggyIssue.findOne({ where: { companyId, buggyId: buggy.id, status: 'out' }, include: [{ model: GolfBuggyIssueRider, as: 'riders' }], transaction, lock: transaction.LOCK.UPDATE });
        if (openIssue) return fail(`Buggy ${buggy.buggyNo} is already out with ${openIssue.riders.map((r) => r.playerName).join(' and ')} - return it first.`, 409);
        const seats = buggy.buggyType ? Number(buggy.buggyType.seats) || 2 : 2;
        if (playerIds.length > seats) return fail(`Buggy ${buggy.buggyNo} seats ${seats} - ${playerIds.length} riders picked.`);

        const rows = await Player.findAll({ where: { companyId, id: { [Op.in]: playerIds }, secondNineFlag: 0 }, transaction });
        if (rows.length !== playerIds.length) return fail('A picked player no longer exists.', 404);
        const notRegistered = rows.filter((r) => r.status !== 'registered');
        if (notRegistered.length) return fail(`${notRegistered.map((r) => r.playerName).join(', ')} ${notRegistered.length > 1 ? 'are' : 'is'} not registered.`, 409);
        const first = rows[0];
        const sameFlight = rows.every((r) => r.courseId === first.courseId && String(r.playDate) === String(first.playDate) && availability.hhmm(r.teeTime) === availability.hhmm(first.teeTime));
        if (!sameFlight) return fail('The riders of one buggy must be in the same flight.');
        const course = await Course.findOne({ where: { companyId, id: first.courseId }, transaction });
        if (!course) return fail('The flight\'s course no longer exists.', 404);

        const players = await flightPlayers(companyId, { courseId: first.courseId, playDate: first.playDate, teeTime: first.teeTime }, { transaction });
        const view = await flightView(companyId, { course, playDate: String(first.playDate), teeTime: first.teeTime }, players, { transaction });
        const already = view.players.filter((p) => playerIds.includes(p.playerId) && p.onBuggy);
        if (already.length) return fail(`${already.map((p) => p.playerName).join(', ')} already ${already.length > 1 ? 'have' : 'has'} a buggy out - swap or return it first.`, 409);

        const want = new Set(playerIds);
        const slot = view.slots.find((s) => s.riders.length === want.size && s.riders.every((r) => want.has(r.playerId)));
        let billItemByPlayer = new Map();
        if (slot) {
            if (!slot.issuable) return fail(slot.blockReason, 409);
            // Map each rider to the fee line(s) of theirs this slot consumes.
            for (const id of slot.billItemIds) {
                const line = view.feeLines.find((l) => l.billItemId === id);
                if (line && !billItemByPlayer.has(line.playerId)) billItemByPlayer.set(line.playerId, id);
            }
        } else {
            // Not a derived slot: allowed only for fee-less players on a
            // non-compulsory course.
            const feeLess = new Set(view.noFee.map((p) => p.playerId));
            const withFee = playerIds.filter((id) => !feeLess.has(id));
            if (withFee.length) {
                const partial = view.slots.find((s) => s.riders.some((r) => want.has(r.playerId)));
                if (partial && partial.blockReason) return fail(partial.blockReason, 409);
                const names = rows.filter((r) => withFee.includes(r.id)).map((r) => r.playerName).join(', ');
                return fail(`${names} ${withFee.length > 1 ? 'do' : 'does'} not form one buggy slot as picked - issue the slots the fees define.`, 409);
            }
            if (course.buggyCompulsory) return fail(`${course.courseCode} is buggy-compulsory - ${rows.map((r) => r.playerName).join(', ')} ${rows.length > 1 ? 'have' : 'has'} no buggy fee on the bill yet.`, 409);
            warnings.push(`Issued without a buggy fee line for ${rows.map((r) => r.playerName).join(', ')}.`);
        }

        const now = new Date();
        const created = await GolfBuggyIssue.create({
            companyId,
            buggyId: buggy.id,
            buggyNo: buggy.buggyNo,
            playDate: first.playDate,
            courseId: first.courseId,
            bookingProfileId: first.bookingProfileId || null,
            teeTime: first.teeTime,
            issuedAt: now,
            issuedBy: stamps.updatedBy,
            conditionOut,
            remarksOut,
            status: 'out',
            ...stamps,
        }, { transaction });
        await GolfBuggyIssueRider.bulkCreate(rows.map((r) => ({
            buggyIssueId: created.id,
            playerId: r.id,
            golferId: r.golferId || null,
            playerName: r.playerName,
            memberNo: r.memberNo || null,
            billItemId: billItemByPlayer.get(r.id) || null,
        })), { transaction });
        buggy.location = 'on-course';
        buggy.updatedBy = stamps.updatedBy;
        await buggy.save({ transaction });
        const full = await GolfBuggyIssue.findOne({ where: { id: created.id }, include: [{ model: GolfBuggyIssueRider, as: 'riders' }], transaction });
        return { issue: full, buggy, names: rows.map((r) => r.playerName) };
    });
    if (result.error) return result;
    const message = `Buggy ${result.buggy.buggyNo} issued to ${result.names.join(' and ')}.`;
    return { message: warnings.length ? `${message} WARNING: ${warnings.join(' ')}` : message, issue: issueDto(result.issue), warnings };
}

// ---------------------------------------------------------------------------
// POST /buggy-station/return { buggy: { id | code } | issueId, conditionIn?, remarksIn? }

async function returnBuggy(req, body) {
    const companyId = companyIdOf(req);
    if (!companyId) return fail('Select a workspace first.');
    if (!(await enabled(companyId))) return fail('Buggy management is switched off (Golf Specification).', 409);
    const conditionIn = CONDITION_IN_KEYS.includes(body.conditionIn) ? body.conditionIn : 'good';
    const remarksIn = typeof body.remarksIn === 'string' ? body.remarksIn.trim().slice(0, 255) || null : null;
    if (conditionIn !== 'good' && !remarksIn) return fail('Describe the fault or damage.');
    const callerId = getUserContext(req).userId;

    const result = await sequelize.transaction(async (transaction) => {
        const found = await openIssueOf(companyId, body, { transaction });
        if (found.error) return found;
        const { issue: open, buggy } = found;
        const now = new Date();
        Object.assign(open, { status: 'returned', returnedAt: now, returnedBy: callerId, conditionIn, remarksIn, updatedBy: callerId });
        await open.save({ transaction });
        buggy.location = 'in-depot';
        buggy.updatedBy = callerId;
        await buggy.save({ transaction });
        return { issue: open, buggy };
    });
    if (result.error) return result;
    return { message: `Buggy ${result.buggy.buggyNo} returned${conditionIn === 'good' ? '' : ` - ${conditionIn} noted`}.`, issue: issueDto(result.issue) };
}

// The open issue of a unit named by id / code, or by issueId.
async function openIssueOf(companyId, body, { transaction }) {
    let open = null;
    if (body.issueId) {
        open = await GolfBuggyIssue.findOne({ where: { companyId, id: String(body.issueId) }, include: [{ model: GolfBuggyIssueRider, as: 'riders' }], transaction, lock: transaction.LOCK.UPDATE });
        if (!open) return fail('Outing not found.', 404);
        if (open.status !== 'out') return fail(`Buggy ${open.buggyNo} was already ${open.status}.`, 409);
    }
    const buggy = open
        ? await GolfBuggy.findOne({ where: { companyId, id: open.buggyId }, include: [{ model: GolfBuggyType, as: 'buggyType', attributes: ['id', 'code', 'name', 'seats'] }], transaction })
        : await findBuggy(companyId, body.buggy || {}, { transaction });
    if (!buggy) return fail(`No buggy matches '${String((body.buggy || {}).code || '').trim()}'.`, 404);
    if (!open) {
        open = await GolfBuggyIssue.findOne({ where: { companyId, buggyId: buggy.id, status: 'out' }, include: [{ model: GolfBuggyIssueRider, as: 'riders' }], transaction, lock: transaction.LOCK.UPDATE });
        if (!open) return fail(`Buggy ${buggy.buggyNo} is not out.`, 409);
    }
    return { issue: open, buggy };
}

// ---------------------------------------------------------------------------
// POST /buggy-station/swap { buggy: { id | code } | issueId, newBuggy: { id | code },
//                            swapReason, swapHole?, conditionIn?, remarksIn? }
// The broken unit's outing ends 'swapped' (returned with its condition); the
// replacement opens a new outing for the SAME riders and the same fee lines.

async function swap(req, body) {
    const companyId = companyIdOf(req);
    if (!companyId) return fail('Select a workspace first.');
    if (!(await enabled(companyId))) return fail('Buggy management is switched off (Golf Specification).', 409);
    const swapReason = typeof body.swapReason === 'string' ? body.swapReason.trim().slice(0, 255) : '';
    if (!swapReason) return fail('Give the reason for the swap.');
    const swapHole = body.swapHole === null || body.swapHole === undefined || body.swapHole === '' ? null : Number(body.swapHole);
    if (swapHole !== null && (!Number.isInteger(swapHole) || swapHole < 1 || swapHole > 18)) return fail('The hole must be a whole number from 1 to 18.');
    const conditionIn = CONDITION_IN_KEYS.includes(body.conditionIn) ? body.conditionIn : 'fault';
    const remarksIn = typeof body.remarksIn === 'string' ? body.remarksIn.trim().slice(0, 255) || null : null;
    const stamps = await callerStamps(req);

    const result = await sequelize.transaction(async (transaction) => {
        const found = await openIssueOf(companyId, body, { transaction });
        if (found.error) return found;
        const { issue: old, buggy: oldBuggy } = found;
        const next = await findBuggy(companyId, body.newBuggy || {}, { transaction });
        if (!next) return fail(`No buggy matches '${String((body.newBuggy || {}).code || '').trim()}'.`, 404);
        if (next.id === oldBuggy.id) return fail('Pick a different buggy as the replacement.');
        if (next.status !== 'active') return fail(`Buggy ${next.buggyNo} is retired.`, 409);
        if (next.location === 'maintenance') return fail(`Buggy ${next.buggyNo} is in maintenance.`, 409);
        const nextOpen = await GolfBuggyIssue.findOne({ where: { companyId, buggyId: next.id, status: 'out' }, transaction, lock: transaction.LOCK.UPDATE });
        if (nextOpen) return fail(`Buggy ${next.buggyNo} is already out - pick a free unit.`, 409);
        const seats = next.buggyType ? Number(next.buggyType.seats) || 2 : 2;
        if (old.riders.length > seats) return fail(`Buggy ${next.buggyNo} seats ${seats} - the outing has ${old.riders.length} riders.`);

        const now = new Date();
        const created = await GolfBuggyIssue.create({
            companyId,
            buggyId: next.id,
            buggyNo: next.buggyNo,
            playDate: old.playDate,
            courseId: old.courseId,
            bookingProfileId: old.bookingProfileId,
            teeTime: old.teeTime,
            issuedAt: now,
            issuedBy: stamps.updatedBy,
            conditionOut: 'good',
            remarksOut: `Replaces ${old.buggyNo} (${swapReason})`,
            status: 'out',
            replacesIssueId: old.id,
            ...stamps,
        }, { transaction });
        await GolfBuggyIssueRider.bulkCreate(old.riders.map((r) => ({
            buggyIssueId: created.id,
            playerId: r.playerId,
            golferId: r.golferId,
            playerName: r.playerName,
            memberNo: r.memberNo,
            billItemId: r.billItemId,
        })), { transaction });
        Object.assign(old, {
            status: 'swapped', returnedAt: now, returnedBy: stamps.updatedBy, conditionIn, remarksIn,
            swapReason, swapHole, replacedByIssueId: created.id, updatedBy: stamps.updatedBy,
        });
        await old.save({ transaction });
        oldBuggy.location = 'in-depot';
        oldBuggy.updatedBy = stamps.updatedBy;
        await oldBuggy.save({ transaction });
        next.location = 'on-course';
        next.updatedBy = stamps.updatedBy;
        await next.save({ transaction });
        const full = await GolfBuggyIssue.findOne({ where: { id: created.id }, include: [{ model: GolfBuggyIssueRider, as: 'riders' }], transaction });
        return { issue: full, old, next };
    });
    if (result.error) return result;
    return {
        message: `Buggy ${result.old.buggyNo} swapped for ${result.next.buggyNo}${swapHole ? ` at hole ${swapHole}` : ''}.`,
        issue: issueDto(result.issue),
        swappedIssue: issueDto(result.old),
    };
}

// ---------------------------------------------------------------------------
// The buggy tags the Tee Time Sheet shows per player: { [playerId]: { buggyNo, status, issueId } }
// (an open outing wins over a returned one).
async function buggyTagsByPlayer(companyId, playerIds, { transaction } = {}) {
    const out = new Map();
    if (!playerIds.length) return out;
    const issues = await liveIssuesOf(companyId, playerIds, { transaction });
    for (const i of issues) {
        for (const r of i.riders) {
            const cur = out.get(r.playerId);
            if (!cur || (cur.status !== 'out' && i.status === 'out') || (cur.status === i.status && new Date(i.issuedAt) > new Date(cur.issuedAt))) {
                out.set(r.playerId, { buggyNo: i.buggyNo, status: i.status, issueId: i.id, issuedAt: i.issuedAt });
            }
        }
    }
    return out;
}

function issueDto(i) {
    return {
        id: i.id,
        buggyId: i.buggyId,
        buggyNo: i.buggyNo,
        playDate: i.playDate,
        courseId: i.courseId,
        bookingProfileId: i.bookingProfileId,
        teeTime: i.teeTime ? availability.hhmm(i.teeTime) : null,
        issuedAt: i.issuedAt,
        conditionOut: i.conditionOut,
        remarksOut: i.remarksOut,
        returnedAt: i.returnedAt,
        conditionIn: i.conditionIn,
        remarksIn: i.remarksIn,
        status: i.status,
        swapReason: i.swapReason,
        swapHole: i.swapHole,
        replacedByIssueId: i.replacedByIssueId,
        replacesIssueId: i.replacesIssueId,
        riders: (i.riders || []).map((r) => ({ playerId: r.playerId, golferId: r.golferId, playerName: r.playerName, memberNo: r.memberNo, billItemId: r.billItemId, withFee: !!r.billItemId })),
    };
}

module.exports = {
    buildSlots, tokenFromCode, newQrToken, enabled,
    day, available, resolve, issue, returnBuggy, swap,
    buggyTagsByPlayer, issueDto, buggyBrief, fleetCounts, liveIssuesOf,
};
