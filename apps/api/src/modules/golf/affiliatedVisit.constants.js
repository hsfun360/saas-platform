// Affiliated Visit vocabularies (user decisions 2026-10-15; host side only).

// requested -> (pending-approval ->) confirmed | declined -> arrived ->
// completed; cancelled / expired from any open state.
const VISIT_STATUSES = [
    { key: 'requested', label: 'Requested' },
    { key: 'pending-approval', label: 'Pending approval' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'declined', label: 'Declined' },
    { key: 'arrived', label: 'Arrived' },
    { key: 'completed', label: 'Completed' },
    { key: 'cancelled', label: 'Cancelled' },
    { key: 'expired', label: 'Expired' },
];
const VISIT_STATUS_KEYS = VISIT_STATUSES.map((s) => s.key);
// States a visit can still move forward from.
const OPEN_VISIT_STATUS_KEYS = ['requested', 'pending-approval', 'confirmed', 'arrived'];
// States that count toward the per-player visit cap.
const COUNTED_VISIT_STATUS_KEYS = ['requested', 'pending-approval', 'confirmed', 'arrived', 'completed'];

// The facilities a letter may request; golf is the one the system books.
const VISIT_FACILITIES = [
    { key: 'golf', label: 'Golf' },
    { key: 'dining', label: 'Dining' },
    { key: 'accommodation', label: 'Accommodation' },
    { key: 'other', label: 'Other' },
];
const VISIT_FACILITY_KEYS = VISIT_FACILITIES.map((f) => f.key);

module.exports = {
    VISIT_STATUSES,
    VISIT_STATUS_KEYS,
    OPEN_VISIT_STATUS_KEYS,
    COUNTED_VISIT_STATUS_KEYS,
    VISIT_FACILITIES,
    VISIT_FACILITY_KEYS,
};
