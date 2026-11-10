// Guest-allowance ledger (structure approved 2026-10-25; guest identity and
// the once-per-day rule 2026-11-10): the Membership-owned functions
// platform/membershipGateway.js exposes to the producer modules, plus the
// Guest Visits enquiry. The month window and the counting rule are pure
// (unit-tested); the ledger operations are thin and transaction-aware.

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

// THE counting rule (2026-11-10): how many guest visits a set of confirmed
// ledger lines amounts to. A KNOWN guest (guestId) counts once per host per
// day, however many lines the modules wrote for them (registered at the
// desk, then on a court booking, then on a flight = 1); a line without a
// guest record counts its own guestCount, as before.
function countVisits(lines) {
    const seen = new Set();
    let total = 0;
    for (const l of lines || []) {
        if (l.guestId) {
            const key = `${l.memberId}|${l.guestId}|${String(l.visitDate)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            total += 1;
        } else {
            total += Number(l.guestCount) || 0;
        }
    }
    return total;
}

// Guest visits the member hosted in the month of `date` (the counting rule).
async function usedInMonth(companyId, memberId, date, { transaction } = {}) {
    const GuestVisit = require('./guestVisit.model');
    const range = monthRange(date);
    if (!range) return 0;
    const rows = await GuestVisit.findAll({
        where: { companyId, memberId, status: 'confirmed', visitDate: { [Op.between]: [range.from, range.to] } },
        attributes: ['memberId', 'guestId', 'visitDate', 'guestCount'],
        transaction,
    });
    return countVisits(rows);
}

// Whether this host already has a confirmed line for this KNOWN guest on the
// date - a further line for them draws nothing more from the allowance.
async function alreadyCounted(companyId, memberId, guestId, date, { transaction, excludeSource = null } = {}) {
    if (!guestId) return false;
    const GuestVisit = require('./guestVisit.model');
    const where = { companyId, memberId, guestId, visitDate: String(date), status: 'confirmed' };
    if (excludeSource) where[Op.not] = { sourceModule: excludeSource.sourceModule, sourceRef: excludeSource.sourceRef };
    return (await GuestVisit.count({ where, transaction })) > 0;
}

// The host's EFFECTIVE monthly allowance: the member's membership type
// (nominee override, else the membership's type) -> monthlyGuestAllowance.
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
// retry updates the row instead of double-counting). `guestId` is optional -
// a producer that knows the membership.Guest passes it so the visit joins
// the once-per-day rule.
async function record(companyId, { memberId, visitDate, sourceModule, sourceRef, guestId = null, guestName = null, guestCount = 1, stamps = {} }, { transaction } = {}) {
    const GuestVisit = require('./guestVisit.model');
    const existing = await GuestVisit.findOne({ where: { sourceModule, sourceRef }, transaction });
    if (existing) {
        Object.assign(existing, { companyId, memberId, visitDate, guestId, guestName, guestCount, status: 'confirmed', voidedAt: null, updatedBy: stamps.updatedBy || null });
        await existing.save({ transaction });
        return existing;
    }
    return GuestVisit.create({ companyId, memberId, visitDate, sourceModule, sourceRef, guestId, guestName, guestCount, status: 'confirmed', ...stamps }, { transaction });
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

// ---- Guest Visits enquiry (Membership Management -> Guest Visits) ----------

const SOURCE_LABELS = { membership: 'Guest Registration', facility: 'Facility', golf: 'Golf' };
const REPORT_LINE_CAP = 5000;

function personName(m) {
    const name = [m.firstName, m.lastName].filter(Boolean).join(' ').trim();
    return name || m.localName || m.memberNo;
}

// Group ledger lines into the two views the screen offers. Pure: `lines` are
// plain objects already carrying the display fields.
//   byMember: one entry per host - { memberId, memberNo, memberName, visits, lines }
//   byGuest:  one entry per KNOWN guest - { guestId, guestName, visits, hosts, lines }
// `visits` follows the counting rule; entries sort by visits, most first.
function groupReport(lines) {
    const members = new Map();
    const guests = new Map();
    for (const l of lines) {
        if (!members.has(l.memberId)) members.set(l.memberId, { memberId: l.memberId, memberNo: l.memberNo, memberName: l.memberName, lines: [] });
        members.get(l.memberId).lines.push(l);
        if (l.guestId) {
            if (!guests.has(l.guestId)) guests.set(l.guestId, { guestId: l.guestId, guestName: l.guestName, lines: [] });
            guests.get(l.guestId).lines.push(l);
        }
    }
    const byMember = [...members.values()].map((m) => ({ ...m, visits: countVisits(m.lines) }));
    const byGuest = [...guests.values()].map((g) => ({ ...g, visits: countVisits(g.lines), hosts: new Set(g.lines.map((l) => l.memberId)).size }));
    const order = (a, b) => b.visits - a.visits || String(a.memberNo || a.guestName || '').localeCompare(String(b.memberNo || b.guestName || ''));
    byMember.sort(order);
    byGuest.sort(order);
    return { byMember, byGuest, totalVisits: countVisits(lines) };
}

// GET /api/membership/guest-visits?dateFrom&dateTo&memberNo - every confirmed
// guest visit in the range, across the modules, grouped for the screen.
async function report(req, query) {
    const { getUserContext } = require('../../platform/serviceContext');
    const GuestVisit = require('./guestVisit.model');
    const Guest = require('./guest.model');
    const Member = require('./member.model');
    const GuestRegistration = require('./guestRegistration.model');
    const companyId = getUserContext(req).companyId;
    if (!companyId) return { error: 'Select a workspace first.', status: 400 };
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    const dateFrom = String(query.dateFrom || '');
    const dateTo = String(query.dateTo || '');
    if (!DATE_RE.test(dateFrom) || !DATE_RE.test(dateTo)) return { error: 'Pick the date range.', status: 400 };
    if (dateFrom > dateTo) return { error: 'The range ends before it starts.', status: 400 };

    const where = { companyId, status: 'confirmed', visitDate: { [Op.between]: [dateFrom, dateTo] } };
    const memberNo = typeof query.memberNo === 'string' ? query.memberNo.trim() : '';
    if (memberNo) {
        const host = await Member.findOne({ where: { companyId, memberNo: { [Op.iLike]: memberNo } }, attributes: ['id'] });
        if (!host) return { error: `No member found with number '${memberNo}'.`, status: 404 };
        where.memberId = host.id;
    }
    const rows = await GuestVisit.findAll({ where, order: [['visitDate', 'DESC'], ['createdAt', 'DESC']], limit: REPORT_LINE_CAP + 1 });
    const capped = rows.length > REPORT_LINE_CAP;
    if (capped) rows.length = REPORT_LINE_CAP;

    const memberIds = [...new Set(rows.map((r) => r.memberId))];
    const guestIds = [...new Set(rows.map((r) => r.guestId).filter(Boolean))];
    const regIds = rows.filter((r) => r.sourceModule === 'membership').map((r) => r.sourceRef);
    const [members, guests, regs] = await Promise.all([
        memberIds.length ? Member.findAll({ where: { companyId, id: { [Op.in]: memberIds } }, attributes: ['id', 'memberNo', 'firstName', 'lastName', 'localName'] }) : [],
        guestIds.length ? Guest.findAll({ where: { companyId, id: { [Op.in]: guestIds } }, attributes: ['id', 'name'] }) : [],
        regIds.length ? GuestRegistration.findAll({ where: { companyId, id: { [Op.in]: regIds } }, attributes: ['id', 'registrationNo'] }) : [],
    ]);
    const memberById = new Map(members.map((m) => [m.id, m]));
    const guestById = new Map(guests.map((g) => [g.id, g]));
    const regById = new Map(regs.map((r) => [r.id, r]));

    const lines = rows.map((r) => {
        const m = memberById.get(r.memberId);
        const g = r.guestId ? guestById.get(r.guestId) : null;
        const reg = r.sourceModule === 'membership' ? regById.get(r.sourceRef) : null;
        return {
            id: r.id,
            visitDate: String(r.visitDate),
            memberId: r.memberId,
            memberNo: m ? m.memberNo : '',
            memberName: m ? personName(m) : '',
            guestId: r.guestId || null,
            guestName: (g && g.name) || r.guestName || 'Guest',
            guestCount: r.guestCount,
            sourceModule: r.sourceModule,
            sourceLabel: SOURCE_LABELS[r.sourceModule] || r.sourceModule,
            reference: reg ? reg.registrationNo : null,
        };
    });
    return { dateFrom, dateTo, capped, lineCount: lines.length, ...groupReport(lines) };
}

module.exports = { monthRange, standingOf, countVisits, usedInMonth, alreadyCounted, allowanceOf, getStanding, record, voidVisit, groupReport, report };
