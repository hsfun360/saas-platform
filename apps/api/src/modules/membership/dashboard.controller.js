// Membership Dashboard - the analytics screen over the membership base.
// Read-only aggregations; every number is drillable to the records behind it
// (the "show expected results" principle). All queries are company-scoped.
//
// Dimension sources (no new tables - everything reads the live CRM data):
//   movement       Membership.joinDate (new) / Membership.expiryDate (expired,
//                  contractual - status is NOT flipped automatically, so the
//                  date is the truer movement signal; user-confirmed 2026-07-21)
//   status         Membership.membershipStatusId / Member.memberStatusId
//   type           Membership.membershipTypeId
//   ageBand        Member.birthDate (bands below, 'unknown' when null)
//   country        Member's 'residential' Address.countryCode
//   nationality    Member.nationalityCode
//   agents         Membership.salesAgentId -> SalesAgent.agentKind/Agency

const { Op, fn, col, literal } = require('sequelize');
const { sequelize } = require('../../platform/db');
const Membership = require('./membership.model');
const Member = require('./member.model');
const MembershipStatus = require('./membershipStatus.model');
const MembershipType = require('./membershipType.model');
const SalesAgent = require('./salesAgent.model');
const SalesAgency = require('./salesAgency.model');
const { getUserContext } = require('../../platform/serviceContext');
const { MEMBER_KIND_KEYS } = require('./member.constants');

const DRILL_LIMIT = 50;

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

// Membership status classes counted as "active" for the KPI.
const ACTIVE_CLASSES = ['active', 'active-absent'];

const UNKNOWN = 'unknown';

// --- helpers ---------------------------------------------------------------

function parseDateOnly(value) {
    if (typeof value !== 'string') return null;
    return /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : null;
}

// The dashboard period. Defaults to the last 12 full months through today.
function getPeriod(req) {
    const to = parseDateOnly(req.query.to) || new Date().toISOString().slice(0, 10);
    let from = parseDateOnly(req.query.from);
    if (!from) {
        const d = new Date(`${to}T00:00:00Z`);
        d.setUTCFullYear(d.getUTCFullYear() - 1);
        d.setUTCDate(d.getUTCDate() + 1);
        from = d.toISOString().slice(0, 10);
    }
    return { from, to };
}

function getClassFilter(req) {
    const c = typeof req.query.class === 'string' ? req.query.class.trim() : '';
    return c === 'individual' || c === 'corporate' ? c : null;
}

function getKindFilter(req) {
    const k = typeof req.query.kind === 'string' ? req.query.kind.trim() : '';
    return MEMBER_KIND_KEYS.includes(k) ? k : null;
}

// Age in whole years from a DATEONLY birthDate, as SQL (Postgres).
const AGE_SQL = 'date_part(\'year\', age(current_date, m."birthDate"))';

function ageBandCondition(bandKey) {
    if (bandKey === UNKNOWN) return 'm."birthDate" IS NULL';
    const band = AGE_BANDS.find((b) => b.key === bandKey);
    if (!band) return null;
    const parts = ['m."birthDate" IS NOT NULL'];
    if (band.min !== null) parts.push(`${AGE_SQL} >= ${band.min}`);
    if (band.max !== null) parts.push(`${AGE_SQL} <= ${band.max}`);
    return parts.join(' AND ');
}

// --- meta ------------------------------------------------------------------

// GET /api/membership/dashboard/meta - label catalogs the charts resolve ids
// against, plus the fixed vocabularies (bands, kinds).
exports.getMeta = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const [statuses, types, agents, agencies] = await Promise.all([
            MembershipStatus.findAll({
                where: { companyId },
                attributes: ['id', 'membershipStatus', 'statusClass', 'statusColor'],
                order: [['membershipStatus', 'ASC']],
            }),
            MembershipType.findAll({
                where: { companyId },
                // The type's display name column is `category` (legacy name kept).
                attributes: ['id', 'category', 'membershipClass'],
                order: [['category', 'ASC']],
            }),
            SalesAgent.findAll({
                where: { companyId },
                attributes: ['id', 'agentCode', 'name', 'agentKind', 'salesAgencyId'],
                order: [['name', 'ASC']],
            }),
            SalesAgency.findAll({
                where: { companyId },
                attributes: ['id', 'agencyName'],
                order: [['agencyName', 'ASC']],
            }),
        ]);

        res.status(200).json({
            statuses,
            types,
            agents,
            agencies,
            ageBands: AGE_BANDS,
        });
    } catch (error) {
        console.error('Error loading dashboard meta:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// --- summary ---------------------------------------------------------------

// GET /api/membership/dashboard/summary?from&to&class - the KPI row.
exports.getSummary = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const { from, to } = getPeriod(req);
        const membershipClass = getClassFilter(req);

        const base = { companyId };
        if (membershipClass) base.membershipClass = membershipClass;

        const activeStatuses = await MembershipStatus.findAll({
            where: { companyId, statusClass: { [Op.in]: ACTIVE_CLASSES } },
            attributes: ['id'],
        });
        const activeStatusIds = activeStatuses.map((s) => s.id);

        const memberWhere = { companyId };
        const memberInclude = membershipClass
            ? [{ model: Membership, as: 'Membership', attributes: [], where: { membershipClass }, required: true }]
            : [];

        const [totalMemberships, activeMemberships, newJoins, expired, totalMembers] = await Promise.all([
            Membership.count({ where: base }),
            activeStatusIds.length
                ? Membership.count({ where: { ...base, membershipStatusId: { [Op.in]: activeStatusIds } } })
                : Promise.resolve(0),
            Membership.count({ where: { ...base, joinDate: { [Op.between]: [from, to] } } }),
            Membership.count({ where: { ...base, expiryDate: { [Op.between]: [from, to] } } }),
            Member.count({ where: memberWhere, include: memberInclude }),
        ]);

        res.status(200).json({
            from,
            to,
            totalMemberships,
            activeMemberships,
            newJoins,
            expired,
            netMovement: newJoins - expired,
            totalMembers,
        });
    } catch (error) {
        console.error('Error loading dashboard summary:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// --- movement --------------------------------------------------------------

// GET /api/membership/dashboard/movement?from&to&class - monthly joins vs
// contractual expiries across the period, empty months filled server-side.
exports.getMovement = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const { from, to } = getPeriod(req);
        const membershipClass = getClassFilter(req);

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

        const joinMap = new Map(joins.map((r) => [r.month, r.count]));
        const expiryMap = new Map(expiries.map((r) => [r.month, r.count]));

        // Walk month by month from..to so the chart has a continuous axis.
        const months = [];
        const cursor = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
        const end = new Date(`${to.slice(0, 7)}-01T00:00:00Z`);
        while (cursor <= end) {
            const key = cursor.toISOString().slice(0, 7);
            months.push({
                month: key,
                joins: joinMap.get(key) || 0,
                expiries: expiryMap.get(key) || 0,
            });
            cursor.setUTCMonth(cursor.getUTCMonth() + 1);
        }

        res.status(200).json({ from, to, months });
    } catch (error) {
        console.error('Error loading dashboard movement:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// --- breakdown -------------------------------------------------------------

// GET /api/membership/dashboard/breakdown?dimension=&class&kind
// Grouped counts for one dimension. Status/type group MEMBERSHIPS (contracts);
// memberStatus/ageBand/country/nationality group MEMBERS (people). Breakdowns
// are a snapshot of the current base (the period applies to movement/agents).
exports.getBreakdown = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const membershipClass = getClassFilter(req);
        const kind = getKindFilter(req);
        const dimension = typeof req.query.dimension === 'string' ? req.query.dimension.trim() : '';

        // Membership-grouped dimensions.
        if (dimension === 'status' || dimension === 'type') {
            const groupCol = dimension === 'status' ? 'membershipStatusId' : 'membershipTypeId';
            const where = { companyId };
            if (membershipClass) where.membershipClass = membershipClass;
            const rows = await Membership.findAll({
                where,
                attributes: [groupCol, [fn('COUNT', col('id')), 'count']],
                group: [groupCol],
                raw: true,
            });
            return res.status(200).json({
                dimension,
                buckets: rows.map((r) => ({ key: r[groupCol] || UNKNOWN, count: parseInt(r.count, 10) })),
            });
        }

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
                }).join('\n                ')}
                ELSE '${UNKNOWN}' END`,
        };
        const keyExpr = memberDims[dimension];
        if (!keyExpr) return res.status(400).json({ message: 'Unknown dimension.' });

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

        res.status(200).json({ dimension, buckets: rows });
    } catch (error) {
        console.error('Error loading dashboard breakdown:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// --- agents ----------------------------------------------------------------

// GET /api/membership/dashboard/agents?from&to&class - memberships CLOSED in
// the period per closing agent (salesAgentId - fixed at joining, the
// commission driver). The web folds the flat rows into the three-tier channel
// view (Internal / External / per-Agency). `unattributed` = no agent recorded.
exports.getAgentPerformance = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const { from, to } = getPeriod(req);
        const membershipClass = getClassFilter(req);

        const where = { companyId, joinDate: { [Op.between]: [from, to] } };
        if (membershipClass) where.membershipClass = membershipClass;

        const grouped = await Membership.findAll({
            where,
            attributes: ['salesAgentId', [fn('COUNT', col('id')), 'count']],
            group: ['salesAgentId'],
            raw: true,
        });

        const agentIds = grouped.map((g) => g.salesAgentId).filter(Boolean);
        const agents = agentIds.length
            ? await SalesAgent.findAll({
                where: { id: { [Op.in]: agentIds } },
                attributes: ['id', 'agentCode', 'name', 'agentKind', 'salesAgencyId'],
                include: [{ model: SalesAgency, as: 'Agency', attributes: ['id', 'agencyName'] }],
            })
            : [];
        const agentMap = new Map(agents.map((a) => [a.id, a]));

        let unattributed = 0;
        const rows = [];
        for (const g of grouped) {
            const count = parseInt(g.count, 10);
            if (!g.salesAgentId) { unattributed += count; continue; }
            const agent = agentMap.get(g.salesAgentId);
            rows.push({
                agentId: g.salesAgentId,
                agentCode: agent ? agent.agentCode : null,
                name: agent ? agent.name : 'Unknown agent',
                agentKind: agent ? agent.agentKind : null,
                agencyId: agent && agent.Agency ? agent.Agency.id : null,
                agencyName: agent && agent.Agency ? agent.Agency.agencyName : null,
                count,
            });
        }
        rows.sort((a, b) => b.count - a.count);

        res.status(200).json({ from, to, agents: rows, unattributed });
    } catch (error) {
        console.error('Error loading dashboard agent performance:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// --- drill -----------------------------------------------------------------

// GET /api/membership/dashboard/drill - the records behind any chart segment.
// Filters COMBINE (cross-filtering two charts narrows the list):
//   entity        'memberships' | 'members' (what the rows are)
//   membership side: statusId, typeId, agentId, agencyId, joinedFrom/joinedTo,
//                    expiredFrom/expiredTo, class
//   member side:     memberStatusId, kind, ageBand, countryCode, nationality
// Member-side filters on a memberships drill mean "has such a member";
// membership-side filters on a members drill constrain the person's contract.
exports.drill = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const entity = req.query.entity === 'members' ? 'members' : 'memberships';
        const membershipClass = getClassFilter(req);
        const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

        const q = (name) => (typeof req.query[name] === 'string' && req.query[name].trim() ? req.query[name].trim() : null);

        // Membership-side where.
        const membershipWhere = { companyId };
        if (membershipClass) membershipWhere.membershipClass = membershipClass;
        if (q('statusId')) membershipWhere.membershipStatusId = q('statusId');
        if (q('typeId')) membershipWhere.membershipTypeId = q('typeId');
        if (q('agentId')) membershipWhere.salesAgentId = q('agentId');
        const joinedFrom = parseDateOnly(req.query.joinedFrom);
        const joinedTo = parseDateOnly(req.query.joinedTo);
        if (joinedFrom && joinedTo) membershipWhere.joinDate = { [Op.between]: [joinedFrom, joinedTo] };
        const expiredFrom = parseDateOnly(req.query.expiredFrom);
        const expiredTo = parseDateOnly(req.query.expiredTo);
        if (expiredFrom && expiredTo) membershipWhere.expiryDate = { [Op.between]: [expiredFrom, expiredTo] };
        // Agency = all memberships closed by any of the agency's agents.
        if (q('agencyId')) {
            const agencyAgents = await SalesAgent.findAll({
                where: { companyId, salesAgencyId: q('agencyId') },
                attributes: ['id'],
            });
            membershipWhere.salesAgentId = { [Op.in]: agencyAgents.map((a) => a.id) };
        } else if (q('agentKind')) {
            const kindAgents = await SalesAgent.findAll({
                where: { companyId, agentKind: q('agentKind') },
                attributes: ['id'],
            });
            membershipWhere.salesAgentId = { [Op.in]: kindAgents.map((a) => a.id) };
        }

        // Member-side where.
        const memberWhere = { companyId };
        if (q('memberStatusId')) memberWhere.memberStatusId = q('memberStatusId');
        const kind = getKindFilter(req);
        if (kind) memberWhere.memberKind = kind;
        if (q('nationality')) {
            memberWhere.nationalityCode = q('nationality') === UNKNOWN ? null : q('nationality');
        }
        const memberLiterals = [];
        const band = q('ageBand');
        if (band && AGE_BAND_KEYS.includes(band)) {
            memberLiterals.push(ageBandCondition(band).replace(/m\."/g, '"Member"."'));
        }
        const countryCode = q('countryCode');
        if (countryCode) {
            const sub = countryCode === UNKNOWN
                ? `NOT EXISTS (SELECT 1 FROM membership."Address" a WHERE a."memberId" = "Member"."id" AND a."addressType" = 'residential' AND a."countryCode" IS NOT NULL)`
                : `EXISTS (SELECT 1 FROM membership."Address" a WHERE a."memberId" = "Member"."id" AND a."addressType" = 'residential' AND UPPER(a."countryCode") = '${countryCode.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase()}')`;
            memberLiterals.push(sub);
        }

        const memberHasFilters = Object.keys(memberWhere).length > 1 || memberLiterals.length > 0;

        if (entity === 'memberships') {
            const include = [];
            if (memberHasFilters) {
                include.push({
                    model: Member,
                    as: 'Members',
                    attributes: [],
                    required: true,
                    where: memberLiterals.length
                        ? { ...memberWhere, [Op.and]: memberLiterals.map((l) => literal(l)) }
                        : memberWhere,
                });
            }
            const { rows, count } = await Membership.findAndCountAll({
                where: membershipWhere,
                include,
                order: [['joinDate', 'DESC'], ['createdAt', 'DESC']],
                limit: DRILL_LIMIT,
                offset,
                distinct: true,
            });
            return res.status(200).json({
                entity,
                total: count,
                limit: DRILL_LIMIT,
                offset,
                rows: rows.map((m) => ({
                    id: m.id,
                    membershipNo: m.membershipNo,
                    membershipClass: m.membershipClass,
                    membershipTypeId: m.membershipTypeId,
                    membershipStatusId: m.membershipStatusId,
                    corporateName: m.corporateName,
                    joinDate: m.joinDate,
                    expiryDate: m.expiryDate,
                    salesAgentId: m.salesAgentId,
                })),
            });
        }

        // Members drill.
        const where = memberLiterals.length
            ? { ...memberWhere, [Op.and]: memberLiterals.map((l) => literal(l)) }
            : memberWhere;
        const membershipSideActive = Object.keys(membershipWhere).length > 1;
        const { rows, count } = await Member.findAndCountAll({
            where,
            include: [{
                model: Membership,
                as: 'Membership',
                attributes: ['id', 'membershipNo', 'membershipClass', 'corporateName'],
                required: membershipSideActive,
                where: membershipSideActive ? membershipWhere : undefined,
            }],
            order: [['createdAt', 'DESC']],
            limit: DRILL_LIMIT,
            offset,
            distinct: true,
        });
        res.status(200).json({
            entity,
            total: count,
            limit: DRILL_LIMIT,
            offset,
            rows: rows.map((m) => ({
                id: m.id,
                memberNo: m.memberNo,
                memberKind: m.memberKind,
                memberStatusId: m.memberStatusId,
                firstName: m.firstName,
                lastName: m.lastName,
                localName: m.localName,
                gender: m.gender,
                birthDate: m.birthDate,
                nationalityCode: m.nationalityCode,
                joinDate: m.joinDate,
                membershipId: m.membershipId,
                membershipNo: m.Membership ? m.Membership.membershipNo : null,
                membershipClass: m.Membership ? m.Membership.membershipClass : null,
                corporateName: m.Membership ? m.Membership.corporateName : null,
            })),
        });
    } catch (error) {
        console.error('Error loading dashboard drill:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
