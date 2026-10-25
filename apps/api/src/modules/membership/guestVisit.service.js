// Guest-allowance ledger (structure approved 2026-10-25): the Membership-
// owned functions platform/membershipGateway.js exposes to the producer
// modules. The month window is pure (unit-tested); the three ledger
// operations are thin and transaction-aware.

const { Op } = require('sequelize');

// The calendar month that contains an ISO date ('YYYY-MM-DD'): first and
// last day as ISO strings. Dates are club-local DATEONLY values already, so
// no timezone arithmetic happens here.
function monthRange(isoDate) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ''));
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (month < 1 || month > 12) return null;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const mm = String(month).padStart(2, '0');
    return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` };
}

// { allowance, used, remaining } for the host member in the month of `date`.
// allowance NULL = no limit (remaining NULL); 0 = no guests at all.
function standingOf(allowance, used) {
    const a = allowance === null || allowance === undefined ? null : Number(allowance);
    const u = Number(used) || 0;
    return { allowance: a, used: u, remaining: a === null ? null : Math.max(0, a - u) };
}

// Sum of confirmed guests the member hosted in the month of `date`.
async function usedInMonth(companyId, memberId, date, { transaction } = {}) {
    const GuestVisit = require('./guestVisit.model');
    const range = monthRange(date);
    if (!range) return 0;
    const n = await GuestVisit.sum('guestCount', {
        where: { companyId, memberId, status: 'confirmed', visitDate: { [Op.between]: [range.from, range.to] } },
        transaction,
    });
    return Number(n) || 0;
}

// The host's EFFECTIVE monthly allowance: the member's membership type
// (nominee override, else the contract's type) -> monthlyGuestAllowance.
async function allowanceOf(companyId, memberId, { transaction } = {}) {
    const Member = require('./member.model');
    const Membership = require('./membership.model');
    const MembershipType = require('./membershipType.model');
    const row = await Member.findOne({ where: { id: memberId, companyId }, attributes: ['id', 'membershipId', 'membershipTypeId'], transaction });
    if (!row) return { found: false, allowance: null };
    let typeId = row.membershipTypeId || null;
    if (!typeId && row.membershipId) {
        const contract = await Membership.findByPk(row.membershipId, { attributes: ['membershipTypeId'], transaction });
        typeId = contract ? contract.membershipTypeId : null;
    }
    const type = typeId ? await MembershipType.findByPk(typeId, { attributes: ['monthlyGuestAllowance'], transaction }) : null;
    return { found: true, allowance: type && type.monthlyGuestAllowance !== null && type.monthlyGuestAllowance !== undefined ? Number(type.monthlyGuestAllowance) : null };
}

async function getStanding(companyId, memberId, date, opts = {}) {
    const { found, allowance } = await allowanceOf(companyId, memberId, opts);
    if (!found) return null;
    const used = await usedInMonth(companyId, memberId, date, opts);
    return standingOf(allowance, used);
}

// Record one confirmed visit (idempotent on (sourceModule, sourceRef): a
// retry updates the row instead of double-counting).
async function record(companyId, { memberId, visitDate, sourceModule, sourceRef, guestName = null, guestCount = 1, stamps = {} }, { transaction } = {}) {
    const GuestVisit = require('./guestVisit.model');
    const existing = await GuestVisit.findOne({ where: { sourceModule, sourceRef }, transaction });
    if (existing) {
        Object.assign(existing, { companyId, memberId, visitDate, guestName, guestCount, status: 'confirmed', voidedAt: null, updatedBy: stamps.updatedBy || null });
        await existing.save({ transaction });
        return existing;
    }
    return GuestVisit.create({ companyId, memberId, visitDate, sourceModule, sourceRef, guestName, guestCount, status: 'confirmed', ...stamps }, { transaction });
}

// Void the visit of a producer line (no-op when none exists).
async function voidVisit(companyId, sourceModule, sourceRef, { transaction, updatedBy = null } = {}) {
    const GuestVisit = require('./guestVisit.model');
    const row = await GuestVisit.findOne({ where: { companyId, sourceModule, sourceRef }, transaction });
    if (!row || row.status === 'voided') return row || null;
    row.status = 'voided';
    row.voidedAt = new Date();
    row.updatedBy = updatedBy;
    await row.save({ transaction });
    return row;
}

module.exports = { monthRange, standingOf, usedInMonth, allowanceOf, getStanding, record, voidVisit };
