// The PURE booking rules of Facility Management (approved 2026-10-25, the nine
// binding rules of the spec). No database access: the controller loads the
// facts (setting, type, rules, counts, the club clock) and asks here, so each
// rule is unit-tested on its own and the same verdict serves the grid, the
// claim and the save. Times are 'HH:MM[:SS]' strings or minutes since midnight.

const { toMinutes } = require('./facilityShared');

const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function hhmm(t) {
    return t ? String(t).slice(0, 5) : null;
}

function addDays(dateStr, days) {
    const t = new Date(`${dateStr}T00:00:00Z`).getTime() + days * 86400000;
    return new Date(t).toISOString().slice(0, 10);
}

// Whole days from `from` to `to` ('YYYY-MM-DD'), negative when `to` is earlier.
function daysBetween(from, to) {
    return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000);
}

// 'monday' .. 'sunday' of a 'YYYY-MM-DD' date.
function weekdayKeyOf(dateStr) {
    return WEEKDAY_KEYS[new Date(`${dateStr}T00:00:00Z`).getUTCDay()];
}

// 'now' in the club's IANA timezone as { date: 'YYYY-MM-DD', time: 'HH:MM' }.
function clubNow(timezone, at = new Date()) {
    const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone || 'UTC',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
    const parts = {};
    for (const p of fmt.formatToParts(at)) parts[p.type] = p.value;
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

// ---- rule 1: the booking window -------------------------------------------

// Effective advance days: membership-type override (when the Specification
// switch is ON and the member's type has one) > the Facility Type's own days
// > the general Specification days.
function effectiveAdvanceDays({ setting, type, overrideDays }) {
    if (setting && setting.allowMembershipTypeOverride && overrideDays != null) return Number(overrideDays);
    if (type && type.advanceBookingDays != null) return Number(type.advanceBookingDays);
    return setting ? Number(setting.advanceBookingDays) : 7;
}

// The bookable date range: date D opens at 00:00 of (D - effectiveDays) minus
// the early-opening hours, club-local - so dateTo = today + effectiveDays, one
// more once the local clock passes (24:00 - hours). Same-day booking OFF
// starts the window tomorrow (today is the station's).
function bookingWindow({ now, effectiveDays, hours, allowSameDay }) {
    let dateTo = addDays(now.date, effectiveDays);
    if (hours > 0 && toMinutes(now.time) >= (24 - hours) * 60) dateTo = addDays(dateTo, 1);
    const dateFrom = allowSameDay ? now.date : addDays(now.date, 1);
    return { dateFrom, dateTo };
}

function windowVerdict(window, date) {
    if (date < window.dateFrom) return window.dateFrom === addDays(date, 1) ? 'Same-day booking is off - today is front-desk registration only.' : `Date ${date} is in the past.`;
    if (date > window.dateTo) return `Date ${date} is outside the booking window (bookable up to ${window.dateTo}).`;
    return null;
}

// ---- slot set in force ----------------------------------------------------

// Active set, dayScope matching (the exact day type preferred over 'all'),
// latest effectiveDate on or before the date.
function pickSlotSet(sets, dayType, date) {
    const live = (sets || [])
        .filter((s) => s.isActive !== false && String(s.effectiveDate) <= date && ['all', dayType].includes(s.dayScope))
        .sort((a, b) => (String(a.effectiveDate) < String(b.effectiveDate) ? 1 : String(a.effectiveDate) > String(b.effectiveDate) ? -1 : 0));
    return live.find((s) => s.dayScope === dayType) || live.find((s) => s.dayScope === 'all') || null;
}

// ---- rule 6: closures -----------------------------------------------------

// `blocks` = [{ start, end }] in minutes, both null = the whole day. A slot is
// blocked when its [start, end) overlaps a block.
function isBlocked(blocks, startMin, endMin) {
    for (const b of blocks || []) {
        if (b.start == null && b.end == null) return true;
        const bs = b.start == null ? 0 : b.start;
        const be = b.end == null ? 24 * 60 : b.end;
        if (startMin < be && endMin > bs) return true;
    }
    return false;
}

// ---- rule 3: consecutive slots on one facility ----------------------------

// `slotNumbers` of ONE facility: must be adjacent and at most maxConsecutive
// (0 = no cap). Returns an error message or null.
function checkRun(slotNumbers, maxConsecutive) {
    const nums = [...new Set(slotNumbers.map(Number))].sort((a, b) => a - b);
    if (!nums.length) return 'Pick at least one slot.';
    for (let i = 1; i < nums.length; i += 1) {
        if (nums[i] !== nums[i - 1] + 1) return 'The slots of one booking must be consecutive.';
    }
    if (maxConsecutive > 0 && nums.length > maxConsecutive) return `At most ${maxConsecutive} consecutive slot${maxConsecutive === 1 ? '' : 's'} per booking.`;
    return null;
}

// ---- rule 4: participants per slot ----------------------------------------

function checkParticipantCount(count, type) {
    const min = Number(type.minParticipants || 0);
    const max = type.maxParticipants == null ? null : Number(type.maxParticipants);
    if (min > 0 && count < min) return `At least ${min} participant${min === 1 ? '' : 's'} per slot.`;
    if (max != null && count > max) return `At most ${max} participant${max === 1 ? '' : 's'} per slot.`;
    return null;
}

// ---- rule 2: slots per day per person -------------------------------------

// `held` = the slots of the type the person already holds that day, `adding`
// = this booking's slots; `limit` 0 = no cap.
function checkDailyLimit({ held, adding, limit, name, dayType }) {
    if (!limit || limit <= 0) return null;
    if (held + adding > limit) {
        const label = dayType === 'weekend' ? 'weekend' : 'weekday';
        return `${name} would hold ${held + adding} slots that day - the ${label} limit is ${limit}${held ? ` (already holding ${held})` : ''}.`;
    }
    return null;
}

// ---- rule 5: guest control ------------------------------------------------

// Rank of an exception row for a date: a specific weekday beats weekday /
// weekend, which beat 'all'; a type-specific row beats a general one; a row
// with a time window must contain the slot start. Returns -1 when the row
// does not apply.
function guestRuleRank(rule, { facilityTypeId, dayType, weekdayKey, startMin }) {
    if (rule.facilityTypeId && rule.facilityTypeId !== facilityTypeId) return -1;
    let dayRank;
    if (rule.dayScope === weekdayKey) dayRank = 2;
    else if (rule.dayScope === dayType) dayRank = 1;
    else if (rule.dayScope === 'all') dayRank = 0;
    else return -1;
    if (rule.startTime || rule.endTime) {
        const s = rule.startTime ? toMinutes(rule.startTime) : 0;
        const e = rule.endTime ? toMinutes(rule.endTime) : 24 * 60;
        if (startMin < s || startMin >= e) return -1;
    }
    return dayRank * 4 + (rule.facilityTypeId ? 2 : 0) + (rule.startTime || rule.endTime ? 1 : 0);
}

// The guest verdict for one slot start: the most specific matching exception
// row decides; with none, the type's policy AND the general day-type flags
// both have to allow (the type can only tighten the club rule). With guest
// control OFF everything is allowed.
function resolveGuestRule({ setting, type, rules, facilityTypeId, dayType, date, startTime }) {
    if (!setting || !setting.guestControlEnabled) return { allowGuest: true, allowMemberGuest: true, source: 'off' };
    const weekdayKey = weekdayKeyOf(date);
    const startMin = toMinutes(startTime);
    let best = null;
    let bestRank = -1;
    for (const r of rules || []) {
        const rank = guestRuleRank(r, { facilityTypeId, dayType, weekdayKey, startMin });
        if (rank > bestRank) { best = r; bestRank = rank; }
    }
    if (best) return { allowGuest: best.allowGuest === true, allowMemberGuest: best.allowMemberGuest === true, source: 'exception' };
    const general = dayType === 'weekend'
        ? { guest: setting.allowGuestWeekend !== false, memberGuest: setting.allowMemberGuestWeekend !== false }
        : { guest: setting.allowGuestWeekday !== false, memberGuest: setting.allowMemberGuestWeekday !== false };
    return {
        allowGuest: general.guest && (!type || type.guestsAllowed !== false),
        allowMemberGuest: general.memberGuest && (!type || type.memberGuestsAllowed !== false),
        source: 'policy',
    };
}

// ---- sessions ---------------------------------------------------------------

// The Facility Session a slot start falls in ([start, end)), or null.
function sessionOf(sessions, startTime) {
    const m = toMinutes(startTime);
    return (sessions || []).find((s) => toMinutes(s.startTime) <= m && m < toMinutes(s.endTime)) || null;
}

// ---- rule 8: late cancellation --------------------------------------------

// Minutes from the club clock `now` to the first slot's start.
function minutesUntil(now, bookingDate, startTime) {
    return daysBetween(now.date, bookingDate) * 1440 + toMinutes(startTime) - toMinutes(now.time);
}

// Late when no-show control is ON and the cancel lands inside the notice
// window (or after the start). { controlled, late, noticeHours, minutesLeft }.
function cancelVerdict({ setting, now, bookingDate, startTime }) {
    const controlled = !!(setting && setting.noShowControlEnabled);
    const noticeHours = setting ? Number(setting.cancellationNoticeHours || 0) : 0;
    const minutesLeft = minutesUntil(now, bookingDate, startTime);
    return { controlled, late: controlled && minutesLeft < noticeHours * 60, noticeHours, minutesLeft };
}

// A slot whose start is at or before the club clock on its date is past.
function isPast(now, bookingDate, startTime) {
    return minutesUntil(now, bookingDate, startTime) <= 0;
}

module.exports = {
    hhmm, addDays, daysBetween, weekdayKeyOf, clubNow,
    effectiveAdvanceDays, bookingWindow, windowVerdict,
    pickSlotSet, isBlocked, checkRun, checkParticipantCount, checkDailyLimit,
    guestRuleRank, resolveGuestRule, sessionOf, minutesUntil, cancelVerdict, isPast,
};
