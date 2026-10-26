// Fixed vocabularies of the Control Station (structures approved 2026-10-26,
// slice 3). Served through GET /api/facility/station/meta and validated here.

const REGISTRATION_STATUSES = [
    { key: 'in', label: 'In' },
    { key: 'out', label: 'Out' },
];
const REGISTRATION_STATUS_KEYS = REGISTRATION_STATUSES.map((s) => s.key);

const ISSUE_STATUSES = [
    { key: 'issued', label: 'Issued' },
    { key: 'returned', label: 'Returned' },
    { key: 'lost', label: 'Lost' },
];
const ISSUE_STATUS_KEYS = ISSUE_STATUSES.map((s) => s.key);

const RETURN_CONDITIONS = [
    { key: 'good', label: 'Good' },
    { key: 'damaged', label: 'Damaged' },
    { key: 'lost', label: 'Lost' },
];
const RETURN_CONDITION_KEYS = RETURN_CONDITIONS.map((c) => c.key);

// Issue-mode units with trackUnits ON.
const UNIT_STATUSES = [
    { key: 'available', label: 'Available' },
    { key: 'issued', label: 'Issued' },
    { key: 'out-of-service', label: 'Out of service' },
];
const UNIT_STATUS_KEYS = UNIT_STATUSES.map((s) => s.key);

// The check-in state of a booked slot by the club clock.
const CHECK_IN_STATES = ['early', 'open', 'closed', 'checked-in'];

const STATION_LIMITS = {
    maxGuestsPerRegistration: 50,
    maxIssueQuantity: 500,
};

module.exports = {
    REGISTRATION_STATUSES, REGISTRATION_STATUS_KEYS,
    ISSUE_STATUSES, ISSUE_STATUS_KEYS,
    RETURN_CONDITIONS, RETURN_CONDITION_KEYS,
    UNIT_STATUSES, UNIT_STATUS_KEYS,
    CHECK_IN_STATES, STATION_LIMITS,
};
