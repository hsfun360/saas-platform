// Fixed vocabularies of CADDY MANAGEMENT (Mission Hills spec 球僮 v3.0 +
// the starter-hut spec, triaged 2026-10-17; user decisions: caddies may be
// SHARED between two golfers, the club's pay to the caddy stays OUTSIDE the
// system but every round of service is tracked, nationality and race stay on
// the profile). Served through the caddy /meta endpoints and validated on
// the server.

// The register lifecycle: active caddies roster and take flights; inactive
// ones (left, long absence) keep their history; a blacklisted one is kept so
// the badge number is never reissued.
const CADDY_STATUSES = [
    { key: 'active', label: 'Active' },
    { key: 'inactive', label: 'Inactive' },
    { key: 'blacklisted', label: 'Blacklisted' },
];
const CADDY_STATUS_KEYS = CADDY_STATUSES.map((s) => s.key);

// Leave categories (spec 2.1.5 假别 + 2.2.1 工伤 collapsed to a vocabulary);
// a caddy on leave or injured is not rostered or assigned for those dates.
const LEAVE_TYPES = [
    { key: 'annual', label: 'Annual leave' },
    { key: 'sick', label: 'Sick leave' },
    { key: 'injury', label: 'Injury' },
    { key: 'unpaid', label: 'Unpaid leave' },
    { key: 'other', label: 'Other' },
];
const LEAVE_TYPE_KEYS = LEAVE_TYPES.map((l) => l.key);

// Notes on a caddy's record (the spec's evaluation + reward/penalty masters
// merged): each carries signed points for the grade review.
const NOTE_KINDS = [
    { key: 'commendation', label: 'Commendation' },
    { key: 'complaint', label: 'Complaint' },
    { key: 'penalty', label: 'Penalty' },
    { key: 'evaluation', label: 'Evaluation' },
];
const NOTE_KIND_KEYS = NOTE_KINDS.map((k) => k.key);

const GENDERS = [
    { key: 'male', label: 'Male' },
    { key: 'female', label: 'Female' },
];
const GENDER_KEYS = GENDERS.map((g) => g.key);

// Golfers one caddy of a grade serves at once (1 = one bag, 2 = a shared caddy).
const MIN_PLAYERS_PER_CADDY = 1;
const MAX_PLAYERS_PER_CADDY = 4;

module.exports = {
    CADDY_STATUSES, CADDY_STATUS_KEYS,
    LEAVE_TYPES, LEAVE_TYPE_KEYS,
    NOTE_KINDS, NOTE_KIND_KEYS,
    GENDERS, GENDER_KEYS,
    MIN_PLAYERS_PER_CADDY, MAX_PLAYERS_PER_CADDY,
};
