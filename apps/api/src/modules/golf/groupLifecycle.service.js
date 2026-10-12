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
const { getUserContext, holdsMenu } = require('../../platform/serviceContext');
const { classifyDateRange, companyTimezone, companyTimezoneById } = require('../../platform/calendarGateway');
const workflowGateway = require('../../platform/workflowGateway');
const { notifyUser, emailUser, emailAddress } = require('../../platform/notificationGateway');
const availability = require('./bookingAvailability.service');
const billing = require('./billing.service');
const { round2 } = billing;
const GolfTransactionType = require('./transactionType.model');
const {
    GROUP_BOOKING_TYPES, GROUP_BOOKING_TYPE_KEYS, COURSE_HOLD_FORMATS, HOLD_STATE_LABELS,
} = require('./groupBooking.constants');
const { ACTIVE_PLAYER_STATUS_KEYS } = require('./registration.constants');
const GolfSetting = require('./golfSetting.model');
const BookingProfile = require('./bookingProfile.model');
const GroupPlayDay = require('./groupPlayDay.model');
const GroupFlight = require('./groupFlight.model');
const GroupPlayer = require('./groupPlayer.model');
const GroupWaitlist = require('./groupWaitlist.model');
const Course = require('./course.model');
const Player = require('./player.model');
const Bill = require('./bill.model');
const BillItem = require('./billItem.model');

const PURPOSE = 'golf-group-booking';
const ENTITY_TYPE = 'GolfGroupBooking';
const GROUP_ROUTE = '/golf/group-bookings';

// ---------------------------------------------------------------------------
// Settings

// The lifecycle knobs of a company: { controlOn, holdHours, depositDays,
// depositPct, capWeekday, capWeekend, maxTentative } (caps 0 = none).
async function settingFor(companyId, { transaction } = {}) {
    const row = await GolfSetting.findOne({ where: { companyId }, transaction });
    const int = (v, dflt) => (Number.isInteger(v) ? v : dflt);
    return {
        controlOn: !!(row && row.groupBookingControlEnabled === true),
        holdHours: row ? int(row.groupTentativeHoldHours, 72) : 72,
        depositDays: row ? int(row.groupDepositDueDays, 7) : 7,
        depositPct: row ? int(row.groupDefaultDepositPct, 30) : 30,
        capWeekday: row ? int(row.groupShareCapWeekday, 0) : 0,
        capWeekend: row ? int(row.groupShareCapWeekend, 0) : 0,
        maxTentative: row ? int(row.groupMaxTentativePerUser, 0) : 0,
        nextInLineHours: row ? int(row.groupNextInLineHours, 24) : 24,
    };
}

// Flagging a booking as the club's own event needs the management screen.
async function mayFlagClubEvent(req) {
    return holdsMenu(req, '/golf/settings');
}

// ---------------------------------------------------------------------------
// Tee-sheet share (the numbers behind the caps and the approval context)

// The slots of a course's grid inside a time window [start, end).
function slotsInWindow(slots, startTime, blockUntil) {
    const start = availability.toMinutes(startTime);
    const end = blockUntil ? availability.toMinutes(blockUntil) : 24 * 60;
    return slots.filter((s) => { const t = availability.toMinutes(s.teeTime); return t >= start && t < end; }).length;
}

// How many of the course's tee-time cells a play day takes: its flights on a
// sequential day, the whole hold window on a shotgun day.
function cellsOfDay(day, flightCount, slots) {
    if (COURSE_HOLD_FORMATS.includes(day.startFormat)) return slots.length ? slotsInWindow(slots, day.startTime, day.blockUntil) : 0;
    return flightCount;
}

function pctOf(cells, slots) {
    return slots ? Math.min(100, Math.round((cells / slots) * 100)) : 0;
}

// The share of `courseId`'s tee times on `playDate` held by group bookings:
// { slots, groupCells, groupSharePct } over every LIVE group booking except
// club events (the club's own events are not "groups" against members) and
// the excluded booking (the one being reserved - its new cells are added by
// the caller). `ctx` is an availability.dayContext for the date.
function courseShare(ctx, courseId, { excludeBookingId = null } = {}) {
    const entry = ctx.byCourse.get(courseId);
    const slots = entry ? entry.slots : [];
    let groupCells = 0;
    for (const { day, profile } of ctx.holds.days) {
        if (day.courseId !== courseId) continue;
        if (profile.id === excludeBookingId) continue;
        if (profile.isClubEvent === true) continue;
        const flights = ctx.holds.flights.filter((f) => f.groupPlayDayId === day.id).length;
        groupCells += cellsOfDay(day, flights, slots);
    }
    return { slots: slots.length, groupCells, groupSharePct: pctOf(groupCells, slots.length) };
}

// Pure: does adding `newCells` to `groupCells` of `slots` break `capPct`?
// Returns the resulting share, or null when within the cap (or no cap).
function shareExceeds({ newCells, groupCells, slots, capPct }) {
    if (!(capPct > 0) || !slots) return null;
    const pct = pctOf(groupCells + newCells, slots);
    return pct > capPct ? pct : null;
}

// The cap for a day type.
function capFor(setting, dayType) {
    return dayType === 'weekend' ? setting.capWeekend : setting.capWeekday;
}

// Refuse a reservation that would push the day's group share past the cap.
// Club events are exempt. Returns { fail } or null.
function capCheck({ profile, day, course, ctx, newCells, dayType, setting }) {
    if (profile.isClubEvent === true) return null;
    const cap = capFor(setting, dayType);
    const share = courseShare(ctx, day.courseId, { excludeBookingId: profile.id });
    const pct = shareExceeds({ newCells, groupCells: share.groupCells, slots: share.slots, capPct: cap });
    if (pct === null) return null;
    const held = share.groupSharePct;
    return {
        fail: `That would put group bookings at ${pct}% of ${course.courseCode}'s tee times on ${day.playDate} - the ${dayType === 'weekend' ? 'weekend' : 'weekday'} cap is ${cap}% (${held}% held by other groups already). Reserve fewer flights, pick another day, or ask management to change the cap.`,
    };
}

// Hoarding: a user may hold at most `maxTentative` TENTATIVE bookings with
// reserved flights (this one excluded). Returns { fail } or null.
async function hoardingCheck(profile, userId, setting, { transaction } = {}) {
    if (!(setting.maxTentative > 0) || !userId) return null;
    const mine = await BookingProfile.findAll({
        where: { companyId: profile.companyId, bookingType: { [Op.in]: GROUP_BOOKING_TYPE_KEYS }, status: 'tentative', createdBy: userId, id: { [Op.ne]: profile.id } },
        attributes: ['id'],
        transaction,
    });
    if (!mine.length) return null;
    const withFlights = await GroupFlight.findAll({
        where: { bookingProfileId: { [Op.in]: mine.map((p) => p.id) } },
        attributes: ['bookingProfileId'],
        group: ['bookingProfileId'],
        transaction,
    });
    const held = withFlights.length;
    if (held < setting.maxTentative) return null;
    return { fail: `You already hold ${held} tentative booking(s) with reserved flights - the limit is ${setting.maxTentative}. Submit one for approval or release its flights first.` };
}

// The share picture for ONE play day, for the Reserve flights dialog (show
// expected results): { dayType, slots, groupCells, groupSharePct, cap,
// clubEvent }. The day's own cells are excluded (they are being replaced).
async function dayShare(req, profile, day) {
    const setting = await settingFor(profile.companyId);
    const playDate = String(day.playDate);
    const rows = await classifyDateRange(req, playDate, playDate);
    const dayType = rows.length ? rows[0].dayType : 'weekday';
    const ctx = await availability.dayContext(profile.companyId, playDate, dayType);
    const share = courseShare(ctx, day.courseId, { excludeBookingId: profile.id });
    return { dayType, ...share, cap: capFor(setting, dayType), clubEvent: profile.isClubEvent === true, controlOn: setting.controlOn };
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
        const cells = cellsOfDay(d, mine.length, slots);
        const sharePct = pctOf(cells, slots.length);
        // Every held group on this course and date, this booking included
        // (club events excluded - see courseShare).
        const others = courseShare(ctx, d.courseId, { excludeBookingId: profile.id });
        const groupCells = others.groupCells + (profile.isClubEvent === true ? 0 : cells);
        perDay.push({
            playDate, dayType, courseId: d.courseId, courseCode: course ? course.course.courseCode : null,
            startFormat: d.startFormat, flights: mine.length, seats: mine.reduce((s, f) => s + f.capacity, 0),
            slots: slots.length, sharePct, groupSharePct: pctOf(groupCells, slots.length), cap: capFor(setting, dayType),
        });
    }
    const amount = bill ? round2(Number(bill.totalAmount)) : 0;
    // Catalog value of the bill: lines priced by hand are re-quoted from the
    // rate card in force on the bill date, so the approver sees the discount.
    let catalogAmount = amount;
    if (bill && (items || []).some((i) => i.priceOverridden === true)) {
        const firstDay = planned[0] || null;
        const holes = firstDay ? Number(firstDay.holes) : 18;
        const billDayType = firstDay ? (dayTypeOf.get(String(firstDay.playDate)) || 'weekday') : 'weekday';
        let catalog = 0;
        for (const i of items) {
            if (i.priceOverridden !== true) { catalog += Number(i.amount); continue; }
            const type = await GolfTransactionType.findOne({ where: { id: i.transactionTypeId }, attributes: ['id', 'chargeType'] });
            const rate = type ? await billing.rateFor(type.id, String(bill.billDate)) : null;
            const unit = type ? billing.unitPriceOf(type, rate, billDayType, holes) : null;
            catalog += unit === null ? Number(i.amount) : round2(unit * Number(i.quantity));
        }
        catalogAmount = round2(catalog);
    }
    const discountPct = catalogAmount > 0 && catalogAmount > amount ? Math.round(((catalogAmount - amount) / catalogAmount) * 100) : 0;
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
            catalogAmount,
            discountPct,
            clubEvent: profile.isClubEvent === true ? 'yes' : 'no',
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
    // A club event skips the chain (it is the club's own decision).
    const chain = setting.controlOn && profile.isClubEvent !== true ? await workflowGateway.previewChain(req, PURPOSE, built.context) : null;
    const held = await depositsHeld(profile);
    return {
        controlOn: setting.controlOn,
        clubEvent: profile.isClubEvent === true,
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
        // The club's own event is exempt from the approval chain.
        const wf = fresh.isClubEvent === true ? null : await workflowGateway.startWorkflow(req, PURPOSE, {
            entityId: fresh.id,
            entityLabel: `${typeLabel(fresh.bookingType)} ${fresh.groupName || fresh.bookingNo} (${fresh.bookingNo}) - ${built.context.playDays} day(s), ${built.context.totalFlights} flight(s), ${built.context.amount.toFixed(2)}`,
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
    profile.depositWarnedAt = null;
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
    const n = await releaseFlights(profile, { transaction });
    if (n) await onSpaceFreed(profile, { transaction });
    return n;
}

// The submitter recalled it: back to tentative, everything kept, the clock
// restarts from now.
async function applyRecall(profile, { transaction, userId = null, setting = null }) {
    const cfg = setting || await settingFor(profile.companyId, { transaction });
    profile.status = 'tentative';
    const hasFlights = await GroupFlight.count({ where: { bookingProfileId: profile.id }, transaction });
    profile.holdExpiresAt = hasFlights ? holdExpiry(cfg) : null;
    profile.holdWarnedAt = null;
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
        profile.holdWarnedAt = null;
        profile.depositWarnedAt = null;
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
        profile.depositWarnedAt = null; // the extended clock warns again
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
    profile.holdWarnedAt = null; // a new clock warns again
    await profile.save({ transaction });
}

// The status a NEW group booking starts in.
async function initialStatus(companyId) {
    const setting = await settingFor(companyId);
    return setting.controlOn ? 'tentative' : 'booked';
}

// ---------------------------------------------------------------------------
// Notices (bell + email); every send is non-critical - logged, never thrown.

const WARN_BEFORE_MS = 24 * 3600000;

// '24 Nov 2026' from 'YYYY-MM-DD' (UTC so the server timezone never shifts
// the date) - the booking emails' date style.
function playDateText(iso) {
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// '18 Oct 2026, 23:59' club-local.
function instantText(date, timezone) {
    return new Intl.DateTimeFormat('en-GB', { timeZone: timezone || 'UTC', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date).replace(',', ',');
}

async function flightCountOf(profile) {
    return GroupFlight.count({ where: { bookingProfileId: profile.id } });
}

// Bell + email to the creator, and (when `organiser`) the same email to the
// organiser's contact address with the organiser wording.
async function notice(profile, { type, title, body, templateKey, data, organiser = false, transaction = null }) {
    const linkRoute = `${GROUP_ROUTE}/${profile.id}`;
    try {
        await notifyUser({ userId: profile.createdBy, companyId: profile.companyId, type, title, body, linkRoute, transaction });
    } catch (err) {
        console.error(`[GOLF GROUP] bell failed for ${profile.id}:`, err.message);
    }
    try {
        // The gateway fills userName from the user record; the templates fall
        // back to it when recipientName is absent.
        await emailUser({ userId: profile.createdBy, companyId: profile.companyId, templateKey, data: { ...data, isOrganiser: false } });
    } catch (err) {
        console.error(`[GOLF GROUP] creator email failed for ${profile.id}:`, err.message);
    }
    if (organiser && profile.contactEmail) {
        try {
            await emailAddress({
                companyId: profile.companyId, templateKey, to: profile.contactEmail,
                data: { ...data, recipientName: profile.contactPerson || profile.organiserName || 'Organiser', isOrganiser: true },
            });
        } catch (err) {
            console.error(`[GOLF GROUP] organiser email failed for ${profile.id}:`, err.message);
        }
    }
}

// ---------------------------------------------------------------------------
// Waitlist (lifecycle slice 4): the queue for a course on a date.

// The live offer on a course/date held by ANOTHER booking, or null.
async function activeOfferFor(companyId, courseId, playDate, { excludeBookingId = null, transaction = null, now = new Date() } = {}) {
    const where = { companyId, courseId, playDate, status: 'offered', offerExpiresAt: { [Op.gt]: now } };
    if (excludeBookingId) where.bookingProfileId = { [Op.ne]: excludeBookingId };
    return GroupWaitlist.findOne({ where, transaction });
}

// Refuse another group's reservation while an offer is live on the day.
async function offerBlock(profile, day, { transaction } = {}) {
    const offer = await activeOfferFor(profile.companyId, day.courseId, String(day.playDate), { excludeBookingId: profile.id, transaction });
    if (!offer) return null;
    const holder = await BookingProfile.findOne({ where: { id: offer.bookingProfileId }, attributes: ['groupName', 'bookingNo'], transaction });
    const tz = await companyTimezoneById(profile.companyId);
    return { fail: `${holder ? holder.groupName || holder.bookingNo : 'Another group'} is next in line for this course on ${day.playDate} and may reserve until ${instantText(offer.offerExpiresAt, tz)}. Join the waitlist to be offered the day when it frees up.` };
}

// Offer the day to the first waiting booking (none = nothing to do).
async function offerNext(companyId, courseId, playDate, { transaction = null } = {}) {
    const first = await GroupWaitlist.findOne({
        where: { companyId, courseId, playDate, status: 'waiting' },
        order: [['position', 'ASC']],
        transaction,
    });
    if (!first) return null;
    const setting = await settingFor(companyId, { transaction });
    first.status = 'offered';
    first.offeredAt = new Date();
    first.offerExpiresAt = new Date(first.offeredAt.getTime() + setting.nextInLineHours * 3600000);
    await first.save({ transaction });
    const [profile, course] = await Promise.all([
        BookingProfile.findOne({ where: { id: first.bookingProfileId }, transaction }),
        Course.findOne({ where: { id: courseId }, attributes: ['courseCode', 'description'], transaction }),
    ]);
    if (profile) {
        const tz = await companyTimezoneById(companyId);
        const courseName = course ? `${course.courseCode}${course.description ? ' - ' + course.description : ''}` : 'the course';
        await notice(profile, {
            type: 'golf-group-waitlist-offer',
            title: `Next in line: ${courseName} on ${playDateText(playDate)}`,
            body: `${profile.groupName || profile.bookingNo} may reserve flights on ${courseName} for ${playDateText(playDate)} until ${instantText(first.offerExpiresAt, tz)} - no other group can take the day meanwhile.`,
            templateKey: 'golf.group.waitlist-offer',
            data: { groupName: profile.groupName || profile.bookingNo, bookingNo: profile.bookingNo, courseName, playDateText: playDateText(playDate), offerExpiresText: instantText(first.offerExpiresAt, tz) },
            transaction,
        });
    }
    return first;
}

// A booking's space on its play days freed (hold expired, rejected, lapsed,
// cancelled): offer each course/date to the next in line. Also withdraws
// the booking's OWN queue entries when it is gone for good (`gone`).
async function onSpaceFreed(profile, { transaction, gone = false, days = null } = {}) {
    const list = days || await GroupPlayDay.findAll({ where: { bookingProfileId: profile.id }, transaction });
    if (gone) await withdrawAll(profile, { transaction });
    for (const d of list) {
        await offerNext(profile.companyId, d.courseId, String(d.playDate), { transaction });
    }
}

// Leave every queue the booking is in; a live offer it held moves on.
async function withdrawAll(profile, { transaction } = {}) {
    const rows = await GroupWaitlist.findAll({ where: { bookingProfileId: profile.id, status: { [Op.in]: ['waiting', 'offered'] } }, transaction });
    for (const r of rows) {
        const wasOffered = r.status === 'offered';
        r.status = 'withdrawn';
        r.closedAt = new Date();
        await r.save({ transaction });
        if (wasOffered) await offerNext(r.companyId, r.courseId, String(r.playDate), { transaction });
    }
    return rows.length;
}

// POST join: a tentative booking queues one of its play days.
async function joinWaitlist(req, profile, day) {
    const setting = await settingFor(profile.companyId);
    if (!setting.controlOn) return { fail: 'The waitlist is part of group booking control - switch it on under Golf Specification.' };
    if (profile.status !== 'tentative') return { fail: 'Only a tentative booking joins the waitlist.' };
    if (day.status !== 'planned') return { fail: 'Only a planned play day joins the waitlist.' };
    const flights = await GroupFlight.count({ where: { groupPlayDayId: day.id } });
    if (flights > 0) return { fail: 'This day already holds flights - the waitlist is for a day you could not reserve.' };
    const existing = await GroupWaitlist.findOne({ where: { bookingProfileId: profile.id, groupPlayDayId: day.id, status: { [Op.in]: ['waiting', 'offered'] } } });
    if (existing) return { fail: 'This day is already on the waitlist.' };
    const userId = getUserContext(req).userId;
    return sequelize.transaction(async (transaction) => {
        const last = await GroupWaitlist.max('position', { where: { companyId: profile.companyId, courseId: day.courseId, playDate: String(day.playDate) }, transaction });
        const row = await GroupWaitlist.create({
            companyId: profile.companyId, courseId: day.courseId, playDate: String(day.playDate),
            bookingProfileId: profile.id, groupPlayDayId: day.id, position: (Number(last) || 0) + 1, status: 'waiting',
            createdBy: userId, updatedBy: userId,
        }, { transaction });
        return { entry: row };
    });
}

// DELETE leave: the booking leaves the queue for that day.
async function leaveWaitlist(req, profile, day) {
    const row = await GroupWaitlist.findOne({ where: { bookingProfileId: profile.id, groupPlayDayId: day.id, status: { [Op.in]: ['waiting', 'offered'] } } });
    if (!row) return { fail: 'This day is not on the waitlist.' };
    const userId = getUserContext(req).userId;
    return sequelize.transaction(async (transaction) => {
        const wasOffered = row.status === 'offered';
        row.status = 'withdrawn';
        row.closedAt = new Date();
        row.updatedBy = userId;
        await row.save({ transaction });
        if (wasOffered) await offerNext(row.companyId, row.courseId, String(row.playDate), { transaction });
        return {};
    });
}

// Flights reserved on a day the booking was queued (or offered) for: taken.
async function markTaken(profile, day, { transaction } = {}) {
    const row = await GroupWaitlist.findOne({ where: { bookingProfileId: profile.id, groupPlayDayId: day.id, status: { [Op.in]: ['waiting', 'offered'] } }, transaction });
    if (!row) return false;
    row.status = 'taken';
    row.closedAt = new Date();
    await row.save({ transaction });
    return true;
}

// The queue picture of ONE play day for the booking page: this booking's
// entry (position among those still waiting, offer window), the queue length,
// and any live offer to another group that blocks reserving.
async function waitlistOfDay(profile, day, { transaction = null } = {}) {
    const [mine, waiting, offer] = await Promise.all([
        GroupWaitlist.findOne({ where: { bookingProfileId: profile.id, groupPlayDayId: day.id }, order: [['createdAt', 'DESC']], transaction }),
        GroupWaitlist.findAll({ where: { companyId: profile.companyId, courseId: day.courseId, playDate: String(day.playDate), status: 'waiting' }, attributes: ['bookingProfileId', 'position'], order: [['position', 'ASC']], transaction }),
        activeOfferFor(profile.companyId, day.courseId, String(day.playDate), { excludeBookingId: profile.id, transaction }),
    ]);
    const queueAhead = mine && mine.status === 'waiting' ? waiting.filter((w) => w.position < mine.position).length : 0;
    return {
        status: mine ? mine.status : null,
        position: mine && mine.status === 'waiting' ? queueAhead + 1 : null,
        waiting: waiting.length,
        offerExpiresAt: mine && mine.status === 'offered' ? mine.offerExpiresAt : null,
        blockedUntil: offer ? offer.offerExpiresAt : null,
    };
}

// Worker: expire unanswered offers and move the queue on.
async function scanWaitlist({ now = new Date() } = {}) {
    const stale = await GroupWaitlist.findAll({ where: { status: 'offered', offerExpiresAt: { [Op.lte]: now } } });
    let moved = 0;
    for (const r of stale) {
        try {
            await sequelize.transaction(async (transaction) => {
                const fresh = await GroupWaitlist.findOne({ where: { id: r.id }, transaction, lock: transaction.LOCK.UPDATE });
                if (!fresh || fresh.status !== 'offered' || fresh.offerExpiresAt > now) return;
                fresh.status = 'expired';
                fresh.closedAt = new Date();
                await fresh.save({ transaction });
                const profile = await BookingProfile.findOne({ where: { id: fresh.bookingProfileId }, transaction });
                if (profile) {
                    try {
                        await notifyUser({
                            userId: profile.createdBy, companyId: profile.companyId, type: 'golf-group-waitlist-expired',
                            title: `Offer passed: ${profile.groupName || profile.bookingNo}`,
                            body: `The next-in-line window for ${playDateText(String(fresh.playDate))} ended without a reservation; the day was offered to the next group.`,
                            linkRoute: `${GROUP_ROUTE}/${profile.id}`, transaction,
                        });
                    } catch (err) {
                        console.error(`[GOLF GROUP] waitlist bell failed for ${profile.id}:`, err.message);
                    }
                }
                await offerNext(fresh.companyId, fresh.courseId, String(fresh.playDate), { transaction });
                moved += 1;
            });
        } catch (err) {
            console.error(`[GOLF GROUP] waitlist offer expiry failed for ${r.id}:`, err);
        }
    }
    if (moved) console.log(`[GOLF GROUP] waitlist scan: ${moved} offer(s) moved on.`);
    return { moved };
}

// ---------------------------------------------------------------------------
// The worker tick: warn 24h ahead, expire tentative holds, lapse unpaid
// approvals.

async function scanGroupLifecycle({ now = new Date() } = {}) {
    let released = 0;
    let lapsed = 0;
    let warned = 0;
    const horizon = new Date(now.getTime() + WARN_BEFORE_MS);

    // 24-hour warnings, once per clock (the markers clear when a clock restarts).
    const holdSoon = await BookingProfile.findAll({
        where: { bookingType: { [Op.in]: GROUP_BOOKING_TYPE_KEYS }, status: 'tentative', holdExpiresAt: { [Op.gt]: now, [Op.lte]: horizon }, holdWarnedAt: null },
    });
    for (const p of holdSoon) {
        try {
            const tz = await companyTimezoneById(p.companyId);
            const flights = await flightCountOf(p);
            p.holdWarnedAt = new Date();
            await p.save();
            await notice(p, {
                type: 'golf-group-hold-expiring',
                title: `Hold ends soon: ${p.groupName || p.bookingNo}`,
                body: `${flights} reserved flight(s) are released at ${instantText(p.holdExpiresAt, tz)} unless the booking is submitted for approval.`,
                templateKey: 'golf.group.hold-expiring',
                data: { groupName: p.groupName || p.bookingNo, bookingNo: p.bookingNo, playDateText: playDateText(String(p.playDate)), expiresText: instantText(p.holdExpiresAt, tz), flightCount: flights },
            });
            warned += 1;
        } catch (err) {
            console.error(`[GOLF GROUP] hold warning failed for ${p.id}:`, err);
        }
    }
    const depositSoon = await BookingProfile.findAll({
        where: { bookingType: { [Op.in]: GROUP_BOOKING_TYPE_KEYS }, status: 'approved', depositDueAt: { [Op.gt]: now, [Op.lte]: horizon }, depositWarnedAt: null },
    });
    for (const p of depositSoon) {
        try {
            const tz = await companyTimezoneById(p.companyId);
            const held = await depositsHeld(p);
            const required = Number(p.depositRequiredAmount || 0);
            p.depositWarnedAt = new Date();
            await p.save();
            if (held >= required) { await refreshConfirmation(p); continue; }
            const short = round2(required - held);
            await notice(p, {
                type: 'golf-group-deposit-due',
                title: `Deposit due soon: ${p.groupName || p.bookingNo}`,
                body: `${short.toFixed(2)} of the ${required.toFixed(2)} deposit is still outstanding; the booking lapses at ${instantText(p.depositDueAt, tz)} unless it is received.`,
                templateKey: 'golf.group.deposit-due',
                organiser: true,
                data: {
                    groupName: p.groupName || p.bookingNo, bookingNo: p.bookingNo, playDateText: playDateText(String(p.playDate)),
                    dueText: instantText(p.depositDueAt, tz), depositRequired: required.toFixed(2), depositHeld: held.toFixed(2), depositShort: short.toFixed(2),
                },
            });
            warned += 1;
        } catch (err) {
            console.error(`[GOLF GROUP] deposit warning failed for ${p.id}:`, err);
        }
    }
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
                fresh.holdWarnedAt = null;
                await fresh.save({ transaction });
                released += 1;
                if (n) await onSpaceFreed(fresh, { transaction });
                await notice(fresh, {
                    type: 'golf-group-hold-expired',
                    title: `Hold expired: ${fresh.groupName || fresh.bookingNo}`,
                    body: `${n} reserved flight(s) were released because the booking was not submitted for approval in time. Reserve them again to continue.`,
                    templateKey: 'golf.group.hold-expired',
                    data: { groupName: fresh.groupName || fresh.bookingNo, bookingNo: fresh.bookingNo, playDateText: playDateText(String(fresh.playDate)), flightCount: n },
                    transaction,
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
                const lapsedDays = await GroupPlayDay.findAll({ where: { bookingProfileId: fresh.id, status: 'planned' }, transaction });
                await GroupPlayDay.update({ status: 'cancelled' }, { where: { bookingProfileId: fresh.id, status: 'planned' }, transaction });
                lapsed += 1;
                await onSpaceFreed(fresh, { transaction, gone: true, days: lapsedDays });
                await notice(fresh, {
                    type: 'golf-group-lapsed',
                    title: `Booking lapsed: ${fresh.groupName || fresh.bookingNo}`,
                    body: `${fresh.lapseReason} ${n} flight(s) were released. Reopen the booking to start again.`,
                    templateKey: 'golf.group.lapsed',
                    organiser: true,
                    data: { groupName: fresh.groupName || fresh.bookingNo, bookingNo: fresh.bookingNo, playDateText: playDateText(String(fresh.playDate)), depositRequired: required.toFixed(2), depositHeld: held.toFixed(2), flightCount: n },
                    transaction,
                });
            });
        } catch (err) {
            console.error(`[GOLF GROUP] deposit lapse failed for ${p.id}:`, err);
        }
    }
    if (released || lapsed || warned) console.log(`[GOLF GROUP] lifecycle scan: ${warned} warning(s), ${released} hold(s) released, ${lapsed} booking(s) lapsed.`);
    const waitlist = await scanWaitlist({ now });
    return { released, lapsed, warned, moved: waitlist.moved };
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
        holdWarnedAt: profile.holdWarnedAt || null,
        depositWarnedAt: profile.depositWarnedAt || null,
        can: abilities(profile.status, { controlOn: setting.controlOn, depositDueExtendedAt: profile.depositDueExtendedAt }),
        isClubEvent: profile.isClubEvent === true,
    };
}

module.exports = {
    PURPOSE,
    ENTITY_TYPE,
    settingFor,
    mayFlagClubEvent,
    cellsOfDay,
    courseShare,
    shareExceeds,
    capFor,
    capCheck,
    hoardingCheck,
    dayShare,
    activeOfferFor,
    offerBlock,
    offerNext,
    onSpaceFreed,
    withdrawAll,
    joinWaitlist,
    leaveWaitlist,
    markTaken,
    waitlistOfDay,
    scanWaitlist,
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
