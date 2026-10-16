// Player Type master vocabularies (spec 2.3.1; user decisions 2026-10-15).
//
// A player type is the club's own catalog of player categories - the key
// the rate card prices by (TransactionType.golferType), the key every
// booking / registration line carries (Player.playerType), and the key the
// playing-right and round-quota rules target. Its BASE IDENTITY is the
// engine class the type behaves as; the code is the club's label.

const BASE_IDENTITIES = [
    // A member of this club: standing, golfing right, booking limit, junior
    // and handicap checks; books in advance.
    { key: 'member', label: 'Member' },
    // A member playing under ANOTHER member's booking: member standing, but
    // guest control's member-as-guest switch and the booker's guest quota.
    { key: 'member-guest', label: 'Member as Guest' },
    // A visitor with no standing: guest control, the booker's guest quota,
    // walk-in at the desk.
    { key: 'guest', label: 'Guest / Visitor' },
    // A member of an affiliated or reciprocal club: enters only through a
    // confirmed Affiliated Visit (letter of introduction), never the booking
    // screen or a walk-in; counts as a guest for guest control and quota.
    { key: 'affiliate', label: 'Affiliated / Reciprocal' },
];
const BASE_IDENTITY_KEYS = BASE_IDENTITIES.map((b) => b.key);

// The three SYSTEM types every company is seeded with. Their codes are the
// keys the engine used before the master existed, so no stored line, rate
// or rule changes; the codes are locked, the descriptions are editable.
const SYSTEM_PLAYER_TYPES = [
    { code: 'member', description: 'Member', baseIdentity: 'member', sortOrder: 1 },
    { code: 'member-guest', description: 'Member as Guest', baseIdentity: 'member-guest', sortOrder: 2 },
    { code: 'guest', description: 'Guest / Visitor', baseIdentity: 'guest', sortOrder: 3 },
];
const SYSTEM_PLAYER_TYPE_CODES = SYSTEM_PLAYER_TYPES.map((t) => t.code);

module.exports = {
    BASE_IDENTITIES,
    BASE_IDENTITY_KEYS,
    SYSTEM_PLAYER_TYPES,
    SYSTEM_PLAYER_TYPE_CODES,
};
