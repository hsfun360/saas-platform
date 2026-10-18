// Named-caddy requests (user decisions 2026-10-18; the starter-hut spec's
// 球僮预订 and 点号球僮报到): a player asks for a PARTICULAR caddy ahead of play.
//   - keyed on the booking (Golf Booking) or at the desk on a registered
//     golfer (Tee Time Sheet); the member portal keys the same later;
//   - a caddy on leave for the date, inactive or blacklisted cannot be
//     requested; ONE live request per caddy per play date;
//   - requested -> confirmed when that caddy checks in on the day ->
//     fulfilled when the station assigns that caddy to that flight (the
//     request IS the player's ask, so the out-of-turn confirmation is skipped
//     and the round is marked requestedByName);
//   - Next up skips a caddy whose confirmed request tees off within
//     RESERVE_WINDOW_MINUTES (90);
//   - cancelled-by-player (the desk, or the booking's cancel), cancelled-by-
//     caddy (with a reason), lapsed (the worker: tee time passed with no
//     assignment).

const { Op } = require('sequelize');
const { getUserContext, getCallerPlacement } = require('../../platform/serviceContext');
const { companyTimezoneById } = require('../../platform/calendarGateway');
const availability = require('./bookingAvailability.service');
const GolfCaddy = require('./caddy.model');
const GolfCaddyGrade = require('./caddyGrade.model');
const GolfCaddyLeave = require('./caddyLeave.model');
const GolfCaddyRequest = require('./caddyRequest.model');
const GolfCaddyAttendance = require('./caddyAttendance.model');
const GolfSetting = require('./golfSetting.model');
const Player = require('./player.model');
const BookingProfile = require('./bookingProfile.model');
const caddySvc = require('./caddy.service');
const {
    LIVE_REQUEST_STATUS_KEYS, REQUEST_SOURCE_KEYS, RESERVE_WINDOW_MINUTES, LAPSE_GRACE_MINUTES, REQUEST_STATUSES,
} = require('./caddy.constants');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

const CADDY_INCLUDE = [{ model: GolfCaddyGrade, as: 'grade', attributes: ['id', 'code', 'name', 'playersPerCaddy'] }];

// The station door (GolfSetting.caddyManagementEnabled) gates requests too.
async function enabled(companyId) {
    const setting = await GolfSetting.findOne({ where: { companyId }, attributes: ['caddyManagementEnabled'] });
    return !!(setting && setting.caddyManagementEnabled === true);
}

// ---------------------------------------------------------------------------
// PURE (unit-tested)

// Minutes from 'HH:MM' (or 'HH:MM:SS').
function toMinutes(hhmm) {
    const m = String(hhmm || '').match(/^(\d{2}):(\d{2})/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// Is a request's tee time inside the reserve window from `now` ('HH:MM')
// on the same date? (Past tee times are still reserved until the grace
// period lapses the request.)
function inReserveWindow(teeTime, now, windowMinutes = RESERVE_WINDOW_MINUTES, graceMinutes = LAPSE_GRACE_MINUTES) {
    const t = toMinutes(teeTime);
    const n = toMinutes(now);
    if (t === null || n === null) return false;
    return t - n <= windowMinutes && n - t <= graceMinutes;
}

// Has a live request lapsed - the play date passed, or the tee time is more
// than the grace period behind the club clock?
function hasLapsed({ playDate, teeTime }, clubDate, clubTime, graceMinutes = LAPSE_GRACE_MINUTES) {
    if (String(playDate) < clubDate) return true;
    if (String(playDate) > clubDate) return false;
    const t = toMinutes(teeTime);
    const n = toMinutes(clubTime);
    if (t === null || n === null) return false;
    return n - t > graceMinutes;
}

// Does a live request match an assignment being made (same caddy, same
// date, same booking or a requested golfer among the riders)?
function requestMatches(request, { caddyId, playDate, bookingProfileId, playerIds }) {
    if (request.caddyId !== caddyId || String(request.playDate) !== String(playDate)) return false;
    if (request.playerId) return (playerIds || []).includes(request.playerId);
    if (request.bookingProfileId) return request.bookingProfileId === bookingProfileId;
    return false;
}

// ---------------------------------------------------------------------------

function dto(r) {
    return {
        id: r.id,
        caddyId: r.caddyId,
        caddyNo: r.caddyNo,
        caddyName: r.caddy ? r.caddy.name : undefined,
        bookingProfileId: r.bookingProfileId,
        playerId: r.playerId,
        playDate: r.playDate,
        teeTime: r.teeTime ? availability.hhmm(r.teeTime) : null,
        courseId: r.courseId,
        source: r.source,
        status: r.status,
        statusLabel: (REQUEST_STATUSES.find((s) => s.key === r.status) || {}).label || r.status,
        requestedAt: r.requestedAt,
        confirmedAt: r.confirmedAt,
        fulfilledAt: r.fulfilledAt,
        caddyAssignmentId: r.caddyAssignmentId,
        cancelledAt: r.cancelledAt,
        cancelReason: r.cancelReason,
        remarks: r.remarks || null,
        live: LIVE_REQUEST_STATUS_KEYS.includes(r.status),
    };
}

// The flight facts a request snapshots, from a booking or a player record.
async function flightOf(companyId, { bookingProfileId, playerId }, { transaction } = {}) {
    if (playerId) {
        const row = await Player.findOne({ where: { companyId, id: playerId, secondNineFlag: 0 }, transaction });
        if (!row) return fail('Player record not found.', 404);
        if (!['booked', 'registered'].includes(row.status)) return fail(`${row.playerName} is ${row.status} - no caddy can be requested.`, 409);
        return { playDate: String(row.playDate), teeTime: row.teeTime, courseId: row.courseId, bookingProfileId: row.bookingProfileId || null, playerId: row.id, playerName: row.playerName };
    }
    const profile = await BookingProfile.findOne({ where: { companyId, id: bookingProfileId }, transaction });
    if (!profile) return fail('Booking not found.', 404);
    if (!['booked', 'pending-approval'].includes(profile.status)) return fail(`Booking ${profile.bookingNo} is ${profile.status} - no caddy can be requested.`, 409);
    const first = await Player.findOne({ where: { companyId, bookingProfileId: profile.id, secondNineFlag: 0, status: { [Op.in]: ['booked', 'registered'] } }, order: [['createdAt', 'ASC']], transaction });
    return { playDate: String(profile.playDate), teeTime: first ? first.teeTime : null, courseId: profile.courseId, bookingProfileId: profile.id, playerId: null, bookingNo: profile.bookingNo };
}

// POST (bookings) /:id/caddy-requests { caddyId | caddyNo, playerId?, remarks }
// POST (front desk) /caddy-requests { playerId, caddyId | caddyNo, remarks }
async function create(req, { bookingProfileId = null, playerId = null, caddyId = null, caddyNo = null, remarks = null, source = 'booking' }) {
    const companyId = companyIdOf(req);
    if (!companyId) return fail('Select a workspace first.');
    if (!REQUEST_SOURCE_KEYS.includes(source)) return fail('Unknown request source.');
    if (!(await enabled(companyId))) return fail('Caddy management is switched off (Golf Specification).', 409);
    const flight = await flightOf(companyId, { bookingProfileId, playerId });
    if (flight.error) return flight;
    const caddy = caddyId
        ? await GolfCaddy.findOne({ where: { companyId, id: String(caddyId) }, include: CADDY_INCLUDE })
        : await GolfCaddy.findOne({ where: { companyId, caddyNo: String(caddyNo || '').trim().toUpperCase() }, include: CADDY_INCLUDE });
    if (!caddy) return fail('Pick the caddy.', 404);
    if (caddy.status !== 'active') return fail(`Caddy ${caddy.caddyNo} is ${caddy.status} and cannot be requested.`, 409);
    const leave = await GolfCaddyLeave.findOne({ where: { caddyId: caddy.id, dateFrom: { [Op.lte]: flight.playDate }, dateTo: { [Op.gte]: flight.playDate } } });
    if (leave) return fail(`Caddy ${caddy.caddyNo} is on ${leave.leaveType} leave on ${flight.playDate}.`, 409);
    const clash = await GolfCaddyRequest.findOne({ where: { companyId, caddyId: caddy.id, playDate: flight.playDate, status: { [Op.in]: LIVE_REQUEST_STATUS_KEYS } } });
    if (clash) {
        const same = clash.bookingProfileId && clash.bookingProfileId === flight.bookingProfileId;
        return fail(same
            ? `Caddy ${caddy.caddyNo} is already requested for this booking.`
            : `Caddy ${caddy.caddyNo} is already requested on ${flight.playDate} (${clash.teeTime ? availability.hhmm(clash.teeTime) : 'another flight'}) - one request per caddy per day.`, 409);
    }
    // Already checked in today -> confirmed at once.
    const attendance = await GolfCaddyAttendance.findOne({ where: { companyId, caddyId: caddy.id, workDate: flight.playDate, status: { [Op.in]: ['present', 'out'] } } });
    const stamps = await callerStamps(req);
    const now = new Date();
    const row = await GolfCaddyRequest.create({
        companyId, caddyId: caddy.id, caddyNo: caddy.caddyNo,
        bookingProfileId: flight.bookingProfileId, playerId: flight.playerId,
        playDate: flight.playDate, teeTime: flight.teeTime, courseId: flight.courseId,
        source, status: attendance ? 'confirmed' : 'requested', requestedAt: now, requestedBy: stamps.updatedBy,
        confirmedAt: attendance ? now : null,
        remarks: typeof remarks === 'string' ? remarks.trim().slice(0, 255) || null : null, ...stamps,
    });
    row.caddy = caddy;
    const who = flight.playerName ? `for ${flight.playerName}` : `for booking ${flight.bookingNo}`;
    return { message: `Caddy ${caddy.caddyNo} ${caddy.name} requested ${who}${attendance ? ' (checked in - confirmed)' : ''}.`, request: dto(row) };
}

// POST .../caddy-requests/:requestId/cancel { reason?, byCaddy? }
async function cancel(req, requestId, { byCaddy = false, reason = null }) {
    const companyId = companyIdOf(req);
    if (!companyId) return fail('Select a workspace first.');
    const row = await GolfCaddyRequest.findOne({ where: { companyId, id: String(requestId) }, include: [{ model: GolfCaddy, as: 'caddy', attributes: ['id', 'name'] }] });
    if (!row) return fail('Caddy request not found.', 404);
    if (!LIVE_REQUEST_STATUS_KEYS.includes(row.status)) return fail(`This request is already ${dto(row).statusLabel.toLowerCase()}.`, 409);
    const text = typeof reason === 'string' ? reason.trim().slice(0, 255) : '';
    if (byCaddy && !text) return fail('Give the reason the caddy cannot serve.');
    const callerId = getUserContext(req).userId;
    Object.assign(row, { status: byCaddy ? 'cancelled-by-caddy' : 'cancelled-by-player', cancelledAt: new Date(), cancelledBy: callerId, cancelReason: text || null, updatedBy: callerId });
    await row.save();
    return { message: `Caddy request for ${row.caddyNo} cancelled${byCaddy ? ' by the caddy' : ''}.`, request: dto(row) };
}

// GET .../caddy-request-candidates?playDate= - active caddies not on leave
// that day, flagging the ones already requested.
async function candidates(req, query) {
    const companyId = companyIdOf(req);
    if (!companyId) return fail('Select a workspace first.');
    const playDate = String(query.playDate || '');
    if (!DATE_RE.test(playDate)) return fail('Pick a play date.');
    const [caddies, onLeave, live] = await Promise.all([
        GolfCaddy.findAll({ where: { companyId, status: 'active' }, include: CADDY_INCLUDE, order: [['caddyNo', 'ASC']] }),
        caddySvc.caddyIdsOnLeave(companyId, playDate),
        GolfCaddyRequest.findAll({ where: { companyId, playDate, status: { [Op.in]: LIVE_REQUEST_STATUS_KEYS } }, attributes: ['caddyId', 'teeTime'] }),
    ]);
    const requested = new Map(live.map((r) => [r.caddyId, r.teeTime ? availability.hhmm(r.teeTime) : null]));
    return {
        playDate,
        caddies: caddies.filter((c) => !onLeave.has(c.id)).map((c) => ({
            id: c.id, caddyNo: c.caddyNo, name: c.name, languages: c.languages || null,
            grade: c.grade ? { code: c.grade.code, name: c.grade.name, playersPerCaddy: Number(c.grade.playersPerCaddy) } : null,
            requestedAt: requested.has(c.id) ? (requested.get(c.id) || 'another flight') : null,
        })),
    };
}

// ---------------------------------------------------------------------------
// Hooks for the station, the bookings and the sheet

// The caddy checked in: its requests for the day become confirmed.
async function confirmOnCheckIn(companyId, caddyId, workDate, { transaction } = {}) {
    await GolfCaddyRequest.update({ status: 'confirmed', confirmedAt: new Date() }, { where: { companyId, caddyId, playDate: workDate, status: 'requested' }, transaction });
}

// An assignment is being made: the live request it fulfils (or null).
async function fulfil({ companyId, caddyId, playDate, bookingProfileId, playerIds, assignmentId, transaction }) {
    const rows = await GolfCaddyRequest.findAll({ where: { companyId, caddyId, playDate, status: { [Op.in]: LIVE_REQUEST_STATUS_KEYS } }, transaction });
    const match = rows.find((r) => requestMatches(r, { caddyId, playDate, bookingProfileId, playerIds }));
    if (!match) return null;
    Object.assign(match, { status: 'fulfilled', fulfilledAt: new Date(), caddyAssignmentId: assignmentId });
    await match.save({ transaction });
    return match;
}

// The caddies reserved by a confirmed request within the window (Next up skips them).
async function reservedCaddyIds(companyId, playDate, clubTime, { transaction } = {}) {
    const rows = await GolfCaddyRequest.findAll({ where: { companyId, playDate, status: 'confirmed' }, attributes: ['caddyId', 'teeTime', 'bookingProfileId', 'playerId'], transaction });
    const out = new Map();
    for (const r of rows) {
        if (inReserveWindow(r.teeTime ? availability.hhmm(r.teeTime) : null, clubTime)) out.set(r.caddyId, { teeTime: availability.hhmm(r.teeTime), bookingProfileId: r.bookingProfileId, playerId: r.playerId });
    }
    return out;
}

// Every request of the day (live and closed) with the caddy's name.
async function listForDay(companyId, playDate, { transaction } = {}) {
    return GolfCaddyRequest.findAll({
        where: { companyId, playDate },
        include: [{ model: GolfCaddy, as: 'caddy', attributes: ['id', 'name'] }],
        order: [['requestedAt', 'ASC']],
        transaction,
    });
}

// Requests by booking (the Bookings listing): live + fulfilled.
async function byBookings(companyId, bookingIds) {
    if (!bookingIds.length) return new Map();
    const rows = await GolfCaddyRequest.findAll({
        where: { companyId, bookingProfileId: { [Op.in]: bookingIds }, status: { [Op.in]: [...LIVE_REQUEST_STATUS_KEYS, 'fulfilled'] } },
        include: [{ model: GolfCaddy, as: 'caddy', attributes: ['id', 'name'] }],
        order: [['requestedAt', 'ASC']],
    });
    const out = new Map();
    for (const r of rows) {
        if (!out.has(r.bookingProfileId)) out.set(r.bookingProfileId, []);
        out.get(r.bookingProfileId).push(dto(r));
    }
    return out;
}

// The request tag per player for the Tee Time Sheet: a request for the player
// itself, else one for its booking.
async function tagsByPlayer(companyId, players, { transaction } = {}) {
    const out = new Map();
    const playerIds = players.map((p) => p.id);
    const bookingIds = [...new Set(players.map((p) => p.bookingProfileId).filter(Boolean))];
    if (!playerIds.length) return out;
    const rows = await GolfCaddyRequest.findAll({
        where: {
            companyId,
            status: { [Op.in]: [...LIVE_REQUEST_STATUS_KEYS, 'fulfilled'] },
            [Op.or]: [{ playerId: { [Op.in]: playerIds } }, ...(bookingIds.length ? [{ bookingProfileId: { [Op.in]: bookingIds }, playerId: null }] : [])],
        },
        include: [{ model: GolfCaddy, as: 'caddy', attributes: ['id', 'name'] }],
        transaction,
    });
    for (const p of players) {
        const own = rows.find((r) => r.playerId === p.id);
        const booking = p.bookingProfileId ? rows.find((r) => !r.playerId && r.bookingProfileId === p.bookingProfileId) : null;
        const r = own || booking;
        if (r) out.set(p.id, { id: r.id, caddyNo: r.caddyNo, caddyName: r.caddy ? r.caddy.name : null, status: r.status, forPlayer: !!own });
    }
    return out;
}

// The booking was cancelled: its live requests are cancelled by the player.
async function onBookingCancelled(companyId, bookingProfileId, callerId, { transaction } = {}) {
    await GolfCaddyRequest.update(
        { status: 'cancelled-by-player', cancelledAt: new Date(), cancelledBy: callerId, cancelReason: 'Booking cancelled', updatedBy: callerId },
        { where: { companyId, bookingProfileId, status: { [Op.in]: LIVE_REQUEST_STATUS_KEYS } }, transaction },
    );
}

// The booking moved: refresh the flight snapshots of its live requests.
async function onBookingMoved(companyId, bookingProfileId, { playDate, teeTime, courseId }, callerId, { transaction } = {}) {
    await GolfCaddyRequest.update(
        { playDate, teeTime, courseId, updatedBy: callerId },
        { where: { companyId, bookingProfileId, status: { [Op.in]: LIVE_REQUEST_STATUS_KEYS } }, transaction },
    );
}

// Worker tick: live requests whose tee time passed lapse.
async function scanCaddyRequests() {
    const rows = await GolfCaddyRequest.findAll({ where: { status: { [Op.in]: LIVE_REQUEST_STATUS_KEYS } }, attributes: ['id', 'companyId', 'playDate', 'teeTime'] });
    let lapsed = 0;
    const tzByCompany = new Map();
    for (const r of rows) {
        if (!tzByCompany.has(r.companyId)) tzByCompany.set(r.companyId, await companyTimezoneById(r.companyId));
        const now = availability.clubNow(tzByCompany.get(r.companyId));
        if (!hasLapsed({ playDate: r.playDate, teeTime: r.teeTime ? availability.hhmm(r.teeTime) : null }, now.date, now.time)) continue;
        await GolfCaddyRequest.update({ status: 'lapsed', updatedBy: null }, { where: { id: r.id, status: { [Op.in]: LIVE_REQUEST_STATUS_KEYS } } });
        lapsed += 1;
    }
    if (lapsed) console.log(`[GOLF CADDY REQUEST] ${lapsed} request(s) lapsed.`);
    return { lapsed };
}

module.exports = {
    toMinutes, inReserveWindow, hasLapsed, requestMatches, dto, enabled,
    create, cancel, candidates,
    confirmOnCheckIn, fulfil, reservedCaddyIds, listForDay, byBookings, tagsByPlayer,
    onBookingCancelled, onBookingMoved, scanCaddyRequests,
};
