// Group booking LIFECYCLE (user decisions 2026-10-11) - the one place that
// knows what a group booking's status allows, how it moves between statuses,
// and the clocks that move it without anyone clicking:
//
//   control OFF (committee club)  create -> booked -> cancelled
//   control ON  (sales club)      create -> tentative -(submit)-> pending-approval
//                                 -(approve)-> approved -(deposit met)-> booked
//                                 rejected / recalled -> tentative
//                                 hold expired -> flights released (stays tentative)
//                                 deposit date passed -> lapsed
//
// The Golf Specification switch decides which world a booking lives in, read
// at every decision (flipping it never rewrites existing rows). Timers run on
// the outbox worker's tick (scanGroupLifecycle), never inside an API request.
// The approval chain is the Workflow service's 'golf-group-booking' purpose:
// no active definition = auto-approve on submit; completion flows back via
// the handlers in src/wiring/workflowHandlers.js (approve / reject / recall).

const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { getUserContext } = require('../../platform/serviceContext');
const { classifyDateRange, companyTimezone, companyTimezoneById } = require('../../platform/calendarGateway');
const workflowGateway = require('../../platform/workflowGateway');
const { notifyUser } = require('../../platform/notificationGateway');
const availability = require('./bookingAvailability.service');
const { round2 } = require('./billing.service');
const {
    GROUP_BOOKING_TYPES, GROUP_BOOKING_TYPE_KEYS, COURSE_HOLD_FORMATS, HOLD_STATE_LABELS,
} = require('./groupBooking.constants');
const { ACTIVE_PLAYER_STATUS_KEYS } = require('./registration.constants');
const GolfSetting = require('./golfSetting.model');
const BookingProfile = require('./bookingProfile.model');
const GroupPlayDay = require('./groupPlayDay.model');
const GroupFlight = require('./groupFlight.model');
const GroupPlayer = require('./groupPlayer.model');
const Player = require('./player.model');
const Bill = require('./bill.model');
const BillItem = require('./billItem.model');

const PURPOSE = 'golf-group-booking';
const ENTITY_TYPE = 'GolfGroupBooking';
const GROUP_ROUTE = '/golf/group-bookings';

// ---------------------------------------------------------------------------
// Settings

// The lifecycle knobs of a company: { controlOn, holdHours, depositDays, depositPct }.
async function settingFor(companyId, { transaction } = {}) {
    const row = await GolfSetting.findOne({ where: { companyId }, transaction });
    return {
        controlOn: !!(row && row.groupBookingControlEnabled === true),
        holdHours: row && Number.isInteger(row.groupTentativeHoldHours) ? row.groupTentativeHoldHours : 72,
        depositDays: row && Number.isInteger(row.groupDepositDueDays) ? row.groupDepositDueDays : 7,
        depositPct: row && Number.isInteger(row.groupDefaultDepositPct) ? row.groupDefaultDepositPct : 30,
    };
}

// ---------------------------------------------------------------------------
// Policy (pure - unit-tested in groupLifecycle.test.js)

const LIVE_STATUSES = ['tentative', 'pending-approval', 'approved', 'booked'];

// What a booking in `status` allows under the given control mode. `kind`s:
//   structure     - play days, flights, bill items, proforma terms
//   header        - the header fields (name, organiser, contact)
//   roster        - roster rows
//   draw          - placing roster players into flights (writes tee-sheet rows)
//   deposit       - recording a deposit bill
//   issueProforma - numbering / printing the proforma (the deposit demand)
//   settle        - the final bill, cancellation charges, refunds
//   submit / recall / reopen / extendDeposit / cancel - the transitions
function abilities(status, { controlOn, depositDueExtendedAt = null } = {}) {
    if (!controlOn) {
        // Committee club: every live status behaves like the old 'booked'
        // (a tentative row left over from a control that was switched off
        // stays workable; Submit simply confirms it).
        const live = LIVE_STATUSES.includes(status);
        return {
            editStructure: live, editHeader: live, editRoster: live, draw: live, deposit: live, issueProforma: live,
            settle: live || status === 'cancelled' || status === 'lapsed',
            submit: status === 'tentative' || status === 'approved', recall: status === 'pending-approval',
            reopen: false, extendDeposit: false, cancel: live,
        };
    }
    return {
        editStructure: status === 'tentative',
        editHeader: ['tentative', 'approved', 'booked'].includes(status),
        editRoster: ['tentative', 'approved', 'booked'].includes(status),
        draw: status === 'booked',
        deposit: ['approved', 'booked'].includes(status),
        issueProforma: ['approved', 'booked'].includes(status),
        settle: ['booked', 'cancelled', 'lapsed'].includes(status),
        submit: status === 'tentative',
        recall: status === 'pending-approval',
        reopen: ['approved', 'booked', 'lapsed'].includes(status),
        extendDeposit: status === 'approved' && !depositDueExtendedAt,
        cancel: LIVE_STATUSES.includes(status),
    };
}

// The refusal a disallowed `kind` gets, worded for the booking's state.
function refusal(status, kind, { controlOn } = {}) {
    if (status === 'cancelled') return 'A cancelled booking cannot be edited.';
    if (status === 'lapsed') return 'This booking lapsed when its deposit was not received in time - reopen it to start again.';
    if (status === 'pending-approval') return 'This booking is awaiting approval - recall it to make changes.';
    if (!controlOn) return 'This booking cannot be edited.';
    if (status === 'tentative') {
        if (kind === 'draw') return 'Players are drawn into flights once the booking is confirmed.';
        if (kind === 'deposit') return 'Deposits are recorded once the booking is approved - submit it for approval first.';
        if (kind === 'issueProforma') return 'The proforma is issued once the booking is approved - submit it for approval first.';
        if (kind === 'settle') return 'The final bill is settled once the booking is confirmed.';
        return 'This booking cannot be edited yet.';
    }
    if (kind === 'draw') return 'Players are drawn into flights once the deposit is received and the booking is confirmed.';
    if (kind === 'settle') return 'The final bill is settled once the booking is confirmed.';
    if (kind === 'structure') return 'The booking is approved - reopen it to change its days, flights or charges; it will need approval again.';
    return 'This booking cannot be edited in its current state.';
}

// null when allowed, else the refusal message.
function guardMessage(profile, setting, kind) {
    const can = abilities(profile.status, { controlOn: setting.controlOn, depositDueExtendedAt: profile.depositDueExtendedAt });
    const key = kind === 'structure' ? 'editStructure' : kind === 'header' ? 'editHeader' : kind === 'roster' ? 'editRoster' : kind;
    return can[key] ? null : refusal(profile.status, kind, setting);
}

// The tee-sheet label prefix of a held cell / block ("TENTATIVE", "PENDING",
// "APPROVED"); null once confirmed.
function holdState(status) {
    return HOLD_STATE_LABELS[status] || null;
}

// ---------------------------------------------------------------------------
// Clocks

function holdExpiry(setting, from = new Date()) {
    if (!setting.controlOn || !(setting.holdHours > 0)) return null;
    return new Date(from.getTime() + setting.holdHours * 3600000);
}

// The club-local offset (minutes east of UTC) at `date`.
function zoneOffsetMinutes(date, timezone) {
    const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone || 'UTC',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    const p = {};
    for (const x of fmt.formatToParts(date)) p[x.type] = x.value;
    const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
    return Math.round((asUtc - date.getTime()) / 60000);
}

// 23:59:59 club-local on a 'YYYY-MM-DD' date, as an instant.
function endOfDayInZone(dateStr, timezone) {
    const guess = new Date(`${dateStr}T23:59:59Z`);
    return new Date(guess.getTime() - zoneOffsetMinutes(guess, timezone) * 60000);
}

function addDays(dateStr, days) {
    return new Date(new Date(`${dateStr}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Reads shared by the transitions

async function groupBillOf(profile, { transaction } = {}) {
    return Bill.findOne({
        where: { companyId: profile.companyId, bookingProfileId: profile.id, billType: 'group', status: { [Op.ne]: 'voided' } },
        transaction,
    });
}

// Money the booking holds in deposits: settled deposit bills less refunds.
async function depositsHeld(profile, { transaction } = {}) {
    const rows = await Bill.findAll({
        where: { companyId: profile.companyId, bookingProfileId: profile.id, billType: 'deposit', status: 'settled' },
        attributes: ['totalAmount', 'depositRefundedAmount'],
        transaction,
    });
    return round2(rows.reduce((s, b) => s + Number(b.totalAmount) - Number(b.depositRefundedAmount || 0), 0));
}

// The deposit the booking demands: the proforma's figure when stated, else
// the default percentage of the bill total (0 without a bill).
function requiredDepositOf(bill, setting) {
    if (!bill) return 0;
    if (bill.depositRequired !== null && bill.depositRequired !== undefined) return round2(Number(bill.depositRequired));
    return round2(Number(bill.totalAmount) * (setting.depositPct / 100));
}

// Drop the booking's reserved flights that hold no drawn player (a flight with
// players keeps its cells - those are real bookings).
async function releaseFlights(profile, { transaction }) {
    const flights = await GroupFlight.findAll({ where: { bookingProfileId: profile.id }, attributes: ['id'], transaction });
    if (!flights.length) return 0;
    const ids = flights.map((f) => f.id);
    const drawn = await Player.findAll({
        where: { groupFlightId: { [Op.in]: ids }, status: { [Op.in]: ACTIVE_PLAYER_STATUS_KEYS } },
        attributes: ['groupFlightId'],
        transaction,
    });
    const keep = new Set(drawn.map((p) => p.groupFlightId));
    const drop = ids.filter((id) => !keep.has(id));
    if (drop.length) await GroupFlight.destroy({ where: { id: { [Op.in]: drop } }, transaction });
    return drop.length;
}

async function anyRegistered(profile, { transaction } = {}) {
    const n = await Player.count({
        where: { bookingProfileId: profile.id, status: { [Op.in]: ACTIVE_PLAYER_STATUS_KEYS.filter((s) => s !== 'booked') } },
        transaction,
    });
    return n > 0;
}

// ---------------------------------------------------------------------------
// Submit: the approval context + the transition

// The numbers an approver (and a step condition) decides on. Shares are the
// booking's flights against the course's tee-time grid that day; the group
// share counts EVERY held group booking on that course and date.
async function submitContext(req, profile, { days, flights, bill, items, rosterCount, setting }) {
    const companyId = profile.companyId;
    const planned = days.filter((d) => d.status === 'planned');
    const dates = planned.map((d) => String(d.playDate)).sort();
    const classes = dates.length ? await classifyDateRange(req, dates[0], dates[dates.length - 1]) : [];
    const dayTypeOf = new Map(classes.map((c) => [c.date, c.dayType]));
    const perDay = [];
    for (const d of planned) {
        const playDate = String(d.playDate);
        const dayType = dayTypeOf.get(playDate) || 'weekday';
        const ctx = await availability.dayContext(companyId, playDate, dayType);
        const course = ctx.byCourse.get(d.courseId) || null;
        const slots = course ? course.slots : [];
        const mine = flights.filter((f) => f.groupPlayDayId === d.id);
        const hold = COURSE_HOLD_FORMATS.includes(d.startFormat);
        // Cells this day takes: its flights on a sequential day; on a shotgun
        // day the whole hold window (every slot inside it).
        let cells = mine.length;
        if (hold && slots.length) {
            const start = availability.toMinutes(d.startTime);
            const end = d.blockUntil ? availability.toMinutes(d.blockUntil) : 24 * 60;
            cells = slots.filter((s) => { const t = availability.toMinutes(s.teeTime); return t >= start && t < end; }).length;
        }
        const sharePct = slots.length ? Math.min(100, Math.round((cells / slots.length) * 100)) : 0;
        // Every held group on this course and date (this booking included).
        const holds = ctx.holds || await availability.groupHolds(companyId, playDate);
        let groupCells = 0;
        for (const { day: gd } of holds.days) {
            if (gd.courseId !== d.courseId) continue;
            if (gd.bookingProfileId === profile.id) { groupCells += cells; continue; }
            if (COURSE_HOLD_FORMATS.includes(gd.startFormat) && slots.length) {
                const start = availability.toMinutes(gd.startTime);
                const end = gd.blockUntil ? availability.toMinutes(gd.blockUntil) : 24 * 60;
                groupCells += slots.filter((s) => { const t = availability.toMinutes(s.teeTime); return t >= start && t < end; }).length;
            } else {
                groupCells += holds.flights.filter((f) => f.groupPlayDayId === gd.id).length;
            }
        }
        const groupSharePct = slots.length ? Math.min(100, Math.round((groupCells / slots.length) * 100)) : 0;
        perDay.push({
            playDate, dayType, courseId: d.courseId, courseCode: course ? course.course.courseCode : null,
            startFormat: d.startFormat, flights: mine.length, seats: mine.reduce((s, f) => s + f.capacity, 0),
            slots: slots.length, sharePct, groupSharePct,
        });
    }
    const amount = bill ? round2(Number(bill.totalAmount)) : 0;
    const totalSeats = perDay.reduce((s, d) => s + d.seats, 0);
    const heads = profile.expectedPlayers || rosterCount || totalSeats || 0;
    const depositRequired = requiredDepositOf(bill, setting);
    return {
        context: {
            bookingType: profile.bookingType,
            dayType: perDay.some((d) => d.dayType === 'weekend') ? 'weekend' : 'weekday',
            playDays: perDay.length,
            totalFlights: perDay.reduce((s, d) => s + d.flights, 0),
            totalSeats,
            maxDaySharePct: perDay.reduce((m, d) => Math.max(m, d.sharePct), 0),
            groupSharePct: perDay.reduce((m, d) => Math.max(m, d.groupSharePct), 0),
            startFormat: perDay.some((d) => COURSE_HOLD_FORMATS.includes(d.startFormat)) ? 'shotgun' : 'sequential',
            amount,
            manualPriceCount: (items || []).filter((i) => i.priceOverridden === true).length,
            perPlayerAmount: heads ? round2(amount / heads) : 0,
            depositRequired,
            depositPct: amount ? Math.round((depositRequired / amount) * 100) : 0,
            organiserType: profile.debtorType === 'other' ? 'city-ledger' : profile.debtorType ? 'member' : 'cash',
        },
        days: perDay,
        depositRequired,
    };
}

async function loadShape(profile, { transaction } = {}) {
    const [days, flights, bill, rosterCount] = await Promise.all([
        GroupPlayDay.findAll({ where: { bookingProfileId: profile.id }, order: [['playDate', 'ASC']], transaction }),
        GroupFlight.findAll({ where: { bookingProfileId: profile.id }, transaction }),
        groupBillOf(profile, { transaction }),
        GroupPlayer.count({ where: { bookingProfileId: profile.id, status: 'listed' }, transaction }),
    ]);
    const items = bill ? await BillItem.findAll({ where: { billId: bill.id }, transaction }) : [];
    return { days, flights, bill, items, rosterCount };
}

function typeLabel(key) {
    return (GROUP_BOOKING_TYPES.find((t) => t.key === key) || { label: key }).label;
}

// What Submit would do, for the confirmation dialog (show expected results):
// the per-day shares, the deposit demand, the chain it takes (null = none).
async function submitPreview(req, profile) {
    const setting = await settingFor(profile.companyId);
    const shape = await loadShape(profile);
    const missing = shape.days.filter((d) => d.status === 'planned' && !shape.flights.some((f) => f.groupPlayDayId === d.id));
    const built = await submitContext(req, profile, { ...shape, setting });
    const chain = setting.controlOn ? await workflowGateway.previewChain(req, PURPOSE, built.context) : null;
    const held = await depositsHeld(profile);
    return {
        controlOn: setting.controlOn,
        context: built.context,
        days: built.days,
        depositRequired: built.depositRequired,
        depositHeld: held,
        depositDueDays: setting.depositDays,
        missingFlights: missing.map((d) => String(d.playDate)),
        chain,
    };
}

// POST submit. Returns { fail } or { outcome: 'pending' | 'approved' | 'booked', profile }.
async function submit(req, profile) {
    const setting = await settingFor(profile.companyId);
    const can = abilities(profile.status, { controlOn: setting.controlOn });
    if (!can.submit) return { fail: refusal(profile.status, 'submit', setting) };
    const shape = await loadShape(profile);
    if (!shape.days.some((d) => d.status === 'planned')) return { fail: 'Add at least one play day before submitting.' };
    const missing = shape.days.filter((d) => d.status === 'planned' && !shape.flights.some((f) => f.groupPlayDayId === d.id));
    if (missing.length) return { fail: `Reserve flights for ${missing.map((d) => String(d.playDate)).join(', ')} before submitting - the approver decides on the tee sheet the booking takes.` };
    const built = await submitContext(req, profile, { ...shape, setting });
    const userId = getUserContext(req).userId;
    const timezone = await companyTimezone(req);

    return sequelize.transaction(async (transaction) => {
        const fresh = await BookingProfile.findOne({ where: { id: profile.id }, transaction, lock: transaction.LOCK.UPDATE });
        if (!fresh || !abilities(fresh.status, { controlOn: setting.controlOn }).submit) return { fail: 'The booking changed meanwhile - reload it.' };
        fresh.submittedAt = new Date();
        fresh.updatedBy = userId;
        if (!setting.controlOn) {
            // Committee club: Submit is a plain confirmation.
            fresh.status = 'booked';
            fresh.confirmedAt = new Date();
            fresh.holdExpiresAt = null;
            await fresh.save({ transaction });
            return { outcome: 'booked', profile: fresh };
        }
        const wf = await workflowGateway.startWorkflow(req, PURPOSE, {
            entityId: fresh.id,
            entityLabel: `${typeLabel(fresh.bookingType)} ${fresh.groupName || fresh.bookingNo} (${fresh.bookingNo}) — ${built.context.playDays} day(s), ${built.context.totalFlights} flight(s), ${built.context.amount.toFixed(2)}`,
            context: built.context,
            transaction,
        });
        if (wf) {
            fresh.status = 'pending-approval';
            fresh.workflowInstanceId = wf.instanceId;
            fresh.holdExpiresAt = null; // frozen while the chain runs
            await fresh.save({ transaction });
            return { outcome: 'pending', profile: fresh };
        }
        const outcome = await applyApproval(fresh, { transaction, userId, setting, timezone, bill: shape.bill });
        return { outcome, profile: fresh };
    });
}

// Approval landed (auto, or the chain completed): snapshot the deposit demand
// and start its clock - or confirm at once when nothing (more) is owed.
// Returns 'approved' | 'booked'.
async function applyApproval(profile, { transaction, userId = null, setting = null, timezone = null, bill = undefined }) {
    const cfg = setting || await settingFor(profile.companyId, { transaction });
    const tz = timezone || await companyTimezoneById(profile.companyId);
    const groupBill = bill === undefined ? await groupBillOf(profile, { transaction }) : bill;
    const required = requiredDepositOf(groupBill, cfg);
    const held = await depositsHeld(profile, { transaction });
    const today = availability.clubNow(tz).date;
    profile.approvedAt = new Date();
    profile.depositRequiredAmount = required;
    profile.holdExpiresAt = null;
    profile.updatedBy = userId || profile.updatedBy;
    if (groupBill && (groupBill.depositRequired === null || groupBill.depositRequired === undefined)) {
        groupBill.depositRequired = required;
    }
    if (held >= required) {
        profile.status = 'booked';
        profile.confirmedAt = new Date();
        profile.depositDueAt = null;
        await profile.save({ transaction });
        if (groupBill && groupBill.changed()) await groupBill.save({ transaction });
        return 'booked';
    }
    // Pay-by date: the proforma's when it is still ahead, else the default
    // days from today; written back so the proforma states the same date.
    let dueDate = groupBill && groupBill.depositDueDate ? String(groupBill.depositDueDate) : null;
    if (!dueDate || dueDate < today) dueDate = addDays(today, cfg.depositDays);
    if (groupBill) groupBill.depositDueDate = dueDate;
    profile.status = 'approved';
    profile.depositDueAt = endOfDayInZone(dueDate, tz);
    await profile.save({ transaction });
    if (groupBill && groupBill.changed()) await groupBill.save({ transaction });
    return 'approved';
}

// The chain said no: back to tentative with the flights RELEASED (the approver
// refused that consumption of the sheet); the bill stays for repricing.
async function applyRejection(profile, { transaction, userId = null }) {
    profile.status = 'tentative';
    profile.holdExpiresAt = null;
    profile.updatedBy = userId || profile.updatedBy;
    await profile.save({ transaction });
    return releaseFlights(profile, { transaction });
}

// The submitter recalled it: back to tentative, everything kept, the clock
// restarts from now.
async function applyRecall(profile, { transaction, userId = null, setting = null }) {
    const cfg = setting || await settingFor(profile.companyId, { transaction });
    profile.status = 'tentative';
    const hasFlights = await GroupFlight.count({ where: { bookingProfileId: profile.id }, transaction });
    profile.holdExpiresAt = hasFlights ? holdExpiry(cfg) : null;
    profile.updatedBy = userId || profile.updatedBy;
    await profile.save({ transaction });
}

// POST recall - the submitter (or anyone allowed to amend) withdraws the
// pending approval; the workflow's onCancelled handler performs applyRecall.
async function recall(req, profile) {
    const setting = await settingFor(profile.companyId);
    if (!abilities(profile.status, { controlOn: setting.controlOn }).recall) return { fail: 'Only a booking awaiting approval can be recalled.' };
    const userId = getUserContext(req).userId;
    return sequelize.transaction(async (transaction) => {
        const cancelled = await workflowGateway.cancelForEntity(ENTITY_TYPE, profile.id, transaction);
        if (cancelled && cancelled.error) return { fail: cancelled.error };
        const fresh = await BookingProfile.findOne({ where: { id: profile.id }, transaction });
        if (fresh.status === 'pending-approval') await applyRecall(fresh, { transaction, userId, setting }); // no live instance to call back
        return { profile: fresh };
    });
}

// POST reopen - an approved / confirmed / lapsed booking goes back to
// tentative so its shape can change; it must be submitted again. Refused once
// anyone is registered (the day has started). A held deposit keeps the
// flights from expiring.
async function reopen(req, profile) {
    const setting = await settingFor(profile.companyId);
    if (!abilities(profile.status, { controlOn: setting.controlOn }).reopen) return { fail: 'Only an approved, confirmed or lapsed booking can be reopened.' };
    if (await anyRegistered(profile)) return { fail: 'Players of this booking are already registered - it can no longer be reopened.' };
    const userId = getUserContext(req).userId;
    return sequelize.transaction(async (transaction) => {
        const held = await depositsHeld(profile, { transaction });
        const hasFlights = await GroupFlight.count({ where: { bookingProfileId: profile.id }, transaction });
        profile.status = 'tentative';
        profile.holdExpiresAt = held > 0 || !hasFlights ? null : holdExpiry(setting);
        profile.submittedAt = null;
        profile.approvedAt = null;
        profile.depositDueAt = null;
        profile.depositRequiredAmount = null;
        profile.confirmedAt = null;
        profile.lapsedAt = null;
        profile.lapseReason = null;
        profile.depositDueExtendedAt = null;
        profile.depositDueExtendedBy = null;
        profile.depositDueExtensionReason = null;
        profile.updatedBy = userId;
        await profile.save({ transaction });
        return { profile };
    });
}

// POST extend-deposit { depositDueDate, reason } - the one extension.
async function extendDeposit(req, profile, { depositDueDate, reason }) {
    const setting = await settingFor(profile.companyId);
    if (!abilities(profile.status, { controlOn: setting.controlOn, depositDueExtendedAt: profile.depositDueExtendedAt }).extendDeposit) {
        return { fail: profile.depositDueExtendedAt ? 'The deposit deadline has already been extended once.' : 'Only an approved booking awaiting its deposit can be extended.' };
    }
    const timezone = await companyTimezone(req);
    const today = availability.clubNow(timezone).date;
    if (!depositDueDate || depositDueDate <= today) return { fail: 'The new pay-by date must be after today.' };
    const current = profile.depositDueAt ? profile.depositDueAt.toISOString() : '';
    const next = endOfDayInZone(depositDueDate, timezone);
    if (current && next.getTime() <= profile.depositDueAt.getTime()) return { fail: 'The new pay-by date must be later than the current one.' };
    const userId = getUserContext(req).userId;
    return sequelize.transaction(async (transaction) => {
        profile.depositDueAt = next;
        profile.depositDueExtendedAt = new Date();
        profile.depositDueExtendedBy = userId;
        profile.depositDueExtensionReason = reason;
        profile.updatedBy = userId;
        await profile.save({ transaction });
        const bill = await groupBillOf(profile, { transaction });
        if (bill) { bill.depositDueDate = depositDueDate; await bill.save({ transaction }); }
        return { profile };
    });
}

// After a deposit lands: an approved booking whose deposits now cover the
// demand confirms. Safe to call from any status (no-op otherwise).
async function refreshConfirmation(profile, { transaction, userId = null } = {}) {
    if (profile.status !== 'approved') return false;
    const held = await depositsHeld(profile, { transaction });
    const required = profile.depositRequiredAmount === null || profile.depositRequiredAmount === undefined
        ? 0 : Number(profile.depositRequiredAmount);
    if (held < required) return false;
    profile.status = 'booked';
    profile.confirmedAt = new Date();
    profile.depositDueAt = null;
    profile.updatedBy = userId || profile.updatedBy;
    await profile.save({ transaction });
    return true;
}

// Flights were (re)reserved: a tentative booking's clock restarts from now
// (a held deposit keeps it off). Call inside the reserving transaction.
async function onFlightsReserved(profile, { transaction }) {
    if (profile.status !== 'tentative') return;
    const setting = await settingFor(profile.companyId, { transaction });
    const held = await depositsHeld(profile, { transaction });
    profile.holdExpiresAt = held > 0 ? null : holdExpiry(setting);
    await profile.save({ transaction });
}

// The status a NEW group booking starts in.
async function initialStatus(companyId) {
    const setting = await settingFor(companyId);
    return setting.controlOn ? 'tentative' : 'booked';
}

// ---------------------------------------------------------------------------
// The worker tick: expire tentative holds, lapse unpaid approvals.

async function scanGroupLifecycle({ now = new Date() } = {}) {
    let released = 0;
    let lapsed = 0;
    const expiring = await BookingProfile.findAll({
        where: { bookingType: { [Op.in]: GROUP_BOOKING_TYPE_KEYS }, status: 'tentative', holdExpiresAt: { [Op.lte]: now } },
    });
    for (const p of expiring) {
        try {
            await sequelize.transaction(async (transaction) => {
                const fresh = await BookingProfile.findOne({ where: { id: p.id }, transaction, lock: transaction.LOCK.UPDATE });
                if (!fresh || fresh.status !== 'tentative' || !fresh.holdExpiresAt || fresh.holdExpiresAt > now) return;
                const n = await releaseFlights(fresh, { transaction });
                fresh.holdExpiresAt = null;
                await fresh.save({ transaction });
                released += 1;
                await notifyUser({
                    userId: fresh.createdBy, companyId: fresh.companyId, type: 'golf-group-hold-expired',
                    title: `Hold expired: ${fresh.groupName || fresh.bookingNo}`,
                    body: `${n} reserved flight(s) were released because the booking was not submitted for approval in time. Reserve them again to continue.`,
                    linkRoute: `${GROUP_ROUTE}/${fresh.id}`, transaction,
                });
            });
        } catch (err) {
            console.error(`[GOLF GROUP] hold expiry failed for ${p.id}:`, err);
        }
    }
    const due = await BookingProfile.findAll({
        where: { bookingType: { [Op.in]: GROUP_BOOKING_TYPE_KEYS }, status: 'approved', depositDueAt: { [Op.lte]: now } },
    });
    for (const p of due) {
        try {
            await sequelize.transaction(async (transaction) => {
                const fresh = await BookingProfile.findOne({ where: { id: p.id }, transaction, lock: transaction.LOCK.UPDATE });
                if (!fresh || fresh.status !== 'approved' || !fresh.depositDueAt || fresh.depositDueAt > now) return;
                // A deposit that arrived without the refresh (e.g. an AR
                // receipt) still confirms rather than lapses.
                if (await refreshConfirmation(fresh, { transaction })) return;
                const held = await depositsHeld(fresh, { transaction });
                const required = Number(fresh.depositRequiredAmount || 0);
                const n = await releaseFlights(fresh, { transaction });
                fresh.status = 'lapsed';
                fresh.lapsedAt = new Date();
                fresh.lapseReason = `Deposit of ${required.toFixed(2)} not received by the pay-by date (${held.toFixed(2)} held).`;
                await fresh.save({ transaction });
                await GroupPlayDay.update({ status: 'cancelled' }, { where: { bookingProfileId: fresh.id, status: 'planned' }, transaction });
                lapsed += 1;
                await notifyUser({
                    userId: fresh.createdBy, companyId: fresh.companyId, type: 'golf-group-lapsed',
                    title: `Booking lapsed: ${fresh.groupName || fresh.bookingNo}`,
                    body: `${fresh.lapseReason} ${n} flight(s) were released. Reopen the booking to start again.`,
                    linkRoute: `${GROUP_ROUTE}/${fresh.id}`, transaction,
                });
            });
        } catch (err) {
            console.error(`[GOLF GROUP] deposit lapse failed for ${p.id}:`, err);
        }
    }
    if (released || lapsed) console.log(`[GOLF GROUP] lifecycle scan: ${released} hold(s) released, ${lapsed} booking(s) lapsed.`);
    return { released, lapsed };
}

// ---------------------------------------------------------------------------
// DTO

function lifecycleDto(profile, setting) {
    return {
        controlOn: setting.controlOn,
        workflowInstanceId: profile.workflowInstanceId || null,
        holdExpiresAt: profile.holdExpiresAt || null,
        submittedAt: profile.submittedAt || null,
        approvedAt: profile.approvedAt || null,
        depositDueAt: profile.depositDueAt || null,
        depositRequiredAmount: profile.depositRequiredAmount === null || profile.depositRequiredAmount === undefined ? null : Number(profile.depositRequiredAmount),
        confirmedAt: profile.confirmedAt || null,
        lapsedAt: profile.lapsedAt || null,
        lapseReason: profile.lapseReason || null,
        depositDueExtendedAt: profile.depositDueExtendedAt || null,
        depositDueExtensionReason: profile.depositDueExtensionReason || null,
        can: abilities(profile.status, { controlOn: setting.controlOn, depositDueExtendedAt: profile.depositDueExtendedAt }),
    };
}

module.exports = {
    PURPOSE,
    ENTITY_TYPE,
    settingFor,
    abilities,
    refusal,
    guardMessage,
    holdState,
    holdExpiry,
    endOfDayInZone,
    zoneOffsetMinutes,
    requiredDepositOf,
    depositsHeld,
    releaseFlights,
    submitPreview,
    submit,
    applyApproval,
    applyRejection,
    applyRecall,
    recall,
    reopen,
    extendDeposit,
    refreshConfirmation,
    onFlightsReserved,
    initialStatus,
    scanGroupLifecycle,
    lifecycleDto,
};
