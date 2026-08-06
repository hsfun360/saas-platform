// Account Receivable - Debtor Listing + ledger-account maintenance.
//
// ONE shared listing for all three debtor types (decision 2026-08-05: Finance
// gets a single outstanding inquiry with a type filter, never per-source
// screens). Party display data is resolved through platform/membershipGateway
// (membership/member debtors) or ar.OtherDebtor (city ledger) - the Debtor row
// itself stays thin.
//
// After first provisioning, THIS screen is the single place credit terms are
// maintained (credit-terms migration decision 2026-08-05); the membership
// screen shows them read-only.

const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const Debtor = require('./debtor.model');
const OtherDebtor = require('./otherDebtor.model');
const CreditAccount = require('./creditAccount.model');
const { getUserContext, canModifyRecord } = require('../../platform/serviceContext');
const membershipGateway = require('../../platform/membershipGateway');
const numberingGateway = require('../../platform/numberingGateway');
const { DEBTOR_TYPES, DEBTOR_TYPE_KEYS, DEBTOR_STATUSES, DEBTOR_STATUS_KEYS } = require('./ar.constants');

const SEARCH_LIMIT = 50;
const OTHER_DEBTOR_NUMBERING_PURPOSE = 'ar-other-debtor';

function str(x) { return typeof x === 'string' ? x.trim() : ''; }
function strOrNull(x) { const s = str(x); return s || null; }

// GET /api/ar/debtors/meta - fixed vocabularies + the Other Debtor numbering
// mode (drives whether the dialog's Code field is keyed or auto).
exports.getMeta = async (req, res) => {
    try {
        const mode = await numberingGateway.getMode(req, OTHER_DEBTOR_NUMBERING_PURPOSE);
        res.status(200).json({
            debtorTypes: DEBTOR_TYPES,
            debtorStatuses: DEBTOR_STATUSES,
            otherDebtorNumberingMode: mode, // 'auto' | 'manual' | null
        });
    } catch (error) {
        console.error('Error loading AR meta:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/ar/debtors?q=&type=&status=&offset= - the shared Debtor Listing.
// q searches every party master (membership no / corporate name / person name /
// member no / other-debtor code+name); the matched ids are then joined against
// Debtor.sourceId in one paged query.
exports.listDebtors = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const where = { companyId };
        const type = str(req.query.type);
        if (type && DEBTOR_TYPE_KEYS.includes(type)) where.debtorType = type;
        const status = str(req.query.status);
        if (status && DEBTOR_STATUS_KEYS.includes(status)) where.status = status;

        const q = str(req.query.q);
        if (q) {
            const { membershipIds, memberIds } = await membershipGateway.searchPartyIds(companyId, q);
            const others = await OtherDebtor.findAll({
                where: { companyId, [Op.or]: [{ code: { [Op.iLike]: `%${q}%` } }, { name: { [Op.iLike]: `%${q}%` } }] },
                attributes: ['id'],
                limit: 200,
            });
            const or = [];
            if (membershipIds.length) or.push({ debtorType: 'membership', sourceId: { [Op.in]: membershipIds } });
            if (memberIds.length) or.push({ debtorType: 'member', sourceId: { [Op.in]: memberIds } });
            if (others.length) or.push({ debtorType: 'other', sourceId: { [Op.in]: others.map((o) => o.id) } });
            if (!or.length) return res.status(200).json({ total: 0, limit: SEARCH_LIMIT, offset: 0, debtors: [] });
            where[Op.and] = [{ [Op.or]: or }];
        }

        const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
        const { rows, count } = await Debtor.findAndCountAll({
            where,
            order: [['createdAt', 'DESC']],
            limit: SEARCH_LIMIT,
            offset,
        });

        // Batch-resolve the page's display data + pool balances.
        const ids = { membershipIds: [], memberIds: [], otherIds: [] };
        for (const d of rows) {
            if (d.debtorType === 'membership') ids.membershipIds.push(d.sourceId);
            else if (d.debtorType === 'member') ids.memberIds.push(d.sourceId);
            else ids.otherIds.push(d.sourceId);
        }
        const display = await membershipGateway.lookupPartyDisplay(companyId, ids);
        const others = ids.otherIds.length
            ? await OtherDebtor.findAll({ where: { id: { [Op.in]: ids.otherIds } }, attributes: ['id', 'code', 'name', 'isActive'] })
            : [];
        const otherById = new Map(others.map((o) => [o.id, o]));
        const pools = rows.length
            ? await CreditAccount.findAll({ where: { debtorId: { [Op.in]: rows.map((r) => r.id) } } })
            : [];
        const poolByDebtor = new Map(pools.map((p) => [p.debtorId, p]));

        res.status(200).json({
            total: count,
            limit: SEARCH_LIMIT,
            offset,
            debtors: rows.map((d) => {
                let no = null; let name = null; let sub = null;
                if (d.debtorType === 'membership') {
                    const m = display.memberships[d.sourceId];
                    no = m ? m.no : null; name = m ? m.name : null; sub = m ? m.membershipClass : null;
                } else if (d.debtorType === 'member') {
                    const m = display.members[d.sourceId];
                    no = m ? m.no : null; name = m ? m.name : null; sub = m && m.membershipNo ? `of ${m.membershipNo}` : null;
                } else {
                    const o = otherById.get(d.sourceId);
                    no = o ? o.code : null; name = o ? o.name : null; sub = null;
                }
                const pool = poolByDebtor.get(d.id);
                return {
                    id: d.id,
                    debtorType: d.debtorType,
                    sourceId: d.sourceId,
                    no,
                    name,
                    sub,
                    terms: d.terms,
                    sendReminders: d.sendReminders,
                    chargeInterest: d.chargeInterest,
                    status: d.status,
                    creditLimit: pool ? pool.creditLimit : '0.00',
                    outstanding: pool ? pool.outstanding : '0.00',
                    createdAt: d.createdAt,
                };
            }),
        });
    } catch (error) {
        console.error('Error listing debtors:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/ar/debtors/:id - maintain the ledger account: credit terms,
// statement/interest prefs, status, credit limit. The party fields are NOT
// editable here (they belong to the party master).
exports.updateDebtor = async (req, res) => {
    try {
        const { companyId, userId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const debtor = await Debtor.findOne({ where: { id: req.params.id, companyId } });
        if (!debtor) return res.status(404).json({ message: 'Debtor not found.' });
        if (!(await canModifyRecord(req, debtor))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }

        if ('terms' in req.body) {
            const t = req.body.terms;
            if (t === null || t === '' || t === undefined) debtor.terms = null;
            else {
                const n = Number(t);
                if (!Number.isInteger(n) || n < 0 || n > 3650) return res.status(400).json({ message: 'Terms must be a number of days (0-3650).' });
                debtor.terms = n;
            }
        }
        if ('sendReminders' in req.body) debtor.sendReminders = !!req.body.sendReminders;
        if ('chargeInterest' in req.body) debtor.chargeInterest = !!req.body.chargeInterest;
        if ('status' in req.body) {
            const s = str(req.body.status);
            if (!DEBTOR_STATUS_KEYS.includes(s)) return res.status(400).json({ message: 'Invalid debtor status.' });
            debtor.status = s;
        }

        let creditLimit = null;
        if ('creditLimit' in req.body) {
            const n = Number(req.body.creditLimit);
            if (!Number.isFinite(n) || n < 0) return res.status(400).json({ message: 'Credit limit must be zero or a positive amount.' });
            creditLimit = n.toFixed(2);
        }

        await sequelize.transaction(async (t) => {
            debtor.updatedBy = userId;
            await debtor.save({ transaction: t });
            if (creditLimit !== null) {
                // findOrCreate repairs a missing pool row (pre-slice-1 data or a
                // half-provisioned account) instead of silently dropping the edit.
                const [pool] = await CreditAccount.findOrCreate({
                    where: { debtorId: debtor.id },
                    defaults: { companyId, creditLimit, outstanding: 0 },
                    transaction: t,
                });
                if (pool.creditLimit !== creditLimit) {
                    pool.creditLimit = creditLimit;
                    pool.updatedBy = userId;
                    await pool.save({ transaction: t });
                }
            }
        });

        const pool = await CreditAccount.findOne({ where: { debtorId: debtor.id } });
        res.status(200).json({
            message: 'Debtor updated.',
            debtor: {
                id: debtor.id,
                debtorType: debtor.debtorType,
                sourceId: debtor.sourceId,
                terms: debtor.terms,
                sendReminders: debtor.sendReminders,
                chargeInterest: debtor.chargeInterest,
                status: debtor.status,
                creditLimit: pool ? pool.creditLimit : '0.00',
                outstanding: pool ? pool.outstanding : '0.00',
            },
        });
    } catch (error) {
        console.error('Error updating debtor:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/ar/reconcile { fix? } - the drift detector: verifies every
// materialized balance against the documents/allocations. Report-only unless
// fix=true (which repairs the counters to the computed truth). Also runs
// nightly (report-only) from the worker sweep.
exports.reconcile = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const { reconcileCompany } = require('./arReconciliation.service');
        const result = await reconcileCompany(companyId, { fix: req.body && req.body.fix === true });
        const n = result.discrepancies.length;
        res.status(200).json({
            message: n === 0
                ? 'All balances reconcile - no drift.'
                : `${n} discrepancy(ies) ${result.discrepancies.some((d) => d.fixed) ? 'repaired' : 'found'}.`,
            ...result,
        });
    } catch (err) {
        console.error('Error reconciling AR:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

module.exports.SEARCH_LIMIT = SEARCH_LIMIT;
module.exports.OTHER_DEBTOR_NUMBERING_PURPOSE = OTHER_DEBTOR_NUMBERING_PURPOSE;
