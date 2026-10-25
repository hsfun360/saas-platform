// Fixed vocabularies of Facility Management (slice 1, approved 2026-10-25).
// Served via GET /api/facility/meta so the screens never hard-code them, and
// validated against here.

// USAGE MODE of a Facility Type (user decision 2026-10-24: exactly three) -
// drives which rule groups apply and how the station treats the facility.
const USAGE_MODES = [
    { key: 'slot', label: 'Time slot booking', hint: 'Courts and halls booked by fixed time slot from the type\'s slot set.' },
    { key: 'entry', label: 'Entry registration', hint: 'Gym and pool: register on arrival, optional capacity.' },
    { key: 'issue', label: 'Issue and return', hint: 'Lockers (numbered units) and towels (counted) issued at the control station.' },
];
const USAGE_MODE_KEYS = USAGE_MODES.map((m) => m.key);

// Which days a slot set or closure plan applies to. Day classification comes
// from Company Weekend Days + Public Holidays through platform/calendarGateway.js;
// PUBLIC HOLIDAYS ARE TREATED AS WEEKEND by platform business rule.
const DAY_SCOPES = [
    { key: 'all', label: 'All days' },
    { key: 'weekday', label: 'Weekdays' },
    { key: 'weekend', label: 'Weekends' },
];
const DAY_SCOPE_KEYS = DAY_SCOPES.map((s) => s.key);

// Ceilings shared by the controllers and the slot service.
const LIMITS = {
    maxSlotsPerSet: 200,
    slotMinutesMin: 15,
    slotMinutesMax: 240,
    maxClosureRangeDays: 366,
    maxSessions: 20,
};

module.exports = { USAGE_MODES, USAGE_MODE_KEYS, DAY_SCOPES, DAY_SCOPE_KEYS, LIMITS };
