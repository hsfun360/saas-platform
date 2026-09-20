// Golf booking availability - the DYNAMIC tee sheet (user decisions
// 2026-09-19/20). There is no materialized slot table: a day's flight grid is
// COMPUTED here from the course's resolved tee-time set (day scope via the
// calendar seam, latest effectiveDate on-or-before the date) minus closure
// blocks, then overlaid with occupancy (active bookings by natural key) and
// unexpired flight locks. The 2006 "stored procedure" equivalent.
//
// Bookings START on the FIRST nine today (the search flow picks course +
// time); the second nine is occupied by 18-hole crossover legs, whose time is
// the first grid slot at/after start + course.crossOverMinutes.

const { Op } = require('sequelize');
const GolfSetting = require('./golfSetting.model');
const AdvanceBookingOverride = require('./advanceBookingOverride.model');
const MinPlayerRule = require('./minPlayerRule.model');
const GuestControlRule = require('./guestControlRule.model');
const Course = require('./course.model');
const CourseTeeTimeSet = require('./courseTeeTimeSet.model');
const CourseTeeTimeSlot = require('./courseTeeTimeSlot.model');
const CourseClosurePlan = require('./courseClosurePlan.model');
const CourseClosureDay = require('./courseClosureDay.model');
const Booking = require('./booking.model');
const BookingPlayer = require('./bookingPlayer.model');
const FlightLock = require('./flightLock.model');

// ---- time helpers ('HH:MM' strings throughout) ----------------------------

function toMinutes(t) {
    if (!t) return null;
    const [h, m] = String(t).slice(0, 5).split(':').map(Number);
    return h * 60 + m;
}

function toHHMM(minutes) {
    const h = Math.floor(minutes / 60) % 24;
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function hhmm(t) {
    return t ? String(t).slice(0, 5) : null;
}

function cellKey(courseId, nine, teeTime) {
    return `${courseId}|${nine}|${hhmm(teeTime)}`;
}

// ---- club-local clock ------------------------------------------------------

// 'now' in the club's IANA timezone as { date: 'YYYY-MM-DD', time: 'HH:MM' }.
function clubNow(timezone) {
    const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone || 'UTC',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
    const parts = {};
    for (const p of fmt.formatToParts(new Date())) parts[p.type] = p.value;
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function addDays(dateStr, days) {
    const t = new Date(`${dateStr}T00:00:00Z`).getTime() + days * 86400000;
    return new Date(t).toISOString().slice(0, 10);
}

// ---- booking window --------------------------------------------------------

// The bookable date range for a member (or the general rule when
// membershipTypeId is null): the window for play date D opens at 00:00 of
// (D - effectiveDays) MINUS advanceBookingHours, club-local. So dateTo =
// today + effectiveDays, plus one more day once the local clock passes
// (24:00 - hours) - "at 10pm members book what opens at coming midnight".
async function bookingWindow(companyId, membershipTypeId, timezone) {
    const setting = await GolfSetting.findOne({ where: { companyId } });
    const days = setting ? setting.advanceBookingDays : 7;
    const hours = setting ? setting.advanceBookingHours : 0;
    let effectiveDays = days;
    if (setting && setting.allowMembershipTypeOverride && membershipTypeId) {
        const ov = await AdvanceBookingOverride.findOne({ where: { companyId, membershipTypeId } });
        if (ov) effectiveDays = ov.advanceBookingDays;
    }
    const now = clubNow(timezone);
    let dateTo = addDays(now.date, effectiveDays);
    if (hours > 0 && toMinutes(now.time) >= (24 - hours) * 60) dateTo = addDays(dateTo, 1);
    return { dateFrom: now.date, dateTo, effectiveDays, hours, setting };
}

// ---- grid resolution -------------------------------------------------------

// The tee-time set in force for a course on a date: active, dayScope matching
// (exact day type preferred over 'all'), latest effectiveDate on-or-before.
async function resolveTeeTimeSet(courseId, dayType, playDate) {
    const sets = await CourseTeeTimeSet.findAll({
        where: {
            courseId,
            isActive: true,
            dayScope: { [Op.in]: ['all', dayType] },
            effectiveDate: { [Op.lte]: playDate },
        },
        order: [['effectiveDate', 'DESC']],
    });
    return sets.find((s) => s.dayScope === dayType) || sets.find((s) => s.dayScope === 'all') || null;
}

// Active closure blocks of a course on a date: [{ nineScope, start, end }]
// with start/end minutes (null = whole day).
async function closureBlocks(courseId, playDate) {
    const plans = await CourseClosurePlan.findAll({ where: { courseId, isActive: true }, attributes: ['id'] });
    if (!plans.length) return [];
    const days = await CourseClosureDay.findAll({
        where: { closurePlanId: { [Op.in]: plans.map((p) => p.id) }, closureDate: playDate, isActive: true },
    });
    return days.map((d) => ({
        nineScope: d.nineScope,
        start: d.startTime ? toMinutes(d.startTime) : null,
        end: d.endTime ? toMinutes(d.endTime) : null,
    }));
}

function nineBlocked(blocks, nine, timeMinutes) {
    return blocks.some((b) => {
        const scopeHit = b.nineScope === 'all'
            || (nine === 'first' && b.nineScope === 'first-nine')
            || (nine === 'second' && b.nineScope === 'second-nine');
        if (!scopeHit) return false;
        if (b.start === null) return true; // whole-day closure
        return timeMinutes >= b.start && timeMinutes < b.end;
    });
}

// ---- occupancy + locks -----------------------------------------------------

// Occupancy of every cell of the given courses on a date, from active
// bookings: cellKey -> { bookings: n, players: n }.
async function occupancy(companyId, courseIds, playDate, { transaction } = {}) {
    const map = new Map();
    if (!courseIds.length) return map;
    const rows = await Booking.findAll({
        where: { companyId, courseId: { [Op.in]: courseIds }, playDate, status: 'booked' },
        attributes: ['id', 'courseId', 'startNine', 'startTime', 'crossNine', 'crossTime'],
        transaction,
    });
    if (!rows.length) return map;
    const counts = await BookingPlayer.findAll({
        where: { bookingId: { [Op.in]: rows.map((r) => r.id) } },
        attributes: ['bookingId'],
        transaction,
    });
    const playersByBooking = new Map();
    for (const p of counts) playersByBooking.set(p.bookingId, (playersByBooking.get(p.bookingId) || 0) + 1);
    const bump = (key, players) => {
        const cur = map.get(key) || { bookings: 0, players: 0 };
        cur.bookings += 1;
        cur.players += players;
        map.set(key, cur);
    };
    for (const r of rows) {
        const players = playersByBooking.get(r.id) || 0;
        bump(cellKey(r.courseId, r.startNine, r.startTime), players);
        if (r.crossNine && r.crossTime) bump(cellKey(r.courseId, r.crossNine, r.crossTime), players);
    }
    return map;
}

// Unexpired flight locks on the given courses/date -> Set of cellKeys.
// `excludeGroupId` lets a lock holder see through their own lock.
async function activeLockCells(companyId, courseIds, playDate, { excludeGroupId, transaction } = {}) {
    const out = new Set();
    if (!courseIds.length) return out;
    const where = {
        companyId,
        courseId: { [Op.in]: courseIds },
        playDate,
        expiresAt: { [Op.gt]: new Date() },
    };
    if (excludeGroupId) where.groupId = { [Op.ne]: excludeGroupId };
    const rows = await FlightLock.findAll({ where, transaction });
    for (const r of rows) out.add(cellKey(r.courseId, r.nine, r.teeTime));
    return out;
}

// ---- rule resolution (minimum players / guest control) ---------------------

// Most-specific-wins over the sparse exception rows: specific course beats
// every-course, a time band beats whole day, exact dayScope beats 'all'.
function pickRule(rules, courseId, dayType, timeMinutes) {
    let best = null;
    let bestScore = -1;
    for (const r of rules) {
        if (r.courseId && r.courseId !== courseId) continue;
        if (r.dayScope !== 'all' && r.dayScope !== dayType) continue;
        if (r.startTime) {
            const s = toMinutes(r.startTime);
            const e = toMinutes(r.endTime);
            if (timeMinutes < s || timeMinutes >= e) continue;
        }
        const score = (r.courseId ? 4 : 0) + (r.startTime ? 2 : 0) + (r.dayScope !== 'all' ? 1 : 0);
        if (score > bestScore) {
            best = r;
            bestScore = score;
        }
    }
    return best;
}

function resolveMinPlayers(setting, rules, courseId, dayType, timeMinutes) {
    const rule = pickRule(rules, courseId, dayType, timeMinutes);
    if (rule) return rule.minPlayers;
    if (!setting) return 1;
    return dayType === 'weekend' ? setting.minPlayersWeekend : setting.minPlayersWeekday;
}

// { allowGuest, allowMemberGuest } for a flight - both true when the master
// switch is off.
function resolveGuestControl(setting, rules, courseId, dayType, timeMinutes) {
    if (!setting || setting.guestControlEnabled !== true) return { allowGuest: true, allowMemberGuest: true };
    const rule = pickRule(rules, courseId, dayType, timeMinutes);
    if (rule) return { allowGuest: rule.allowGuest === true, allowMemberGuest: rule.allowMemberGuest === true };
    return dayType === 'weekend'
        ? { allowGuest: setting.allowGuestWeekend === true, allowMemberGuest: setting.allowMemberGuestWeekend === true }
        : { allowGuest: setting.allowGuestWeekday === true, allowMemberGuest: setting.allowMemberGuestWeekday === true };
}

// ---- flight computation ----------------------------------------------------

// Seats left in a cell under the merge rule; null = cell not bookable at all.
function seatsLeft(allowMerge, occ, maxPlayers) {
    if (!occ) return maxPlayers;
    if (!allowMerge && occ.bookings > 0) return 0;
    return Math.max(0, maxPlayers - occ.players);
}

// Every flight of ONE course/date that can take `players` more players for
// `holes`, from the computed grid. Returns { course, flights: [...] } or null
// when the course has no grid that day (no set / whole-day closure).
// `flights`: { teeTime, crossTime, seatsLeft, maxPlayers, isFrontDesk,
// existingPlayers, minPlayers } sorted by time.
async function courseFlights({ companyId, course, playDate, dayType, holes, players, setting, minRules, occ, locks }) {
    const set = await resolveTeeTimeSet(course.id, dayType, playDate);
    if (!set) return null;
    const slots = await CourseTeeTimeSlot.findAll({
        where: { teeTimeSetId: set.id },
        order: [['teeTime', 'ASC']],
    });
    if (!slots.length) return null;
    const blocks = await closureBlocks(course.id, playDate);
    const slotTimes = slots.map((s) => toMinutes(s.teeTime));
    const crossOffset = course.crossOverMinutes || 0;
    const mustPlay18 = set.mustPlay18Until ? toMinutes(set.mustPlay18Until) : null;

    const flights = [];
    for (const slot of slots) {
        const t = toMinutes(slot.teeTime);
        // 9-hole play is not offered while 18 holes are mandatory.
        if (holes === 9 && mustPlay18 !== null && t <= mustPlay18) continue;
        if (nineBlocked(blocks, 'first', t)) continue;
        const startKey = cellKey(course.id, 'first', slot.teeTime);
        if (locks.has(startKey)) continue;
        const startOcc = occ.get(startKey);
        const startSeats = seatsLeft(setting ? setting.allowBookingMerge === true : false, startOcc, slot.maxPlayers);
        if (startSeats < players) continue;

        let crossTime = null;
        let crossSeats = Infinity;
        if (holes === 18) {
            const targetIdx = slotTimes.findIndex((st) => st >= t + crossOffset);
            if (targetIdx === -1) continue; // crossover lands after the last flight
            const crossSlot = slots[targetIdx];
            const ct = slotTimes[targetIdx];
            if (nineBlocked(blocks, 'second', ct)) continue;
            const crossKey = cellKey(course.id, 'second', crossSlot.teeTime);
            if (locks.has(crossKey)) continue;
            crossSeats = seatsLeft(setting ? setting.allowBookingMerge === true : false, occ.get(crossKey), crossSlot.maxPlayers);
            if (crossSeats < players) continue;
            crossTime = hhmm(crossSlot.teeTime);
        }

        const existingPlayers = (startOcc && startOcc.players) || 0;
        const minPlayers = resolveMinPlayers(setting, minRules, course.id, dayType, t);
        // Enforcement rule: own count meets the minimum OR joining brings the
        // flight's total to it (merge OFF degenerates to per-booking).
        if (players < minPlayers && !(existingPlayers > 0 && existingPlayers + players >= minPlayers)) continue;

        flights.push({
            teeTime: hhmm(slot.teeTime),
            crossTime,
            seatsLeft: Math.min(startSeats, crossSeats === Infinity ? startSeats : crossSeats),
            maxPlayers: slot.maxPlayers,
            isFrontDesk: slot.isFrontDesk === true,
            existingPlayers,
            minPlayers,
        });
    }
    return { course, flights };
}

// The N flights nearest to a requested time (± both directions), re-sorted by
// time for display.
function nearestFlights(flights, requestedTime, n) {
    const target = toMinutes(requestedTime);
    return [...flights]
        .sort((a, b) => Math.abs(toMinutes(a.teeTime) - target) - Math.abs(toMinutes(b.teeTime) - target))
        .slice(0, n)
        .sort((a, b) => toMinutes(a.teeTime) - toMinutes(b.teeTime));
}

// A member golfer's ACTIVE bookings on a play date - the one-booking-per-day
// rule's evidence. Counted: bookings they made (bookerGolferId) and bookings
// where they appear as a 'member' player line; member-as-guest lines are NOT
// counted, cancelled bookings free the day.
async function memberDayBookings(companyId, golferId, playDate, { transaction } = {}) {
    if (!golferId) return [];
    const asBooker = await Booking.findAll({
        where: { companyId, playDate, status: 'booked', bookerGolferId: golferId },
        transaction,
    });
    const lines = await BookingPlayer.findAll({
        where: { golferId, playerType: 'member' },
        attributes: ['bookingId'],
        transaction,
    });
    const seen = new Set(asBooker.map((b) => b.id));
    const ids = [...new Set(lines.map((l) => l.bookingId))].filter((id) => !seen.has(id));
    const asPlayer = ids.length
        ? await Booking.findAll({ where: { companyId, playDate, status: 'booked', id: { [Op.in]: ids } }, transaction })
        : [];
    return [...asBooker, ...asPlayer];
}

// Shared rule loads for one company (settings + both sparse rule sets).
async function loadRules(companyId) {
    const [setting, minRules, guestRules] = await Promise.all([
        GolfSetting.findOne({ where: { companyId } }),
        MinPlayerRule.findAll({ where: { companyId } }),
        GuestControlRule.findAll({ where: { companyId } }),
    ]);
    return { setting, minRules, guestRules };
}

module.exports = {
    toMinutes,
    toHHMM,
    hhmm,
    cellKey,
    clubNow,
    addDays,
    bookingWindow,
    resolveTeeTimeSet,
    closureBlocks,
    nineBlocked,
    occupancy,
    activeLockCells,
    pickRule,
    resolveMinPlayers,
    resolveGuestControl,
    seatsLeft,
    memberDayBookings,
    courseFlights,
    nearestFlights,
    loadRules,
};
