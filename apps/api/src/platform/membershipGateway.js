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

// The non-compounding "Interest" transaction type the interest run posts its
// summary Debit Notes under (auto-seeded per company on first run; the club
// edits tax/description like any catalog row - flipping isInterestChargeable
// on would deliberately enable interest-on-interest).
async function ensureInterestType(companyId) {
    const TransactionType = require('../modules/membership/transactionType.model');
    const [row] = await TransactionType.findOrCreate({
        where: { companyId, transactionType: 'INTEREST' },
        defaults: {
            companyId,
            transactionType: 'INTEREST',
            chargeType: 'miscellaneous',
            description: 'Late-payment interest',
            taxSchemeCode: null,
            isInterestChargeable: false,
            isActive: true,
        },
    });
    return row.toJSON();
}

// Billing name + address snapshot for a debtor's statement (frozen onto
// ar.Statement at generation). Membership debtors bill to the contract's
// mailing address (fallback: company/residential); member debtors to the
// person's own mailing address; other debtors carry their address themselves
// (resolved AR-side, not here). Corporate contracts also surface their
// contact person - statements addressed to a company print who to reach.
async function lookupPartyBilling(companyId, debtorType, sourceId) {
    const Address = require('../modules/membership/address.model');
    const display = await lookupPartyDisplay(
        companyId,
        debtorType === 'membership' ? { membershipIds: [sourceId] } : { memberIds: [sourceId] },
    );
    const d = debtorType === 'membership' ? display.memberships[sourceId] : display.members[sourceId];
    if (!d) return null;

    let contactPerson = null;
    if (debtorType === 'membership' && d.membershipClass === 'corporate') {
        const Membership = require('../modules/membership/membership.model');
        const row = await Membership.findOne({
            where: { companyId, id: sourceId },
            attributes: ['contactPerson'],
        });
        contactPerson = (row && row.contactPerson) || null;
    }

    const owner = debtorType === 'membership' ? { membershipId: sourceId } : { memberId: sourceId };
    const rows = await Address.findAll({ where: { companyId, ...owner } });
    const pick = rows.find((r) => r.addressType === 'mailing')
        || rows.find((r) => r.addressType === 'company')
        || rows.find((r) => r.addressType === 'residential')
        || rows[0]
        || null;
    return {
        name: d.name,
        no: d.no,
        contactPerson,
        address: pick ? {
            line1: pick.address,
            city: pick.city,
            state: pick.state,
            postcode: pick.postcode,
            countryCode: pick.countryCode,
        } : null,
    };
}

// Classify party references into the AR statement-scope categories:
//   memberships -> { id: 'individual' | 'corporate' }  (membershipClass)
//   members     -> { id: 'nominee' | 'individual' }    (memberKind; any
//                   non-nominee personal debtor reads as 'individual')
// Used by the statement run's debtor-scope filter (Individual / Corporate /
// Nominee / Other) and stamped onto each generated Statement.
async function classifyParties(companyId, { membershipIds = [], memberIds = [] }) {
    const Membership = require('../modules/membership/membership.model');
    const Member = require('../modules/membership/member.model');
    const out = { memberships: {}, members: {} };
    if (!companyId) return out;
    if (membershipIds.length) {
        const rows = await Membership.findAll({
            where: { companyId, id: { [Op.in]: membershipIds } },
            attributes: ['id', 'membershipClass'],
        });
        for (const r of rows) out.memberships[r.id] = r.membershipClass === 'corporate' ? 'corporate' : 'individual';
    }
    if (memberIds.length) {
        const rows = await Member.findAll({
            where: { companyId, id: { [Op.in]: memberIds } },
            attributes: ['id', 'memberKind'],
        });
        for (const r of rows) out.members[r.id] = r.memberKind === 'nominee' ? 'nominee' : 'individual';
    }
    return out;
}

module.exports = {
    lookupPartyDisplay,
    searchPartyIds,
    listTransactionTypes,
    getTransactionType,
    ensureDepositConversionType,
    ensureInterestType,
    listDebtorPersons,
    lookupPartyBilling,
    classifyParties,
};
