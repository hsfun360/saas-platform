// Fixed vocabulary for a course's tee-time sets.
//
// Which days a tee-time set applies to. Day classification comes from platform
// data the subscriber already maintains - Company Weekend Days decides weekday
// vs weekend - and PUBLIC HOLIDAYS ARE TREATED AS WEEKEND by business rule
// (user decision 2026-07-14), so there is no separate holiday scope and no
// legacy Date Type master file.
const DAY_SCOPES = [
    { key: 'all', label: 'All days' },
    { key: 'weekday', label: 'Weekdays' },
    { key: 'weekend', label: 'Weekends' },
];

const DAY_SCOPE_KEYS = DAY_SCOPES.map((s) => s.key);

module.exports = { DAY_SCOPES, DAY_SCOPE_KEYS };
