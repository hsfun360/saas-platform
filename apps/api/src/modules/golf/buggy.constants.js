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

// --- maintenance (slice 2, user decisions 2026-10-18) ---

// One job on one unit: a routine service, a repair (a fault or damage), or
// the safety inspection (the spec's 安检 five-system checklist).
const MAINTENANCE_KINDS = [
    { key: 'service', label: 'Service' },
    { key: 'repair', label: 'Repair' },
    { key: 'inspection', label: 'Inspection' },
];
const MAINTENANCE_KIND_KEYS = MAINTENANCE_KINDS.map((k) => k.key);
const MAINTENANCE_STATUSES = [
    { key: 'open', label: 'Open' },
    { key: 'done', label: 'Done' },
];
const MAINTENANCE_STATUS_KEYS = MAINTENANCE_STATUSES.map((s) => s.key);
// How the job was raised: keyed by hand, by a fault / damaged return at the
// station, or by an inspection that found a fault.
const MAINTENANCE_SOURCES = [
    { key: 'manual', label: 'Keyed' },
    { key: 'station-return', label: 'Station return' },
    { key: 'inspection', label: 'Inspection' },
];
const MAINTENANCE_SOURCE_KEYS = MAINTENANCE_SOURCES.map((s) => s.key);
// The inspection checklist (spec 球车安检): steering, brakes, electrical,
// drive, body - each ok or faulty.
const INSPECTION_SYSTEMS = [
    { key: 'steeringOk', label: 'Steering' },
    { key: 'brakesOk', label: 'Brakes' },
    { key: 'electricalOk', label: 'Electrical' },
    { key: 'driveOk', label: 'Drive' },
    { key: 'bodyOk', label: 'Body' },
];
const INSPECTION_SYSTEM_KEYS = INSPECTION_SYSTEMS.map((s) => s.key);
// Who or what damaged the unit (spec 损坏原因所属的类型). Compensation stays
// OUTSIDE the system (user decision 2026-10-18): the record is the register.
const DAMAGE_REASON_TYPES = [
    { key: 'player', label: 'Player' },
    { key: 'staff', label: 'Staff' },
    { key: 'non-human', label: 'Not caused by a person' },
];
const DAMAGE_REASON_TYPE_KEYS = DAMAGE_REASON_TYPES.map((r) => r.key);

module.exports = {
    BUGGY_STATUSES, BUGGY_STATUS_KEYS,
    BUGGY_LOCATIONS, BUGGY_LOCATION_KEYS,
    ISSUE_STATUSES, ISSUE_STATUS_KEYS,
    CONDITIONS_OUT, CONDITION_OUT_KEYS,
    CONDITIONS_IN, CONDITION_IN_KEYS,
    MIN_SEATS, MAX_SEATS,
    MAINTENANCE_KINDS, MAINTENANCE_KIND_KEYS,
    MAINTENANCE_STATUSES, MAINTENANCE_STATUS_KEYS,
    MAINTENANCE_SOURCES, MAINTENANCE_SOURCE_KEYS,
    INSPECTION_SYSTEMS, INSPECTION_SYSTEM_KEYS,
    DAMAGE_REASON_TYPES, DAMAGE_REASON_TYPE_KEYS,
};
