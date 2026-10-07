// Golf booking availability - the DYNAMIC tee sheet (user decisions
// 2026-09-19/20, revamped 2026-09-29 to the PER-NINE model). There is no
// materialized slot table: a day's flight grid is COMPUTED here from each
// course's resolved tee-time set (day scope via the calendar seam, latest
// effectiveDate on-or-before the date) minus closure blocks, then overlaid
// with occupancy and unexpired flight locks.
//
// THE availability key is the physical NINE: occupancy counts golf.Player
// records per (unitCourseId, teeTime), so a course's 18-hole crossover leg
// occupies the nine it lands on even when ANOTHER course starts on that
// nine (composite rotation, e.g. Tropicana E1 -> E2 -> W3 -> E1). A nine's
// timeline/capacity comes from the grid of the course that STARTS on it
// (its "owner"); a second nine no course starts on falls back to the
// playing course's own grid times, as before the revamp.

const { Op } = require('sequelize');
const GolfSetting = require('./golfSetting.model');
const AdvanceBookingOverride = require('./advanceBookingOverride.model');
const MinPlayerRule = require('./minPlayerRule.model');
const GuestControlRule = require('./guestControlRule.model');
const Course = require('./course.model');
const CourseTeeTimeSet = require('./courseTeeTimeSet.model');
const CourseTeeTimeSlot = require('./courseTeeTimeSlot.model');
const UnitCourseClosurePlan = require('./unitCourseClosurePlan.model');
const UnitCourseClosureDay = require('./unitCourseClosureDay.model');
const BookingProfile = require('./bookingProfile.model');
const Player = require('./player.model');
const FlightLock = require('./flightLock.model');
const GroupPlayDay = require('./groupPlayDay.model');
const GroupFlight = require('./groupFlight.model');
const { ACTIVE_PLAYER_STATUS_KEYS } = require('./registration.constants');
const { COURSE_HOLD_FORMATS } = require('./groupBooking.constants');

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

// The one occupancy/lock cell key: a physical nine at a tee time.
function nineKey(unitCourseId, teeTime) {
    return `${unitCourseId}|${hhmm(teeTime)}`;
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
    // Same-day booking OFF (default): the window STARTS TOMORROW - today's
    // flights are front-desk registration only (user decision 2026-09-21).
    const dateFrom = setting && setting.allowSameDayBooking === true ? now.date : addDays(now.date, 1);
    return { dateFrom, dateTo, effectiveDays, hours, setting };
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

// Active closure blocks of the given PHYSICAL NINES on a date, in one query:
// Map(unitCourseId -> [{ start, end }]) with start/end minutes (null = whole
// day). Closures are keyed on the unit course (2026-09-30): closing EAST1
// blocks every use of that nine - E1's tee-offs AND W3's crossover landings.
async function closureBlocks(unitCourseIds, playDate) {
    const map = new Map();
    if (!unitCourseIds.length) return map;
    const plans = await UnitCourseClosurePlan.findAll({
        where: { unitCourseId: { [Op.in]: unitCourseIds }, isActive: true },
        attributes: ['id', 'unitCourseId'],
    });
    if (!plans.length) return map;
    const nineByPlan = new Map(plans.map((p) => [p.id, p.unitCourseId]));
    const days = await UnitCourseClosureDay.findAll({
        where: { closurePlanId: { [Op.in]: plans.map((p) => p.id) }, closureDate: playDate, isActive: true },
    });
    for (const d of days) {
        const nineId = nineByPlan.get(d.closurePlanId);
        if (!map.has(nineId)) map.set(nineId, []);
        map.get(nineId).push({
            start: d.startTime ? toMinutes(d.startTime) : null,
            end: d.endTime ? toMinutes(d.endTime) : null,
        });
    }
    return map;
}

// Is ONE nine's block list closed at the time? (blocks = closureBlocks map
// entry for that nine; undefined/empty = open.)
function nineBlocked(blocks, timeMinutes) {
    return (blocks || []).some((b) => {
        if (b.start === null) return true; // whole-day closure
        return timeMinutes >= b.start && timeMinutes < b.end;
    });
}

// ---- group booking holds (2026-10-07) ---------------------------------------

// The GROUP BOOKING holds on a date: the planned play days of still-BOOKED
// group/tournament bookings and their reserved flights. Shotgun-format days
// HOLD the course's nines for startTime..blockUntil (merged into
// ctx.nineBlocks as kind 'group'); sequential-format flights hold their
// tee-time CELL at full capacity (applied in occupancy()). Returns
// { days: [{ day, profile }], flights: [GroupFlight], dayById }.
async function groupHolds(companyId, playDate, { transaction } = {}) {
    const days = await GroupPlayDay.findAll({
        where: { companyId, playDate, status: 'planned' },
        transaction,
    });
    if (!days.length) return { days: [], flights: [], dayById: new Map() };
    const profiles = await BookingProfile.findAll({
        where: { companyId, status: 'booked', id: { [Op.in]: [...new Set(days.map((d) => d.bookingProfileId))] } },
        attributes: ['id', 'bookingNo', 'groupName', 'bookingType'],
        transaction,
    });
    const profileById = new Map(profiles.map((p) => [p.id, p]));
    const live = days.filter((d) => profileById.has(d.bookingProfileId)).map((d) => ({ day: d, profile: profileById.get(d.bookingProfileId) }));
    if (!live.length) return { days: [], flights: [], dayById: new Map() };
    const flights = await GroupFlight.findAll({
        where: { groupPlayDayId: { [Op.in]: live.map((x) => x.day.id) } },
        order: [['sortOrder', 'ASC'], ['teeTime', 'ASC']],
        transaction,
    });
    return { days: live, flights, dayById: new Map(live.map((x) => [x.day.id, x])) };
}

// Merge the shotgun-format holds into a nineBlocks map (mutates `map`):
// both nines of the day's course are blocked for the window, labelled so
// the tee sheet can say "GROUP" rather than "CLOSED".
function applyGroupBlocks(map, holds, courseById) {
    for (const { day, profile } of holds.days) {
        if (!COURSE_HOLD_FORMATS.includes(day.startFormat)) continue;
        const course = courseById.get(day.courseId);
        if (!course) continue;
        const block = {
            start: toMinutes(day.startTime),
            end: day.blockUntil ? toMinutes(day.blockUntil) : 24 * 60,
            kind: 'group',
            label: profile.groupName || profile.bookingNo,
            bookingProfileId: profile.id,
        };
        for (const nineId of [course.firstNineId, course.secondNineId]) {
            if (!nineId) continue;
            if (!map.has(nineId)) map.set(nineId, []);
            map.get(nineId).push({ ...block });
        }
    }
}

// ---- day context (grids + nine ownership) ----------------------------------

// One shared resolve of the day's grids: per course its set/slots, the
// per-NINE closure blocks (nineBlocks: unitCourseId -> block list), plus the
// nine-OWNER map (unitCourseId -> the course that STARTS on that nine, whose
// grid is the nine's authoritative timeline/capacity). At most one active
// course should start on a given nine; the first by display sequence wins if
// data ever violates that.
async function dayContext(companyId, playDate, dayType, { courses = null, transaction } = {}) {
    const list = courses || await Course.findAll({
        where: { companyId, isActive: true },
        order: [['displaySequence', 'ASC'], ['courseCode', 'ASC']],
        transaction,
    });
    const nineIds = [...new Set(list.flatMap((c) => [c.firstNineId, c.secondNineId]).filter(Boolean))];
    const nineBlocks = await closureBlocks(nineIds, playDate);
    const byCourse = new Map();
    const nineOwner = new Map();
    for (const course of list) {
        const set = await resolveTeeTimeSet(course.id, dayType, playDate);
        const slots = set
            ? await CourseTeeTimeSlot.findAll({ where: { teeTimeSetId: set.id }, order: [['teeTime', 'ASC']], transaction })
            : [];
        byCourse.set(course.id, { course, set, slots });
        if (set && slots.length && !nineOwner.has(course.firstNineId)) {
            nineOwner.set(course.firstNineId, { course, slots });
        }
    }
    // Group booking holds (2026-10-07): shotgun-format play days block their
    // course's nines for the window, like a closure; sequential flights are
    // applied by occupancy(). A held course that is no longer in `list`
    // (deactivated) is resolved on its own so its hold still shows.
    const holds = await groupHolds(companyId, playDate, { transaction });
    const courseById = new Map(list.map((c) => [c.id, c]));
    const missing = [...new Set(holds.days.map((x) => x.day.courseId))].filter((id) => !courseById.has(id));
    if (missing.length) {
        for (const c of await Course.findAll({ where: { companyId, id: { [Op.in]: missing } }, transaction })) courseById.set(c.id, c);
    }
    applyGroupBlocks(nineBlocks, holds, courseById);
    return { courses: list, byCourse, nineOwner, nineBlocks, holds, courseById };
}

// The crossover LANDING slot for an 18-hole flight starting at `tMinutes`
// on `startNineId` of `course`: it lands on the course's OTHER nine, on the
// first slot at/after start + crossOverMinutes of that nine's own timeline
// (its owner course's grid; the playing course's grid when nobody starts on
// that nine). Crossover-only slots are valid landing targets by design.
// Returns { slot, unitCourseId } or null when the crossover lands after the
// last flight. A two-tee group flight starts on the SECOND nine and lands on
// the first - the generalisation this takes.
function crossTargetFrom(ctx, course, startNineId, tMinutes) {
    const offset = course.crossOverMinutes || 0;
    const landing = startNineId === course.secondNineId ? course.firstNineId : course.secondNineId;
    const owner = ctx.nineOwner.get(landing) || null;
    const own = ctx.byCourse.get(course.id);
    const slots = owner ? owner.slots : (own ? own.slots : []);
    const idx = slots.findIndex((s) => toMinutes(s.teeTime) >= tMinutes + offset);
    if (idx === -1) return null;
    return { slot: slots[idx], unitCourseId: landing };
}

// The ordinary case: a tee-off on the course's first nine.
function crossTarget(ctx, course, tMinutes) {
    return crossTargetFrom(ctx, course, course.firstNineId, tMinutes);
}

// Is the crossover landing blocked? Simply: is the landing NINE closed at
// the landing time (closures are per unit course, so one lookup covers every
// course that uses the nine).
function crossBlocked(ctx, course, ctMinutes) {
    return nineBlocked(ctx.nineBlocks.get(course.secondNineId), ctMinutes);
}

// ---- occupancy + locks -----------------------------------------------------

// Occupancy of every NINE-cell of the company on a date: nineKey ->
// { claims, players }. One query over golf.Player (statuses that hold a
// seat): `players` counts every record in the cell (starters AND crossover
// arrivals - physical bodies on the nine); `claims` counts DISTINCT booking
// profiles plus one claim for the cell's walk-ins together (so an
// exclusive-flight club never offers a flight strangers already occupy,
// while one booking's own records never claim twice).
//
// GROUP HOLDS (2026-10-07): a reserved sequential-format group flight counts
// at FULL capacity from the moment it exists - its seats not yet filled by
// the draw are added as players (and the booking as one claim). With `ctx`
// (dayContext) an 18-hole flight's crossover landing cell is held the same
// way until the draw's crossover records exist. Pass `ctx` wherever one is
// at hand (availability search, lock, save, desk walk-in).
async function occupancy(companyId, playDate, { transaction, ctx = null } = {}) {
    const map = new Map();
    const rows = await Player.findAll({
        where: { companyId, playDate, status: { [Op.in]: ACTIVE_PLAYER_STATUS_KEYS } },
        attributes: ['bookingProfileId', 'unitCourseId', 'teeTime', 'groupFlightId', 'secondNineFlag'],
        transaction,
    });
    const profilesByCell = new Map();
    const drawnByFlight = new Map(); // groupFlightId -> { start, cross }
    for (const r of rows) {
        const key = nineKey(r.unitCourseId, r.teeTime);
        const cur = map.get(key) || { claims: 0, players: 0 };
        cur.players += 1;
        map.set(key, cur);
        if (!profilesByCell.has(key)) profilesByCell.set(key, { profiles: new Set(), walkIn: false });
        const cell = profilesByCell.get(key);
        if (r.bookingProfileId) cell.profiles.add(r.bookingProfileId);
        else cell.walkIn = true;
        if (r.groupFlightId) {
            const d = drawnByFlight.get(r.groupFlightId) || { start: 0, cross: 0 };
            if (Number(r.secondNineFlag) === 1) d.cross += 1; else d.start += 1;
            drawnByFlight.set(r.groupFlightId, d);
        }
    }

    const holds = ctx && ctx.holds ? ctx.holds : await groupHolds(companyId, playDate, { transaction });
    for (const f of holds.flights) {
        const entry = holds.dayById.get(f.groupPlayDayId);
        if (!entry || COURSE_HOLD_FORMATS.includes(entry.day.startFormat)) continue;
        const drawn = drawnByFlight.get(f.id) || { start: 0, cross: 0 };
        const reserve = (key, taken) => {
            const open = Math.max(0, f.capacity - taken);
            if (!open) return;
            const cur = map.get(key) || { claims: 0, players: 0 };
            cur.players += open;
            map.set(key, cur);
            if (!profilesByCell.has(key)) profilesByCell.set(key, { profiles: new Set(), walkIn: false });
            profilesByCell.get(key).profiles.add(f.bookingProfileId);
        };
        reserve(nineKey(f.unitCourseId, f.teeTime), drawn.start);
        if (ctx && Number(entry.day.holes) === 18) {
            const course = ctx.courseById ? ctx.courseById.get(f.courseId) : null;
            const target = course ? crossTargetFrom(ctx, course, f.unitCourseId, toMinutes(f.teeTime)) : null;
            if (target) reserve(nineKey(target.unitCourseId, target.slot.teeTime), drawn.cross);
        }
    }

    for (const [key, cell] of profilesByCell) {
        map.get(key).claims = cell.profiles.size + (cell.walkIn ? 1 : 0);
    }
    return map;
}

// Unexpired flight locks on the date -> Set of nineKeys.
// `excludeGroupId` lets a lock holder see through their own lock.
async function activeLockCells(companyId, playDate, { excludeGroupId, transaction } = {}) {
    const out = new Set();
    const where = {
        companyId,
        playDate,
        expiresAt: { [Op.gt]: new Date() },
    };
    if (excludeGroupId) where.groupId = { [Op.ne]: excludeGroupId };
    const rows = await FlightLock.findAll({ where, transaction });
    for (const r of rows) out.add(nineKey(r.unitCourseId, r.teeTime));
    return out;
}

// ---- rule resolution (minimum players / guest control) ---------------------

// The day-of-week of a YYYY-MM-DD play date (dates are club-local already).
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
function dayOfWeekOf(dateStr) {
    const d = new Date(`${dateStr}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : DAY_NAMES[d.getUTCDay()];
}

// Most-specific-wins over the sparse exception rows: specific course beats
// every-course, a time band beats whole day, and the day scope ladders
// specific DAY-OF-WEEK (e.g. 'sunday', user request 2026-09-28) > exact
// weekday/weekend > 'all'.
function pickRule(rules, courseId, dayType, timeMinutes, dayOfWeek = null) {
    let best = null;
    let bestScore = -1;
    for (const r of rules) {
        if (r.courseId && r.courseId !== courseId) continue;
        let scopeScore = 0;
        if (r.dayScope !== 'all') {
            if (r.dayScope === dayType) scopeScore = 1;
            else if (dayOfWeek && r.dayScope === dayOfWeek) scopeScore = 2;
            else continue;
        }
        if (r.startTime) {
            const s = toMinutes(r.startTime);
            const e = toMinutes(r.endTime);
            if (timeMinutes < s || timeMinutes >= e) continue;
        }
        const score = (r.courseId ? 8 : 0) + (r.startTime ? 4 : 0) + scopeScore;
        if (score > bestScore) {
            best = r;
            bestScore = score;
        }
    }
    return best;
}

function resolveMinPlayers(setting, rules, courseId, dayType, timeMinutes, dayOfWeek = null) {
    const rule = pickRule(rules, courseId, dayType, timeMinutes, dayOfWeek);
    if (rule) return rule.minPlayers;
    if (!setting) return 1;
    return dayType === 'weekend' ? setting.minPlayersWeekend : setting.minPlayersWeekday;
}

// { allowGuest, allowMemberGuest } for a flight - both true when the master
// switch is off.
function resolveGuestControl(setting, rules, courseId, dayType, timeMinutes, dayOfWeek = null) {
    if (!setting || setting.guestControlEnabled !== true) return { allowGuest: true, allowMemberGuest: true };
    const rule = pickRule(rules, courseId, dayType, timeMinutes, dayOfWeek);
    if (rule) return { allowGuest: rule.allowGuest === true, allowMemberGuest: rule.allowMemberGuest === true };
    return dayType === 'weekend'
        ? { allowGuest: setting.allowGuestWeekend === true, allowMemberGuest: setting.allowMemberGuestWeekend === true }
        : { allowGuest: setting.allowGuestWeekday === true, allowMemberGuest: setting.allowMemberGuestWeekday === true };
}

// ---- flight computation ----------------------------------------------------

// Seats left in a nine-cell under the merge rule; occ = { claims, players }.
function seatsLeft(allowMerge, occ, maxPlayers) {
    if (!occ) return maxPlayers;
    if (!allowMerge && occ.claims > 0) return 0;
    return Math.max(0, maxPlayers - occ.players);
}

// Every flight of ONE course/date that can take `players` more players for
// `holes`, from the computed grids in `ctx`. Returns { course, flights } or
// null when the course has no grid that day (no set / whole-day closure).
// `flights`: { teeTime, crossTime, seatsLeft, maxPlayers, isFrontDesk,
// existingPlayers, minPlayers } sorted by time.
async function courseFlights({ course, ctx, playDate, dayType, holes, players, setting, minRules, occ, locks }) {
    const day = ctx.byCourse.get(course.id);
    if (!day || !day.set || !day.slots.length) return null;
    const { slots } = day;
    const firstNineBlocks = ctx.nineBlocks.get(course.firstNineId);
    const mustPlay18 = day.set.mustPlay18Until ? toMinutes(day.set.mustPlay18Until) : null;
    const allowMerge = setting ? setting.allowBookingMerge === true : false;

    const flights = [];
    for (const slot of slots) {
        const t = toMinutes(slot.teeTime);
        // ENFORCED slot roles (2026-09-28): crossover-only slots exist purely
        // as second-nine LANDING times ("course closed for crossover"), and
        // front-desk-only slots take walk-ins at the counter - neither offers
        // NEW tee-offs to the booking channel. Both remain valid crossover
        // targets.
        if (slot.isCrossoverOnly === true || slot.isFrontDesk === true) continue;
        // 9-hole play is not offered while 18 holes are mandatory.
        if (holes === 9 && mustPlay18 !== null && t <= mustPlay18) continue;
        if (nineBlocked(firstNineBlocks, t)) continue;
        const startKey = nineKey(course.firstNineId, slot.teeTime);
        if (locks.has(startKey)) continue;
        const startOcc = occ.get(startKey);
        const startSeats = seatsLeft(allowMerge, startOcc, slot.maxPlayers);
        if (startSeats < players) continue;

        let crossTime = null;
        let crossSeats = Infinity;
        if (holes === 18) {
            const target = crossTarget(ctx, course, t);
            if (!target) continue; // crossover lands after the last flight
            const ct = toMinutes(target.slot.teeTime);
            if (crossBlocked(ctx, course, ct)) continue;
            const crossKey = nineKey(course.secondNineId, target.slot.teeTime);
            if (locks.has(crossKey)) continue;
            crossSeats = seatsLeft(allowMerge, occ.get(crossKey), target.slot.maxPlayers);
            if (crossSeats < players) continue;
            crossTime = hhmm(target.slot.teeTime);
        }

        const existingPlayers = (startOcc && startOcc.players) || 0;
        const minPlayers = resolveMinPlayers(setting, minRules, course.id, dayType, t, dayOfWeekOf(playDate));
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
// rule's evidence. Counted: profiles they made (bookerGolferId) and profiles
// where they appear as a 'member' player record; member-as-guest records are
// NOT counted, cancelled bookings free the day.
async function memberDayBookings(companyId, golferId, playDate, { transaction } = {}) {
    if (!golferId) return [];
    const asBooker = await BookingProfile.findAll({
        where: { companyId, playDate, status: 'booked', bookerGolferId: golferId },
        transaction,
    });
    const lines = await Player.findAll({
        where: {
            companyId,
            playDate,
            golferId,
            playerType: 'member',
            secondNineFlag: 0,
            bookingProfileId: { [Op.ne]: null },
            status: { [Op.in]: ACTIVE_PLAYER_STATUS_KEYS },
        },
        attributes: ['bookingProfileId'],
        transaction,
    });
    const seen = new Set(asBooker.map((b) => b.id));
    const ids = [...new Set(lines.map((l) => l.bookingProfileId))].filter((id) => !seen.has(id));
    // (No playDate filter on the id lookup: a group booking's header carries
    // only its FIRST play day, and its player rows already matched the date.)
    const asPlayer = ids.length
        ? await BookingProfile.findAll({ where: { companyId, status: 'booked', id: { [Op.in]: ids } }, transaction })
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
    nineKey,
    clubNow,
    addDays,
    dayOfWeekOf,
    bookingWindow,
    resolveTeeTimeSet,
    closureBlocks,
    nineBlocked,
    dayContext,
    groupHolds,
    crossTarget,
    crossTargetFrom,
    crossBlocked,
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
