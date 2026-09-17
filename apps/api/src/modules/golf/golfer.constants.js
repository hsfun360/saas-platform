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

module.exports = { GOLFER_TYPES, GOLFER_TYPE_KEYS };
