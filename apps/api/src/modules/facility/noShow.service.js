// Facility no-show engine (structures approved 2026-10-26, slice 4; golf's
// noShowCharge.service shape). Shared by the booking cancel (late
// cancellation), the station's no-show mark and end-of-day sweep, and the
// No-show Charges / Booking Suspensions listings:
//   config      - the effective no-show configuration (null = control OFF)
//   lateness    - is a cancel NOW inside the notice window, and the deadline
//   quote       - price the penalty from the no-show item's flat card + tax
//   raise       - create the charge row inside the caller's transaction
//                 (pending, or waived with a reason); marks the strike
//   postPending - AFTER commit, post a pending row to the booker's AR
//                 account; a failure leaves it pending with the reason
//   strike      - count the booker's strikes and open the suspension
//   suspension  - the active suspension covering a date (booking refuses)
// Posting after commit (not inside it) mirrors golf: the no-show fact is
// never lost because AR was unavailable, and a posted AR invoice is never
// orphaned by a rolled-back row.

const { Op } = require('sequelize');
const { getUserContext, getCompanyProfile } = require('../../platform/serviceContext');
const { getGolfMemberStanding, getChargeTarget } = require('../../platform/membershipGateway');
const { quoteTax } = require('../../platform/taxGateway');
const arGateway = require('../../platform/arGateway');
const { emailAddress } = require('../../platform/notificationGateway');
const FacilitySetting = require('./facilitySetting.model');
const TransactionType = require('./transactionType.model');
const NoShowCharge = require('./noShowCharge.model');
const PatronSuspension = require('./patronSuspension.model');
const Patron = require('./patron.model');
const billing = require('./billing.service');
const pricing = require('./billPricing.service');
const bookingRules = require('./bookingRules.service');
const { bookingDateText } = require('./bookingShared');

const { round2, cents } = pricing;

// ---- configuration ------------------------------------------------------------

// The effective configuration (null when the master switch is OFF).
async function config(companyId, { transaction } = {}) {
    const row = await FacilitySetting.findOne({ where: { companyId }, transaction });
    if (!row || row.noShowControlEnabled !== true) return null;
    return {
        noticeHours: Number(row.cancellationNoticeHours) || 0,
        lateAction: row.lateCancellationAction === 'refuse' ? 'refuse' : 'charge',
        transactionTypeId: row.noShowTransactionTypeId || null,
        basis: ['booking', 'slot', 'participant'].includes(row.noShowChargeBasis) ? row.noShowChargeBasis : 'booking',
        graceMinutes: Number(row.noShowGraceMinutes ?? 15),
        strikeCount: Number(row.strikeCount ?? 3),
        strikeWindowDays: Number(row.strikeWindowDays ?? 90),
        strikeSuspensionDays: Number(row.strikeSuspensionDays ?? 30),
    };
}

// Is a cancel made NOW (club-local) inside the notice window of a booking
// whose first slot starts at `startTime` on `bookingDate`? { late, deadline }.
function lateness(cfg, bookingDate, startTime, timezone) {
    if (!cfg || cfg.noticeHours <= 0 || !startTime) return { late: false, deadline: null };
    const now = bookingRules.clubNow(timezone);
    const verdict = bookingRules.cancelVerdict({ setting: { noShowControlEnabled: true, cancellationNoticeHours: cfg.noticeHours }, now, bookingDate, startTime });
    const total = bookingRules.minutesUntil({ date: bookingDate, time: '00:00' }, bookingDate, startTime) - cfg.noticeHours * 60;
    const dayShift = Math.floor(total / 1440);
    const minutes = total - dayShift * 1440;
    const deadline = { date: bookingRules.addDays(bookingDate, dayShift), time: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}` };
    return { late: verdict.late, deadline };
}

// The no-show item: the Specification's pick, else the active no-show item
// scoped to the facility type, else the general one.
async function noShowType(companyId, cfg, facilityTypeId, { transaction } = {}) {
    if (cfg.transactionTypeId) {
        const t = await TransactionType.findOne({ where: { companyId, id: cfg.transactionTypeId, isActive: true }, transaction });
        if (t) return t;
    }
    const candidates = await TransactionType.findAll({ where: { companyId, chargeType: 'no-show', isActive: true }, transaction });
    return candidates.find((t) => t.facilityTypeId === facilityTypeId) || candidates.find((t) => !t.facilityTypeId) || null;
}

// Price the penalty: quantity by the basis (1 per booking, the no-show
// slots, or the roster size). Returns the priced lines, or { unpriced,
// reason } when no item or no card is in force.
async function quote(req, cfg, { facilityTypeId, bookingDate, slots, participants }, { transaction } = {}) {
    const companyId = getUserContext(req).companyId;
    const qty = cfg.basis === 'slot' ? Math.max(1, Number(slots) || 1) : cfg.basis === 'participant' ? Math.max(1, Number(participants) || 1) : 1;
    const type = await noShowType(companyId, cfg, facilityTypeId, { transaction });
    if (!type) return { unpriced: true, reason: 'No no-show item is set up - pick one on Facility Specification.', quantity: qty, type: null };
    const cards = await billing.cardsOf(type.id, { transaction });
    const priced = pricing.unitPriceOf(type, cards, { date: bookingDate, participantType: 'member', dayType: 'weekday' });
    if (priced.missing) return { unpriced: true, reason: priced.missing, quantity: qty, type };
    const amount = round2(priced.unitAmount * qty);
    const tax = await billing.quoteItemTax(req, type.taxSchemeCode, amount, bookingDate);
    return {
        type,
        description: billing.typeDescription(type),
        quantity: qty,
        unitAmount: priced.unitAmount,
        amount,
        taxSchemeCode: tax.breakdown ? type.taxSchemeCode : null,
        taxAmount: tax.taxAmount,
        taxBreakdown: tax.breakdown,
        totalAmount: tax.payable,
    };
}

// ---- raise ------------------------------------------------------------------------

function slotSummaryOf(facts) {
    const shown = facts.shownSlots.length ? facts.shownSlots : [];
    const codes = [...new Set(facts.slots.filter((s) => shown.some((x) => x.id === s.row.id)).map((s) => s.facilityCode))];
    return `${codes.join(', ')} ${facts.firstStart || ''} - ${facts.lastEnd || ''} (${shown.length} slot${shown.length === 1 ? '' : 's'})`.trim();
}

// Create the charge row inside the caller's transaction. `priced` from
// quote() (an unpriced quote raises a 0.00 row with the reason in remarks);
// `waive` = { reason } records it waived; `strike` marks it counted.
async function raise({ req, booking, facts, chargeReason, priced, waive, strike, stamps, transaction }) {
    const callerId = getUserContext(req).userId;
    const booker = facts.booker;
    const unpriced = priced.unpriced === true;
    return NoShowCharge.create({
        companyId: booking.companyId,
        bookingId: booking.id,
        bookingNo: booking.bookingNo,
        facilityTypeId: booking.facilityTypeId,
        bookingDate: facts.shownSlots.length ? facts.shownSlots[0].bookingDate : booking.createdAt,
        chargeReason,
        bookerPatronId: booker.id,
        bookerName: booker.name,
        bookerMemberNo: booker.memberNo || null,
        slotSummary: slotSummaryOf(facts).slice(0, 255),
        transactionTypeId: priced.type ? priced.type.id : null,
        description: unpriced ? 'No-show (unpriced)' : priced.description,
        quantity: priced.quantity,
        unitAmount: unpriced ? 0 : priced.unitAmount,
        amount: unpriced ? 0 : priced.amount,
        taxSchemeCode: unpriced ? null : priced.taxSchemeCode,
        taxAmount: unpriced ? 0 : priced.taxAmount,
        taxBreakdown: unpriced ? null : priced.taxBreakdown,
        totalAmount: unpriced ? 0 : priced.totalAmount,
        strikeCounted: strike === true && chargeReason === 'no-show',
        status: waive ? 'waived' : 'pending',
        waivedAt: waive ? new Date() : null,
        waivedBy: waive ? callerId : null,
        waiveReason: waive ? waive.reason : null,
        remarks: unpriced ? String(priced.reason).slice(0, 255) : null,
        ...stamps,
    }, { transaction });
}

// Re-price a pending row (the office set the pricing up after the raise).
async function reprice(req, cfg, row, { transaction } = {}) {
    const priced = await quote(req, cfg, { facilityTypeId: row.facilityTypeId, bookingDate: String(row.bookingDate), slots: row.quantity, participants: row.quantity }, { transaction });
    if (priced.unpriced) return { error: priced.reason };
    Object.assign(row, {
        transactionTypeId: priced.type.id, description: priced.description, unitAmount: priced.unitAmount, amount: priced.amount,
        taxSchemeCode: priced.taxSchemeCode, taxAmount: priced.taxAmount, taxBreakdown: priced.taxBreakdown, totalAmount: priced.totalAmount,
        remarks: null, updatedBy: getUserContext(req).userId,
    });
    await row.save({ transaction });
    return { row };
}

// ---- post ---------------------------------------------------------------------------

async function chargeTargetOf(companyId, row) {
    if (!row.bookerMemberNo) return { error: 'The booker is a visitor - no ledger account to charge; collect at the desk or waive.' };
    const standing = await getGolfMemberStanding(companyId, row.bookerMemberNo);
    if (!standing) return { error: `No member found with number '${row.bookerMemberNo}'.` };
    if (standing.chargeControl === 'barred') return { error: `Member ${standing.memberNo} (${standing.statusLabel || 'status'}) is barred from charging to account.` };
    const target = await getChargeTarget(companyId, standing.memberId);
    if (!target) return { error: 'The booker\'s charge-to-account target could not be resolved.' };
    return { target, standing };
}

// Post ONE pending row to AR (outside any business transaction); credit NOT
// enforced - a penalty is never refused by the limit. On failure the row stays
// pending with the reason in remarks.
async function postPending(req, row) {
    if (row.status !== 'pending') return row;
    const callerId = getUserContext(req).userId;
    let error = null;
    let resolved = null;
    if (!row.transactionTypeId || Number(row.totalAmount) <= 0) error = row.remarks || 'The charge is unpriced - re-price it first.';
    if (!error) {
        resolved = await chargeTargetOf(row.companyId, row);
        error = resolved.error || null;
    }
    if (!error) {
        const arType = await billing.arInvoiceType(row.companyId);
        if (arType.error) error = arType.error;
        else {
            const amountC = cents(row.totalAmount);
            const reasonText = row.chargeReason === 'late-cancel' ? 'Late cancellation' : 'No show';
            const posted = await arGateway.postCharge(req, {
                debtorType: resolved.target.debtorType,
                sourceId: resolved.target.sourceId,
                docDate: String(row.bookingDate),
                trxDate: String(row.bookingDate),
                transactionTypeId: arType.type.id,
                isInterestChargeable: arType.type.isInterestChargeable === true,
                description: `${reasonText} charge - booking ${row.bookingNo} (${String(row.bookingDate)})`,
                incurredByMemberId: resolved.target.incurredByMemberId,
                sourceModule: 'facility',
                sourceRef: row.id,
                amounts: { netC: amountC, taxC: 0, grossC: amountC, taxSchemeCode: null, taxRate: null },
                stamps: { createdBy: callerId, createdByDepartmentId: row.createdByDepartmentId || null, updatedBy: callerId },
                enforceCredit: false,
            });
            if (posted.error) error = posted.error;
            else {
                Object.assign(row, {
                    status: 'posted', arDocId: posted.id, arDocNo: posted.docNo, debtorType: resolved.target.debtorType, debtorSourceId: resolved.target.sourceId,
                    postedAt: new Date(), postedBy: callerId, remarks: null,
                });
            }
        }
    }
    if (error) row.remarks = String(error).slice(0, 255);
    row.updatedBy = callerId;
    await row.save();
    if (row.status === 'posted') await queueChargedEmail(row, resolved && resolved.standing);
    return row;
}

// ---- strikes and suspensions ---------------------------------------------------------------

// The booker's counted no-show rows inside the window ending on `date`.
async function strikesOf(companyId, patronId, cfg, date, { transaction } = {}) {
    const from = bookingRules.addDays(date, -Math.max(0, cfg.strikeWindowDays - 1));
    return NoShowCharge.findAll({
        where: { companyId, bookerPatronId: patronId, chargeReason: 'no-show', strikeCounted: true, bookingDate: { [Op.between]: [from, date] } },
        order: [['bookingDate', 'ASC']],
        attributes: ['id', 'bookingNo', 'bookingDate'],
        transaction,
    });
}

// The active suspension covering `date` for a patron (any type or the given one).
async function activeSuspension(companyId, patronId, date, { facilityTypeId = null, transaction } = {}) {
    return PatronSuspension.findOne({
        where: {
            companyId, patronId, status: 'active', fromDate: { [Op.lte]: date }, toDate: { [Op.gte]: date },
            ...(facilityTypeId ? { [Op.or]: [{ facilityTypeId: null }, { facilityTypeId }] } : {}),
        },
        transaction,
    });
}

// After a counted no-show row: reach the strike count inside the window with
// no active suspension -> open one from the strike day, club-wide. Returns
// the suspension or null. Runs inside the raising transaction.
async function strike({ req, row, cfg, stamps, transaction }) {
    if (!row.strikeCounted) return null;
    const companyId = row.companyId;
    const date = String(row.bookingDate);
    const strikes = await strikesOf(companyId, row.bookerPatronId, cfg, date, { transaction });
    if (strikes.length < cfg.strikeCount) return null;
    const existing = await PatronSuspension.findOne({ where: { companyId, patronId: row.bookerPatronId, status: 'active' }, transaction });
    if (existing) return null;
    const toDate = bookingRules.addDays(date, Math.max(0, cfg.strikeSuspensionDays - 1));
    const suspension = await PatronSuspension.create({
        companyId, patronId: row.bookerPatronId, patronName: row.bookerName, memberNo: row.bookerMemberNo, facilityTypeId: null,
        reason: `Automatic - ${strikes.length} no-shows in ${cfg.strikeWindowDays} days`,
        fromDate: date, toDate, strikeChargeIds: strikes.map((s) => s.id), status: 'active', ...stamps,
    }, { transaction });
    return suspension;
}

// Past suspensions expire (the worker tick and every listing read).
async function expireSuspensions(companyId, today) {
    const [n] = await PatronSuspension.update({ status: 'expired' }, { where: { ...(companyId ? { companyId } : {}), status: 'active', toDate: { [Op.lt]: today } } });
    return n;
}

// ---- emails ---------------------------------------------------------------------------------

async function queueChargedEmail(row, standing) {
    if (!standing || !standing.email) return;
    try {
        const company = await getCompanyProfile(row.companyId);
        await emailAddress({
            templateKey: 'facility.noshow.charged',
            accountId: company ? company.accountId : null,
            companyId: row.companyId,
            to: standing.email,
            data: {
                companyName: company ? company.name : '',
                bookerName: row.bookerName, bookingNo: row.bookingNo, bookingDateText: bookingDateText(String(row.bookingDate)),
                reasonLabel: row.chargeReason === 'late-cancel' ? 'Late cancellation' : 'No show', isLateCancel: row.chargeReason === 'late-cancel',
                slotSummary: row.slotSummary, description: row.description, quantity: row.quantity,
                unitAmount: Number(row.unitAmount).toFixed(2), taxAmount: Number(row.taxAmount) > 0 ? Number(row.taxAmount).toFixed(2) : '',
                totalAmount: Number(row.totalAmount).toFixed(2), arDocNo: row.arDocNo || '',
            },
        });
    } catch (e) {
        console.error('Error queueing facility.noshow.charged email:', e);
    }
}

async function queueSuspensionEmail(suspension) {
    if (!suspension.memberNo) return;
    try {
        const standing = await getGolfMemberStanding(suspension.companyId, suspension.memberNo);
        if (!standing || !standing.email) return;
        const company = await getCompanyProfile(suspension.companyId);
        await emailAddress({
            templateKey: 'facility.suspension.started',
            accountId: company ? company.accountId : null,
            companyId: suspension.companyId,
            to: standing.email,
            data: {
                companyName: company ? company.name : '', memberName: suspension.patronName, reason: suspension.reason,
                fromDateText: bookingDateText(String(suspension.fromDate)), toDateText: bookingDateText(String(suspension.toDate)),
                strikes: Array.isArray(suspension.strikeChargeIds) ? suspension.strikeChargeIds.length : 0,
            },
        });
    } catch (e) {
        console.error('Error queueing facility.suspension.started email:', e);
    }
}

// ---- DTOs ----------------------------------------------------------------------------------

function chargeDto(row) {
    return {
        id: row.id,
        bookingId: row.bookingId,
        bookingNo: row.bookingNo,
        facilityTypeId: row.facilityTypeId,
        bookingDate: String(row.bookingDate),
        chargeReason: row.chargeReason,
        bookerPatronId: row.bookerPatronId,
        bookerName: row.bookerName,
        bookerMemberNo: row.bookerMemberNo,
        slotSummary: row.slotSummary,
        transactionTypeId: row.transactionTypeId,
        description: row.description,
        quantity: row.quantity,
        unitAmount: Number(row.unitAmount),
        amount: Number(row.amount),
        taxAmount: Number(row.taxAmount),
        totalAmount: Number(row.totalAmount),
        strikeCounted: row.strikeCounted === true,
        status: row.status,
        arDocNo: row.arDocNo,
        postedAt: row.postedAt,
        waivedAt: row.waivedAt,
        waiveReason: row.waiveReason,
        remarks: row.remarks,
        canModify: row.get ? row.get('canModify') : undefined,
    };
}

function suspensionDto(row) {
    return {
        id: row.id,
        patronId: row.patronId,
        patronName: row.patronName,
        memberNo: row.memberNo,
        facilityTypeId: row.facilityTypeId,
        reason: row.reason,
        fromDate: String(row.fromDate),
        toDate: String(row.toDate),
        strikeChargeIds: Array.isArray(row.strikeChargeIds) ? row.strikeChargeIds : [],
        status: row.status,
        liftedAt: row.liftedAt,
        liftReason: row.liftReason,
        createdAt: row.createdAt,
        canModify: row.get ? row.get('canModify') : undefined,
    };
}

module.exports = {
    config, lateness, noShowType, quote, raise, reprice, postPending, strikesOf, activeSuspension, strike, expireSuspensions,
    queueChargedEmail, queueSuspensionEmail, chargeDto, suspensionDto, NoShowCharge, PatronSuspension, Patron,
};
