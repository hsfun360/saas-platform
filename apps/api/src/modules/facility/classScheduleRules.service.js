// Facility classes - the PURE scheduling rules (slice 5a, structures approved
// 2026-10-26): no DB, unit-tested. The schedule header expands onto its ISO
// weekdays, public holidays and closure days are SKIPPED, and anything
// already taken in the time range (the venue, the venue's slot-type unit -
// a court is whole - the unit's live bookings, the instructor) is a
// CONFLICT. classSchedule.service.js loads the facts and calls these.

const { isoDayOfWeek } = require('../../platform/calendarGateway');
const { toMinutes } = require('./facilityShared');

// Two [start, end) minute bands overlap.
function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
}

// 'HH:MM' from a TIME value or an 'HH:MM[:SS]' string.
function hhmm(t) {
    return t ? String(t).slice(0, 5) : null;
}

// The ISO weekday list of a schedule: unique integers 1..7 in order, or null
// when anything is off.
function normalizeWeekdays(raw) {
    if (!Array.isArray(raw) || !raw.length) return null;
    const out = [];
    for (const v of raw) {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1 || n > 7) return null;
        if (!out.includes(n)) out.push(n);
    }
    return out.sort((a, b) => a - b);
}

// A venue blocks its unit only when the unit is a slot-type one.
function venueBlocksUnit(venue) {
    const unit = venue && (venue.Facility || venue.facility);
    const type = unit && (unit.FacilityType || unit.facilityType);
    return !!(unit && type && type.usageMode === 'slot');
}

// The dates a header runs on: one row per classified date whose ISO weekday
// is on the list; public holidays are SKIPPED when the header says so.
function expandDates({ classified, weekdays, skipPublicHolidays }) {
    return classified
        .filter((d) => weekdays.includes(isoDayOfWeek(d.date)))
        .map((d) => (skipPublicHolidays && d.isHoliday
            ? { date: d.date, dayType: d.dayType, isHoliday: true, status: 'skipped', reason: 'Public holiday' }
            : { date: d.date, dayType: d.dayType, isHoliday: d.isHoliday === true, status: 'ok', reason: null }));
}

// Mark SKIPPED the rows whose date is closed for the whole day or for a band
// overlapping the session's times. `closed` is Map(date -> [{ start, end,
// label }]) in minutes, start/end null = whole day.
function applyClosures(rows, closed, { startTime, endTime }) {
    const s = toMinutes(startTime);
    const e = toMinutes(endTime);
    return rows.map((r) => {
        if (r.status !== 'ok') return r;
        const blocks = closed.get(r.date) || [];
        const hit = blocks.find((b) => b.start === null || overlaps(s, e, b.start, b.end));
        return hit ? { ...r, status: 'skipped', reason: `Closed${hit.label ? ' - ' + hit.label : ''}` } : r;
    });
}

// Mark CONFLICT the rows where something is already taken in the session's
// times. `taken` holds lists of { date, start, end, label } in minutes:
// `venue` (sessions on the same venue), `unit` (sessions of other venues on
// the same slot-type unit), `bookings` (live booking slots on that unit) and
// `instructor` (the instructor's other sessions).
function applyConflicts(rows, taken, { startTime, endTime }) {
    const s = toMinutes(startTime);
    const e = toMinutes(endTime);
    const find = (list, date) => (list || []).find((t) => t.date === date && overlaps(s, e, t.start, t.end));
    return rows.map((r) => {
        if (r.status !== 'ok') return r;
        const v = find(taken.venue, r.date);
        if (v) return { ...r, status: 'conflict', reason: `Venue taken by ${v.label}` };
        const u = find(taken.unit, r.date);
        if (u) return { ...r, status: 'conflict', reason: `Court taken by ${u.label}` };
        const b = find(taken.bookings, r.date);
        if (b) return { ...r, status: 'conflict', reason: `Booked - ${b.label}` };
        const i = find(taken.instructor, r.date);
        if (i) return { ...r, status: 'conflict', reason: `Instructor on ${i.label}` };
        return r;
    });
}

// The venue, instructor and capacity a schedule's sessions take: the header
// first, then the class default, the capacity capped by the venue's.
// Returns { error } or { venueId, instructorId, capacity }.
function resolveFacts({ cls, header, venue }) {
    const venueId = header.venueId || (cls && cls.venueId) || null;
    if (!venueId) return { error: 'Pick a venue - the class has no default venue.' };
    const instructorId = header.instructorId || (cls && cls.instructorId) || null;
    if (!instructorId) return { error: 'Pick an instructor - the class has no default instructor.' };
    const venueCap = venue ? Number(venue.capacity) : null;
    let capacity = header.capacity != null ? Number(header.capacity) : (cls && cls.capacity != null ? Number(cls.capacity) : venueCap);
    if (capacity == null) return { error: 'Set the capacity - the venue has none.' };
    if (venueCap != null && capacity > venueCap) return { error: `Capacity ${capacity} exceeds the venue's ${venueCap}.` };
    return { venueId, instructorId, capacity };
}

// Count the preview outcomes.
function summarize(rows) {
    const out = { ok: 0, skipped: 0, conflict: 0 };
    for (const r of rows) out[r.status] = (out[r.status] || 0) + 1;
    return out;
}

// The class block (if any) covering a slot on a unit.
function classBlockAt(blocks, start, end) {
    return (blocks || []).find((b) => overlaps(start, end, b.start, b.end)) || null;
}

module.exports = { overlaps, hhmm, normalizeWeekdays, venueBlocksUnit, expandDates, applyClosures, applyConflicts, resolveFacts, summarize, classBlockAt };
