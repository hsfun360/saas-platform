// Fixed vocabularies of BUGGY MANAGEMENT (Mission Hills spec 2.1 triaged
// 2026-10-17; user decisions: one fleet per club, no depots / transfers /
// loans / engineers / parts; condition and damage reason are vocabularies,
// not masters). Served through the buggy and station /meta endpoints and
// validated on the server.

// The register's lifecycle: an active unit can be issued; a retired unit is
// history (never deleted while it has outings).
const BUGGY_STATUSES = [
    { key: 'active', label: 'Active' },
    { key: 'retired', label: 'Retired' },
];
const BUGGY_STATUS_KEYS = BUGGY_STATUSES.map((s) => s.key);

// Where the unit is right now - SYSTEM-MAINTAINED (the spec's 出入库状态):
// issue moves it on course, return brings it back, a maintenance record
// (slice 2) parks it.
const BUGGY_LOCATIONS = [
    { key: 'in-depot', label: 'In depot' },
    { key: 'on-course', label: 'On course' },
    { key: 'maintenance', label: 'In maintenance' },
];
const BUGGY_LOCATION_KEYS = BUGGY_LOCATIONS.map((l) => l.key);

// One outing of one unit.
const ISSUE_STATUSES = [
    { key: 'out', label: 'Out' },
    { key: 'returned', label: 'Returned' },
    { key: 'swapped', label: 'Swapped' },
];
const ISSUE_STATUS_KEYS = ISSUE_STATUSES.map((s) => s.key);

// Condition at issue and at return (the spec's 球车状况 master, collapsed to
// a vocabulary): a 'damaged' return is what slice 2's damage record hangs on.
const CONDITIONS_OUT = [
    { key: 'good', label: 'Good' },
    { key: 'fault', label: 'Fault noted' },
];
const CONDITION_OUT_KEYS = CONDITIONS_OUT.map((c) => c.key);
const CONDITIONS_IN = [
    { key: 'good', label: 'Good' },
    { key: 'fault', label: 'Fault' },
    { key: 'damaged', label: 'Damaged' },
];
const CONDITION_IN_KEYS = CONDITIONS_IN.map((c) => c.key);

// A buggy type's seats: 1-6 (two-seaters are the norm).
const MIN_SEATS = 1;
const MAX_SEATS = 6;

module.exports = {
    BUGGY_STATUSES, BUGGY_STATUS_KEYS,
    BUGGY_LOCATIONS, BUGGY_LOCATION_KEYS,
    ISSUE_STATUSES, ISSUE_STATUS_KEYS,
    CONDITIONS_OUT, CONDITION_OUT_KEYS,
    CONDITIONS_IN, CONDITION_IN_KEYS,
    MIN_SEATS, MAX_SEATS,
};
