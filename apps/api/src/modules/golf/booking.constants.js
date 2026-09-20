// Golf booking vocabularies (user decisions 2026-09-20).

// Booking lifecycle - registration/no-show states belong to later stages.
const BOOKING_STATUSES = [
    { key: 'booked', label: 'Booked' },
    { key: 'cancelled', label: 'Cancelled' },
];

// Player line kinds - the 2006 screen's Member vs Guest / Member-as-Guest
// split, and what guest control checks.
const PLAYER_TYPES = [
    { key: 'member', label: 'Member' },
    { key: 'member-guest', label: 'Member as Guest' },
    { key: 'guest', label: 'Guest' },
];

const BOOKING_STATUS_KEYS = BOOKING_STATUSES.map((s) => s.key);
const PLAYER_TYPE_KEYS = PLAYER_TYPES.map((t) => t.key);

// The two nines of the per-nine tee-sheet model.
const NINES = ['first', 'second'];

const HOLES_OPTIONS = [9, 18];

module.exports = {
    BOOKING_STATUSES,
    BOOKING_STATUS_KEYS,
    PLAYER_TYPES,
    PLAYER_TYPE_KEYS,
    NINES,
    HOLES_OPTIONS,
};
