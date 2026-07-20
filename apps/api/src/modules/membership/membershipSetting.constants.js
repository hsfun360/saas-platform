// Club Specification vocabulary (SRS 2.1.1 - the membership system master).
// The club type is STRUCTURAL configuration (it gates which fields/screens are
// relevant), so a fixed vocabulary, not a user-editable master.
//   golf    - Golf Club (golf + facilities)
//   leisure - Leisure Club (facilities, no golfing)
//   others  - any other club profile (fitness centers etc.)
const CLUB_TYPES = [
    { key: 'golf', label: 'Golf Club' },
    { key: 'leisure', label: 'Leisure Club' },
    { key: 'others', label: 'Others' },
];

const CLUB_TYPE_KEYS = CLUB_TYPES.map((t) => t.key);

module.exports = { CLUB_TYPES, CLUB_TYPE_KEYS };
