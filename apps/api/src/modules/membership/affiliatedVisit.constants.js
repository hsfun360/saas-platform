// Affiliated Visit vocabularies (user decisions 2026-10-15 / 16).

// inbound (their member visits us) | outbound (our member visits them).
const VISIT_DIRECTIONS = [
    { key: 'inbound', label: 'Inbound - their member visits us' },
    { key: 'outbound', label: 'Outbound - our member visits them' },
];
const VISIT_DIRECTION_KEYS = VISIT_DIRECTIONS.map((d) => d.key);

// inbound:  requested -> (pending-approval ->) confirmed | declined ->
//           arrived -> completed; cancelled / expired from any open state.
// outbound: requested -> issued -> completed; cancelled / expired.
const VISIT_STATUSES = [
    { key: 'requested', label: 'Requested' },
    { key: 'pending-approval', label: 'Pending approval' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'issued', label: 'Letter issued' },
    { key: 'declined', label: 'Declined' },
    { key: 'arrived', label: 'Arrived' },
    { key: 'completed', label: 'Completed' },
    { key: 'cancelled', label: 'Cancelled' },
    { key: 'expired', label: 'Expired' },
];
const VISIT_STATUS_KEYS = VISIT_STATUSES.map((s) => s.key);
// States a visit can still move forward from.
const OPEN_VISIT_STATUS_KEYS = ['requested', 'pending-approval', 'confirmed', 'issued', 'arrived'];
// States that count toward the per-member and club-wide caps.
const COUNTED_VISIT_STATUS_KEYS = ['requested', 'pending-approval', 'confirmed', 'issued', 'arrived', 'completed'];

// The facilities a letter may request; golf is the one the system books.
const VISIT_FACILITIES = [
    { key: 'golf', label: 'Golf' },
    { key: 'dining', label: 'Dining' },
    { key: 'accommodation', label: 'Accommodation' },
    { key: 'sports', label: 'Sports facilities (tennis, squash, pool, gym)' },
    { key: 'other', label: 'Other' },
];
const VISIT_FACILITY_KEYS = VISIT_FACILITIES.map((f) => f.key);

module.exports = {
    VISIT_DIRECTIONS,
    VISIT_DIRECTION_KEYS,
    VISIT_STATUSES,
    VISIT_STATUS_KEYS,
    OPEN_VISIT_STATUS_KEYS,
    COUNTED_VISIT_STATUS_KEYS,
    VISIT_FACILITIES,
    VISIT_FACILITY_KEYS,
};
