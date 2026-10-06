// Cancellation notice + no-show penalty engine (user decisions 2026-10-06,
// Tropicana procedure "24 hours minimum notice" / "No-show charge RM80.00 +
// 5%"). Shared by the booking cancel (late cancellation), the front desk's
// no-show review and the No-show Charges listing (post / waive).
//
// The penalty is a golf.NoShowCharge row per BOOKING charged to the BOOKER:
//   quote   - price the penalty from the configured no-show transaction
//             type's flat rate card + tax scheme (the BillItem rules)
//   raise   - create the row inside the caller's transaction (pending, or
//             waived with a reason)
//   post    - AFTER the business transaction commits, post each pending row
//             to the booker's AR account via arGateway.postCharge; a failure
//             (public booker, no ledger account, barred) leaves the row
//             pending with the reason in `remarks` for the listing to retry
// Posting after commit (not inside it) mirrors bill settlement: the no-show
// fact is never lost because AR was unavailable, and a posted AR invoice is
// never orphaned by a rolled-back row.

const { Op } = require('sequelize');
const GolfSetting = require('./golfSetting.model');
const GolfTransactionType = require('./transactionType.model');
const GolfTransactionTypeRate = require('./transactionTypeRate.model');
const Golfer = require('./golfer.model');
const NoShowCharge = require('./noShowCharge.model');
const { getUserContext, getCompanyProfile } = require('../../platform/serviceContext');
const { getGolfMemberStanding, getChargeTarget } = require('../../platform/membershipGateway');
const { quoteTax } = require('../../platform/taxGateway');
const arGateway = require('../../platform/arGateway');
const { enqueueEmail } = require('../notification/emailOutbox');
const availability = require('./bookingAvailability.service');

function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
}

function cents(n) {
    return Math.round((Number(n) || 0) * 100);
}

// The effective no-show configuration of a company (null when the control
// is OFF or never saved - callers then skip every penalty rule).
async function config(companyId, { transaction } = {}) {
    const row = await GolfSetting.findOne({
        where: { companyId },
        attributes: ['noShowControlEnabled', 'cancellationNoticeHours', 'lateCancellationAction', 'noShowTransactionTypeId', 'noShowChargeBasis'],
        transaction,
    });
    if (!row || row.noShowControlEnabled !== true) return null;
    return {
        noticeHours: Number(row.cancellationNoticeHours) || 0,
        lateAction: row.lateCancellationAction === 'refuse' ? 'refuse' : 'charge',
        transactionTypeId: row.noShowTransactionTypeId || null,
        basis: row.noShowChargeBasis === 'booking' ? 'booking' : 'player',
    };
}

// Is a cancel made NOW (club-local) inside the notice window of a booking
// whose first tee-off is `teeTime` on `playDate`? Returns { late, deadline:
// { date, time } } - deadline = tee-off minus the notice hours.
function lateness(cfg, playDate, teeTime, timezone) {
    if (!cfg || cfg.noticeHours <= 0 || !teeTime) return { late: false, deadline: null };
    const total = availability.toMinutes(teeTime) - cfg.noticeHours * 60;
    const dayShift = Math.floor(total / 1440);
    const minutes = total - dayShift * 1440;
    const deadline = { date: availability.addDays(playDate, dayShift), time: availability.toHHMM(minutes) };
    const now = availability.clubNow(timezone);
    const late = `${now.date} ${now.time}` >= `${deadline.date} ${deadline.time}`;
    return { late, deadline };
}

// Price the penalty for a play date: the configured type's active flat rate
// on-or-before the date × quantity, tax per the type's scheme. Returns
// { error } when the configuration is incomplete (surfaced to the user).
async function quote(req, cfg, playDate, quantity, { transaction } = {}) {
    const companyId = getUserContext(req).companyId;
    if (!cfg.transactionTypeId) return { error: 'No no-show transaction type is set on Golf Specification.' };
    const type = await GolfTransactionType.findOne({ where: { companyId, id: cfg.transactionTypeId }, transaction });
    if (!type || type.isActive !== true) return { error: 'The no-show transaction type on Golf Specification is missing or inactive.' };
    const rate = await GolfTransactionTypeRate.findOne({
        where: { transactionTypeId: type.id, isActive: true, effectiveDate: { [Op.lte]: playDate } },
        order: [['effectiveDate', 'DESC']],
        transaction,
    });
    const unit = rate && rate.flatAmount !== null && rate.flatAmount !== undefined ? Number(rate.flatAmount) : null;
    if (unit === null) return { error: `'${type.transactionType}' has no flat price in force for ${playDate} - set up its pricing first.` };
    const qty = cfg.basis === 'booking' ? 1 : Math.max(1, Number(quantity) || 1);
    const amount = round2(unit * qty);
    let taxAmount = 0;
    let total = amount;
    let breakdown = null;
    if (type.taxSchemeCode) {
        const tq = await quoteTax(req, { taxSchemeCode: type.taxSchemeCode, amount, onDate: playDate });
        if (tq) {
            taxAmount = round2(tq.taxTotal);
            total = round2(tq.gross);
            breakdown = { schemeCode: type.taxSchemeCode, ieFlag: tq.ieFlag, net: tq.net, gross: tq.gross, asOf: tq.asOf, lines: tq.lines };
        }
    }
    return {
        type,
        description: `${type.transactionType}${type.description ? ' — ' + type.description : ''}`,
        quantity: qty,
        unitAmount: unit,
        amount,
        taxSchemeCode: breakdown ? type.taxSchemeCode : null,
        taxAmount,
        taxBreakdown: breakdown,
        totalAmount: total,
    };
}

// Create the charge row for a booking inside the caller's transaction.
// `waive` = { reason } records a waived row; otherwise the row starts
// pending and `postPending` takes it to the ledger after commit.
async function raise({ req, profile, booker, players, chargeReason, priced, waive, stamps, transaction }) {
    const callerId = getUserContext(req).userId;
    const names = players.map((p) => p.playerName).filter(Boolean).join(', ');
    return NoShowCharge.create({
        companyId: profile.companyId,
        bookingProfileId: profile.id,
        bookingNo: profile.bookingNo,
        playDate: profile.playDate,
        chargeReason,
        bookerGolferId: booker.id,
        bookerName: booker.name,
        bookerMemberNo: booker.memberNo || null,
        playerNames: names ? names.slice(0, 255) : null,
        transactionTypeId: priced.type.id,
        description: priced.description,
        quantity: priced.quantity,
        unitAmount: priced.unitAmount,
        amount: priced.amount,
        taxSchemeCode: priced.taxSchemeCode,
        taxAmount: priced.taxAmount,
        taxBreakdown: priced.taxBreakdown,
        totalAmount: priced.totalAmount,
        status: waive ? 'waived' : 'pending',
        waivedAt: waive ? new Date() : null,
        waivedBy: waive ? callerId : null,
        waiveReason: waive ? waive.reason : null,
        ...stamps,
    }, { transaction });
}

// Resolve the booker's AR charge target: a member golfer whose standing
// allows charge-to-account. Returns { target, standing } or { error }.
async function chargeTargetOf(companyId, booker) {
    if (booker.golferType !== 'member' || !booker.memberNo) return { error: 'The booker is not a member - no ledger account to charge; collect at the counter.' };
    const standing = await getGolfMemberStanding(companyId, booker.memberNo);
    if (!standing) return { error: `No member found with number '${booker.memberNo}'.` };
    if (standing.chargeControl === 'barred') return { error: `Member ${standing.memberNo} (${standing.statusLabel || 'status'}) is barred from charging to account.` };
    const target = await getChargeTarget(companyId, standing.memberId);
    if (!target) return { error: 'The booker\'s charge-to-account target could not be resolved.' };
    return { target, standing };
}

// Post ONE pending row to AR (outside any business transaction). Returns
// the refreshed row; on failure the row stays pending with the reason in
// `remarks`. `enforceCredit` is false - a penalty is a billing reality, like
// a fee run, never blocked by the credit limit.
async function postPending(req, row) {
    if (row.status !== 'pending') return row;
    const callerId = getUserContext(req).userId;
    const booker = await Golfer.findOne({ where: { companyId: row.companyId, id: row.bookerGolferId } });
    const resolved = booker ? await chargeTargetOf(row.companyId, booker) : { error: 'The booker\'s golfer identity no longer exists.' };
    let error = resolved.error || null;
    if (!error) {
        const arTypes = await arGateway.listTransactionTypes(row.companyId, { module: 'golf', trxClass: 'invoice' });
        if (!arTypes.length) error = 'Open an AR invoice transaction type to the Golf module first (AR → Transaction Type).';
        else if (arTypes.length > 1) error = 'Several AR transaction types are opened to Golf - keep exactly one so charges post unambiguously.';
        else {
            const arType = arTypes[0];
            const amountC = cents(row.totalAmount);
            const reasonText = row.chargeReason === 'late-cancel' ? 'Late cancellation' : 'No show';
            const posted = await arGateway.postCharge(req, {
                debtorType: resolved.target.debtorType,
                sourceId: resolved.target.sourceId,
                docDate: String(row.playDate),
                trxDate: String(row.playDate),
                transactionTypeId: arType.id,
                isInterestChargeable: arType.isInterestChargeable === true,
                description: `${reasonText} charge — booking ${row.bookingNo} (${String(row.playDate)})`,
                incurredByMemberId: resolved.target.incurredByMemberId,
                sourceModule: 'golf',
                sourceRef: row.id,
                // The golf row owns the tax accounting; the AR document is
                // the receivable for the gross (same split as bills).
                amounts: { netC: amountC, taxC: 0, grossC: amountC, taxSchemeCode: null, taxRate: null },
                stamps: { createdBy: callerId, createdByDepartmentId: row.createdByDepartmentId || null, updatedBy: callerId },
                enforceCredit: false,
            });
            if (posted.error) error = posted.error;
            else {
                row.status = 'posted';
                row.arDocId = posted.id;
                row.arDocNo = posted.docNo;
                row.debtorType = resolved.target.debtorType;
                row.debtorSourceId = resolved.target.sourceId;
                row.postedAt = new Date();
                row.postedBy = callerId;
                row.remarks = null;
            }
        }
    }
    if (error) row.remarks = String(error).slice(0, 255);
    row.updatedBy = callerId;
    await row.save();
    if (row.status === 'posted') await queueChargedEmail(row, resolved.standing);
    return row;
}

// '27 Sept 2026' from 'YYYY-MM-DD' (UTC so the server timezone never shifts
// the date) - the booking emails' date style.
function playDateText(iso) {
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// Notice to the BOOKER once a charge is actually on their ledger (user
// decision 2026-10-06) - never for pending or waived rows. The address comes
// from the member's standing via the membership seam; no address = no email.
// NON-CRITICAL: an email problem never fails the posting - the charge is
// already saved as posted; the enqueue is caught and logged.
async function queueChargedEmail(row, standing) {
    if (!standing || !standing.email) return;
    try {
        const company = await getCompanyProfile(row.companyId);
        await enqueueEmail({
            templateKey: 'golf.noshow.charged',
            accountId: company ? company.accountId : null,
            companyId: row.companyId,
            to: standing.email,
            data: {
                companyName: company ? company.name : '',
                bookerName: row.bookerName,
                bookingNo: row.bookingNo,
                playDateText: playDateText(String(row.playDate)),
                reasonLabel: row.chargeReason === 'late-cancel' ? 'Late cancellation' : 'No show',
                isLateCancel: row.chargeReason === 'late-cancel',
                playerNames: row.playerNames || '',
                description: row.description,
                quantity: row.quantity,
                unitAmount: Number(row.unitAmount).toFixed(2),
                taxAmount: Number(row.taxAmount) > 0 ? Number(row.taxAmount).toFixed(2) : '',
                totalAmount: Number(row.totalAmount).toFixed(2),
                arDocNo: row.arDocNo || '',
            },
        });
    } catch (e) {
        console.error('Error queueing golf.noshow.charged email:', e);
    }
}

function chargeDto(row) {
    return {
        id: row.id,
        bookingProfileId: row.bookingProfileId,
        bookingNo: row.bookingNo,
        playDate: row.playDate,
        chargeReason: row.chargeReason,
        bookerGolferId: row.bookerGolferId,
        bookerName: row.bookerName,
        bookerMemberNo: row.bookerMemberNo,
        playerNames: row.playerNames,
        description: row.description,
        quantity: row.quantity,
        unitAmount: Number(row.unitAmount),
        amount: Number(row.amount),
        taxAmount: Number(row.taxAmount),
        totalAmount: Number(row.totalAmount),
        status: row.status,
        arDocNo: row.arDocNo,
        postedAt: row.postedAt,
        waivedAt: row.waivedAt,
        waiveReason: row.waiveReason,
        remarks: row.remarks,
        createdAt: row.createdAt,
        canModify: row.get ? row.get('canModify') : undefined,
    };
}

module.exports = {
    config,
    lateness,
    quote,
    raise,
    postPending,
    chargeTargetOf,
    chargeDto,
};
