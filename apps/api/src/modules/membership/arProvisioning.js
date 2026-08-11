// src/modules/membership/arProvisioning.js
//
// PRODUCER side of AR debtor provisioning (design approved 2026-08-05).
// Membership decides WHEN a ledger account is due (a contract or nominee
// enters an active status class) and sends everything AR needs in the event
// payload (event-carried state via platform/arGateway.js) - AR never reads
// membership tables.
//
// Rules (ar-debtor design):
//   - Contract debtor (debtorType 'membership') for EVERY membership, both
//     classes - an individual membership's single debtor carries everything.
//   - Personal debtor (debtorType 'member') EAGERLY for every active NOMINEE
//     (frontend charges and possibly their own subscription always land
//     there). Individual members and dependents never get one.
//   - Credit terms seed from the membership/member row ONCE; after that the AR
//     Debtor screen is the single maintenance place (credit-terms migration
//     decision) - replayed events never overwrite AR's copy.
//   - Enqueue is idempotent end-to-end, so callers fire on every entry into an
//     active class without checking whether the account already exists.

const { Op } = require('sequelize');
const { enqueueDebtorProvisioning } = require('../../platform/arGateway');

// Status classes that mean "this party is live" - entering one opens the
// ledger account (membershipStatus.constants STATUS_CLASSES).
const ACTIVE_STATUS_CLASSES = ['active', 'active-absent'];

function isActiveClass(statusRow) {
    return !!statusRow && ACTIVE_STATUS_CLASSES.includes(statusRow.statusClass);
}

function toInt(x) { const n = Number(x); return Number.isInteger(n) ? n : null; }
function toMoney(x) { const n = Number(x); return Number.isFinite(n) && n > 0 ? n : 0; }

// Person display name: "First Last" -> native-script name -> member number.
// Mirrors platform/membershipGateway personName so the AR snapshot matches
// what the listing resolves live.
function personDisplayName(member) {
    const name = [member.firstName, member.lastName].filter(Boolean).join(' ').trim();
    return name || member.localName || member.memberNo || null;
}

// A contract debtor's display name: the corporate name (corporate class) or
// the individual member's own name (individual class - the contract debtor IS
// the person). Falls back to the membership number so the payload always
// carries SOMETHING once numbering has run.
async function contractDisplayName(membership, transaction) {
    if (membership.membershipClass === 'corporate') {
        return membership.corporateName || membership.membershipNo || null;
    }
    const Member = require('./member.model');
    const person = await Member.findOne({
        where: { companyId: membership.companyId, membershipId: membership.id, memberKind: 'individual' },
        attributes: ['firstName', 'lastName', 'localName', 'memberNo'],
        transaction,
    });
    return (person && personDisplayName(person)) || membership.membershipNo || null;
}

// The contract debtor payload, seeded from the Membership credit card.
// `requestedBy` (a userId) makes the worker notify that user when the ledger
// account is actually opened or terminally fails - interactive saves pass it,
// bulk paths (import migrate, backfill) leave it off so they stay silent.
async function provisionContractDebtor(membership, transaction, requestedBy = null) {
    await enqueueDebtorProvisioning({
        companyId: membership.companyId,
        debtorType: 'membership',
        sourceId: membership.id,
        sourceNo: membership.membershipNo || null,
        name: await contractDisplayName(membership, transaction),
        requestedBy,
        terms: toInt(membership.terms),
        creditLimit: toMoney(membership.creditLimit),
        sendReminders: !!membership.sendReminders,
        chargeInterest: !!membership.chargeInterest,
    }, transaction);
}

// A nominee's personal debtor: repayment terms follow the contract, the limit
// seeds from the nominee's own member-level credit limit.
async function provisionNomineeDebtor(member, membership, transaction, requestedBy = null) {
    await enqueueDebtorProvisioning({
        companyId: member.companyId,
        debtorType: 'member',
        sourceId: member.id,
        sourceNo: member.memberNo || null,
        name: personDisplayName(member),
        requestedBy,
        terms: toInt(membership.terms),
        creditLimit: toMoney(member.creditLimit),
        sendReminders: !!membership.sendReminders,
        chargeInterest: !!membership.chargeInterest,
    }, transaction);
}

// Fire-if-active helpers for the controller hook points. `statusRow` is the
// resolved MembershipStatus the caller already validated. `requestedBy` is the
// interactive caller's userId (bell notification target) - omit for bulk runs.
async function onMembershipStatus(membership, statusRow, transaction, requestedBy = null) {
    if (isActiveClass(statusRow)) await provisionContractDebtor(membership, transaction, requestedBy);
}

async function onMemberStatus(member, membership, statusRow, transaction, requestedBy = null) {
    if (member.memberKind === 'nominee' && isActiveClass(statusRow)) {
        await provisionNomineeDebtor(member, membership, transaction, requestedBy);
    }
}

// Backfill for data that predates AR (or arrived via import before the hooks):
// enqueue a provisioning event for every currently-active contract + nominee
// of the company. Idempotent - existing debtors are untouched - so it is safe
// to re-run any time. Returns the enqueued counts.
async function backfillCompanyDebtors(companyId, sequelize) {
    const Membership = require('./membership.model');
    const Member = require('./member.model');
    const MembershipStatus = require('./membershipStatus.model');

    const activeStatuses = await MembershipStatus.findAll({
        where: { companyId, statusClass: { [Op.in]: ACTIVE_STATUS_CLASSES } },
        attributes: ['id'],
    });
    const activeIds = activeStatuses.map((s) => s.id);
    if (!activeIds.length) return { memberships: 0, nominees: 0 };

    const memberships = await Membership.findAll({
        where: { companyId, membershipStatusId: { [Op.in]: activeIds } },
    });
    const nominees = await Member.findAll({
        where: { companyId, memberKind: 'nominee', memberStatusId: { [Op.in]: activeIds } },
    });
    const membershipById = new Map(memberships.map((m) => [m.id, m]));
    // A nominee can be active under a non-active contract snapshot; fetch any
    // missing parents so their terms still seed correctly.
    const missingParents = [...new Set(nominees.map((n) => n.membershipId))].filter((id) => !membershipById.has(id));
    if (missingParents.length) {
        const extra = await Membership.findAll({ where: { companyId, id: { [Op.in]: missingParents } } });
        for (const m of extra) membershipById.set(m.id, m);
    }

    await sequelize.transaction(async (t) => {
        for (const m of memberships) await provisionContractDebtor(m, t);
        for (const n of nominees) {
            const parent = membershipById.get(n.membershipId);
            if (parent) await provisionNomineeDebtor(n, parent, t);
        }
    });
    return { memberships: memberships.length, nominees: nominees.length };
}

module.exports = {
    ACTIVE_STATUS_CLASSES,
    isActiveClass,
    onMembershipStatus,
    onMemberStatus,
    backfillCompanyDebtors,
};
