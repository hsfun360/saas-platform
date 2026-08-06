// Membership - Billing Schedules (fee runs): Generate & Post Membership Fee /
// Monthly Subscription Fee. Staged like the interest run: generate -> review
// items (skip what shouldn't bill) -> post selectively; each posted item
// becomes ONE AR Invoice through arGateway.postCharge. Lives in the
// membership module (producer owns its run), menu '/membership/billing' -
// granted to Finance via cross-module RBAC.

const { sequelize } = require('../../platform/db');
const BillingSchedule = require('./billingSchedule.model');
const BillingScheduleItem = require('./billingScheduleItem.model');
const TransactionType = require('./transactionType.model');
const billing = require('./billing.service');
const { getUserContext, getCallerPlacement } = require('../../platform/serviceContext');
const { quoteTax } = require('../../platform/taxGateway');
const arGateway = require('../../platform/arGateway');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const BILLING_TYPES = ['membership-fee', 'subscription-fee'];

function str(x) { return typeof x === 'string' ? x.trim() : ''; }

function ownershipStamps(req, placement) {
    const callerId = getUserContext(req).userId;
    return { createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId };
}

function scheduleDto(s) {
    return {
        id: s.id,
        billingType: s.billingType,
        periodMonth: s.periodMonth,
        docDate: s.docDate,
        trxDate: s.trxDate,
        totalAmount: s.totalAmount,
        itemCount: s.itemCount,
        status: s.status,
    };
}

function itemDto(i) {
    return {
        id: i.id,
        membershipId: i.membershipId,
        memberId: i.memberId,
        debtorTarget: i.debtorTarget,
        transactionTypeId: i.transactionTypeId,
        description: i.description,
        amount: i.amount,
        status: i.status,
        postedDocNo: i.postedDocNo,
        issue: i.issue,
    };
}

// POST /api/membership/billing-schedules { billingType, month, docDate, trxDate? }
exports.generate = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const billingType = str(req.body.billingType);
        if (!BILLING_TYPES.includes(billingType)) return res.status(400).json({ message: 'Select the billing type.' });
        const month = str(req.body.month);
        if (!MONTH_RE.test(month)) return res.status(400).json({ message: 'Month is required (YYYY-MM).' });
        const docDate = str(req.body.docDate);
        if (!DATE_RE.test(docDate)) return res.status(400).json({ message: 'Document date is required (YYYY-MM-DD).' });
        const trxDate = str(req.body.trxDate) || docDate;
        if (!DATE_RE.test(trxDate)) return res.status(400).json({ message: 'Transaction date must be YYYY-MM-DD.' });

        const placement = await getCallerPlacement(req);
        const stamps = ownershipStamps(req, placement);

        let result;
        try {
            result = await billing.generateSchedule({
                companyId, billingType, periodMonth: `${month}-01`, docDate, trxDate, stamps,
            });
        } catch (e) {
            if (e && e.httpStatus) return res.status(e.httpStatus).json({ message: e.message });
            throw e;
        }
        res.status(201).json({
            message: `${result.generated} item(s) generated - total ${result.schedule.totalAmount}.`
                + (result.warnings.length ? ` ${result.warnings.length} warning(s).` : ''),
            schedule: scheduleDto(result.schedule),
            warnings: result.warnings.slice(0, 50),
        });
    } catch (err) {
        console.error('Error generating billing schedule:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/membership/billing-schedules?month=YYYY-MM
exports.list = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const where = { companyId };
        const month = str(req.query.month);
        if (MONTH_RE.test(month)) where.periodMonth = `${month}-01`;
        const rows = await BillingSchedule.findAll({
            where,
            order: [['periodMonth', 'DESC'], ['billingType', 'ASC'], ['createdAt', 'DESC']],
            limit: 100,
        });
        res.status(200).json({ schedules: rows.map(scheduleDto) });
    } catch (err) {
        console.error('Error listing billing schedules:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/membership/billing-schedules/:id - header + items.
exports.get = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const schedule = await BillingSchedule.findOne({ where: { id: req.params.id, companyId } });
        if (!schedule) return res.status(404).json({ message: 'Billing schedule not found.' });
        const items = await BillingScheduleItem.findAll({
            where: { billingScheduleId: schedule.id },
            order: [['description', 'ASC']],
        });
        res.status(200).json({ schedule: scheduleDto(schedule), items: items.map(itemDto) });
    } catch (err) {
        console.error('Error loading billing schedule:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/membership/billing-schedules/:id/post { itemIds } - selective
// posting: one AR Invoice per pending item, per-id results.
exports.post = async (req, res) => {
    try {
        const { companyId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const schedule = await BillingSchedule.findOne({ where: { id: req.params.id, companyId } });
        if (!schedule) return res.status(404).json({ message: 'Billing schedule not found.' });
        if (schedule.status === 'cancelled') return res.status(400).json({ message: 'This schedule is cancelled.' });
        const ids = Array.isArray(req.body.itemIds) ? req.body.itemIds.filter((x) => typeof x === 'string') : [];
        if (!ids.length) return res.status(400).json({ message: 'Select at least one item to post.' });

        const placement = await getCallerPlacement(req);
        const stamps = ownershipStamps(req, placement);

        const results = [];
        for (const id of ids) {
            const item = await BillingScheduleItem.findOne({ where: { id, billingScheduleId: schedule.id } });
            if (!item) { results.push({ id, ok: false, message: 'Not found.' }); continue; }
            if (item.status !== 'pending') { results.push({ id, ok: false, message: `Already ${item.status}.` }); continue; }

            const txn = await TransactionType.findOne({ where: { id: item.transactionTypeId, companyId } });
            if (!txn) {
                item.status = 'failed';
                item.issue = 'Transaction type not found.';
                await item.save();
                results.push({ id, ok: false, message: item.issue });
                continue;
            }

            // Tax snapshot from the billing item's scheme (single tax source).
            const amountC = billing.cents(item.amount);
            let amounts = { netC: amountC, taxC: 0, grossC: amountC, taxSchemeCode: null, taxRate: null };
            if (txn.taxSchemeCode) {
                const q = await quoteTax(req, { taxSchemeCode: txn.taxSchemeCode, amount: amountC / 100, onDate: schedule.docDate });
                if (!q) {
                    item.status = 'failed';
                    item.issue = `Tax scheme '${txn.taxSchemeCode}' could not be resolved.`;
                    await item.save();
                    results.push({ id, ok: false, message: item.issue });
                    continue;
                }
                amounts = {
                    netC: billing.cents(q.net),
                    taxC: billing.cents(q.taxTotal),
                    grossC: billing.cents(q.gross),
                    taxSchemeCode: txn.taxSchemeCode,
                    taxRate: q.lines.reduce((s, l) => s + Number(l.taxRate || 0), 0).toFixed(4),
                };
            }

            const posted = await arGateway.postCharge(req, {
                debtorType: item.debtorTarget,
                sourceId: item.debtorTarget === 'membership' ? item.membershipId : item.memberId,
                docDate: schedule.docDate,
                trxDate: schedule.trxDate,
                transactionTypeId: txn.id,
                isInterestChargeable: txn.isInterestChargeable === true,
                description: item.description,
                incurredByMemberId: item.incurredByMemberId,
                sourceModule: 'membership',
                sourceRef: item.id,
                amounts,
                stamps,
            });
            if (posted.error) {
                item.status = 'failed';
                item.issue = posted.error;
                await item.save();
                results.push({ id, ok: false, message: posted.error });
            } else {
                item.status = 'posted';
                item.postedLedgerId = posted.id;
                item.postedDocNo = posted.docNo;
                item.issue = null;
                item.updatedBy = stamps.updatedBy;
                await item.save();
                results.push({ id, ok: true, message: `Posted ${posted.docNo}.`, docNo: posted.docNo });
            }
        }

        await billing.refreshSchedule(schedule);
        const okCount = results.filter((r) => r.ok).length;
        res.status(200).json({
            message: `${okCount} Invoice(s) posted${okCount < results.length ? `, ${results.length - okCount} failed/skipped` : ''}.`,
            results,
            schedule: scheduleDto(schedule),
        });
    } catch (err) {
        console.error('Error posting billing schedule:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/membership/billing-schedule-items/:id { status } - review skip
// toggle (pending <-> skipped only; posted/failed rows are immutable audit).
exports.setItemStatus = async (req, res) => {
    try {
        const { companyId, userId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const item = await BillingScheduleItem.findOne({ where: { id: req.params.id, companyId } });
        if (!item) return res.status(404).json({ message: 'Item not found.' });
        const next = str(req.body.status);
        if (!['pending', 'skipped'].includes(next) || !['pending', 'skipped'].includes(item.status)) {
            return res.status(400).json({ message: 'Only pending items can be skipped (and un-skipped).' });
        }
        item.status = next;
        item.updatedBy = userId;
        await item.save();
        const schedule = await BillingSchedule.findOne({ where: { id: item.billingScheduleId, companyId } });
        if (schedule) await billing.refreshSchedule(schedule);
        res.status(200).json({ message: next === 'skipped' ? 'Item skipped.' : 'Item restored.', item: itemDto(item) });
    } catch (err) {
        console.error('Error updating billing item:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/membership/billing-schedules/:id/cancel - only while nothing has
// posted (posted Invoices are corrected in AR, never by cancelling the run).
exports.cancel = async (req, res) => {
    try {
        const { companyId, userId } = getUserContext(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const schedule = await BillingSchedule.findOne({ where: { id: req.params.id, companyId } });
        if (!schedule) return res.status(404).json({ message: 'Billing schedule not found.' });
        const postedCount = await BillingScheduleItem.count({ where: { billingScheduleId: schedule.id, status: 'posted' } });
        if (postedCount > 0) {
            return res.status(400).json({ message: 'Items have already posted - void the Invoices in AR instead of cancelling the schedule.' });
        }
        schedule.status = 'cancelled';
        schedule.updatedBy = userId;
        await schedule.save();
        res.status(200).json({ message: 'Billing schedule cancelled.' });
    } catch (err) {
        console.error('Error cancelling billing schedule:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};
