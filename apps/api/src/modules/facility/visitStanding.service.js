// What Facility Management holds against a LETTER of introduction (slice 7c,
// approved 2026-11-14) - the answers behind platform/facilityGateway.js.
// Membership owns the letter (an affiliated or reciprocal member's visit) and
// its day passes; Facility keeps ONE person record per letter (Patron of type
// 'affiliate' | 'reciprocal', sourceId = the letter). Two questions:
//   - standingOf: is anything still owed here - an item out, a bill open?
//     (a letter does not complete while it is)
//   - dayUseOf: was a day's pass used at the station?
//     (the Registration Counter does not cancel a day that was)
// The wording helpers are pure and unit-tested.

const { Op } = require('sequelize');
const { companyTimezoneById } = require('../../platform/calendarGateway');
const Patron = require('./patron.model');
const IssueRecord = require('./issueRecord.model');
const UtilityItem = require('./utilityItem.model');
const UtilityUnit = require('./utilityUnit.model');
const Registration = require('./registration.model');
const RegistrationGuest = require('./registrationGuest.model');
const { VISITING_PATRON_TYPE_KEYS } = require('./facility.constants');
const { UNDONE_REMARK } = require('./stationRules.service');

// ---- pure wording ---------------------------------------------------------------

function listText(parts) {
    const p = parts.filter(Boolean);
    if (p.length <= 1) return p.join('');
    return `${p.slice(0, -1).join(', ')} and ${p[p.length - 1]}`;
}

// "still holds L002 and TOWEL (E2E Companion) and has an open bill FBL-00017
// (31.00)" - what follows the visiting member's name; '' when nothing holds.
function holdText({ itemsOut = [], openBills = [] } = {}) {
    const parts = [];
    if (itemsOut.length) parts.push(`still holds ${listText(itemsOut.map((i) => (i.holder ? `${i.label} (${i.holder})` : i.label)))}`);
    if (openBills.length) {
        const bills = listText(openBills.map((b) => `${b.billNo} (${Number(b.totalAmount || 0).toFixed(2)})`));
        parts.push(openBills.length === 1 ? `has an open bill ${bills}` : `has open bills ${bills}`);
    }
    return listText(parts);
}

// "took 2 items and entered 1 facility" - how a day's pass was used; ''
// when it was not.
function useText({ items = 0, entries = 0 } = {}) {
    const parts = [];
    if (items) parts.push(`took ${items} item${items === 1 ? '' : 's'}`);
    if (entries) parts.push(`entered ${entries} facilit${entries === 1 ? 'y' : 'ies'}`);
    return listText(parts);
}

// ---- the letter's person record ----------------------------------------------

function patronOf(companyId, affiliatedVisitId, { transaction } = {}) {
    if (!companyId || !affiliatedVisitId) return null;
    return Patron.findOne({ where: { companyId, patronType: { [Op.in]: VISITING_PATRON_TYPE_KEYS }, sourceId: String(affiliatedVisitId) }, attributes: ['id', 'name'], transaction });
}

const CLEAR = Object.freeze({ clear: true, itemsOut: [], openBills: [], text: '' });

// What the letter still owes the station: the items its party holds (the
// visiting member's own and their guests') and its open facility bills.
async function standingOf(companyId, affiliatedVisitId, { transaction } = {}) {
    const patron = await patronOf(companyId, affiliatedVisitId, { transaction });
    if (!patron) return { ...CLEAR };
    const billing = require('./billing.service');
    const [issues, bills] = await Promise.all([
        IssueRecord.findAll({ where: { companyId, patronId: patron.id, status: 'issued' }, attributes: ['utilityItemId', 'utilityUnitId', 'quantity', 'holderName'], order: [['issuedAt', 'ASC']], transaction }),
        billing.Bill.findAll({ where: { companyId, patronId: patron.id, status: 'open' }, attributes: ['billNo', 'totalAmount'], order: [['createdAt', 'ASC']], transaction }),
    ]);
    if (!issues.length && !bills.length) return { ...CLEAR };
    const [items, units] = await Promise.all([
        issues.length ? UtilityItem.findAll({ where: { id: { [Op.in]: [...new Set(issues.map((i) => i.utilityItemId))] } }, attributes: ['id', 'code'], transaction }) : [],
        issues.some((i) => i.utilityUnitId) ? UtilityUnit.findAll({ where: { id: { [Op.in]: issues.map((i) => i.utilityUnitId).filter(Boolean) } }, attributes: ['id', 'code'], transaction }) : [],
    ]);
    const itemCode = new Map(items.map((x) => [x.id, x.code]));
    const unitCode = new Map(units.map((x) => [x.id, x.code]));
    const standing = {
        clear: false,
        itemsOut: issues.map((i) => ({
            label: i.utilityUnitId ? unitCode.get(i.utilityUnitId) || 'unit' : `${itemCode.get(i.utilityItemId) || 'item'}${Number(i.quantity) > 1 ? ` x ${i.quantity}` : ''}`,
            holder: i.holderName || null,
        })),
        openBills: bills.map((b) => ({ billNo: b.billNo, totalAmount: Number(b.totalAmount) })),
    };
    standing.text = holdText(standing);
    return standing;
}

// Whether a day's pass of the letter was used at the station. With
// `guestRegistrationId` the question is about ONE guest the visiting member
// brought (that guest's pass); without it, about the visiting member's own
// day - which carries their guests' use too, since cancelling the day takes
// their passes with it. An item issued and undone is not a use.
async function dayUseOf(companyId, affiliatedVisitId, date, { guestRegistrationId = null, transaction } = {}) {
    const none = { used: false, items: 0, entries: 0, text: '' };
    const patron = await patronOf(companyId, affiliatedVisitId, { transaction });
    if (!patron) return none;
    const notUndone = { [Op.or]: [{ remarks: null }, { remarks: { [Op.ne]: UNDONE_REMARK } }] };
    let items;
    let entries;
    if (guestRegistrationId) {
        const pass = String(guestRegistrationId);
        [items, entries] = await Promise.all([
            IssueRecord.count({ where: { companyId, guestRegistrationId: pass, ...notUndone }, transaction }),
            RegistrationGuest.count({ where: { companyId, guestRegistrationId: pass }, transaction }),
        ]);
    } else {
        // The club's day, as instants.
        const { localToDate } = require('./station.service');
        const timezone = await companyTimezoneById(companyId);
        const from = localToDate(`${date}T00:00`, timezone);
        const to = new Date(from.getTime() + 24 * 3600 * 1000);
        [items, entries] = await Promise.all([
            IssueRecord.count({ where: { companyId, patronId: patron.id, issuedAt: { [Op.gte]: from, [Op.lt]: to }, ...notUndone }, transaction }),
            Registration.count({ where: { companyId, patronId: patron.id, registrationDate: String(date) }, transaction }),
        ]);
    }
    const use = { used: items + entries > 0, items, entries };
    use.text = useText(use);
    return use;
}

module.exports = { listText, holdText, useText, standingOf, dayUseOf };
