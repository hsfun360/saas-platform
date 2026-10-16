// Affiliated / Reciprocal Club vocabularies (user decisions 2026-10-15).

// One table covers both arrangements; the kind is a label for the desk and
// the letter templates, the controls are the same columns.
const AFFILIATED_CLUB_KINDS = [
    // A golf association or federation whose members the club admits.
    { key: 'affiliate', label: 'Affiliated association' },
    // A mutual arrangement with another club: their members play here, ours there.
    { key: 'reciprocal', label: 'Reciprocal club' },
];
const AFFILIATED_CLUB_KIND_KEYS = AFFILIATED_CLUB_KINDS.map((k) => k.key);

// The period the per-player visit cap counts over (calendar periods).
const VISIT_CAP_PERIODS = [
    { key: 'week', label: 'Per week' },
    { key: 'month', label: 'Per month' },
    { key: 'year', label: 'Per year' },
];
const VISIT_CAP_PERIOD_KEYS = VISIT_CAP_PERIODS.map((p) => p.key);

module.exports = {
    AFFILIATED_CLUB_KINDS,
    AFFILIATED_CLUB_KIND_KEYS,
    VISIT_CAP_PERIODS,
    VISIT_CAP_PERIOD_KEYS,
};
