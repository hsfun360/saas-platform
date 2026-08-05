// src/platform/membershipGateway.js
//
// PEER-SERVICE SEAM: other services -> Membership (party master reads).
// First consumer: Account Receivable. AR's Debtor is deliberately thin - it
// stores (debtorType, sourceId) only - so its screens/documents resolve party
// display data (numbers, names) through THIS seam, never by requiring
// membership models directly (golden rule #4). In-process today; when
// Membership splits out, these become internal HTTP reads and callers never
// change.
//
// Scope note: callers pass companyId explicitly (AR resolved it from its own
// request context already); this seam never re-derives auth.

const { Op } = require('sequelize');

// Full name for display: "First Last", falling back to the native-script name,
// then the member number.
function personName(m) {
    const name = [m.firstName, m.lastName].filter(Boolean).join(' ').trim();
    return name || m.localName || m.memberNo;
}

// Resolve display data for a set of party references.
//   { membershipIds: [...], memberIds: [...] } ->
//   { memberships: { id: { no, membershipClass, name } },
//     members:     { id: { no, name, membershipNo } } }
// A membership's display name is its corporate name (corporate class) or the
// individual member's own name (individual class - the contract debtor IS the
// person, per the one-debtor rule).
async function lookupPartyDisplay(companyId, { membershipIds = [], memberIds = [] }) {
    const Membership = require('../modules/membership/membership.model');
    const Member = require('../modules/membership/member.model');
    const out = { memberships: {}, members: {} };
    if (!companyId) return out;

    if (membershipIds.length) {
        const rows = await Membership.findAll({
            where: { companyId, id: { [Op.in]: membershipIds } },
            attributes: ['id', 'membershipNo', 'membershipClass', 'corporateName'],
        });
        const individualIds = rows.filter((r) => r.membershipClass === 'individual').map((r) => r.id);
        const persons = individualIds.length
            ? await Member.findAll({
                where: { companyId, membershipId: { [Op.in]: individualIds }, memberKind: 'individual' },
                attributes: ['membershipId', 'memberNo', 'firstName', 'lastName', 'localName'],
            })
            : [];
        const personByMembership = new Map(persons.map((p) => [p.membershipId, p]));
        for (const r of rows) {
            const person = personByMembership.get(r.id);
            out.memberships[r.id] = {
                no: r.membershipNo,
                membershipClass: r.membershipClass,
                name: r.membershipClass === 'corporate'
                    ? (r.corporateName || r.membershipNo)
                    : (person ? personName(person) : r.membershipNo),
            };
        }
    }

    if (memberIds.length) {
        const rows = await Member.findAll({
            where: { companyId, id: { [Op.in]: memberIds } },
            attributes: ['id', 'memberNo', 'firstName', 'lastName', 'localName', 'membershipId'],
        });
        const parentIds = [...new Set(rows.map((r) => r.membershipId))];
        const parents = parentIds.length
            ? await Membership.findAll({
                where: { companyId, id: { [Op.in]: parentIds } },
                attributes: ['id', 'membershipNo'],
            })
            : [];
        const parentNo = new Map(parents.map((p) => [p.id, p.membershipNo]));
        for (const r of rows) {
            out.members[r.id] = {
                no: r.memberNo,
                name: personName(r),
                membershipNo: parentNo.get(r.membershipId) || null,
            };
        }
    }

    return out;
}

// Text-search the party masters for a debtor-listing query. Returns the ids a
// caller should match against Debtor.sourceId:
//   membershipIds - memberships matched by number/corporate name, PLUS the
//                   parent membership of any matching INDIVIDUAL member (the
//                   person's charges live on the contract debtor);
//   memberIds     - matching nominees (personal debtors).
// Capped per master - this feeds a paged listing, not an export.
async function searchPartyIds(companyId, q, { limit = 200 } = {}) {
    const Membership = require('../modules/membership/membership.model');
    const Member = require('../modules/membership/member.model');
    if (!companyId || !q) return { membershipIds: [], memberIds: [] };
    const like = { [Op.iLike]: `%${q}%` };

    const memberships = await Membership.findAll({
        where: { companyId, [Op.or]: [{ membershipNo: like }, { corporateName: like }] },
        attributes: ['id'],
        limit,
    });
    const members = await Member.findAll({
        where: {
            companyId,
            memberKind: { [Op.in]: ['individual', 'nominee'] },
            [Op.or]: [{ memberNo: like }, { firstName: like }, { lastName: like }, { localName: like }],
        },
        attributes: ['id', 'memberKind', 'membershipId'],
        limit,
    });

    const membershipIds = new Set(memberships.map((m) => m.id));
    const memberIds = [];
    for (const m of members) {
        if (m.memberKind === 'individual') membershipIds.add(m.membershipId);
        else memberIds.push(m.id);
    }
    return { membershipIds: [...membershipIds], memberIds };
}

// --- Billing-item catalog reads (AR document entry) -----------------------
// The membership Transaction Type catalog is the SINGLE tax source for AR
// documents; AR reads it through this seam and snapshots tax at posting.

async function listTransactionTypes(companyId) {
    const TransactionType = require('../modules/membership/transactionType.model');
    const rows = await TransactionType.findAll({
        where: { companyId, isActive: true },
        order: [['transactionType', 'ASC']],
        attributes: ['id', 'transactionType', 'chargeType', 'description', 'taxSchemeCode', 'isInterestChargeable'],
    });
    return rows.map((r) => r.toJSON());
}

async function getTransactionType(companyId, id) {
    const TransactionType = require('../modules/membership/transactionType.model');
    const row = await TransactionType.findOne({ where: { companyId, id } });
    return row ? row.toJSON() : null;
}

// The non-taxable "Deposit Conversion" transaction type every conversion CN
// posts under (auto-seeded per company on first use; editable like any
// catalog row afterwards).
async function ensureDepositConversionType(companyId) {
    const TransactionType = require('../modules/membership/transactionType.model');
    const [row] = await TransactionType.findOrCreate({
        where: { companyId, transactionType: 'DEPCONV' },
        defaults: {
            companyId,
            transactionType: 'DEPCONV',
            chargeType: 'miscellaneous',
            description: 'Deposit conversion',
            taxSchemeCode: null,
            isInterestChargeable: false,
            isActive: true,
        },
    });
    return row.toJSON();
}

// The persons whose consumption can be stamped on a debtor's documents
// (incurredByMemberId picker + validation):
//   membership debtor -> every member of the contract (nominees, dependents,
//                        the individual member);
//   member debtor     -> the person plus their dependents;
//   other debtor      -> nobody (charges belong to the entity itself).
async function listDebtorPersons(companyId, debtorType, sourceId) {
    if (debtorType === 'other') return [];
    const Member = require('../modules/membership/member.model');
    let where = null;
    if (debtorType === 'membership') {
        where = { companyId, membershipId: sourceId };
    } else {
        where = { companyId, [Op.or]: [{ id: sourceId }, { principalMemberId: sourceId }] };
    }
    const rows = await Member.findAll({
        where,
        order: [['memberNo', 'ASC']],
        attributes: ['id', 'memberNo', 'memberKind', 'firstName', 'lastName', 'localName'],
    });
    return rows.map((r) => ({ id: r.id, memberNo: r.memberNo, memberKind: r.memberKind, name: personName(r) }));
}

module.exports = {
    lookupPartyDisplay,
    searchPartyIds,
    listTransactionTypes,
    getTransactionType,
    ensureDepositConversionType,
    listDebtorPersons,
};
