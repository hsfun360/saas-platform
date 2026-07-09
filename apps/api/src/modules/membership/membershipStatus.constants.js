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

// What the system does to a member carrying this status.
const SYSTEM_CONTROLS = [
    { key: 'barred', label: 'Barred' },                          // block all activity
    { key: 'allow', label: 'Allow' },                            // full access
    { key: 'warning', label: 'Warning' },                        // warn, still allow
    { key: 'warning-no-charge', label: 'Warning (No-charge)' },  // warn + no posting/charging
];

const STATUS_CLASS_KEYS = STATUS_CLASSES.map((c) => c.key);
const SYSTEM_CONTROL_KEYS = SYSTEM_CONTROLS.map((c) => c.key);

module.exports = { STATUS_CLASSES, SYSTEM_CONTROLS, STATUS_CLASS_KEYS, SYSTEM_CONTROL_KEYS };
