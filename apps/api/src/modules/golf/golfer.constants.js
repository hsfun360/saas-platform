// Fixed vocabulary for a Golfer's type - WHERE the player's profile lives
// (user decisions 2026-09-17, mirroring AR's debtorType <-> Other* pairing):
//   'member' -> membership Member (sourceId = Member.id; profile stays in the
//               membership service, checked live via membershipGateway)
//   'other'  -> golf.OtherGolfer (sourceId = OtherGolfer.id; the golf-owned
//               profile master for public / walk-in players; UI label Public)
const GOLFER_TYPES = [
    { key: 'member', label: 'Member' },
    { key: 'other', label: 'Public' },
];

const GOLFER_TYPE_KEYS = GOLFER_TYPES.map((t) => t.key);

// Handicap proficiency standing (user decisions 2026-09-29, Tropicana
// procedure 2.1-2.3): what the handicap-control rules branch on. NULL on the
// Golfer = not recorded (exempt from limit rules per user decision).
const HANDICAP_STATUSES = [
    { key: 'established', label: 'Established' },
    { key: 'provisional', label: 'Provisional' },
    { key: 'beginner', label: 'Beginner' },
];

const HANDICAP_STATUS_KEYS = HANDICAP_STATUSES.map((s) => s.key);

module.exports = { GOLFER_TYPES, GOLFER_TYPE_KEYS, HANDICAP_STATUSES, HANDICAP_STATUS_KEYS };
