// Guest Registration vocabularies (structure approved 2026-11-10).

// registered -> arrived; cancelled. "Expired" is derived from the visit date
// (see passStateOf in guestRegistration.service), never stored.
const GUEST_REGISTRATION_STATUSES = [
    { key: 'registered', label: 'Registered' },
    { key: 'arrived', label: 'Arrived' },
    { key: 'cancelled', label: 'Cancelled' },
];
const GUEST_REGISTRATION_STATUS_KEYS = GUEST_REGISTRATION_STATUSES.map((s) => s.key);

// The patron group a registration belongs to (2026-11-14): a member's guest,
// or a visiting member of an affiliated / reciprocal club (the two kinds of
// membership.AffiliatedClub). A plain Visitor is not registered here yet.
const PATRON_GROUPS = [
    { key: 'guest', label: "Member's guest" },
    { key: 'affiliate', label: 'Affiliated member' },
    { key: 'reciprocal', label: 'Reciprocal member' },
];
const PATRON_GROUP_KEYS = PATRON_GROUPS.map((g) => g.key);

// Who created the registration: the Registration Counter, or a producer
// module's own counter (a guest added at the Facility station, a visitor
// received at the golf desk). The Member Portal joins later.
const GUEST_REGISTRATION_CHANNELS = [
    { key: 'desk', label: 'Registration Counter' },
    { key: 'portal', label: 'Member Portal' },
    { key: 'facility', label: 'Facility' },
    { key: 'golf', label: 'Golf' },
];

// How the pass reached the guest.
const PASS_SEND_VIAS = [
    { key: 'email', label: 'Email' },
    { key: 'whatsapp', label: 'WhatsApp' },
];
const PASS_SEND_VIA_KEYS = PASS_SEND_VIAS.map((v) => v.key);

// What the pass shows on a given day (derived).
const PASS_STATES = [
    { key: 'valid', label: 'Valid today' },
    { key: 'upcoming', label: 'Not yet valid' },
    { key: 'expired', label: 'Expired' },
    { key: 'cancelled', label: 'Cancelled' },
];

module.exports = {
    GUEST_REGISTRATION_STATUSES,
    GUEST_REGISTRATION_STATUS_KEYS,
    GUEST_REGISTRATION_CHANNELS,
    PATRON_GROUPS,
    PATRON_GROUP_KEYS,
    PASS_SEND_VIAS,
    PASS_SEND_VIA_KEYS,
    PASS_STATES,
};
