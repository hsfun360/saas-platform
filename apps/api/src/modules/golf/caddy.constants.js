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

// --- the Caddy Station (slice 2, user decisions 2026-10-17) ---

// A caddy's day: checked in and waiting in the queue, out on the course, or
// checked out for the day.
const ATTENDANCE_STATUSES = [
    { key: 'present', label: 'Present' },
    { key: 'out', label: 'On course' },
    { key: 'off', label: 'Checked out' },
];
const ATTENDANCE_STATUS_KEYS = ATTENDANCE_STATUSES.map((s) => s.key);

// One round of caddy service.
const ASSIGNMENT_STATUSES = [
    { key: 'assigned', label: 'On course' },
    { key: 'completed', label: 'Completed' },
    { key: 'swapped', label: 'Swapped' },
];
const ASSIGNMENT_STATUS_KEYS = ASSIGNMENT_STATUSES.map((s) => s.key);

// Why a caddy was swapped mid-round and whether the swapped-out caddy's round
// still COUNTS as a round of service (the spec's 更换原因 "pays the replaced
// caddy" flag; user confirmed the four reasons 2026-10-17).
const SWAP_REASONS = [
    { key: 'unwell', label: 'Caddy unwell or injured', countsAsRound: true },
    { key: 'player-request', label: 'Player request', countsAsRound: true },
    { key: 'complaint', label: 'Complaint against the caddy', countsAsRound: false },
    { key: 'other', label: 'Other', countsAsRound: true },
];
const SWAP_REASON_KEYS = SWAP_REASONS.map((r) => r.key);

// --- named-caddy requests (slice 3, user decisions 2026-10-18) ---

// A player's request for a particular caddy ahead of play (the starter-hut
// spec's 球僮预订 + 点号球僮报到): keyed on the booking or at the desk,
// confirmed when the caddy checks in on the day, fulfilled when the station
// assigns that caddy to that flight; cancelled by the player (or with the
// booking) or by the caddy (with a reason); lapsed when the tee time passed
// with no assignment.
const REQUEST_STATUSES = [
    { key: 'requested', label: 'Requested' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'fulfilled', label: 'Fulfilled' },
    { key: 'cancelled-by-player', label: 'Cancelled by player' },
    { key: 'cancelled-by-caddy', label: 'Cancelled by caddy' },
    { key: 'lapsed', label: 'Lapsed' },
];
const REQUEST_STATUS_KEYS = REQUEST_STATUSES.map((s) => s.key);
const LIVE_REQUEST_STATUS_KEYS = ['requested', 'confirmed'];

const REQUEST_SOURCES = [
    { key: 'booking', label: 'Golf Booking' },
    { key: 'desk', label: 'Tee Time Sheet' },
    { key: 'portal', label: 'Member portal' },
];
const REQUEST_SOURCE_KEYS = REQUEST_SOURCES.map((s) => s.key);

// Next up skips a caddy whose confirmed request tees off within this many
// minutes (user decision 2026-10-18: keep 90).
const RESERVE_WINDOW_MINUTES = 90;
// A live request whose tee time passed by this much with no assignment lapses.
const LAPSE_GRACE_MINUTES = 60;

module.exports = {
    CADDY_STATUSES, CADDY_STATUS_KEYS,
    LEAVE_TYPES, LEAVE_TYPE_KEYS,
    NOTE_KINDS, NOTE_KIND_KEYS,
    GENDERS, GENDER_KEYS,
    MIN_PLAYERS_PER_CADDY, MAX_PLAYERS_PER_CADDY,
    ATTENDANCE_STATUSES, ATTENDANCE_STATUS_KEYS,
    ASSIGNMENT_STATUSES, ASSIGNMENT_STATUS_KEYS,
    SWAP_REASONS, SWAP_REASON_KEYS,
    REQUEST_STATUSES, REQUEST_STATUS_KEYS, LIVE_REQUEST_STATUS_KEYS,
    REQUEST_SOURCES, REQUEST_SOURCE_KEYS,
    RESERVE_WINDOW_MINUTES, LAPSE_GRACE_MINUTES,
};
