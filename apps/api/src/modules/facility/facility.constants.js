// Fixed vocabularies of Facility Management (slice 1 approved 2026-10-25,
// slice 2 structures approved 2026-10-25). Served via GET /api/facility/meta
// and the catalog /meta endpoints so the screens never hard-code them, and
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

// Day scopes of the guest-control EXCEPTION rows: the pair above plus a
// specific day of the week (a Sunday guest ban). Resolution ladders specific
// day > weekday/weekend > all.
const RULE_DAY_SCOPE_KEYS = ['all', 'weekday', 'weekend', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// ---- slice 2 ----

// The thin identity's profile kind (facility.Patron.patronType).
const PATRON_TYPES = [
    { key: 'member', label: 'Member' },
    { key: 'other', label: 'Visitor' },
];
const PATRON_TYPE_KEYS = PATRON_TYPES.map((p) => p.key);

// Participant Type base identities - the engine class a club-defined type
// behaves as (the three system codes are the keys themselves).
const BASE_IDENTITIES = [
    { key: 'member', label: 'Member' },
    { key: 'member-guest', label: 'Member as Guest' },
    { key: 'guest', label: 'Guest / Visitor' },
];
const BASE_IDENTITY_KEYS = BASE_IDENTITIES.map((b) => b.key);

// The three SYSTEM participant types every company is seeded with (codes
// locked, descriptions editable).
const SYSTEM_PARTICIPANT_TYPES = [
    { code: 'member', description: 'Member', baseIdentity: 'member', sortOrder: 1 },
    { code: 'member-guest', description: 'Member as Guest', baseIdentity: 'member-guest', sortOrder: 2 },
    { code: 'guest', description: 'Guest / Visitor', baseIdentity: 'guest', sortOrder: 3 },
];

// Transaction Type charge types. Packages and deposits keep their keys so the
// vocabulary never changes, but are not built in slice 2.
const CHARGE_TYPES = [
    { key: 'facility-fee', label: 'Facility Fee' },
    { key: 'guest-fee', label: 'Guest Fee' },
    { key: 'issue-fee', label: 'Issue Fee' },
    { key: 'class-fee', label: 'Class Fee' },
    { key: 'no-show', label: 'No Show Charges' },
    { key: 'miscellaneous', label: 'Miscellaneous' },
    { key: 'package', label: 'Package' },
    { key: 'deposit', label: 'Deposit' },
];
const CHARGE_TYPE_KEYS = CHARGE_TYPES.map((c) => c.key);
// Charge types priced by the participant x day scope x session CELL matrix;
// the rest take one flat amount per card.
const MATRIX_CHARGE_TYPE_KEYS = ['facility-fee', 'guest-fee'];
// Charge types that may name the participant category they are the DEFAULT
// (auto-charged) item for.
const DEFAULT_TYPED_CHARGE_TYPE_KEYS = ['facility-fee', 'guest-fee'];
// Charge types not yet built: refused at create until their slice lands.
const RESERVED_CHARGE_TYPE_KEYS = ['package', 'deposit'];

// How many lines a transaction type produces on a bill.
const FEE_BASES = [
    { key: 'per-slot', label: 'Per slot', hint: 'One line per reserved slot - court or hall hire.' },
    { key: 'per-participant', label: 'Per participant', hint: 'One line per matching participant - a guest fee.' },
    { key: 'per-booking', label: 'Per booking', hint: 'One line per booking - a deposit or a booking charge.' },
];
const FEE_BASIS_KEYS = FEE_BASES.map((f) => f.key);

// Payment Type classes (golf's minus deposit and rain check).
const PAYMENT_CLASSES = [
    { key: 'cash', label: 'Cash' },
    { key: 'creditcard', label: 'Credit Card' },
    { key: 'member', label: 'Member' },
    { key: 'debtor', label: 'Debtor' },
    { key: 'voucher', label: 'Voucher' },
    { key: 'staff', label: 'Staff' },
    { key: 'online', label: 'Online' },
    { key: 'suspend', label: 'Suspend' },
];
const PAYMENT_CLASS_KEYS = PAYMENT_CLASSES.map((c) => c.key);
const ACCOUNT_PAYMENT_CLASSES = ['member', 'debtor'];

// Ceilings shared by the controllers and the slot service.
const LIMITS = {
    maxSlotsPerSet: 200,
    slotMinutesMin: 15,
    slotMinutesMax: 240,
    maxClosureRangeDays: 366,
    maxSessions: 20,
    maxRateCells: 400,
    maxGuestRules: 200,
    maxOverrides: 100,
};

module.exports = {
    USAGE_MODES, USAGE_MODE_KEYS, DAY_SCOPES, DAY_SCOPE_KEYS, RULE_DAY_SCOPE_KEYS, LIMITS,
    PATRON_TYPES, PATRON_TYPE_KEYS,
    BASE_IDENTITIES, BASE_IDENTITY_KEYS, SYSTEM_PARTICIPANT_TYPES,
    CHARGE_TYPES, CHARGE_TYPE_KEYS, MATRIX_CHARGE_TYPE_KEYS, DEFAULT_TYPED_CHARGE_TYPE_KEYS, RESERVED_CHARGE_TYPE_KEYS,
    FEE_BASES, FEE_BASIS_KEYS,
    PAYMENT_CLASSES, PAYMENT_CLASS_KEYS, ACCOUNT_PAYMENT_CLASSES,
};
