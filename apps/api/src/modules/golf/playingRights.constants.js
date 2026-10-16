// Playing rights + round quotas vocabularies (spec 2.3.4 / 2.3.5; user
// decisions 2026-10-15).

// The calendar period a round quota counts over.
const QUOTA_PERIODS = [
    { key: 'week', label: 'Per week' },
    { key: 'month', label: 'Per month' },
    { key: 'year', label: 'Per year' },
];
const QUOTA_PERIOD_KEYS = QUOTA_PERIODS.map((p) => p.key);

module.exports = { QUOTA_PERIODS, QUOTA_PERIOD_KEYS };
