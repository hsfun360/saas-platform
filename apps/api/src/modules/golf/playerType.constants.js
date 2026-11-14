// Player Type master vocabularies (spec 2.3.1; user decisions 2026-10-15,
// SIX engine classes since 2026-11-13).
//
// A player type is the club's own catalog of player categories - the key
// the rate card prices by (TransactionType.golferType), the key every
// booking / registration line carries (Player.playerType), and the key the
// playing-right and round-quota rules target. Its BASE IDENTITY is the
// engine class the type behaves as; the code is the club's label.
//
// The club's FIVE patron groups (user, 2026-11-13) map onto six classes:
// Member (member, member-guest), Guest (guest), Visitor (visitor),
// Affiliated club member (affiliate) and Reciprocal club member (reciprocal).
// A GUEST is always ATTACHED TO A HOST MEMBER whose rights and the club's
// guest rules bind them strictly; a VISITOR has no host and never draws on
// any member; the two club-member classes enter only through a confirmed
// Affiliated Visit and are exempt from guest control (the club record's own
// caps and letter flow bind them).

const BASE_IDENTITIES = [
    // A member of this club: standing, golfing right, booking limit, junior
    // and handicap checks; books in advance.
    { key: 'member', label: 'Member' },
    // A member playing under ANOTHER member's booking as that member's GUEST.
    // Never picked: the engine DERIVES it when a member on someone else's
    // booking has no playing right (or round quota) of their own for the
    // flight. Member standing, but the host's guest rules, quota and monthly
    // allowance apply; the round does not count toward their own quota.
    { key: 'member-guest', label: 'Member as Guest' },
    // A guest BROUGHT BY A MEMBER (the host): the flight's allow-guests flag,
    // the host's per-booking quota and monthly allowance apply strictly, at
    // the desk as on the booking screen.
    { key: 'guest', label: 'Guest' },
    // A member of the public with NO host: the flight's allow-visitors flag
    // applies; enters as a front-desk walk-in only.
    { key: 'visitor', label: 'Visitor' },
    // A member of an AFFILIATED club: enters only through a confirmed
    // Affiliated Visit (letter of introduction); exempt from guest control,
    // bound by the club record's caps and visit fee.
    { key: 'affiliate', label: 'Affiliated club member' },
    // A member of a RECIPROCAL club: the same entry path and exemption as an
    // affiliate; a separate class so types, rates, rights and reports tell
    // the two agreements apart.
    { key: 'reciprocal', label: 'Reciprocal club member' },
];
const BASE_IDENTITY_KEYS = BASE_IDENTITIES.map((b) => b.key);

// Classes that never appear in a picker: affiliate and reciprocal enter only
// through a confirmed visit; the SYSTEM member-guest row is derived, never
// picked (a club-defined member-guest-base type stays pickable as a deliberate
// override, e.g. a "Spouse as guest" price).
const VISIT_ONLY_BASES = ['affiliate', 'reciprocal'];
// Classes whose line draws on a HOST MEMBER: guest control's allow-guests
// flag, the host's per-booking quota and monthly guest allowance.
const HOSTED_GUEST_BASES = ['guest', 'member-guest'];

// The FOUR SYSTEM types every company is seeded with. Their codes are the
// keys the engine used before the master existed, so no stored line, rate
// or rule changes; the codes are locked, the descriptions are editable.
// 'visitor' joined on 2026-11-13 (the Guest / Visitor split).
const SYSTEM_PLAYER_TYPES = [
    { code: 'member', description: 'Member', baseIdentity: 'member', sortOrder: 1 },
    { code: 'member-guest', description: 'Member as Guest', baseIdentity: 'member-guest', sortOrder: 2 },
    { code: 'guest', description: 'Guest', baseIdentity: 'guest', sortOrder: 3 },
    { code: 'visitor', description: 'Visitor', baseIdentity: 'visitor', sortOrder: 4 },
];
const SYSTEM_PLAYER_TYPE_CODES = SYSTEM_PLAYER_TYPES.map((t) => t.code);
// The code every derived member-as-guest line carries.
const MEMBER_GUEST_CODE = 'member-guest';

module.exports = {
    BASE_IDENTITIES,
    BASE_IDENTITY_KEYS,
    VISIT_ONLY_BASES,
    HOSTED_GUEST_BASES,
    SYSTEM_PLAYER_TYPES,
    SYSTEM_PLAYER_TYPE_CODES,
    MEMBER_GUEST_CODE,
};
