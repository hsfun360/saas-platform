// Group / tournament booking vocabularies (user decisions 2026-10-07).
// A GROUP booking (travel agent, society, corporate day) or a TOURNAMENT is
// a BookingProfile of one of these types, holding one or more PLAY DAYS
// (each its own course + start format), reserved FLIGHTS per day, a ROSTER
// (GroupPlayer) for the whole booking, and a DRAW that places roster players
// into flights (writing ordinary golf.Player rows).

const GROUP_BOOKING_TYPES = [
    { key: 'group', label: 'Group' },
    { key: 'tournament', label: 'Tournament' },
];

// How a play day starts (user requirement 2026-10-07):
//   traditional     - sequential tee times off ONE nine (hole 1); 18-hole
//                     flights cross over as ordinary bookings do.
//   two-tee         - the same sequential times off BOTH nines at once (tees
//                     1 and 10); flights off the second nine cross to the first.
//   shotgun         - every flight tees off at ONE time, each from its own
//                     hole across all 18; the course is HELD for a window.
//   modified-shotgun - shotgun off a CHOSEN subset of holes, possibly in
//                     more than one wave; the course is held for the window.
const START_FORMATS = [
    { key: 'traditional', label: 'Traditional' },
    { key: 'two-tee', label: 'Two-tee start' },
    { key: 'shotgun', label: 'Shotgun' },
    { key: 'modified-shotgun', label: 'Modified shotgun' },
];

// Formats that HOLD the course for a time window (nines blocked to ordinary
// bookings) instead of occupying tee-time cells.
const COURSE_HOLD_FORMATS = ['shotgun', 'modified-shotgun'];

const PLAY_DAY_STATUSES = [
    { key: 'planned', label: 'Planned' },
    { key: 'played', label: 'Played' },
    { key: 'cancelled', label: 'Cancelled' },
];

const GROUP_PLAYER_STATUSES = [
    { key: 'listed', label: 'Listed' },
    { key: 'withdrawn', label: 'Withdrawn' },
];

// GROUP BOOKING LIFECYCLE (user decisions 2026-10-11). With Group booking
// control OFF (committee club) a group booking is 'booked' at creation and
// stays so until cancelled - exactly the ordinary booking's pair. With the
// control ON (sales club) it walks the timed lifecycle:
//   tentative        - quoting; reserved flights hold the sheet until
//                      holdExpiresAt (the tentative hold hours), then are
//                      released by the worker scan.
//   pending-approval - submitted; the hold is frozen while the chain runs
//                      (the approver's delay never punishes the organiser).
//   approved         - approved, deposit pending: depositDueAt runs; the
//                      proforma can be issued and deposits recorded.
//   booked           - confirmed (deposit met, or none required); draw,
//                      registration and the final bill proceed.
//   lapsed           - the deposit date passed short: flights released, the
//                      booking kept for the record (distinct from cancelled).
//   cancelled        - a person cancelled it.
// Every status in HOLD_STATUS_KEYS keeps its flights on the tee sheet.
const GROUP_BOOKING_STATUSES = [
    { key: 'tentative', label: 'Tentative' },
    { key: 'pending-approval', label: 'Pending approval' },
    { key: 'approved', label: 'Approved' },
    { key: 'booked', label: 'Confirmed' },
    { key: 'lapsed', label: 'Lapsed' },
    { key: 'cancelled', label: 'Cancelled' },
];
const GROUP_BOOKING_STATUS_KEYS = GROUP_BOOKING_STATUSES.map((s) => s.key);
const HOLD_STATUS_KEYS = ['tentative', 'pending-approval', 'approved', 'booked'];
// The tee-sheet prefix a held cell / block carries while the booking is not
// yet confirmed ("TENTATIVE · IFCA Invitational"); confirmed shows the name.
const HOLD_STATE_LABELS = {
    tentative: 'TENTATIVE',
    'pending-approval': 'PENDING',
    approved: 'APPROVED',
    booked: null,
};

// Refund requests to Finance (slice 4): plain request-and-settle.
const GROUP_REFUND_STATUSES = [
    { key: 'requested', label: 'Requested' },
    { key: 'paid', label: 'Paid' },
    { key: 'declined', label: 'Declined' },
];

const GROUP_BOOKING_TYPE_KEYS = GROUP_BOOKING_TYPES.map((t) => t.key);
const GROUP_REFUND_STATUS_KEYS = GROUP_REFUND_STATUSES.map((s) => s.key);
const START_FORMAT_KEYS = START_FORMATS.map((f) => f.key);
const PLAY_DAY_STATUS_KEYS = PLAY_DAY_STATUSES.map((s) => s.key);
const GROUP_PLAYER_STATUS_KEYS = GROUP_PLAYER_STATUSES.map((s) => s.key);

// A flight's default seat count and the hard cap on reserved flights per day.
const DEFAULT_FLIGHT_CAPACITY = 4;
const MAX_FLIGHTS_PER_DAY = 80;
const MAX_ROSTER = 400;

module.exports = {
    GROUP_BOOKING_TYPES,
    GROUP_BOOKING_TYPE_KEYS,
    START_FORMATS,
    START_FORMAT_KEYS,
    COURSE_HOLD_FORMATS,
    PLAY_DAY_STATUSES,
    PLAY_DAY_STATUS_KEYS,
    GROUP_PLAYER_STATUSES,
    GROUP_PLAYER_STATUS_KEYS,
    GROUP_REFUND_STATUSES,
    GROUP_REFUND_STATUS_KEYS,
    GROUP_BOOKING_STATUSES,
    GROUP_BOOKING_STATUS_KEYS,
    HOLD_STATUS_KEYS,
    HOLD_STATE_LABELS,
    DEFAULT_FLIGHT_CAPACITY,
    MAX_FLIGHTS_PER_DAY,
    MAX_ROSTER,
};
