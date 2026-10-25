// Facility Bills (/facility/bookings; structures approved 2026-10-25,
// sub-slice 2c; golf's front-desk bill flow). ONE bill per booking, payable
// by the booker: the desk opens it from the booking (the Facility Type's
// default fees auto-charge - the facility fee per slot and the guest fee per
// guest participant, each priced from its rate card for the slot's day type,
// session and participant type; a missing price cell refuses the open naming
// the cell), adds or amends lines from the tiles, then settles with several
// tenders: the member class posts to the booker's AR account and the debtor
// class to an AR Other Debtor (both credit enforced through the AR seam), the
// suspend class counts toward settlement, cash-like classes just record.

const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { getUserContext, canModifyRecord, annotateCanModify } = require('../../platform/serviceContext');
const { getGolfMemberStanding, getChargeTarget } = require('../../platform/membershipGateway');
const arGateway = require('../../platform/arGateway');
const Booking = require('./booking.model');
const FacilityType = require('./facilityType.model');
const TransactionType = require('./transactionType.model');
const PaymentType = require('./paymentType.model');
const Patron = require('./patron.model');
const billing = require('./billing.service');
const pricing = require('./billPricing.service');
const participantTypes = require('./participantType.service');
const availability = require('./bookingAvailability.service');
const shared = require('./bookingShared');
const { companyIdOf, stampsFor } = require('./facilityShared');

const { Bill, BillItem, BillPayment, round2, cents } = billing;

// ---- loaders ------------------------------------------------------------------

async function findBill(req, { openOnly = false } = {}) {
    const companyId = companyIdOf(req);
    if (!companyId) return { status: 400, message: 'Select a workspace first.' };
    const bill = await Bill.findOne({ where: { companyId, id: req.params.billId } });
    if (!bill) return { status: 404, message: 'Bill not found.' };
    if (openOnly && bill.status !== 'open') return { status: 409, message: `Bill ${bill.billNo} is ${bill.status}.` };
    const booking = await Booking.findOne({ where: { companyId, id: bill.bookingId } });
    if (!booking) return { status: 409, message: 'The bill\'s booking no longer exists.' };
    return { companyId, bill, booking };
}

// The line context a booking gives a manual line: the first live slot's date,
// day type and session, and the booker's category.
async function lineContext(companyId, booking, facts, { transaction } = {}) {
    const slot = facts.liveSlots[0] || (facts.slots[0] ? facts.slots[0].row : null);
    const { sessions } = await availability.loadRules(companyId, { transaction });
    const session = slot && slot.sessionId ? sessions.find((s) => s.id === slot.sessionId) : null;
    return {
        date: slot ? String(slot.bookingDate) : String(booking.createdAt).slice(0, 10),
        dayType: slot ? slot.dayType : 'weekday',
        sessionId: session ? session.id : null,
        sessionName: session ? session.name : null,
        participantType: pricing.bookerCategory(facts.booker),
        sessions,
        slot,
    };
}

// The payload the bill screen renders: the bill, the booking's facts, the
// tiles of its facility type, the tenders and the AR Other Debtors.
async function screenPayload(req, companyId, bill, booking, facts, extras = {}) {
    await annotateCanModify(req, [bill]);
    const [tiles, tenders, otherDebtors] = await Promise.all([
        billing.tilesFor(companyId, booking.facilityTypeId),
        PaymentType.findAll({ where: { companyId, isActive: true }, order: [['paymentType', 'ASC']] }),
        arGateway.listOtherDebtors(companyId),
    ]);
    return {
        bill: await billing.billDto(bill),
        booking: {
            id: booking.id,
            bookingNo: booking.bookingNo,
            status: booking.status,
            bookingDate: facts.shownSlots.length ? String(facts.shownSlots[0].bookingDate) : null,
            startTime: facts.firstStart,
            endTime: facts.lastEnd,
            facilityType: facts.type ? { id: facts.type.id, code: facts.type.code, description: facts.type.description } : null,
            facilities: [...new Set(facts.slots.map((s) => s.facilityCode))],
            booker: facts.booker ? { id: facts.booker.id, patronType: facts.booker.patronType, name: facts.booker.name, memberNo: facts.booker.memberNo } : null,
            slots: facts.liveSlots.length,
            participants: facts.roster.map((p) => ({ id: p.id, name: p.name, participantType: p.participantType })),
        },
        tiles,
        tenders: tenders.map((t) => ({ id: t.id, paymentType: t.paymentType, paymentClass: t.paymentClass, description: t.description, iconUrl: t.iconUrl })),
        otherDebtors: (otherDebtors || []).map((d) => ({ id: d.id, code: d.code || d.debtorCode || null, name: d.name })),
        warnings: [],
        ...extras,
    };
}

// ---- POST /api/facility/bookings/:id/bill ------------------------------------
// Open the booking's bill (or return the live one): the default fees of the
// facility type auto-charge from the rate cards.
exports.openBill = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const booking = await Booking.findOne({ where: { companyId, id: req.params.id } });
        if (!booking) return res.status(404).json({ message: 'Booking not found.' });
        const facts = await shared.bookingFacts(booking);
        const existing = await billing.billOfBooking(companyId, booking.id);
        if (existing) return res.status(200).json(await screenPayload(req, companyId, existing, booking, facts));
        if (booking.status !== 'booked') return res.status(400).json({ message: `Booking ${booking.bookingNo} is ${booking.status} - only a booked booking is billed.` });
        if (!facts.liveSlots.length) return res.status(400).json({ message: 'This booking has no live slots to bill.' });
        if (!facts.booker) return res.status(409).json({ message: 'The booking\'s booker no longer exists.' });

        const type = facts.type;
        const stamps = await stampsFor(req);
        const [types, ptypes] = await Promise.all([
            TransactionType.findAll({ where: { companyId } }),
            participantTypes.catalog(companyId),
        ]);
        const ctx = await lineContext(companyId, booking, facts);
        const warnings = [];

        const result = await sequelize.transaction(async (transaction) => {
            const issued = await billing.issueBillNo(req, { transaction, manualNo: req.body.billNo });
            if (issued.error) return { fail: issued.error, status: 400 };
            const bill = await Bill.create({
                companyId, billNo: issued.billNo, bookingId: booking.id, patronId: facts.booker.id, billDate: ctx.date, status: 'open', ...stamps,
            }, { transaction });

            // The facility fee: per slot (one line per slot, each priced on
            // its own session), else one line on the first slot.
            const feeType = pricing.defaultTypeFor(types, { chargeType: 'facility-fee', participantType: ctx.participantType, facilityTypeId: type.id, explicitId: type.feeTransactionTypeId });
            if (!feeType) warnings.push(`No active facility-fee item is the default for '${ctx.participantType}' on ${type.code} - the facility fee was not auto-charged.`);
            else {
                const targetSlots = feeType.feeBasis === 'per-slot' ? facts.liveSlots : [facts.liveSlots[0]];
                for (const s of targetSlots) {
                    const session = s.sessionId ? ctx.sessions.find((x) => x.id === s.sessionId) : null;
                    const added = await billing.addItem({
                        req, bill, type: feeType, quantity: 1, stamps, transaction,
                        context: { date: String(s.bookingDate), dayType: s.dayType, sessionId: session ? session.id : null, sessionName: session ? session.name : null, participantType: ctx.participantType, bookingSlotId: s.id },
                    });
                    if (added.error) return { fail: added.error, status: 400 };
                }
            }

            // The guest fee: once per guest-like participant (per slot when
            // the item's basis says so), priced by that participant's type.
            const guests = facts.roster.filter((p) => participantTypes.isGuestLike(ptypes, p.participantType));
            for (const p of guests) {
                const guestType = pricing.defaultTypeFor(types, { chargeType: 'guest-fee', participantType: p.participantType, facilityTypeId: type.id, explicitId: type.guestFeeTransactionTypeId });
                if (!guestType) {
                    warnings.push(`No active guest-fee item is the default for '${participantTypes.labelOf(ptypes, p.participantType)}' on ${type.code} - ${p.name}'s guest fee was not auto-charged.`);
                    continue;
                }
                const first = facts.liveSlots[0];
                const added = await billing.addItem({
                    req, bill, type: guestType, quantity: guestType.feeBasis === 'per-slot' ? facts.liveSlots.length : 1, stamps, transaction,
                    context: { date: String(first.bookingDate), dayType: first.dayType, sessionId: ctx.sessionId, sessionName: ctx.sessionName, participantType: p.participantType, bookingSlotId: first.id, bookingParticipantId: p.id },
                });
                if (added.error) return { fail: `${p.name}: ${added.error}`, status: 400 };
            }
            await billing.recomputeTotals(bill, transaction);
            return { bill };
        });
        if (result.fail) return res.status(result.status || 400).json({ message: result.fail });
        res.status(201).json(await screenPayload(req, companyId, result.bill, booking, facts, { warnings, message: `Bill ${result.bill.billNo} opened.` }));
    } catch (error) {
        console.error('Error opening facility bill:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---- GET /api/facility/bills/:billId --------------------------------------------
exports.getBill = async (req, res) => {
    try {
        const found = await findBill(req);
        if (found.status) return res.status(found.status).json({ message: found.message });
        const { companyId, bill, booking } = found;
        res.status(200).json(await screenPayload(req, companyId, bill, booking, await shared.bookingFacts(booking)));
    } catch (error) {
        console.error('Error loading facility bill:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---- POST /api/facility/bills/:billId/items ----------------------------------------
exports.addItem = async (req, res) => {
    try {
        const found = await findBill(req, { openOnly: true });
        if (found.status) return res.status(found.status).json({ message: found.message });
        const { companyId, bill, booking } = found;
        const type = await TransactionType.findOne({ where: { companyId, id: String(req.body.transactionTypeId || ''), isActive: true } });
        if (!type) return res.status(400).json({ message: 'Pick a billing item.' });
        if (['package', 'deposit', 'no-show'].includes(type.chargeType)) return res.status(400).json({ message: `'${type.transactionType}' is not a desk billing item.` });
        if (type.facilityTypeId && type.facilityTypeId !== booking.facilityTypeId) return res.status(400).json({ message: `'${type.transactionType}' belongs to another facility type.` });
        const quantity = Number.isInteger(Number(req.body.quantity)) ? Number(req.body.quantity) : 1;
        if (quantity < 1 || quantity > 99) return res.status(400).json({ message: 'Quantity must be between 1 and 99.' });
        const facts = await shared.bookingFacts(booking);
        const ctx = await lineContext(companyId, booking, facts);
        const stamps = await stampsFor(req);
        const result = await sequelize.transaction(async (transaction) => {
            const added = await billing.addItem({
                req, bill, type, quantity, stamps, transaction,
                context: { ...ctx, participantType: type.participantType || ctx.participantType, bookingSlotId: ctx.slot ? ctx.slot.id : null },
            });
            if (added.error) return { fail: added.error };
            await billing.recomputeTotals(bill, transaction);
            return {};
        });
        if (result.fail) return res.status(400).json({ message: result.fail });
        res.status(200).json({ bill: await billing.billDto(bill) });
    } catch (error) {
        console.error('Error adding facility bill item:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---- PUT /api/facility/bills/:billId/items/:itemId -----------------------------------
exports.updateItem = async (req, res) => {
    try {
        const found = await findBill(req, { openOnly: true });
        if (found.status) return res.status(found.status).json({ message: found.message });
        const { companyId, bill } = found;
        const item = await BillItem.findOne({ where: { billId: bill.id, id: req.params.itemId } });
        if (!item) return res.status(404).json({ message: 'Bill item not found.' });
        const type = await TransactionType.findOne({ where: { companyId, id: item.transactionTypeId } });
        const result = await sequelize.transaction(async (transaction) => billing.amendItem({
            req, bill, item, type, quantity: req.body.quantity, unitAmount: req.body.unitAmount,
            onDate: String(bill.billDate), updatedBy: getUserContext(req).userId, transaction,
        }));
        if (result.error) return res.status(result.status || 400).json({ message: result.error });
        res.status(200).json({ bill: await billing.billDto(bill) });
    } catch (error) {
        console.error('Error amending facility bill item:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---- DELETE /api/facility/bills/:billId/items/:itemId ----------------------------------
exports.removeItem = async (req, res) => {
    try {
        const found = await findBill(req, { openOnly: true });
        if (found.status) return res.status(found.status).json({ message: found.message });
        const { bill } = found;
        const item = await BillItem.findOne({ where: { billId: bill.id, id: req.params.itemId } });
        if (!item) return res.status(404).json({ message: 'Bill item not found.' });
        await sequelize.transaction(async (transaction) => billing.removeItem({ bill, item, transaction }));
        res.status(200).json({ bill: await billing.billDto(bill) });
    } catch (error) {
        console.error('Error removing facility bill item:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---- POST /api/facility/bills/:billId/settle --------------------------------------------
// Several tenders whose sum equals the total. Account classes post to AR
// FIRST (credit enforced - a refusal aborts the settlement), then the
// settlement commits.
exports.settle = async (req, res) => {
    try {
        const found = await findBill(req, { openOnly: true });
        if (found.status) return res.status(found.status).json({ message: found.message });
        const { companyId, bill, booking } = found;
        const raw = Array.isArray(req.body.payments) ? req.body.payments : [];
        if (!raw.length) return res.status(400).json({ message: 'Key in at least one payment.' });
        if (raw.length > 10) return res.status(400).json({ message: 'Too many payment lines.' });

        const tenders = await PaymentType.findAll({ where: { companyId, isActive: true } });
        const tenderById = new Map(tenders.map((t) => [t.id, t]));
        const lines = [];
        for (let i = 0; i < raw.length; i += 1) {
            const line = raw[i] || {};
            const tender = tenderById.get(String(line.paymentTypeId || ''));
            if (!tender) return res.status(400).json({ message: `Payment ${i + 1}: pick a payment type.` });
            const amount = round2(Number(line.amount));
            if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: `Payment ${i + 1}: the amount must be more than 0.00.` });
            lines.push({
                sortOrder: i + 1, tender, amount,
                reference: line.reference ? String(line.reference).slice(0, 100) : null,
                otherDebtorId: tender.paymentClass === 'debtor' && line.otherDebtorId ? String(line.otherDebtorId) : null,
            });
        }
        const paySum = round2(lines.reduce((s, l) => s + l.amount, 0));
        const total = round2(Number(bill.totalAmount));
        if (cents(paySum) !== cents(total)) return res.status(400).json({ message: `Payments (${paySum.toFixed(2)}) must equal the bill total (${total.toFixed(2)}).` });

        const memberLines = lines.filter((l) => l.tender.paymentClass === 'member');
        const debtorLines = lines.filter((l) => l.tender.paymentClass === 'debtor');
        const stamps = await stampsFor(req);
        let arType = null;
        if (memberLines.length || debtorLines.length) {
            const resolved = await billing.arInvoiceType(companyId);
            if (resolved.error) return res.status(400).json({ message: resolved.error });
            arType = resolved.type;
        }
        const booker = await Patron.findOne({ where: { companyId, id: bill.patronId } });
        for (const line of debtorLines) {
            if (!line.otherDebtorId) return res.status(400).json({ message: `Payment ${line.sortOrder}: pick the Other Debtor to charge.` });
            const od = await arGateway.getOtherDebtor(companyId, line.otherDebtorId);
            if (!od) return res.status(400).json({ message: `Payment ${line.sortOrder}: Other Debtor not found or inactive.` });
            const posted = await billing.postChargeToAccount(req, {
                bill, arType, target: { debtorType: 'other', sourceId: od.id, incurredByMemberId: null }, amount: line.amount,
                description: `Facility bill ${bill.billNo} - booking ${booking.bookingNo} (charged to ${od.name})`, stamps,
            });
            if (posted.error) return res.status(400).json({ message: `Payment ${line.sortOrder} (${od.name}): ${posted.error}` });
            Object.assign(line, { arDocId: posted.id, arDocNo: posted.docNo, debtorType: 'other', debtorSourceId: od.id });
        }
        if (memberLines.length) {
            if (!booker || booker.patronType !== 'member' || !booker.memberNo) return res.status(400).json({ message: 'Charge to member account needs a member booker.' });
            const standing = await getGolfMemberStanding(companyId, booker.memberNo);
            if (!standing) return res.status(400).json({ message: `No member found with number '${booker.memberNo}'.` });
            if (standing.chargeControl === 'barred') return res.status(400).json({ message: `Member ${standing.memberNo} (${standing.statusLabel || 'status'}) is barred from charging to account.` });
            const target = await getChargeTarget(companyId, standing.memberId);
            if (!target) return res.status(400).json({ message: 'The member\'s charge-to-account target could not be resolved.' });
            for (const line of memberLines) {
                const posted = await billing.postChargeToAccount(req, {
                    bill, arType, target, amount: line.amount, description: `Facility bill ${bill.billNo} - booking ${booking.bookingNo} - ${booker.name}`, stamps,
                });
                if (posted.error) return res.status(400).json({ message: posted.error });
                Object.assign(line, { arDocId: posted.id, arDocNo: posted.docNo, debtorType: target.debtorType, debtorSourceId: target.sourceId });
            }
        }

        await sequelize.transaction(async (transaction) => {
            for (const line of lines) {
                await BillPayment.create({
                    billId: bill.id, sortOrder: line.sortOrder, paymentTypeId: line.tender.id, paymentClass: line.tender.paymentClass,
                    amount: line.amount, reference: line.reference, arDocId: line.arDocId || null, arDocNo: line.arDocNo || null,
                    debtorType: line.debtorType || null, debtorSourceId: line.debtorSourceId || null, ...stamps,
                }, { transaction });
            }
            bill.status = 'settled';
            bill.settledAt = new Date();
            bill.updatedBy = stamps.updatedBy;
            await bill.save({ transaction });
        });
        res.status(200).json({ message: `Bill ${bill.billNo} settled.`, bill: await billing.billDto(bill) });
    } catch (error) {
        console.error('Error settling facility bill:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---- POST /api/facility/bills/:billId/void ---------------------------------------------
// Open bills only; a voided bill lets the booking be billed again.
exports.voidBill = async (req, res) => {
    try {
        const found = await findBill(req, { openOnly: true });
        if (found.status) return res.status(found.status).json({ message: found.message });
        const { bill } = found;
        if (!(await canModifyRecord(req, bill))) return res.status(403).json({ message: 'You are not allowed to amend this bill.' });
        const callerId = getUserContext(req).userId;
        bill.status = 'voided';
        bill.voidedAt = new Date();
        bill.voidedBy = callerId;
        bill.voidReason = req.body.reason ? String(req.body.reason).slice(0, 255) : null;
        bill.updatedBy = callerId;
        await bill.save();
        res.status(200).json({ message: `Bill ${bill.billNo} voided.`, bill: await billing.billDto(bill) });
    } catch (error) {
        console.error('Error voiding facility bill:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

exports.Op = Op;
