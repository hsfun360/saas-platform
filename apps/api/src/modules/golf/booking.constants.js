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

const HOLES_OPTIONS = [9, 18];

// Change-booking kinds (2026-10-14): what one amendment of a flight booking
// touched. 'move' = another course / date / tee time / holes, 'roster' =
// players added or dropped, 'header' = contact or remarks only, 'mixed' =
// more than one of those.
const CHANGE_TYPES = [
    { key: 'move', label: 'Flight moved' },
    { key: 'roster', label: 'Players changed' },
    { key: 'header', label: 'Details updated' },
    { key: 'mixed', label: 'Flight and players changed' },
];
const CHANGE_TYPE_KEYS = CHANGE_TYPES.map((t) => t.key);

module.exports = {
    BOOKING_STATUSES,
    BOOKING_STATUS_KEYS,
    PLAYER_TYPES,
    PLAYER_TYPE_KEYS,
    HOLES_OPTIONS,
    CHANGE_TYPES,
    CHANGE_TYPE_KEYS,
};
