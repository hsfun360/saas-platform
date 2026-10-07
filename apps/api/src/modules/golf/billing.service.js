// Golf BILLING ENGINE - shared by the Front Desk (per-player bills) and the
// Group Booking folio (group bill + deposit bills; 2026-10-07). Extracted
// from frontdesk.controller so both doors price, tax, explode packages and
// post charge-to-account tenders through ONE implementation.
//
// A bill's PLAY FACTS (`play` = { playDate, holes }) and day type drive the
// rate-card cell; the caller decides where they come from (the registered
// player's record, or the group booking's first play day).

const crypto = require('crypto');
const { Op } = require('sequelize');
const { quoteTax } = require('../../platform/taxGateway');
const arGateway = require('../../platform/arGateway');
const numberingGateway = require('../../platform/numberingGateway');
const { MATRIX_CHARGE_TYPE_KEYS } = require('./transactionType.constants');
const Bill = require('./bill.model');
const BillItem = require('./billItem.model');
const BillPayment = require('./billPayment.model');
const GolfTransactionType = require('./transactionType.model');
const GolfTransactionTypeRate = require('./transactionTypeRate.model');
const GolfTransactionTypeElement = require('./transactionTypeElement.model');

function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
}

function cents(n) {
    return Math.round((Number(n) || 0) * 100);
}

// ---------------------------------------------------------------------------
// Pricing + tax

// The active rate card in force on the play date (latest effectiveDate <=).
async function rateFor(transactionTypeId, playDate, transaction) {
    return GolfTransactionTypeRate.findOne({
        where: { transactionTypeId, isActive: true, effectiveDate: { [Op.lte]: playDate } },
        order: [['effectiveDate', 'DESC']],
        transaction,
    });
}

// The unit price of a type for a play (matrix cell by holes + day type, or
// flatAmount). null = no price configured.
function unitPriceOf(type, rate, dayType, holes) {
    if (!rate) return null;
    if (MATRIX_CHARGE_TYPE_KEYS.includes(type.chargeType)) {
        const cell = `price${holes === 9 ? 9 : 18}${dayType === 'weekend' ? 'Weekend' : 'Weekday'}`;
        return rate[cell] === null || rate[cell] === undefined ? null : Number(rate[cell]);
    }
    return rate.flatAmount === null || rate.flatAmount === undefined ? null : Number(rate.flatAmount);
}

// Quote the tax of one item amount. Returns { taxAmount, payable, breakdown }
// - payable is what the golfer owes for the line (gross: amount + tax when
// exclusive, the amount itself when inclusive); no scheme = no tax.
async function quoteItemTax(req, taxSchemeCode, amount, onDate) {
    if (!taxSchemeCode) return { taxAmount: 0, payable: round2(amount), breakdown: null };
    const quote = await quoteTax(req, { taxSchemeCode, amount, onDate });
    if (!quote) return { taxAmount: 0, payable: round2(amount), breakdown: null };
    return {
        taxAmount: round2(quote.taxTotal),
        payable: round2(quote.gross),
        breakdown: {
            schemeCode: taxSchemeCode,
            ieFlag: quote.ieFlag,
            net: quote.net,
            gross: quote.gross,
            asOf: quote.asOf,
            lines: quote.lines,
        },
    };
}

function itemPayable(item) {
    const exclusive = item.taxBreakdown && item.taxBreakdown.ieFlag === 'EXCLUSIVE';
    return round2(Number(item.amount) + (exclusive ? Number(item.taxAmount) : 0));
}

// Recompute + persist the bill's denormalized totals from its items.
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
    return `${type.transactionType}${type.description ? ' — ' + type.description : ''}`;
}

// Add ONE ordinary (non-package) item. `play` = { playDate, holes }. A keyed
// `unitAmount` (deposit bills, allowed overrides) replaces the rate card.
async function addOrdinaryItem({
    req, bill, play, type, quantity, dayType, stamps, transaction, allowMissingPrice = false, unitAmount: keyed = null,
}) {
    let unit = keyed;
    if (unit === null) {
        const rate = await rateFor(type.id, play.playDate, transaction);
        unit = unitPriceOf(type, rate, dayType, play.holes);
        if (unit === null && !type.allowPriceOverride && !allowMissingPrice) {
            return { error: `'${type.transactionType}' has no price in force for ${play.playDate} - set up its pricing first.` };
        }
    }
    const unitAmount = unit === null ? 0 : round2(unit);
    const amount = round2(unitAmount * quantity);
    const tax = await quoteItemTax(req, type.taxSchemeCode, amount, play.playDate);
    const sortOrder = await nextSortOrder(bill.id, transaction);
    const item = await BillItem.create({
        billId: bill.id,
        sortOrder,
        transactionTypeId: type.id,
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

// Explode a PACKAGE into its element lines + the automatic balance line
// (approved spec): package price from its flat rate; the PACKAGE's tax scheme
// on every generated line; the LAST line's tax adjusted so the group's tax
// equals the tax computed directly on the package amount. `quantity` repeats
// the explosion (group bills bill a package per player).
async function addPackageItems({ req, bill, play, type, stamps, transaction, quantity = 1 }) {
    const rate = await rateFor(type.id, play.playDate, transaction);
    const packagePrice = rate && rate.flatAmount !== null ? Number(rate.flatAmount) : null;
    if (packagePrice === null) {
        return { error: `Package '${type.transactionType}' has no price in force for ${play.playDate}.` };
    }
    const elements = await GolfTransactionTypeElement.findAll({
        where: { transactionTypeId: type.id },
        order: [['sortOrder', 'ASC']],
        transaction,
    });
    if (!elements.length) return { error: `Package '${type.transactionType}' has no elements.` };
    if (!type.autoTransactionTypeId) return { error: `Package '${type.transactionType}' has no Auto Transaction Type.` };

    const companyId = bill.companyId;
    const typeIds = [...new Set([...elements.map((e) => e.elementTransactionTypeId), type.autoTransactionTypeId])];
    const types = await GolfTransactionType.findAll({ where: { companyId, id: { [Op.in]: typeIds } }, transaction });
    const typeById = new Map(types.map((t) => [t.id, t]));

    const lines = [];
    let elementSum = 0;
    for (const el of elements) {
        const elType = typeById.get(el.elementTransactionTypeId);
        if (!elType) return { error: 'A package element no longer exists.' };
        const amount = round2(Number(el.unitAmount) * el.quantity * quantity);
        elementSum = round2(elementSum + amount);
        lines.push({ type: elType, quantity: el.quantity * quantity, unitAmount: Number(el.unitAmount), amount, role: 'element' });
    }
    const autoType = typeById.get(type.autoTransactionTypeId);
    if (!autoType) return { error: 'The package\'s Auto Transaction Type no longer exists.' };
    const total = round2(packagePrice * quantity);
    lines.push({ type: autoType, quantity, unitAmount: round2((total - elementSum) / quantity), amount: round2(total - elementSum), role: 'auto' });

    // Package tax on each line + the direct tax on the package amount.
    const taxes = [];
    for (const line of lines) taxes.push(await quoteItemTax(req, type.taxSchemeCode, line.amount, play.playDate));
    const target = await quoteItemTax(req, type.taxSchemeCode, total, play.playDate);
    const lineTaxSum = round2(taxes.reduce((s, t) => s + t.taxAmount, 0));
    const adjust = round2(target.taxAmount - lineTaxSum);
    if (adjust !== 0 && taxes.length) {
        const last = taxes[taxes.length - 1];
        last.taxAmount = round2(last.taxAmount + adjust);
        if (last.breakdown) last.breakdown.roundingAdjustment = adjust;
    }

    const groupId = crypto.randomUUID();
    const created = [];
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const tax = taxes[i];
        const sortOrder = await nextSortOrder(bill.id, transaction);
        created.push(await BillItem.create({
            billId: bill.id,
            sortOrder,
            transactionTypeId: line.type.id,
            description: typeDescription(line.type),
            quantity: line.quantity,
            unitAmount: line.unitAmount,
            amount: line.amount,
            packageGroupId: groupId,
            packageRole: line.role,
            packageTransactionTypeId: type.id,
            taxSchemeCode: type.taxSchemeCode || null,
            taxAmount: tax.taxAmount,
            taxBreakdown: tax.breakdown,
            ...stamps,
        }, { transaction }));
    }
    return { items: created };
}

// Amend an ordinary line's quantity / unit price (a manual price needs the
// type's allowPriceOverride), re-quoting its tax on `onDate`.
async function amendItem({ req, bill, item, type, quantity, unitAmount, onDate, updatedBy, transaction }) {
    let qty = item.quantity;
    if (quantity !== undefined) {
        qty = Number(quantity);
        if (!Number.isInteger(qty) || qty < 1 || qty > 999) return { error: 'Quantity must be between 1 and 999.' };
    }
    let unit = Number(item.unitAmount);
    let overridden = item.priceOverridden === true;
    if (unitAmount !== undefined) {
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

// Remove a line - a package line removes its whole group.
async function removeItem({ bill, item, transaction }) {
    if (item.packageGroupId) {
        await BillItem.destroy({ where: { billId: bill.id, packageGroupId: item.packageGroupId }, transaction });
    } else {
        await item.destroy({ transaction });
    }
    await recomputeTotals(bill, transaction);
}

// ---------------------------------------------------------------------------
// Numbering

// The next Bill No. from the golf-bill series (gapless inside `transaction`);
// a manual scheme takes `manualNo`. Returns { billNo } or { error }.
async function issueBillNo(req, { transaction, manualNo = null, purpose = 'golf-bill', label = 'Bill No.' } = {}) {
    const issued = await numberingGateway.issueNumber(req, purpose, { transaction });
    if (issued && issued.number) return { billNo: issued.number };
    if (issued && issued.manual) {
        const no = manualNo ? String(manualNo).trim() : '';
        if (no) return { billNo: no };
        return { error: `The ${label} scheme is manual - key in a number.` };
    }
    return { error: `Configure the ${label} numbering scheme first (Golf Management → Numbering Control).` };
}

// ---------------------------------------------------------------------------
// Charge to account

// The ONE AR invoice transaction type opened to the golf module (0 or >1 is
// a self-explanatory configuration error).
async function arInvoiceType(companyId) {
    const arTypes = await arGateway.listTransactionTypes(companyId, { module: 'golf', trxClass: 'invoice' });
    if (!arTypes.length) return { error: 'Open an AR invoice transaction type to the Golf module first (AR → Transaction Type).' };
    if (arTypes.length > 1) return { error: 'Several AR transaction types are opened to Golf - keep exactly one so charges post unambiguously.' };
    return { type: arTypes[0] };
}

// Post ONE AR invoice for an amount charged to an account (member / city
// ledger tender). The golf bill owns the tax accounting; the AR document is
// the plain receivable. Returns { id, docNo } or { error }.
async function postChargeToAccount(req, { bill, target, amount, description, stamps, enforceCredit = true }) {
    const resolved = await arInvoiceType(bill.companyId);
    if (resolved.error) return { error: resolved.error };
    const amountC = cents(amount);
    return arGateway.postCharge(req, {
        debtorType: target.debtorType,
        sourceId: target.sourceId,
        docDate: String(bill.billDate),
        trxDate: String(bill.billDate),
        transactionTypeId: resolved.type.id,
        isInterestChargeable: resolved.type.isInterestChargeable === true,
        description,
        incurredByMemberId: target.incurredByMemberId || null,
        sourceModule: 'golf',
        sourceRef: bill.id,
        amounts: { netC: amountC, taxC: 0, grossC: amountC, taxSchemeCode: null, taxRate: null },
        stamps: stamps || {},
        enforceCredit,
    });
}

// ---------------------------------------------------------------------------
// DTOs

function itemDto(i) {
    return {
        id: i.id,
        sortOrder: i.sortOrder,
        transactionTypeId: i.transactionTypeId,
        description: i.description,
        quantity: i.quantity,
        unitAmount: Number(i.unitAmount),
        amount: Number(i.amount),
        priceOverridden: i.priceOverridden === true,
        packageGroupId: i.packageGroupId,
        packageRole: i.packageRole,
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
        appliedDepositBillId: p.appliedDepositBillId || null,
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
        billType: bill.billType || 'player',
        bookingProfileId: bill.bookingProfileId || null,
        playerId: bill.playerId,
        billDate: bill.billDate,
        status: bill.status,
        totalAmount: Number(bill.totalAmount),
        taxTotal: Number(bill.taxTotal),
        remarks: bill.remarks,
        proformaNo: bill.proformaNo || null,
        proformaRevision: bill.proformaRevision || 0,
        proformaIssuedAt: bill.proformaIssuedAt || null,
        depositRequired: bill.depositRequired === null || bill.depositRequired === undefined ? null : Number(bill.depositRequired),
        depositDueDate: bill.depositDueDate || null,
        depositAppliedAmount: Number(bill.depositAppliedAmount || 0),
        depositRefundedAmount: Number(bill.depositRefundedAmount || 0),
        settledAt: bill.settledAt || null,
        voidedAt: bill.voidedAt || null,
        voidReason: bill.voidReason || null,
        items: items.map(itemDto),
        payments: payments.map(paymentDto),
    };
}

module.exports = {
    round2,
    cents,
    rateFor,
    unitPriceOf,
    quoteItemTax,
    itemPayable,
    recomputeTotals,
    nextSortOrder,
    typeDescription,
    addOrdinaryItem,
    addPackageItems,
    amendItem,
    removeItem,
    issueBillNo,
    arInvoiceType,
    postChargeToAccount,
    itemDto,
    paymentDto,
    billDto,
    Bill,
    BillItem,
    BillPayment,
};
