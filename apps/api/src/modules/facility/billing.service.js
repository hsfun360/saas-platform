// Facility BILLING ENGINE (approved 2026-10-25, sub-slice 2c) - golf's
// billing.service with the per-player and package variants removed: price a
// line from the rate cards (billPricing.service), quote its tax through the
// tax seam, keep the bill's totals, issue the bill number from the
// facility-bill series, and post account-class tenders to AR through the AR
// seam. The bill controller is the only caller today; the control station
// (slice 3) opens bills through the same functions.

const { Op } = require('sequelize');
const { quoteTax } = require('../../platform/taxGateway');
const arGateway = require('../../platform/arGateway');
const numberingGateway = require('../../platform/numberingGateway');
const Bill = require('./bill.model');
const BillItem = require('./billItem.model');
const BillPayment = require('./billPayment.model');
const TransactionType = require('./transactionType.model');
const TransactionTypeRate = require('./transactionTypeRate.model');
const TransactionTypeRateCell = require('./transactionTypeRateCell.model');
const pricing = require('./billPricing.service');

const { round2, cents } = pricing;

// ---- pricing + tax ---------------------------------------------------------

// Every active card of a type with its cells (the pure picker chooses).
async function cardsOf(transactionTypeId, { transaction } = {}) {
    const cards = await TransactionTypeRate.findAll({
        where: { transactionTypeId, isActive: true },
        include: [{ model: TransactionTypeRateCell, as: 'Cells' }],
        transaction,
    });
    return cards.map((c) => ({ ...c.get({ plain: true }), cells: (c.Cells || []).map((x) => x.get({ plain: true })) }));
}

// Quote the tax of one line amount. { taxAmount, payable, breakdown }; no
// scheme = no tax.
async function quoteItemTax(req, taxSchemeCode, amount, onDate) {
    if (!taxSchemeCode) return { taxAmount: 0, payable: round2(amount), breakdown: null };
    const quote = await quoteTax(req, { taxSchemeCode, amount, onDate });
    if (!quote) return { taxAmount: 0, payable: round2(amount), breakdown: null };
    return {
        taxAmount: round2(quote.taxTotal),
        payable: round2(quote.gross),
        breakdown: { schemeCode: taxSchemeCode, ieFlag: quote.ieFlag, net: quote.net, gross: quote.gross, asOf: quote.asOf, lines: quote.lines },
    };
}

function itemPayable(item) {
    const exclusive = item.taxBreakdown && item.taxBreakdown.ieFlag === 'EXCLUSIVE';
    return round2(Number(item.amount) + (exclusive ? Number(item.taxAmount) : 0));
}

async function recomputeTotals(bill, transaction) {
    const items = await BillItem.findAll({ where: { billId: bill.id }, transaction });
    bill.totalAmount = round2(items.reduce((s, i) => s + itemPayable(i), 0));
    bill.taxTotal = round2(items.reduce((s, i) => s + Number(i.taxAmount), 0));
    await bill.save({ transaction });
    return items;
}

async function nextSortOrder(billId, transaction) {
    const max = await BillItem.max('sortOrder', { where: { billId }, transaction });
    return (max || 0) + 1;
}

function typeDescription(type) {
    return `${type.transactionType}${type.description ? ' - ' + type.description : ''}`;
}

// Add ONE line. `context` = { date, dayType, sessionId, sessionName,
// participantType, bookingSlotId, bookingParticipantId }; a keyed
// `unitAmount` (an allowed override) replaces the rate card. Returns
// { item } or { error }.
async function addItem({ req, bill, type, quantity = 1, context, stamps, transaction, unitAmount: keyed = null }) {
    let unit = keyed;
    if (unit === null) {
        const cards = await cardsOf(type.id, { transaction });
        const priced = pricing.unitPriceOf(type, cards, context);
        if (priced.missing) {
            if (!type.allowPriceOverride) return { error: priced.missing };
            unit = 0;
        } else unit = priced.unitAmount;
    }
    const unitAmount = round2(unit);
    const amount = round2(unitAmount * quantity);
    const tax = await quoteItemTax(req, type.taxSchemeCode, amount, context.date);
    const sortOrder = await nextSortOrder(bill.id, transaction);
    const item = await BillItem.create({
        billId: bill.id,
        sortOrder,
        transactionTypeId: type.id,
        bookingSlotId: context.bookingSlotId || null,
        bookingParticipantId: context.bookingParticipantId || null,
        description: typeDescription(type),
        quantity,
        unitAmount,
        amount,
        priceOverridden: keyed !== null,
        taxSchemeCode: tax.breakdown ? type.taxSchemeCode : null,
        taxAmount: tax.taxAmount,
        taxBreakdown: tax.breakdown,
        ...stamps,
    }, { transaction });
    return { item };
}

// Amend a line's quantity / unit price (a manual price needs the type's
// allowPriceOverride), re-quoting its tax on `onDate`.
async function amendItem({ req, bill, item, type, quantity, unitAmount, onDate, updatedBy, transaction }) {
    let qty = item.quantity;
    if (quantity !== undefined && quantity !== null) {
        qty = Number(quantity);
        if (!Number.isInteger(qty) || qty < 1 || qty > 999) return { error: 'Quantity must be between 1 and 999.' };
    }
    let unit = Number(item.unitAmount);
    let overridden = item.priceOverridden === true;
    if (unitAmount !== undefined && unitAmount !== null) {
        const parsed = Number(unitAmount);
        if (!Number.isFinite(parsed) || parsed < 0) return { error: 'The price must be 0.00 or more.' };
        if (round2(parsed) !== round2(unit)) {
            if (!type || type.allowPriceOverride !== true) return { error: 'This item\'s price cannot be amended at billing.', status: 403 };
            unit = round2(parsed);
            overridden = true;
        }
    }
    item.quantity = qty;
    item.unitAmount = unit;
    item.amount = round2(unit * qty);
    item.priceOverridden = overridden;
    const tax = await quoteItemTax(req, item.taxSchemeCode, item.amount, onDate);
    item.taxAmount = tax.taxAmount;
    item.taxBreakdown = tax.breakdown;
    item.updatedBy = updatedBy;
    await item.save({ transaction });
    await recomputeTotals(bill, transaction);
    return { item };
}

async function removeItem({ bill, item, transaction }) {
    await item.destroy({ transaction });
    await recomputeTotals(bill, transaction);
}

// ---- numbering --------------------------------------------------------------

async function issueBillNo(req, { transaction, manualNo = null } = {}) {
    const issued = await numberingGateway.issueNumber(req, 'facility-bill', { transaction });
    if (issued && issued.number) return { billNo: issued.number };
    if (issued && issued.manual) {
        const no = manualNo ? String(manualNo).trim() : '';
        if (no) return { billNo: no };
        return { error: 'The Bill No. scheme is manual - key in a bill number.' };
    }
    return { error: 'Configure the Bill No. numbering scheme first (Facility Management - Numbering Control).' };
}

// ---- charge to account -------------------------------------------------------

// The ONE AR invoice transaction type opened to the facility module.
async function arInvoiceType(companyId) {
    const arTypes = await arGateway.listTransactionTypes(companyId, { module: 'facility', trxClass: 'invoice' });
    if (!arTypes.length) return { error: 'Open an AR invoice transaction type to the Facility module first (AR - Transaction Type).' };
    if (arTypes.length > 1) return { error: 'Several AR transaction types are opened to Facility - keep exactly one so charges post unambiguously.' };
    return { type: arTypes[0] };
}

// Post ONE AR invoice for an amount charged to an account. The facility bill
// owns the tax accounting; the AR document is the plain receivable.
async function postChargeToAccount(req, { bill, arType, target, amount, description, stamps }) {
    const amountC = cents(amount);
    return arGateway.postCharge(req, {
        debtorType: target.debtorType,
        sourceId: target.sourceId,
        docDate: String(bill.billDate),
        trxDate: String(bill.billDate),
        transactionTypeId: arType.id,
        isInterestChargeable: arType.isInterestChargeable === true,
        description,
        incurredByMemberId: target.incurredByMemberId || null,
        sourceModule: 'facility',
        sourceRef: bill.id,
        amounts: { netC: amountC, taxC: 0, grossC: amountC, taxSchemeCode: null, taxRate: null },
        stamps: stamps || {},
        enforceCredit: true,
    });
}

// ---- lookups -----------------------------------------------------------------

// The live (open or settled) bill of a booking, if any.
async function billOfBooking(companyId, bookingId, { transaction } = {}) {
    return Bill.findOne({ where: { companyId, bookingId, status: { [Op.ne]: 'voided' } }, transaction });
}

// Bill summaries for a set of bookings: Map(bookingId -> { id, billNo, status, totalAmount }).
async function summariesFor(companyId, bookingIds) {
    const ids = [...new Set(bookingIds.filter(Boolean))];
    if (!ids.length) return new Map();
    const rows = await Bill.findAll({ where: { companyId, bookingId: { [Op.in]: ids }, status: { [Op.ne]: 'voided' } }, attributes: ['id', 'bookingId', 'billNo', 'status', 'totalAmount'] });
    return new Map(rows.map((b) => [b.bookingId, { id: b.id, billNo: b.billNo, status: b.status, totalAmount: Number(b.totalAmount) }]));
}

// The desk's billing tiles for a facility type: active types a desk may add
// by hand (packages, deposits and no-show charges are not desk items), scoped
// to this facility type or to none.
async function tilesFor(companyId, facilityTypeId) {
    const rows = await TransactionType.findAll({
        where: { companyId, isActive: true, chargeType: { [Op.notIn]: ['package', 'deposit', 'no-show'] }, [Op.or]: [{ facilityTypeId: null }, { facilityTypeId }] },
        order: [['transactionType', 'ASC']],
    });
    return rows.map((t) => ({
        id: t.id, transactionType: t.transactionType, description: t.description, chargeType: t.chargeType, feeBasis: t.feeBasis,
        participantType: t.participantType || null, allowPriceOverride: t.allowPriceOverride === true, iconUrl: t.iconUrl,
    }));
}

// ---- DTOs ----------------------------------------------------------------------

function itemDto(i) {
    return {
        id: i.id,
        sortOrder: i.sortOrder,
        transactionTypeId: i.transactionTypeId,
        bookingSlotId: i.bookingSlotId,
        bookingParticipantId: i.bookingParticipantId,
        description: i.description,
        quantity: i.quantity,
        unitAmount: Number(i.unitAmount),
        amount: Number(i.amount),
        priceOverridden: i.priceOverridden === true,
        taxSchemeCode: i.taxSchemeCode,
        taxAmount: Number(i.taxAmount),
        ieFlag: i.taxBreakdown ? i.taxBreakdown.ieFlag : null,
        payable: itemPayable(i),
    };
}

function paymentDto(p) {
    return {
        id: p.id,
        sortOrder: p.sortOrder,
        paymentTypeId: p.paymentTypeId,
        paymentClass: p.paymentClass,
        amount: Number(p.amount),
        reference: p.reference,
        arDocId: p.arDocId,
        arDocNo: p.arDocNo,
        debtorType: p.debtorType,
    };
}

async function billDto(bill, { transaction } = {}) {
    const [items, payments] = await Promise.all([
        BillItem.findAll({ where: { billId: bill.id }, order: [['sortOrder', 'ASC']], transaction }),
        BillPayment.findAll({ where: { billId: bill.id }, order: [['sortOrder', 'ASC']], transaction }),
    ]);
    return {
        id: bill.id,
        billNo: bill.billNo,
        bookingId: bill.bookingId,
        patronId: bill.patronId,
        billDate: String(bill.billDate),
        status: bill.status,
        totalAmount: Number(bill.totalAmount),
        taxTotal: Number(bill.taxTotal),
        remarks: bill.remarks,
        settledAt: bill.settledAt || null,
        voidedAt: bill.voidedAt || null,
        voidReason: bill.voidReason || null,
        canModify: bill.get ? bill.get('canModify') : undefined,
        items: items.map(itemDto),
        payments: payments.map(paymentDto),
    };
}

module.exports = {
    round2, cents, cardsOf, quoteItemTax, itemPayable, recomputeTotals, nextSortOrder, typeDescription,
    addItem, amendItem, removeItem, issueBillNo, arInvoiceType, postChargeToAccount,
    billOfBooking, summariesFor, tilesFor, itemDto, paymentDto, billDto,
    Bill, BillItem, BillPayment,
};
