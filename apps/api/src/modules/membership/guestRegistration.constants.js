// Guest Registration vocabularies (structure approved 2026-11-10).

// registered -> arrived; cancelled. "Expired" is derived from the visit date
// (see passStateOf in guestRegistration.service), never stored.
const GUEST_REGISTRATION_STATUSES = [
    { key: 'registered', label: 'Registered' },
    { key: 'arrived', label: 'Arrived' },
    { key: 'cancelled', label: 'Cancelled' },
];
const GUEST_REGISTRATION_STATUS_KEYS = GUEST_REGISTRATION_STATUSES.map((s) => s.key);

// Who created the registration. Only the front desk today; the Member Portal
// and the producer modules (a guest on a facility booking or a golf flight)
// join later.
const GUEST_REGISTRATION_CHANNELS = [
    { key: 'desk', label: 'Front desk' },
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
    PASS_SEND_VIAS,
    PASS_SEND_VIA_KEYS,
    PASS_STATES,
};
