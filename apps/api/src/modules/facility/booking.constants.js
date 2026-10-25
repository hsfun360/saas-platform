// Fixed vocabularies of the facility Booking (structures approved 2026-10-25,
// sub-slice 2b). Served through GET /api/facility/bookings/meta so the screen
// never hard-codes them, and validated against here.

// Lifecycle of a Booking header.
const BOOKING_STATUSES = [
    { key: 'booked', label: 'Booked' },
    { key: 'pending-approval', label: 'Pending approval' },
    { key: 'cancelled', label: 'Cancelled' },
];
const BOOKING_STATUS_KEYS = BOOKING_STATUSES.map((s) => s.key);

// Lifecycle of ONE reserved slot. checked-in and no-show are set by the
// control station (slice 3) and no-show control (slice 4).
const SLOT_STATUSES = [
    { key: 'booked', label: 'Booked' },
    { key: 'checked-in', label: 'Checked in' },
    { key: 'no-show', label: 'No show' },
    { key: 'cancelled', label: 'Cancelled' },
];
const SLOT_STATUS_KEYS = SLOT_STATUSES.map((s) => s.key);
// The slot statuses that OCCUPY the cell and count toward the per-day limits.
const ACTIVE_SLOT_STATUS_KEYS = ['booked', 'checked-in'];

// Where the booking was made.
const BOOKING_CHANNELS = [
    { key: 'desk', label: 'Front desk' },
    { key: 'portal', label: 'Member portal' },
];
const BOOKING_CHANNEL_KEYS = BOOKING_CHANNELS.map((c) => c.key);

// The grid cell states the availability endpoint reports.
const CELL_STATES = ['open', 'front-desk', 'closed', 'past', 'locked', 'mine', 'booked'];

const BOOKING_LIMITS = {
    maxSlotsPerBooking: 20,
    maxParticipantsPerBooking: 50,
    maxLockMinutes: 60,
    searchLimit: 50,
};

module.exports = {
    BOOKING_STATUSES, BOOKING_STATUS_KEYS,
    SLOT_STATUSES, SLOT_STATUS_KEYS, ACTIVE_SLOT_STATUS_KEYS,
    BOOKING_CHANNELS, BOOKING_CHANNEL_KEYS,
    CELL_STATES, BOOKING_LIMITS,
};
