// src/modules/membership/billing.service.js
//
// Fee-run GENERATION (approved 2026-08-06). The producer resolves everything
// membership-side - fee amounts, effective types, exact-status standing
// charges, bear-flag debtor routing - into BillingSchedule/-Item holding rows.
// AR stays dumb: posting (billing.controller) sends fully resolved charges
// through arGateway.postCharge, one Invoice per item.
//
// Amount sources (user-confirmed assumptions):
//   membership-fee    - the contract's assigned Membership Fee master amount;
//                       billed monthly when Membership.monthlyFee, or in the
//                       joinDate anniversary month when Membership.yearlyFee
//                       (neither flag = billed at joining, not by the run).
//                       Only contracts in an active status class bill.
//   subscription-fee  - the EFFECTIVE membership type's Standing Charges rows
//                       matched by the person's EXACT status (the master says
//                       "applies while carrying status X" - no class filter):
//                       individual member -> contract debtor; corporate
//                       contract's own charges -> contract debtor; nominee ->
//                       effective type (override ?? contract's) + bear flag
//                       (subscriptionBorneBy ?? contract default) decides
//                       contract vs personal debtor. Dependents never bill.
//       Frequencies: monthly = every month; fixed-month = that month only;
//       annually = the joinDate anniversary month.

const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const Membership = require('./membership.model');
const Member = require('./member.model');
const MembershipStatus = require('./membershipStatus.model');
const MembershipFee = require('./membershipFee.model');
const MembershipType = require('./membershipType.model');
const MembershipTypeStandingCharge = require('./membershipTypeStandingCharge.model');
const TransactionType = require('./transactionType.model');
const BillingSchedule = require('./billingSchedule.model');
const BillingScheduleItem = require('./billingScheduleItem.model');

const ACTIVE_STATUS_CLASSES = ['active', 'active-absent'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function cents(v) { return Math.round(Number(v || 0) * 100); }
function money(c) { return (c / 100).toFixed(2); }
function bizError(status, message) { const e = new Error(message); e.httpStatus = status; return e; }
function monthOf(dateStr) { return Number(String(dateStr || '').split('-')[1] || 0); }
function monthLabel(periodMonth) {
    const [y, m] = String(periodMonth).split('-').map(Number);
    return `${MONTH_NAMES[m - 1]} ${y}`;
}

// A standing-charge row applies in this month? (anniversaryMonth = the
// person's/contract's joinDate month, for 'annually'.)
function chargeAppliesInMonth(charge, billMonth, anniversaryMonth) {
    if (charge.frequency === 'monthly') return true;
    if (charge.frequency === 'fixed-month') return charge.fixedMonth === billMonth;
    if (charge.frequency === 'annually') return anniversaryMonth === billMonth;
    return false;
}

// Generate one schedule + its items. Returns { schedule, generated, warnings }.
async function generateSchedule({ companyId, billingType, periodMonth, docDate, trxDate, stamps }) {
    const existing = await BillingSchedule.findOne({
        where: { companyId, billingType, periodMonth, status: { [Op.ne]: 'cancelled' } },
        attributes: ['id', 'status'],
    });
    if (existing) throw bizError(409, `A ${billingType} schedule for this month already exists (${existing.status}).`);

    const statuses = await MembershipStatus.findAll({ where: { companyId } });
    const statusById = new Map(statuses.map((s) => [s.id, s]));
    const isActiveStatus = (id) => {
        const s = statusById.get(id);
        return !!s && ACTIVE_STATUS_CLASSES.includes(s.statusClass);
    };

    const memberships = await Membership.findAll({ where: { companyId } });
    const billMonth = monthOf(periodMonth);
    const label = monthLabel(periodMonth);
    const warnings = [];
    const items = [];

    if (billingType === 'membership-fee') {
        // The billing item every membership-fee Invoice posts under.
        const feeTxnType = await TransactionType.findOne({
            where: { companyId, chargeType: 'membership-fee', isActive: true },
            order: [['transactionType', 'ASC']],
        });
        if (!feeTxnType) throw bizError(400, 'Create an active membership-fee Transaction Type first.');

        const fees = await MembershipFee.findAll({ where: { companyId } });
        const feeById = new Map(fees.map((f) => [f.id, f]));
        const individualByMembership = new Map(
            (await Member.findAll({ where: { companyId, memberKind: 'individual' }, attributes: ['id', 'membershipId'] }))
                .map((m) => [m.membershipId, m.id]),
        );

        for (const ms of memberships) {
            if (!isActiveStatus(ms.membershipStatusId)) continue;
            const due = ms.monthlyFee || (ms.yearlyFee && monthOf(ms.joinDate) === billMonth);
            if (!due) continue;
            if (!ms.membershipFeeId) { warnings.push(`${ms.membershipNo}: no membership fee assigned`); continue; }
            const fee = feeById.get(ms.membershipFeeId);
            if (!fee || fee.isActive === false) { warnings.push(`${ms.membershipNo}: membership fee not found or disabled`); continue; }
            if (cents(fee.amount) <= 0) continue;

            items.push({
                companyId,
                membershipId: ms.id,
                memberId: null,
                incurredByMemberId: ms.membershipClass === 'individual'
                    ? (individualByMembership.get(ms.id) || null) : null,
                debtorTarget: 'membership',
                transactionTypeId: feeTxnType.id,
                description: `${fee.membershipFeeCode} - Membership fee ${label} (${ms.membershipNo})`,
                amount: money(cents(fee.amount)),
                status: 'pending',
                ...stamps,
            });
        }
    } else {
        // subscription-fee: exact-status standing charges of the effective type.
        const types = await MembershipType.findAll({ where: { companyId }, attributes: ['id'] });
        const charges = await MembershipTypeStandingCharge.findAll({
            where: { membershipTypeId: { [Op.in]: types.map((t) => t.id) } },
        });
        const chargesByTypeStatus = new Map();
        for (const c of charges) {
            const key = `${c.membershipTypeId}:${c.membershipStatusId}`;
            if (!chargesByTypeStatus.has(key)) chargesByTypeStatus.set(key, []);
            chargesByTypeStatus.get(key).push(c);
        }
        const txnTypes = await TransactionType.findAll({ where: { companyId } });
        const txnByCode = new Map(txnTypes.map((t) => [t.transactionType, t]));
        const membershipById = new Map(memberships.map((m) => [m.id, m]));
        const members = await Member.findAll({ where: { companyId, memberKind: { [Op.in]: ['individual', 'nominee'] } } });

        // One person's (or the corporate contract's) charge rows for the month.
        const pushCharges = ({ ms, typeId, statusId, joinDate, memberId, incurredByMemberId, debtorTarget, who }) => {
            const rows = chargesByTypeStatus.get(`${typeId}:${statusId}`) || [];
            for (const c of rows) {
                if (!chargeAppliesInMonth(c, billMonth, monthOf(joinDate))) continue;
                if (cents(c.amount) <= 0) continue;
                const txn = txnByCode.get(c.transactionType);
                if (!txn || txn.isActive === false) {
                    warnings.push(`${who}: transaction type '${c.transactionType}' not found or disabled`);
                    continue;
                }
                items.push({
                    companyId,
                    membershipId: ms.id,
                    memberId,
                    incurredByMemberId,
                    debtorTarget,
                    transactionTypeId: txn.id,
                    description: `${c.transactionType} - Subscription ${label} (${who})`,
                    amount: money(cents(c.amount)),
                    status: 'pending',
                    ...stamps,
                });
            }
        };

        for (const person of members) {
            const ms = membershipById.get(person.membershipId);
            if (!ms) continue;
            if (person.memberKind === 'individual') {
                pushCharges({
                    ms,
                    typeId: ms.membershipTypeId,
                    statusId: person.memberStatusId,
                    joinDate: person.joinDate || ms.joinDate,
                    memberId: null,
                    incurredByMemberId: person.id,
                    debtorTarget: 'membership',
                    who: person.memberNo,
                });
            } else {
                const borne = person.subscriptionBorneBy
                    || (ms.nomineeSubscriptionBorneByCompany ? 'company' : 'self');
                pushCharges({
                    ms,
                    typeId: person.membershipTypeId || ms.membershipTypeId,
                    statusId: person.memberStatusId,
                    joinDate: person.joinDate || ms.joinDate,
                    memberId: person.id,
                    incurredByMemberId: person.id,
                    debtorTarget: borne === 'company' ? 'membership' : 'member',
                    who: person.memberNo,
                });
            }
        }
        // The corporate CONTRACT's own subscription (its type + its status).
        for (const ms of memberships) {
            if (ms.membershipClass !== 'corporate') continue;
            pushCharges({
                ms,
                typeId: ms.membershipTypeId,
                statusId: ms.membershipStatusId,
                joinDate: ms.joinDate,
                memberId: null,
                incurredByMemberId: null,
                debtorTarget: 'membership',
                who: ms.membershipNo,
            });
        }
    }

    const totalC = items.reduce((s, i) => s + cents(i.amount), 0);
    const schedule = await sequelize.transaction(async (t) => {
        const header = await BillingSchedule.create({
            companyId, billingType, periodMonth, docDate, trxDate,
            totalAmount: money(totalC), itemCount: items.length, status: 'pending', ...stamps,
        }, { transaction: t });
        if (items.length) {
            await BillingScheduleItem.bulkCreate(
                items.map((i) => ({ ...i, billingScheduleId: header.id })),
                { transaction: t },
            );
        }
        return header;
    });

    return { schedule, generated: items.length, warnings };
}

// Recompute a schedule's rollups (after skip toggles / posting) and derive its
// status: cancelled stays; else pending -> partially-posted -> posted as items
// resolve. totalAmount = non-skipped items.
async function refreshSchedule(schedule) {
    const items = await BillingScheduleItem.findAll({
        where: { billingScheduleId: schedule.id },
        attributes: ['amount', 'status'],
    });
    const active = items.filter((i) => i.status !== 'skipped');
    const pending = items.filter((i) => i.status === 'pending').length;
    const posted = items.filter((i) => i.status === 'posted').length;
    schedule.totalAmount = money(active.reduce((s, i) => s + cents(i.amount), 0));
    schedule.itemCount = items.length;
    if (schedule.status !== 'cancelled') {
        schedule.status = pending > 0 ? (posted > 0 ? 'partially-posted' : 'pending') : (posted > 0 ? 'posted' : 'pending');
    }
    await schedule.save();
    return schedule;
}

module.exports = { generateSchedule, refreshSchedule, monthLabel, cents, money, bizError };
