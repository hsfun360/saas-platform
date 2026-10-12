// Membership Dashboard - the raw-SQL aggregates behind the analytics screens
// (dashboard.controller.js keeps request parsing, month-walk filling and the
// response shaping). Raw queries live here, in a service, per the coding
// standard: hot-path aggregates never inline in a route. Every query is
// company-scoped through its replacements.
//
// The age-band vocabulary and its SQL live here too, as the ONE definition
// the breakdown CASE, the drill filter and the /meta catalog share.

const { sequelize } = require('../../platform/db');

// Age bands - stable keys the web maps to labels. 'unknown' = no birthDate.
const AGE_BANDS = [
    { key: 'under21', label: 'Under 21', min: null, max: 20 },
    { key: '21-30', label: '21-30', min: 21, max: 30 },
    { key: '31-40', label: '31-40', min: 31, max: 40 },
    { key: '41-50', label: '41-50', min: 41, max: 50 },
    { key: '51-60', label: '51-60', min: 51, max: 60 },
    { key: 'over60', label: 'Over 60', min: 61, max: null },
];
const AGE_BAND_KEYS = AGE_BANDS.map((b) => b.key).concat('unknown');

const UNKNOWN = 'unknown';

// Age in whole years from a DATEONLY birthDate, as SQL (Postgres). `m` is the
// Member alias of the breakdown query; the drill rewrites it to "Member".
const AGE_SQL = 'date_part(\'year\', age(current_date, m."birthDate"))';

// The SQL predicate selecting one age band (the drill's member filter).
function ageBandCondition(bandKey) {
    if (bandKey === UNKNOWN) return 'm."birthDate" IS NULL';
    const band = AGE_BANDS.find((b) => b.key === bandKey);
    if (!band) return null;
    const parts = ['m."birthDate" IS NOT NULL'];
    if (band.min !== null) parts.push(`${AGE_SQL} >= ${band.min}`);
    if (band.max !== null) parts.push(`${AGE_SQL} <= ${band.max}`);
    return parts.join(' AND ');
}

// --- movement --------------------------------------------------------------

// Monthly joins vs contractual expiries across the period, as two raw row
// sets [{ month: 'YYYY-MM', count }] - the controller fills the empty months.
async function monthlyMovement(companyId, { from, to, membershipClass }) {
    const classSql = membershipClass ? 'AND "membershipClass" = :membershipClass' : '';
    const replacements = { companyId, from, to, membershipClass };

    const [joins, expiries] = await Promise.all([
        sequelize.query(
            `SELECT to_char(date_trunc('month', "joinDate"), 'YYYY-MM') AS month, COUNT(*)::int AS count
             FROM membership."Membership"
             WHERE "companyId" = :companyId AND "joinDate" BETWEEN :from AND :to ${classSql}
             GROUP BY 1`,
            { replacements, type: sequelize.QueryTypes.SELECT }
        ),
        sequelize.query(
            `SELECT to_char(date_trunc('month', "expiryDate"), 'YYYY-MM') AS month, COUNT(*)::int AS count
             FROM membership."Membership"
             WHERE "companyId" = :companyId AND "expiryDate" BETWEEN :from AND :to ${classSql}
             GROUP BY 1`,
            { replacements, type: sequelize.QueryTypes.SELECT }
        ),
    ]);
    return { joins, expiries };
}

// --- breakdown -------------------------------------------------------------

// Member-grouped dimensions - raw SQL (age CASE / address join), always
// joined to Membership so the class filter applies uniformly.
const memberDims = {
    memberStatus: 'm."memberStatusId"',
    nationality: `COALESCE(m."nationalityCode", '${UNKNOWN}')`,
    // Case-normalized: stored codes vary in case; Country.alpha2 is upper.
    country: `COALESCE(UPPER(a."countryCode"), '${UNKNOWN}')`,
    ageBand: `CASE
        WHEN m."birthDate" IS NULL THEN '${UNKNOWN}'
        ${AGE_BANDS.map((b) => {
            const conds = [];
            if (b.min !== null) conds.push(`${AGE_SQL} >= ${b.min}`);
            if (b.max !== null) conds.push(`${AGE_SQL} <= ${b.max}`);
            return `WHEN ${conds.join(' AND ')} THEN '${b.key}'`;
        }).join('\n        ')}
        ELSE '${UNKNOWN}' END`,
};

// Grouped counts of MEMBERS (people) for one member-side dimension:
// { rows: [{ key, count }] } ordered by count, or { error } for an unknown
// dimension (the controller answers 400 with it).
async function memberBreakdown(companyId, { dimension, membershipClass, kind }) {
    const keyExpr = memberDims[dimension];
    if (!keyExpr) return { error: 'Unknown dimension.' };

    const countryJoin = dimension === 'country'
        ? 'LEFT JOIN membership."Address" a ON a."memberId" = m."id" AND a."addressType" = \'residential\''
        : '';
    const classSql = membershipClass ? 'AND ms."membershipClass" = :membershipClass' : '';
    const kindSql = kind ? 'AND m."memberKind" = :kind' : '';

    const rows = await sequelize.query(
        `SELECT ${keyExpr} AS key, COUNT(*)::int AS count
         FROM membership."Member" m
         JOIN membership."Membership" ms ON ms."id" = m."membershipId"
         ${countryJoin}
         WHERE m."companyId" = :companyId ${classSql} ${kindSql}
         GROUP BY 1
         ORDER BY count DESC`,
        { replacements: { companyId, membershipClass, kind }, type: sequelize.QueryTypes.SELECT }
    );
    return { rows };
}

// --- agents ----------------------------------------------------------------

// Memberships CLOSED in the period as a monthly series per sales channel:
// [{ month: 'YYYY-MM', channel: 'internal'|'external'|'agency'|'none', count }]
// ('none' = no closing agent recorded). The controller folds the rows into
// one entry per month and fills the empty months.
async function monthlyClosingsByChannel(companyId, { from, to, membershipClass }) {
    const classSql = membershipClass ? 'AND ms."membershipClass" = :membershipClass' : '';
    return sequelize.query(
        `SELECT to_char(date_trunc('month', ms."joinDate"), 'YYYY-MM') AS month,
                CASE WHEN sa."id" IS NULL THEN 'none'
                     WHEN sa."agentKind" = 'internal' THEN 'internal'
                     WHEN sa."agentKind" = 'external' THEN 'external'
                     ELSE 'agency' END AS channel,
                COUNT(*)::int AS count
         FROM membership."Membership" ms
         LEFT JOIN membership."SalesAgent" sa ON sa."id" = ms."salesAgentId"
         WHERE ms."companyId" = :companyId AND ms."joinDate" BETWEEN :from AND :to ${classSql}
         GROUP BY 1, 2`,
        { replacements: { companyId, from, to, membershipClass }, type: sequelize.QueryTypes.SELECT }
    );
}

module.exports = {
    AGE_BANDS,
    AGE_BAND_KEYS,
    AGE_SQL,
    UNKNOWN,
    ageBandCondition,
    monthlyMovement,
    memberBreakdown,
    monthlyClosingsByChannel,
};
