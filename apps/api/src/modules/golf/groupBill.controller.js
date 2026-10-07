// Group Booking FOLIO - slice 2 (user decisions 2026-10-07): the GROUP BILL
// (packages and other charges keyed at booking time), the PROFORMA printed
// from it (with the deposit it demands and its pay-by date), and DEPOSIT
// BILLS - one golf bill per deposit received, one Deposit item, settled by
// the tender used; a City Ledger / Member tender posts a NORMAL AR invoice on
// the organiser's account, whose standing the folio reads back from AR.
// Final settlement and refunds arrive with slice 4.
//
// Mounted under /api/golf/group-bookings/:id/... (groupBookings.routes).

const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const {
    getUserContext, getCallerPlacement, canModifyRecord, getCompanyLetterhead,
} = require('../../platform/serviceContext');
const { getGolfMemberStanding } = require('../../platform/membershipGateway');
const { classifyDateRange } = require('../../platform/calendarGateway');
const arGateway = require('../../platform/arGateway');
const numberingGateway = require('../../platform/numberingGateway');
const billing = require('./billing.service');
const { PACKAGE_CHARGE_TYPE_KEY, DEPOSIT_CHARGE_TYPE_KEY, GOLFER_TYPES } = require('./transactionType.constants');
const { ACCOUNT_PAYMENT_CLASSES } = require('./paymentType.constants');
const { GROUP_BOOKING_TYPE_KEYS } = require('./groupBooking.constants');
const BookingProfile = require('./bookingProfile.model');
const GroupPlayDay = require('./groupPlayDay.model');
const Bill = require('./bill.model');
const BillItem = require('./billItem.model');
const BillPayment = require('./billPayment.model');
const GolfTransactionType = require('./transactionType.model');
const PaymentType = require('./paymentType.model');
const { formatAddressLines } = require('../../platform/addressFormat');

const { round2, cents } = billing;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

async function callerStamps(req) {
    const placement = await getCallerPlacement(req);
    const callerId = getUserContext(req).userId;
    return { createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId };
}

async function dayTypeOf(req, playDate) {
    const rows = await classifyDateRange(req, playDate, playDate);
    return rows.length ? rows[0].dayType : 'weekday';
}

function str(v, max) {
    const s = v === null || v === undefined ? '' : String(v).trim();
    return s ? s.slice(0, max) : null;
}

// ---------------------------------------------------------------------------
// Lookups

async function findBooking(req, id, { transaction } = {}) {
    const companyId = companyIdOf(req);
    if (!companyId) return { status: 400, message: 'Select a workspace first.' };
    const profile = await BookingProfile.findOne({
        where: { companyId, id, bookingType: { [Op.in]: GROUP_BOOKING_TYPE_KEYS } },
        transaction,
    });
    if (!profile) return { status: 404, message: 'Group booking not found.' };
    return { companyId, profile };
}

// The PLAY FACTS a group bill prices by: the booking's FIRST planned play
// day (its holes and day type decide the matrix cell). Falls back to the
// header's play date with 18 holes when no day is planned.
async function playFactsOf(req, profile) {
    const day = await GroupPlayDay.findOne({
        where: { bookingProfileId: profile.id, status: { [Op.ne]: 'cancelled' } },
        order: [['playDate', 'ASC']],
    });
    const playDate = String(day ? day.playDate : profile.playDate);
    const holes = day ? Number(day.holes) : 18;
    const dayType = await dayTypeOf(req, playDate);
    return { playDate, holes, dayType };
}

// The group bill (non-voided) of a booking, or null.
async function groupBillOf(companyId, profile, { transaction } = {}) {
    return Bill.findOne({
        where: { companyId, bookingProfileId: profile.id, billType: 'group', status: { [Op.ne]: 'voided' } },
        transaction,
    });
}

// Get-or-create the group bill: created OPEN with no items, dated the first
// play day, numbered from the golf-bill series.
async function ensureGroupBill(req, companyId, profile, stamps) {
    const existing = await groupBillOf(companyId, profile);
    if (existing) return { bill: existing };
    const facts = await playFactsOf(req, profile);
    return sequelize.transaction(async (transaction) => {
        const again = await groupBillOf(companyId, profile, { transaction });
        if (again) return { bill: again };
        const no = await billing.issueBillNo(req, { transaction });
        if (no.error) return { error: no.error };
        const bill = await Bill.create({
            companyId,
            billNo: no.billNo,
            billType: 'group',
            bookingProfileId: profile.id,
            playerId: null,
            golferId: null,
            billDate: facts.playDate,
            ...stamps,
        }, { transaction });
        return { bill };
    });
}

// ---------------------------------------------------------------------------
// DTOs

function tileDto(t) {
    return {
        id: t.id,
        transactionType: t.transactionType,
        description: t.description,
        chargeType: t.chargeType,
        golferType: t.golferType || null,
        golferTypeLabel: t.golferType ? ((GOLFER_TYPES.find((g) => g.key === t.golferType) || {}).label || t.golferType) : null,
        iconUrl: t.iconUrl,
        allowPriceOverride: t.allowPriceOverride === true,
    };
}

function tenderDto(t) {
    return { id: t.id, paymentType: t.paymentType, paymentClass: t.paymentClass, description: t.description, iconUrl: t.iconUrl };
}

// A deposit bill as the folio shows it: the tender, the AR invoice it posted
// (when charged to account) and that invoice's live standing from AR.
async function depositDto(companyId, bill) {
    const [items, payments] = await Promise.all([
        BillItem.findAll({ where: { billId: bill.id }, order: [['sortOrder', 'ASC']] }),
        BillPayment.findAll({ where: { billId: bill.id }, order: [['sortOrder', 'ASC']] }),
    ]);
    const pay = payments[0] || null;
    const tender = pay ? await PaymentType.findOne({ where: { id: pay.paymentTypeId }, attributes: ['paymentType', 'description', 'paymentClass'] }) : null;
    const standing = pay && pay.arDocId ? await arGateway.getDocumentStanding(companyId, pay.arDocId) : null;
    const total = Number(bill.totalAmount);
    const applied = Number(bill.depositAppliedAmount || 0);
    const refunded = Number(bill.depositRefundedAmount || 0);
    return {
        id: bill.id,
        billNo: bill.billNo,
        billDate: bill.billDate,
        status: bill.status,
        description: items[0] ? items[0].description : 'Deposit',
        amount: total,
        taxTotal: Number(bill.taxTotal),
        remarks: bill.remarks,
        paymentTypeId: pay ? pay.paymentTypeId : null,
        paymentType: tender ? tender.paymentType : null,
        paymentClass: pay ? pay.paymentClass : null,
        reference: pay ? pay.reference : null,
        onAccount: !!(pay && pay.arDocId),
        arDocNo: pay ? pay.arDocNo : null,
        arStanding: standing,
        appliedAmount: applied,
        refundedAmount: refunded,
        unappliedAmount: round2(total - applied - refunded),
        voidedAt: bill.voidedAt || null,
        voidReason: bill.voidReason || null,
        createdAt: bill.createdAt,
    };
}

async function folioDto(req, companyId, profile, bill) {
    const [types, tenders, depositBills] = await Promise.all([
        GolfTransactionType.findAll({ where: { companyId, isActive: true }, order: [['transactionType', 'ASC']] }),
        PaymentType.findAll({ where: { companyId, isActive: true }, order: [['paymentType', 'ASC']] }),
        Bill.findAll({ where: { companyId, bookingProfileId: profile.id, billType: 'deposit' }, order: [['billDate', 'ASC'], ['createdAt', 'ASC']] }),
    ]);
    const deposits = [];
    for (const d of depositBills) deposits.push(await depositDto(companyId, d));
    const live = deposits.filter((d) => d.status !== 'voided');
    const facts = await playFactsOf(req, profile);
    const depositType = types.find((t) => t.chargeType === DEPOSIT_CHARGE_TYPE_KEY) || null;
    return {
        bill: bill ? await billing.billDto(bill) : null,
        play: facts,
        tiles: types.filter((t) => t.chargeType !== DEPOSIT_CHARGE_TYPE_KEY && t.chargeType !== 'no-show').map(tileDto),
        tenders: tenders.filter((t) => t.paymentClass !== 'deposit' && t.paymentClass !== 'suspend').map(tenderDto),
        depositType: depositType ? tileDto(depositType) : null,
        deposits,
        depositTotal: round2(live.reduce((s, d) => s + d.amount, 0)),
        depositUnapplied: round2(live.reduce((s, d) => s + d.unappliedAmount, 0)),
        billingParty: {
            debtorType: profile.debtorType,
            debtorSourceId: profile.debtorSourceId,
            organiserName: profile.organiserName,
            hasAccount: !!(profile.debtorType && profile.debtorSourceId),
        },
    };
}

// ---------------------------------------------------------------------------
// Group bill

// GET /api/golf/group-bookings/:id/folio - the folio: the group bill (null
// until the first item), tiles, tenders, deposits with AR standing.
exports.getFolio = async (req, res) => {
    try {
        const found = await findBooking(req, req.params.id);
        if (!found.profile) return res.status(found.status).json({ message: found.message });
        const { companyId, profile } = found;
        const bill = await groupBillOf(companyId, profile);
        res.status(200).json({ folio: await folioDto(req, companyId, profile, bill) });
    } catch (error) {
        console.error('Error loading group folio:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

async function guardAmend(req, found) {
    const { profile } = found;
    if (profile.status !== 'booked') return { status: 400, message: 'A cancelled booking cannot be billed.' };
    if (!(await canModifyRecord(req, profile))) return { status: 403, message: 'You are not allowed to amend this booking.' };
    return null;
}

// POST /api/golf/group-bookings/:id/folio/items { transactionTypeId, quantity, unitAmount? }
// - creates the group bill on first use. Packages explode per player
// (quantity = number of players); eligibility rules are golfer-specific and
// do not apply to a group bill.
exports.addItem = async (req, res) => {
    try {
        const found = await findBooking(req, req.params.id);
        if (!found.profile) return res.status(found.status).json({ message: found.message });
        const guard = await guardAmend(req, found);
        if (guard) return res.status(guard.status).json({ message: guard.message });
        const { companyId, profile } = found;
        const type = await GolfTransactionType.findOne({ where: { companyId, id: String(req.body.transactionTypeId || ''), isActive: true } });
        if (!type) return res.status(400).json({ message: 'Pick a billing item.' });
        if (type.chargeType === DEPOSIT_CHARGE_TYPE_KEY) return res.status(400).json({ message: 'Deposits are recorded with "Record deposit", not as a bill item.' });
        const quantity = Number.isInteger(Number(req.body.quantity)) ? Number(req.body.quantity) : 1;
        if (quantity < 1 || quantity > 999) return res.status(400).json({ message: 'Quantity must be between 1 and 999.' });
        let unitAmount = null;
        if (req.body.unitAmount !== undefined && req.body.unitAmount !== null && req.body.unitAmount !== '') {
            unitAmount = Number(req.body.unitAmount);
            if (!Number.isFinite(unitAmount) || unitAmount < 0) return res.status(400).json({ message: 'The price must be 0.00 or more.' });
            if (type.allowPriceOverride !== true) return res.status(403).json({ message: `'${type.transactionType}' does not allow a manual price.` });
            if (type.chargeType === PACKAGE_CHARGE_TYPE_KEY) return res.status(400).json({ message: 'A package is billed at its catalog price.' });
        }
        const stamps = await callerStamps(req);
        const ensured = await ensureGroupBill(req, companyId, profile, stamps);
        if (ensured.error) return res.status(400).json({ message: ensured.error });
        const bill = ensured.bill;
        if (bill.status !== 'open') return res.status(409).json({ message: `The group bill is ${bill.status} and cannot be amended.` });
        const facts = await playFactsOf(req, profile);
        const play = { playDate: facts.playDate, holes: facts.holes };
        const result = await sequelize.transaction(async (transaction) => {
            const out = type.chargeType === PACKAGE_CHARGE_TYPE_KEY
                ? await billing.addPackageItems({ req, bill, play, type, stamps, transaction, quantity })
                : await billing.addOrdinaryItem({ req, bill, play, type, quantity, dayType: facts.dayType, stamps, transaction, unitAmount });
            if (out.error) return { fail: out.error, status: 400 };
            await billing.recomputeTotals(bill, transaction);
            return {};
        });
        if (result.fail) return res.status(result.status).json({ message: result.fail });
        res.status(200).json({ folio: await folioDto(req, companyId, profile, bill) });
    } catch (error) {
        console.error('Error adding group bill item:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/golf/group-bookings/:id/folio/items/:itemId { quantity?, unitAmount? }
exports.updateItem = async (req, res) => {
    try {
        const found = await findBooking(req, req.params.id);
        if (!found.profile) return res.status(found.status).json({ message: found.message });
        const guard = await guardAmend(req, found);
        if (guard) return res.status(guard.status).json({ message: guard.message });
        const { companyId, profile } = found;
        const bill = await groupBillOf(companyId, profile);
        if (!bill) return res.status(404).json({ message: 'No group bill yet.' });
        if (bill.status !== 'open') return res.status(409).json({ message: `The group bill is ${bill.status} and cannot be amended.` });
        const item = await BillItem.findOne({ where: { billId: bill.id, id: req.params.itemId } });
        if (!item) return res.status(404).json({ message: 'Bill item not found.' });
        if (item.packageGroupId) return res.status(400).json({ message: 'Package lines are fixed - remove the package and bill it again instead.' });
        const type = await GolfTransactionType.findOne({ where: { companyId, id: item.transactionTypeId } });
        const result = await sequelize.transaction(async (transaction) => {
            const out = await billing.amendItem({
                req, bill, item, type, quantity: req.body.quantity, unitAmount: req.body.unitAmount,
                onDate: String(bill.billDate), updatedBy: getUserContext(req).userId, transaction,
            });
            if (out.error) return { fail: out.error, status: out.status || 400 };
            return {};
        });
        if (result.fail) return res.status(result.status).json({ message: result.fail });
        res.status(200).json({ folio: await folioDto(req, companyId, profile, bill) });
    } catch (error) {
        console.error('Error updating group bill item:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/golf/group-bookings/:id/folio/items/:itemId
exports.removeItem = async (req, res) => {
    try {
        const found = await findBooking(req, req.params.id);
        if (!found.profile) return res.status(found.status).json({ message: found.message });
        const guard = await guardAmend(req, found);
        if (guard) return res.status(guard.status).json({ message: guard.message });
        const { companyId, profile } = found;
        const bill = await groupBillOf(companyId, profile);
        if (!bill) return res.status(404).json({ message: 'No group bill yet.' });
        if (bill.status !== 'open') return res.status(409).json({ message: `The group bill is ${bill.status} and cannot be amended.` });
        const item = await BillItem.findOne({ where: { billId: bill.id, id: req.params.itemId } });
        if (!item) return res.status(404).json({ message: 'Bill item not found.' });
        await sequelize.transaction(async (transaction) => billing.removeItem({ bill, item, transaction }));
        res.status(200).json({ folio: await folioDto(req, companyId, profile, bill) });
    } catch (error) {
        console.error('Error removing group bill item:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---------------------------------------------------------------------------
// Proforma

// PUT /api/golf/group-bookings/:id/folio/proforma { depositRequired, depositDueDate }
// - the deposit demand stated on the proforma.
exports.setProformaTerms = async (req, res) => {
    try {
        const found = await findBooking(req, req.params.id);
        if (!found.profile) return res.status(found.status).json({ message: found.message });
        const guard = await guardAmend(req, found);
        if (guard) return res.status(guard.status).json({ message: guard.message });
        const { companyId, profile } = found;
        const stamps = await callerStamps(req);
        const ensured = await ensureGroupBill(req, companyId, profile, stamps);
        if (ensured.error) return res.status(400).json({ message: ensured.error });
        const bill = ensured.bill;
        const raw = req.body.depositRequired;
        let depositRequired = null;
        if (raw !== undefined && raw !== null && raw !== '') {
            depositRequired = Number(raw);
            if (!Number.isFinite(depositRequired) || depositRequired < 0) return res.status(400).json({ message: 'The deposit must be 0.00 or more.' });
            depositRequired = round2(depositRequired);
        }
        const due = str(req.body.depositDueDate, 10);
        if (due && !DATE_RE.test(due)) return res.status(400).json({ message: 'Invalid deposit due date.' });
        bill.depositRequired = depositRequired;
        bill.depositDueDate = due;
        bill.updatedBy = stamps.updatedBy;
        await bill.save();
        res.status(200).json({ message: 'Proforma terms saved.', folio: await folioDto(req, companyId, profile, bill) });
    } catch (error) {
        console.error('Error saving proforma terms:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/golf/group-bookings/:id/folio/proforma/issue - issue (first
// time) or re-issue (revision + 1) the proforma number and stamp the time.
exports.issueProforma = async (req, res) => {
    try {
        const found = await findBooking(req, req.params.id);
        if (!found.profile) return res.status(found.status).json({ message: found.message });
        const guard = await guardAmend(req, found);
        if (guard) return res.status(guard.status).json({ message: guard.message });
        const { companyId, profile } = found;
        const bill = await groupBillOf(companyId, profile);
        if (!bill) return res.status(400).json({ message: 'Key the packages and charges first - a proforma needs at least one item.' });
        const items = await BillItem.count({ where: { billId: bill.id } });
        if (!items) return res.status(400).json({ message: 'Key the packages and charges first - a proforma needs at least one item.' });
        const result = await sequelize.transaction(async (transaction) => {
            if (!bill.proformaNo) {
                const no = await billing.issueBillNo(req, { transaction, purpose: 'golf-proforma', label: 'Proforma No.', manualNo: req.body.proformaNo });
                if (no.error) return { fail: no.error };
                bill.proformaNo = no.billNo;
                bill.proformaRevision = 1;
            } else {
                bill.proformaRevision = Number(bill.proformaRevision || 0) + 1;
            }
            bill.proformaIssuedAt = new Date();
            bill.updatedBy = getUserContext(req).userId;
            await bill.save({ transaction });
            return {};
        });
        if (result.fail) return res.status(400).json({ message: result.fail });
        res.status(200).json({
            message: `Proforma ${bill.proformaNo}${bill.proformaRevision > 1 ? ' (revision ' + bill.proformaRevision + ')' : ''} issued.`,
            folio: await folioDto(req, companyId, profile, bill),
        });
    } catch (error) {
        console.error('Error issuing proforma:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function money(n) {
    return Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function longDate(iso) {
    if (!iso) return '';
    return new Date(`${String(iso).slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// GET /api/golf/group-bookings/:id/folio/proforma/html - the proforma as a
// self-contained printable HTML document (letterhead through the seam; the
// web opens it in a new tab for the browser's print). Requires an issued
// proforma number.
exports.proformaHtml = async (req, res) => {
    try {
        const found = await findBooking(req, req.params.id);
        if (!found.profile) return res.status(found.status).json({ message: found.message });
        const { companyId, profile } = found;
        const bill = await groupBillOf(companyId, profile);
        if (!bill || !bill.proformaNo) return res.status(400).json({ message: 'Issue the proforma first.' });
        const [items, days, letterhead] = await Promise.all([
            BillItem.findAll({ where: { billId: bill.id }, order: [['sortOrder', 'ASC']] }),
            GroupPlayDay.findAll({ where: { bookingProfileId: profile.id, status: { [Op.ne]: 'cancelled' } }, order: [['playDate', 'ASC']] }),
            getCompanyLetterhead(companyId),
        ]);
        const Course = require('./course.model');
        const courses = await Course.findAll({ where: { companyId }, attributes: ['id', 'courseCode', 'description'] });
        const courseById = new Map(courses.map((c) => [c.id, c]));
        const addressLines = letterhead ? await formatAddressLines({
            line1: letterhead.address.line1, line2: letterhead.address.line2, city: letterhead.address.city,
            state: letterhead.address.state, postcode: letterhead.address.postcode, countryCode: letterhead.address.countryCode,
        }) : [];
        const rows = items.map((i) => `<tr><td>${esc(i.description)}${i.packageRole ? ' <span class="tag">package</span>' : ''}</td><td class="n">${i.quantity}</td><td class="n">${money(i.unitAmount)}</td><td class="n">${money(i.taxAmount)}</td><td class="n">${money(billing.itemPayable(i))}</td></tr>`).join('');
        const dayRows = days.map((d) => {
            const c = courseById.get(d.courseId);
            return `<li>${esc(longDate(d.playDate))} - ${esc(c ? c.courseCode + (c.description ? ' ' + c.description : '') : '')}, ${d.holes} holes, ${esc(d.startFormat)} from ${esc(String(d.startTime).slice(0, 5))}</li>`;
        }).join('');
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>Proforma ${esc(bill.proformaNo)}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;color:#1e293b;margin:32px;font-size:13px}
.head{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #1e293b;padding-bottom:12px;margin-bottom:16px}
.head img{max-height:64px;max-width:200px;object-fit:contain}
.club{font-size:18px;font-weight:700}.muted{color:#475569}
h1{font-size:22px;margin:0 0 4px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:12px 0 20px}
.box{border:1px solid #cbd5e1;border-radius:6px;padding:10px 12px}.box b{display:block;font-size:11px;text-transform:uppercase;color:#64748b;margin-bottom:4px}
table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border-bottom:1px solid #e2e8f0;padding:8px 6px;text-align:left;vertical-align:top}
th{font-size:11px;text-transform:uppercase;color:#64748b}.n{text-align:right;white-space:nowrap}
tfoot td{font-weight:700;border-top:2px solid #1e293b;border-bottom:none}.tag{font-size:10px;color:#64748b;border:1px solid #cbd5e1;border-radius:4px;padding:0 4px}
.demand{margin-top:20px;padding:12px;border:2px solid #1e293b;border-radius:6px;font-size:14px}
.foot{margin-top:28px;font-size:11px;color:#64748b}ul{margin:4px 0 0 18px;padding:0}
@media print{body{margin:12mm}.noprint{display:none}}
</style></head><body>
<div class="head"><div>${letterhead && letterhead.logo ? `<img src="${esc(letterhead.logo)}" alt="">` : ''}<div class="club">${esc(letterhead ? letterhead.name : '')}</div>
${letterhead && letterhead.registrationNo ? `<div class="muted">(${esc(letterhead.registrationNo)})</div>` : ''}<div class="muted">${addressLines.map(esc).join('<br>')}</div>
${letterhead && (letterhead.phone || letterhead.email) ? `<div class="muted">${esc([letterhead.phone, letterhead.email].filter(Boolean).join(' · '))}</div>` : ''}</div>
<div style="text-align:right"><h1>PROFORMA INVOICE</h1><div><b>${esc(bill.proformaNo)}</b>${bill.proformaRevision > 1 ? ` <span class="muted">rev ${bill.proformaRevision}</span>` : ''}</div><div class="muted">Issued ${esc(longDate(bill.proformaIssuedAt ? new Date(bill.proformaIssuedAt).toISOString() : ''))}</div><div class="muted">Booking ${esc(profile.bookingNo)}</div></div></div>
<div class="meta"><div class="box"><b>Bill to</b><div>${esc(profile.organiserName || '')}</div>${profile.contactPerson ? `<div class="muted">Attn: ${esc(profile.contactPerson)}</div>` : ''}${profile.contactMobile ? `<div class="muted">${esc(profile.contactMobile)}</div>` : ''}</div>
<div class="box"><b>${esc(profile.bookingType === 'tournament' ? 'Tournament' : 'Group')}</b><div>${esc(profile.groupName || '')}</div><ul>${dayRows}</ul>${profile.expectedPlayers ? `<div class="muted">${profile.expectedPlayers} players expected</div>` : ''}</div></div>
<table><thead><tr><th>Item</th><th class="n">Qty</th><th class="n">Unit</th><th class="n">Tax</th><th class="n">Amount</th></tr></thead><tbody>${rows}</tbody>
<tfoot><tr><td colspan="3">Total</td><td class="n">${money(bill.taxTotal)}</td><td class="n">${money(bill.totalAmount)}</td></tr></tfoot></table>
${bill.depositRequired !== null && bill.depositRequired !== undefined ? `<div class="demand">Deposit of <b>${money(bill.depositRequired)}</b> payable${bill.depositDueDate ? ` by <b>${esc(longDate(bill.depositDueDate))}</b>` : ''} to confirm the booking.</div>` : ''}
${bill.remarks ? `<p class="muted">${esc(bill.remarks)}</p>` : ''}
<p class="foot">This proforma invoice is a request for payment and not a tax invoice. Charges are stated at the rates in force on the play date and may change if the booking changes.</p>
<p class="noprint"><button onclick="window.print()">Print</button></p>
</body></html>`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.status(200).send(html);
    } catch (error) {
        console.error('Error rendering proforma:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---------------------------------------------------------------------------
// Deposits

// Resolve the AR target of an account-class tender on the folio:
//   'debtor' -> the booking's billing party (city ledger / member account);
//   'member' -> the organising member's own account (the same target when the
//               organiser is a member; refused for a non-member organiser).
async function depositTarget(companyId, profile, tender) {
    if (!profile.debtorType || !profile.debtorSourceId) {
        return { error: 'This booking has no billing account - record the deposit with a cash-type tender, or set the organiser to a City Ledger or Member account first.' };
    }
    if (tender.paymentClass === 'member' && profile.debtorType === 'other') {
        return { error: 'The organiser is a City Ledger account - use a Debtor-class tender to charge it.' };
    }
    if (tender.paymentClass === 'debtor' && profile.debtorType !== 'other') {
        // A member organiser's account is still a valid "debtor" target.
    }
    let incurredByMemberId = null;
    if (profile.debtorType !== 'other' && profile.bookerGolferId) {
        const Golfer = require('./golfer.model');
        const g = await Golfer.findOne({ where: { id: profile.bookerGolferId }, attributes: ['memberNo', 'sourceId'] });
        if (g && g.memberNo) {
            const standing = await getGolfMemberStanding(companyId, g.memberNo);
            if (standing && standing.chargeControl === 'barred') return { error: `Member ${standing.memberNo} (${standing.statusLabel || 'status'}) is barred from charging to account.` };
            incurredByMemberId = standing ? standing.memberId : g.sourceId;
        }
    }
    return { target: { debtorType: profile.debtorType, sourceId: profile.debtorSourceId, incurredByMemberId } };
}

// POST /api/golf/group-bookings/:id/deposits { amount, paymentTypeId, reference?, remarks?, billNo? }
// - raise a DEPOSIT BILL: one Deposit item for the amount, settled at once by
// the tender. Account-class tenders post the AR invoice FIRST (the credit
// gate), then the bill commits with the posted document snapshotted.
exports.recordDeposit = async (req, res) => {
    try {
        const found = await findBooking(req, req.params.id);
        if (!found.profile) return res.status(found.status).json({ message: found.message });
        const guard = await guardAmend(req, found);
        if (guard) return res.status(guard.status).json({ message: guard.message });
        const { companyId, profile } = found;
        const amount = round2(Number(req.body.amount));
        if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: 'The deposit amount must be more than 0.00.' });
        const tender = await PaymentType.findOne({ where: { companyId, id: String(req.body.paymentTypeId || ''), isActive: true } });
        if (!tender) return res.status(400).json({ message: 'Pick the payment type the deposit was received by.' });
        if (tender.paymentClass === 'deposit' || tender.paymentClass === 'suspend') return res.status(400).json({ message: `A ${tender.paymentClass}-class tender cannot receive a deposit.` });
        const depositType = await GolfTransactionType.findOne({ where: { companyId, chargeType: DEPOSIT_CHARGE_TYPE_KEY, isActive: true } });
        if (!depositType) return res.status(400).json({ message: 'Set up a Deposit transaction type first (Golf Management → Transaction Type, charge type Deposit).' });
        const reference = str(req.body.reference, 100);
        const remarks = str(req.body.remarks, 255);
        const stamps = await callerStamps(req);
        const facts = await playFactsOf(req, profile);
        const billDate = String(req.body.billDate && DATE_RE.test(String(req.body.billDate)) ? req.body.billDate : new Date().toISOString().slice(0, 10));

        // Account tenders: resolve the AR target before anything is written.
        let target = null;
        if (ACCOUNT_PAYMENT_CLASSES.includes(tender.paymentClass)) {
            const t = await depositTarget(companyId, profile, tender);
            if (t.error) return res.status(400).json({ message: t.error });
            target = t.target;
        }

        // 1. The bill + item (tax per the Deposit type's scheme, normally none).
        const created = await sequelize.transaction(async (transaction) => {
            const no = await billing.issueBillNo(req, { transaction, manualNo: req.body.billNo });
            if (no.error) return { fail: no.error };
            const bill = await Bill.create({
                companyId, billNo: no.billNo, billType: 'deposit', bookingProfileId: profile.id,
                playerId: null, golferId: null, billDate, remarks, ...stamps,
            }, { transaction });
            const added = await billing.addOrdinaryItem({
                req, bill, play: { playDate: facts.playDate, holes: facts.holes }, type: depositType, quantity: 1,
                dayType: facts.dayType, stamps, transaction, unitAmount: amount,
            });
            if (added.error) return { fail: added.error };
            await billing.recomputeTotals(bill, transaction);
            return { bill };
        });
        if (created.fail) return res.status(400).json({ message: created.fail });
        const bill = created.bill;
        const total = round2(Number(bill.totalAmount));

        // 2. Account tender: post the AR invoice for the bill total (the
        // deposit plus any tax the club put on it). A refusal voids the bill
        // just created so nothing half-raised remains.
        let ar = null;
        if (target) {
            const posted = await billing.postChargeToAccount(req, {
                bill, target, amount: total,
                description: `Deposit ${bill.billNo} — ${profile.groupName || profile.bookingNo}`,
                stamps, enforceCredit: true,
            });
            if (posted.error) {
                bill.status = 'voided';
                bill.voidedAt = new Date();
                bill.voidedBy = stamps.updatedBy;
                bill.voidReason = `AR refused: ${posted.error}`;
                await bill.save();
                return res.status(400).json({ message: `The deposit could not be charged to account: ${posted.error}` });
            }
            ar = posted;
        }

        // 3. The tender settles the bill.
        await sequelize.transaction(async (transaction) => {
            await BillPayment.create({
                billId: bill.id, sortOrder: 1, paymentTypeId: tender.id, paymentClass: tender.paymentClass,
                amount: total, reference,
                arDocId: ar ? ar.id : null, arDocNo: ar ? ar.docNo : null,
                debtorType: target ? target.debtorType : null, debtorSourceId: target ? target.sourceId : null,
                ...stamps,
            }, { transaction });
            bill.status = 'settled';
            bill.settledAt = new Date();
            bill.updatedBy = stamps.updatedBy;
            await bill.save({ transaction });
        });
        const how = ar ? `charged to ${profile.organiserName} (${ar.docNo})` : `received by ${tender.paymentType}`;
        res.status(201).json({
            message: `Deposit bill ${bill.billNo} for ${total.toFixed(2)} ${how}.`,
            folio: await folioDto(req, companyId, profile, await groupBillOf(companyId, profile)),
        });
    } catch (error) {
        console.error('Error recording group deposit:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/golf/group-bookings/:id/deposits/:billId/void { reason } - a
// cash-tendered deposit keyed in error. An on-account deposit is on the
// ledger and is reversed by Finance; an applied deposit is in the final bill.
exports.voidDeposit = async (req, res) => {
    try {
        const found = await findBooking(req, req.params.id);
        if (!found.profile) return res.status(found.status).json({ message: found.message });
        const guard = await guardAmend(req, found);
        if (guard) return res.status(guard.status).json({ message: guard.message });
        const { companyId, profile } = found;
        const bill = await Bill.findOne({ where: { companyId, bookingProfileId: profile.id, billType: 'deposit', id: req.params.billId } });
        if (!bill) return res.status(404).json({ message: 'Deposit bill not found.' });
        if (bill.status === 'voided') return res.status(400).json({ message: 'This deposit is already voided.' });
        const reason = str(req.body.reason, 255);
        if (!reason) return res.status(400).json({ message: 'Give a reason for voiding the deposit.' });
        const pay = await BillPayment.findOne({ where: { billId: bill.id } });
        if (pay && pay.arDocId) return res.status(400).json({ message: `Deposit ${bill.billNo} was charged to account (${pay.arDocNo}) - Finance reverses it in Account Receivable.` });
        if (cents(bill.depositAppliedAmount) > 0 || cents(bill.depositRefundedAmount) > 0) {
            return res.status(400).json({ message: `Deposit ${bill.billNo} has been applied or refunded and cannot be voided.` });
        }
        const callerId = getUserContext(req).userId;
        bill.status = 'voided';
        bill.voidedAt = new Date();
        bill.voidedBy = callerId;
        bill.voidReason = reason;
        bill.updatedBy = callerId;
        await bill.save();
        res.status(200).json({ message: `Deposit bill ${bill.billNo} voided.`, folio: await folioDto(req, companyId, profile, await groupBillOf(companyId, profile)) });
    } catch (error) {
        console.error('Error voiding group deposit:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/golf/group-bookings/:id/deposits/:billId/html - the deposit bill
// as a printable document (same letterhead as the proforma).
exports.depositHtml = async (req, res) => {
    try {
        const found = await findBooking(req, req.params.id);
        if (!found.profile) return res.status(found.status).json({ message: found.message });
        const { companyId, profile } = found;
        const bill = await Bill.findOne({ where: { companyId, bookingProfileId: profile.id, billType: 'deposit', id: req.params.billId } });
        if (!bill) return res.status(404).json({ message: 'Deposit bill not found.' });
        const d = await depositDto(companyId, bill);
        const letterhead = await getCompanyLetterhead(companyId);
        const addressLines = letterhead ? await formatAddressLines({
            line1: letterhead.address.line1, line2: letterhead.address.line2, city: letterhead.address.city,
            state: letterhead.address.state, postcode: letterhead.address.postcode, countryCode: letterhead.address.countryCode,
        }) : [];
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>Deposit bill ${esc(bill.billNo)}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;color:#1e293b;margin:32px;font-size:13px}.head{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #1e293b;padding-bottom:12px;margin-bottom:16px}.head img{max-height:64px;max-width:200px;object-fit:contain}.club{font-size:18px;font-weight:700}.muted{color:#475569}h1{font-size:22px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border-bottom:1px solid #e2e8f0;padding:8px 6px;text-align:left}th{font-size:11px;text-transform:uppercase;color:#64748b}.n{text-align:right}tfoot td{font-weight:700;border-top:2px solid #1e293b;border-bottom:none}.box{border:1px solid #cbd5e1;border-radius:6px;padding:10px 12px;margin-top:12px}.box b{display:block;font-size:11px;text-transform:uppercase;color:#64748b;margin-bottom:4px}.void{color:#b91c1c;font-weight:700}@media print{body{margin:12mm}.noprint{display:none}}</style></head><body>
<div class="head"><div>${letterhead && letterhead.logo ? `<img src="${esc(letterhead.logo)}" alt="">` : ''}<div class="club">${esc(letterhead ? letterhead.name : '')}</div><div class="muted">${addressLines.map(esc).join('<br>')}</div></div>
<div style="text-align:right"><h1>DEPOSIT BILL</h1><div><b>${esc(bill.billNo)}</b></div><div class="muted">${esc(longDate(bill.billDate))}</div><div class="muted">Booking ${esc(profile.bookingNo)}</div>${bill.status === 'voided' ? `<div class="void">VOIDED${bill.voidReason ? ' - ' + esc(bill.voidReason) : ''}</div>` : ''}</div></div>
<div class="box"><b>Received from</b><div>${esc(profile.organiserName || '')}</div><div class="muted">${esc(profile.groupName || '')}</div></div>
<table><thead><tr><th>Item</th><th class="n">Amount</th></tr></thead><tbody><tr><td>${esc(d.description)}</td><td class="n">${money(bill.totalAmount)}</td></tr></tbody><tfoot><tr><td>Total</td><td class="n">${money(bill.totalAmount)}</td></tr></tfoot></table>
<div class="box"><b>Payment</b><div>${esc(d.paymentType || '')}${d.reference ? ` · ${esc(d.reference)}` : ''}${d.onAccount ? ` · charged to account, AR invoice ${esc(d.arDocNo)}` : ''}</div></div>
${bill.remarks ? `<p class="muted">${esc(bill.remarks)}</p>` : ''}
<p class="noprint"><button onclick="window.print()">Print</button></p></body></html>`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.status(200).send(html);
    } catch (error) {
        console.error('Error rendering deposit bill:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
