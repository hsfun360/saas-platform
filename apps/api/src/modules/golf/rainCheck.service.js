// Rain checks (user decisions 2026-10-15) - a credit owed to a golfer whose
// PAID round was abandoned, redeemable once as a tender on a later bill.
//
//   issue    - from the Tee Time Sheet flight workspace on a registered player
//              whose bill is SETTLED: value = the basis amount (green-fee lines
//              or the whole bill) prorated by the unplayed holes when the
//              setting says so, the desk may lower it, never raise it; numbered
//              from the 'golf-raincheck' series; one issued rain check per
//              source bill; an email to the golfer when an address exists.
//   redeem   - at settlement of a later bill of the SAME golfer, a Rain
//              Check-class tender line names the rain check; the line applies
//              min(value, remaining); single use - the surplus is forfeited
//              and recorded (applyToSettlement, called by settleBill inside
//              its transaction).
//   expire   - the worker's scan expires issued rain checks past their expiry
//              date (bell to the issuer).
//   cancel   - an issued rain check is cancelled with a reason (listing).
// The pure pieces (quoteValue, splitRedemption) are unit-tested.

const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { getUserContext, getCallerPlacement, canModifyRecord, getCompanyProfile } = require('../../platform/serviceContext');
const { getGolfMemberStanding } = require('../../platform/membershipGateway');
const { emailAddress, notifyUser } = require('../../platform/notificationGateway');
const { companyTimezone } = require('../../platform/calendarGateway');
const numberingGateway = require('../../platform/numberingGateway');
const availability = require('./bookingAvailability.service');
const { RAIN_CHECK_STATUSES, RAIN_CHECK_BASIS_KEYS } = require('./rainCheck.constants');
const GolfSetting = require('./golfSetting.model');
const RainCheck = require('./rainCheck.model');
const Bill = require('./bill.model');
const BillItem = require('./billItem.model');
const Player = require('./player.model');
const Golfer = require('./golfer.model');
const Course = require('./course.model');
const OtherGolfer = require('./otherGolfer.model');
const GolfTransactionType = require('./transactionType.model');

function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
}

function fail(message, status = 400) {
    return { error: message, status };
}

// The effective rain-check configuration (null when the control is OFF).
async function config(companyId, { transaction } = {}) {
    const row = await GolfSetting.findOne({
        where: { companyId },
        attributes: ['rainCheckEnabled', 'rainCheckValidityDays', 'rainCheckBasis', 'rainCheckProrate'],
        transaction,
    });
    if (!row || row.rainCheckEnabled !== true) return null;
    return {
        validityDays: Number(row.rainCheckValidityDays) || 90,
        basis: RAIN_CHECK_BASIS_KEYS.includes(row.rainCheckBasis) ? row.rainCheckBasis : 'green-fee',
        prorate: row.rainCheckProrate !== false,
    };
}

// ---- pure rules ------------------------------------------------------------

// The credit value: `basisAmount` prorated by the unplayed holes when the
// setting prorates (holesPlayed clamped to 0..holesRegistered), else the whole
// basis. Returns { computed, amount } where amount honours a desk override
// that may only LOWER the computed value (and never below 0).
function quoteValue({ basisAmount, holesRegistered, holesPlayed, prorate, requestedAmount = null }) {
    const basis = round2(basisAmount);
    const reg = Math.max(1, Number(holesRegistered) || 0);
    const played = Math.min(reg, Math.max(0, Number(holesPlayed) || 0));
    const computed = prorate ? round2(basis * (reg - played) / reg) : basis;
    let amount = computed;
    if (requestedAmount !== null && requestedAmount !== undefined && requestedAmount !== '') {
        const req = round2(Number(requestedAmount));
        if (!Number.isFinite(req) || req < 0) return { error: 'The rain check amount must be 0.00 or more.' };
        if (req > computed) return { error: `The rain check amount cannot exceed the computed value ${computed.toFixed(2)}.` };
        amount = req;
    }
    return { computed, amount, holesPlayed: played, holesRegistered: reg };
}

// Single use: the rain check covers min(value, remaining) of the bill; the
// rest of its value is forfeited.
function splitRedemption(value, remaining) {
    const v = round2(value);
    const r = Math.max(0, round2(remaining));
    const applied = Math.min(v, r);
    return { applied: round2(applied), forfeited: round2(v - applied) };
}

// The bill lines the basis counts: green-fee charge-type lines (a package's
// element lines count by their own type) or every line.
async function basisAmountOf(bill, basis, { transaction } = {}) {
    const items = await BillItem.findAll({ where: { billId: bill.id }, transaction });
    if (basis === 'bill') return round2(Number(bill.totalAmount));
    const typeIds = [...new Set(items.map((i) => i.transactionTypeId))];
    const types = typeIds.length ? await GolfTransactionType.findAll({ where: { id: { [Op.in]: typeIds } }, attributes: ['id', 'chargeType'], transaction }) : [];
    const chargeById = new Map(types.map((t) => [t.id, t.chargeType]));
    let sum = 0;
    for (const i of items) {
        if (chargeById.get(i.transactionTypeId) === 'green-fee') sum += Number(i.amount) + (i.taxBreakdown && i.taxBreakdown.ieFlag === 'E' ? Number(i.taxAmount) : 0);
    }
    return round2(sum);
}

function expiryDateFor(issuedOn, validityDays) {
    return availability.addDays(issuedOn, validityDays);
}

// ---- issue -----------------------------------------------------------------

// The registered player + settled bill a rain check is issued against.
async function loadSource(req, playerId, { transaction } = {}) {
    const companyId = getUserContext(req).companyId;
    if (!companyId) return fail('Select a workspace first.');
    const cfg = await config(companyId, { transaction });
    if (!cfg) return fail('Rain checks are switched off on Golf Specification.');
    const registration = await Player.findOne({ where: { companyId, id: playerId, secondNineFlag: 0 }, transaction });
    if (!registration) return fail('Registration not found.', 404);
    if (registration.status !== 'registered') return fail('Only a registered player can be issued a rain check.');
    if (!registration.golferId) return fail('The player has no golfer identity yet - register them first.');
    const bill = await Bill.findOne({ where: { companyId, playerId: registration.id, status: 'settled' }, order: [['settledAt', 'DESC']], transaction });
    if (!bill) return fail('A rain check needs a SETTLED bill - the round must have been paid for.');
    const existing = await RainCheck.findOne({ where: { companyId, billId: bill.id, status: { [Op.in]: ['issued', 'redeemed'] } }, transaction });
    if (existing) return fail(`Rain check ${existing.rainCheckNo} was already issued for bill ${bill.billNo}.`, 409);
    const golfer = await Golfer.findOne({ where: { companyId, id: registration.golferId }, transaction });
    if (!golfer) return fail('The player\'s golfer identity no longer exists.', 409);
    const second = await Player.findOne({ where: { firstNinePlayerId: registration.id }, transaction });
    const course = registration.courseId ? await Course.findOne({ where: { companyId, id: registration.courseId }, attributes: ['id', 'courseCode', 'description'], transaction }) : null;
    return { companyId, cfg, registration, bill, golfer, holesRegistered: second ? 18 : 9, course };
}

async function quote(req, playerId, body, { transaction } = {}) {
    const src = await loadSource(req, playerId, { transaction });
    if (src.error) return src;
    const { companyId, cfg, registration, bill, golfer, holesRegistered, course } = src;
    const basisAmount = await basisAmountOf(bill, cfg.basis, { transaction });
    if (basisAmount <= 0) return fail(cfg.basis === 'green-fee' ? `Bill ${bill.billNo} has no green-fee line to credit.` : `Bill ${bill.billNo} has nothing to credit.`);
    const value = quoteValue({ basisAmount, holesRegistered, holesPlayed: body.holesPlayed, prorate: cfg.prorate, requestedAmount: body.amount });
    if (value.error) return fail(value.error);
    const timezone = await companyTimezone(req);
    const today = availability.clubNow(timezone).date;
    const expiryDate = expiryDateFor(today, cfg.validityDays);
    return {
        companyId, cfg, registration, bill, golfer, course,
        quote: {
            golfer: { id: golfer.id, name: golfer.name, memberNo: golfer.memberNo || null, golferType: golfer.golferType },
            bill: { id: bill.id, billNo: bill.billNo, totalAmount: Number(bill.totalAmount) },
            playDate: String(registration.playDate),
            courseCode: course ? course.courseCode : null,
            holesRegistered: value.holesRegistered,
            holesPlayed: value.holesPlayed,
            basis: cfg.basis,
            prorate: cfg.prorate,
            basisAmount,
            computedAmount: value.computed,
            amount: value.amount,
            validityDays: cfg.validityDays,
            expiryDate,
        },
    };
}

async function issue(req, playerId, body) {
    const callerId = getUserContext(req).userId;
    const placement = await getCallerPlacement(req);
    const stamps = { createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId };
    const reason = body.reason ? String(body.reason).slice(0, 255) : null;
    let golferForEmail = null;
    const result = await sequelize.transaction(async (transaction) => {
        const q = await quote(req, playerId, body, { transaction });
        if (q.error) return q;
        const { companyId, registration, bill, golfer, course } = q;
        const issued = await numberingGateway.issueNumber(req, 'golf-raincheck', { transaction });
        let rainCheckNo = null;
        if (issued && issued.number) rainCheckNo = issued.number;
        else if (issued && issued.manual) {
            rainCheckNo = String(body.rainCheckNo || '').trim();
            if (!rainCheckNo) return fail('The Rain Check No. scheme is manual - key in a rain check number.');
        } else {
            return fail('Configure the Rain Check No. numbering scheme first (Golf Management -> Numbering Control).');
        }
        const row = await RainCheck.create({
            companyId, rainCheckNo,
            golferId: golfer.id, golferName: golfer.name, memberNo: golfer.memberNo || null,
            playerId: registration.id, billId: bill.id, billNo: bill.billNo,
            playDate: registration.playDate, courseId: course ? course.id : null,
            holesRegistered: q.quote.holesRegistered, holesPlayed: q.quote.holesPlayed,
            basisAmount: q.quote.basisAmount, amount: q.quote.amount,
            reason, issuedAt: new Date(), expiryDate: q.quote.expiryDate, status: 'issued', ...stamps,
        }, { transaction });
        golferForEmail = golfer;
        return { row, quote: q.quote, companyId };
    });
    if (result.error) return result;
    await notifyIssued(result.companyId, result.row, golferForEmail).catch((err) => console.warn('[GOLF RAIN CHECK] issue email failed:', err.message));
    return { message: `Rain check ${result.row.rainCheckNo} issued for ${Number(result.row.amount).toFixed(2)} to ${result.row.golferName}, valid until ${result.row.expiryDate}.`, rainCheck: dto(result.row) };
}

// The golfer's address: a member's through the membership seam, a visitor's
// from the OtherGolfer profile.
async function golferEmail(companyId, golfer) {
    if (golfer.golferType === 'member' && golfer.memberNo) {
        const s = await getGolfMemberStanding(companyId, golfer.memberNo);
        return s && s.email ? s.email : null;
    }
    const other = await OtherGolfer.findOne({ where: { companyId, id: golfer.sourceId }, attributes: ['email'] });
    return other && other.email ? other.email : null;
}

async function notifyIssued(companyId, row, golfer) {
    const to = await golferEmail(companyId, golfer);
    if (!to) return;
    const company = await getCompanyProfile(companyId);
    await emailAddress({
        templateKey: 'golf.raincheck.issued',
        companyId,
        to,
        data: {
            golferName: row.golferName,
            rainCheckNo: row.rainCheckNo,
            amount: Number(row.amount).toFixed(2),
            playDateText: new Date(`${row.playDate}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
            holesPlayed: row.holesPlayed,
            holesRegistered: row.holesRegistered,
            expiryDateText: new Date(`${row.expiryDate}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
            reason: row.reason || '',
            companyName: company ? company.name : '',
        },
    });
}

// ---- redeem ----------------------------------------------------------------

// The golfer's open (issued, unexpired) rain checks - offered as tenders.
async function openFor(companyId, golferId, { transaction } = {}) {
    if (!golferId) return [];
    const rows = await RainCheck.findAll({ where: { companyId, golferId, status: 'issued' }, order: [['expiryDate', 'ASC']], transaction });
    return rows.map(dto);
}

// Resolve + validate the Rain Check-class tender lines of a settlement for
// the billed golfer: each names ONE open rain check of that golfer, used at
// most once; the line amount may not exceed the rain check value. Returns
// { lines: [{ line, rainCheck }] } or { error }.
async function resolveTenderLines(companyId, golferId, lines, { transaction } = {}) {
    const out = [];
    const seen = new Set();
    for (const line of lines) {
        const id = String(line.rainCheckId || '');
        if (!id) return { error: `Payment ${line.sortOrder}: pick the rain check to redeem.` };
        if (seen.has(id)) return { error: `Payment ${line.sortOrder}: that rain check is already on another line.` };
        seen.add(id);
        const rc = await RainCheck.findOne({ where: { companyId, id }, transaction });
        if (!rc) return { error: `Payment ${line.sortOrder}: rain check not found.` };
        if (rc.status !== 'issued') return { error: `Payment ${line.sortOrder}: rain check ${rc.rainCheckNo} is ${rc.status}.` };
        if (!golferId || rc.golferId !== golferId) return { error: `Payment ${line.sortOrder}: rain check ${rc.rainCheckNo} belongs to ${rc.golferName}, not to the billed golfer.` };
        if (round2(line.amount) > round2(Number(rc.amount))) return { error: `Payment ${line.sortOrder}: rain check ${rc.rainCheckNo} is worth ${Number(rc.amount).toFixed(2)} - the line cannot apply more.` };
        out.push({ line, rainCheck: rc });
    }
    return { lines: out };
}

// Mark the rain checks of a settlement redeemed (inside the settle tx).
async function markRedeemed(resolved, bill, callerId, { transaction }) {
    for (const { line, rainCheck } of resolved) {
        const split = splitRedemption(Number(rainCheck.amount), line.amount);
        rainCheck.status = 'redeemed';
        rainCheck.redeemedBillId = bill.id;
        rainCheck.redeemedBillNo = bill.billNo;
        rainCheck.redeemedAt = new Date();
        rainCheck.redeemedAmount = split.applied;
        rainCheck.forfeitedAmount = split.forfeited;
        rainCheck.updatedBy = callerId;
        await rainCheck.save({ transaction });
    }
}

// ---- listing / cancel / expiry ----------------------------------------------

async function cancel(req, id, body) {
    const companyId = getUserContext(req).companyId;
    if (!companyId) return fail('Select a workspace first.');
    const row = await RainCheck.findOne({ where: { companyId, id } });
    if (!row) return fail('Rain check not found.', 404);
    if (row.status !== 'issued') return fail(`Rain check ${row.rainCheckNo} is ${row.status} and cannot be cancelled.`);
    if (!(await canModifyRecord(req, row))) return fail("Your role's data scope does not allow amending this record.", 403);
    const reason = body.reason ? String(body.reason).trim().slice(0, 255) : '';
    if (!reason) return fail('Give a reason for cancelling the rain check.');
    const callerId = getUserContext(req).userId;
    row.status = 'cancelled';
    row.cancelledAt = new Date();
    row.cancelledBy = callerId;
    row.cancelReason = reason;
    row.updatedBy = callerId;
    await row.save();
    return { message: `Rain check ${row.rainCheckNo} cancelled.`, rainCheck: dto(row) };
}

// Issued rain checks past their expiry date (club-local today) expire; the
// issuer gets a bell. Runs on the worker tick.
async function scanRainChecks() {
    const { companyTimezoneById } = require('../../platform/calendarGateway');
    const due = await RainCheck.findAll({ where: { status: 'issued' }, attributes: ['id', 'companyId', 'expiryDate', 'rainCheckNo', 'golferName', 'amount', 'createdBy'] });
    let expired = 0;
    for (const row of due) {
        const tz = await companyTimezoneById(row.companyId);
        const today = availability.clubNow(tz).date;
        if (String(row.expiryDate) >= today) continue;
        await RainCheck.update({ status: 'expired', updatedBy: null }, { where: { id: row.id, status: 'issued' } });
        expired += 1;
        if (row.createdBy) {
            await notifyUser({
                userId: row.createdBy, companyId: row.companyId, type: 'golf.raincheck.expired',
                title: `Rain check ${row.rainCheckNo} expired`,
                body: `${row.golferName}'s rain check for ${Number(row.amount).toFixed(2)} expired on ${row.expiryDate} unredeemed.`,
                linkRoute: '/golf/rain-checks',
            }).catch(() => {});
        }
    }
    if (expired) console.log(`[GOLF RAIN CHECK] ${expired} rain check(s) expired.`);
    return { expired };
}

async function list(req, query) {
    const companyId = getUserContext(req).companyId;
    if (!companyId) return fail('Select a workspace first.');
    const where = { companyId };
    if (query.status && RAIN_CHECK_STATUSES.some((s) => s.key === query.status)) where.status = query.status;
    if (query.dateFrom || query.dateTo) {
        where.playDate = {};
        if (query.dateFrom) where.playDate[Op.gte] = String(query.dateFrom);
        if (query.dateTo) where.playDate[Op.lte] = String(query.dateTo);
    }
    if (query.golferId) where.golferId = String(query.golferId);
    const rows = await RainCheck.findAll({ where, order: [['issuedAt', 'DESC']], limit: 500 });
    const { annotateCanModify } = require('../../platform/serviceContext');
    await annotateCanModify(req, rows);
    return { rainChecks: rows.map(dto), statuses: RAIN_CHECK_STATUSES };
}

async function get(req, id) {
    const companyId = getUserContext(req).companyId;
    if (!companyId) return fail('Select a workspace first.');
    const row = await RainCheck.findOne({ where: { companyId, id } });
    if (!row) return fail('Rain check not found.', 404);
    return { rainCheck: dto(row) };
}

// The rain check already issued for each registered player of a day (the
// sheet shows its number instead of offering Issue again).
async function issuedByPlayer(companyId, playerIds, { transaction } = {}) {
    const map = new Map();
    if (!playerIds.length) return map;
    const rows = await RainCheck.findAll({
        where: { companyId, playerId: { [Op.in]: playerIds }, status: { [Op.in]: ['issued', 'redeemed'] } },
        attributes: ['playerId', 'rainCheckNo', 'status', 'amount'],
        transaction,
    });
    for (const r of rows) map.set(r.playerId, { rainCheckNo: r.rainCheckNo, status: r.status, amount: Number(r.amount) });
    return map;
}

function dto(r) {
    return {
        id: r.id,
        rainCheckNo: r.rainCheckNo,
        golferId: r.golferId,
        golferName: r.golferName,
        memberNo: r.memberNo,
        playerId: r.playerId,
        billId: r.billId,
        billNo: r.billNo,
        playDate: r.playDate,
        courseId: r.courseId,
        holesRegistered: r.holesRegistered,
        holesPlayed: r.holesPlayed,
        basisAmount: Number(r.basisAmount),
        amount: Number(r.amount),
        reason: r.reason,
        remarks: r.remarks,
        issuedAt: r.issuedAt,
        expiryDate: r.expiryDate,
        status: r.status,
        redeemedBillId: r.redeemedBillId,
        redeemedBillNo: r.redeemedBillNo,
        redeemedAt: r.redeemedAt,
        redeemedAmount: r.redeemedAmount === null || r.redeemedAmount === undefined ? null : Number(r.redeemedAmount),
        forfeitedAmount: r.forfeitedAmount === null || r.forfeitedAmount === undefined ? null : Number(r.forfeitedAmount),
        cancelledAt: r.cancelledAt,
        cancelReason: r.cancelReason,
        canModify: r.get ? r.get('canModify') : undefined,
    };
}

module.exports = {
    config, quoteValue, splitRedemption, expiryDateFor, basisAmountOf,
    quote, issue, openFor, resolveTenderLines, markRedeemed, cancel, scanRainChecks, list, get, issuedByPlayer, dto,
};
