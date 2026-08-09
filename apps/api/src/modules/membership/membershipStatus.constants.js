// Fixed domain vocabularies for a Membership Status master record.
//
// Each value is stored as its stable `key` (e.g. 'active', 'warning-no-charge');
// the UI maps the key to a display label. These lists are the single source of
// truth: the API validates create/update against them AND serves them to the
// screen's dropdowns (GET /api/membership/statuses/meta), so the two never drift.

// Lifecycle class a status maps to. Drives standing/entitlement logic later
// (e.g. Golf/Facility can ask "is this member in an 'active' class?").
const STATUS_CLASSES = [
    { key: 'active', label: 'Active' },
    { key: 'provisional', label: 'Provisional' },
    { key: 'resigned', label: 'Resigned' },
    { key: 'decease', label: 'Decease' },
    { key: 'terminate', label: 'Terminate' },
    { key: 'absent', label: 'Absent' },
    { key: 'suspend', label: 'Suspend' },
    { key: 'defaulter', label: 'Defaulter' },
    { key: 'expired', label: 'Expired' },
    { key: 'active-absent', label: 'Active (Absent)' },
];

// The old single "System control" conflated two orthogonal questions (the
// composite 'warning-no-charge' value was the tell), so it was SPLIT
// (user decision 2026-08-09) into the two vocabularies below. The legacy
// column/backfill mapping lives in LEGACY_SYSTEM_CONTROL_SPLIT.

// ACTION control - what the system does when a member carrying this status
// ACTS in a frontend module (registration, booking, check-in).
// 'warning' proceeds but alerts the operator.
const ACTION_CONTROLS = [
    { key: 'allow', label: 'Allow' },
    { key: 'warning', label: 'Warning' },
    { key: 'barred', label: 'Barred' },
];

// CHARGE control - what the system does when the member CHARGES TO ACCOUNT at
// settlement (cash/card settlement is never checked). 'warning' alerts the
// operator but still posts - the advisory stage before a club converts the
// member to a truly barred status; 'barred' refuses the posting. The AR
// credit-headroom check runs AFTER this, in the authorizeCharge seam.
const CHARGE_CONTROLS = [
    { key: 'allow', label: 'Allow' },
    { key: 'warning', label: 'Warning' },
    { key: 'barred', label: 'Barred' },
];

// How the retired systemControl values split across the two axes (boot
// backfill in app.js). Legacy 'warning' warned at charging (the legacy field
// WAS the charges control), so it lands as warning on BOTH axes.
const LEGACY_SYSTEM_CONTROL_SPLIT = {
    allow: { action: 'allow', charge: 'allow' },
    warning: { action: 'warning', charge: 'warning' },
    'warning-no-charge': { action: 'warning', charge: 'barred' },
    barred: { action: 'barred', charge: 'barred' },
};

const STATUS_CLASS_KEYS = STATUS_CLASSES.map((c) => c.key);
const ACTION_CONTROL_KEYS = ACTION_CONTROLS.map((c) => c.key);
const CHARGE_CONTROL_KEYS = CHARGE_CONTROLS.map((c) => c.key);

module.exports = {
    STATUS_CLASSES,
    STATUS_CLASS_KEYS,
    ACTION_CONTROLS,
    ACTION_CONTROL_KEYS,
    CHARGE_CONTROLS,
    CHARGE_CONTROL_KEYS,
    LEGACY_SYSTEM_CONTROL_SPLIT,
};
