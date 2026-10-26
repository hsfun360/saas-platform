// Facility booking availability - the DAY GRID of one facility type
// (facilities across, the day's slots down) is COMPUTED here: the slot set in
// force for the type on the date (day scope via the calendar seam, latest
// effective date), minus the active closure days of the type and its units,
// overlaid with live slot occupancy and unexpired slot locks. There is no
// materialized slot table; the saved BookingSlot rows and the SlotLock rows
// are the only truth, and the pure verdicts live in bookingRules.service.js.

const { Op } = require('sequelize');
const FacilitySetting = require('./facilitySetting.model');
const FacilitySession = require('./facilitySession.model');
const FacilityType = require('./facilityType.model');
const FacilityTypeSlotSet = require('./facilityTypeSlotSet.model');
const FacilityTypeSlot = require('./facilityTypeSlot.model');
const Facility = require('./facility.model');
const FacilityClosurePlan = require('./facilityClosurePlan.model');
const FacilityClosureDay = require('./facilityClosureDay.model');
const AdvanceBookingOverride = require('./advanceBookingOverride.model');
const GuestControlRule = require('./guestControlRule.model');
const Booking = require('./booking.model');
const BookingSlot = require('./bookingSlot.model');
const BookingParticipant = require('./bookingParticipant.model');
const SlotLock = require('./slotLock.model');
const Patron = require('./patron.model');
const rules = require('./bookingRules.service');
const { ACTIVE_SLOT_STATUS_KEYS } = require('./booking.constants');
const { toMinutes } = require('./facilityShared');
const { classBlockAt } = require('./classScheduleRules.service');
const { DEFAULTS } = require('./facilitySetting.controller');

// One cell key: a facility at a start time.
function cellKey(facilityId, startTime) {
    return `${facilityId}|${rules.hhmm(startTime)}`;
}

// The Specification (saved row or the defaults), the sessions and the guest
// exception rows - one load per request.
async function loadRules(companyId, { transaction } = {}) {
    const [row, sessions, guestRules] = await Promise.all([
        FacilitySetting.findOne({ where: { companyId }, transaction }),
        FacilitySession.findAll({ where: { companyId }, order: [['sequence', 'ASC'], ['startTime', 'ASC']], transaction }),
        GuestControlRule.findAll({ where: { companyId }, transaction }),
    ]);
    const setting = row ? row.get({ plain: true }) : { ...DEFAULTS };
    return { setting, sessions: sessions.map((s) => s.get({ plain: true })), guestRules: guestRules.map((r) => r.get({ plain: true })) };
}

// The membership-type override days for a member (null when none).
async function overrideDaysFor(companyId, membershipTypeId, { transaction } = {}) {
    if (!membershipTypeId) return null;
    const ov = await AdvanceBookingOverride.findOne({ where: { companyId, membershipTypeId }, transaction });
    return ov ? Number(ov.advanceBookingDays) : null;
}

// The booker's window for a type: { dateFrom, dateTo, effectiveDays, hours }.
async function windowFor(companyId, { setting, type, membershipTypeId, timezone }, { transaction } = {}) {
    const overrideDays = await overrideDaysFor(companyId, membershipTypeId, { transaction });
    const effectiveDays = rules.effectiveAdvanceDays({ setting, type, overrideDays });
    const hours = Number(setting.advanceBookingHours || 0);
    const now = rules.clubNow(timezone);
    return { ...rules.bookingWindow({ now, effectiveDays, hours, allowSameDay: setting.allowSameDayBooking === true }), effectiveDays, hours, now };
}

// The slot set in force for a type on a date, with its ACTIVE slots in order
// (an unticked break slot is simply not on the grid). Null = no set.
async function resolveSlotSet(facilityTypeId, dayType, date, { transaction } = {}) {
    const sets = await FacilityTypeSlotSet.findAll({
        where: { facilityTypeId, isActive: true, dayScope: { [Op.in]: ['all', dayType] }, effectiveDate: { [Op.lte]: date } },
        transaction,
    });
    const set = rules.pickSlotSet(sets.map((s) => s.get({ plain: true })), dayType, date);
    if (!set) return null;
    const slots = await FacilityTypeSlot.findAll({
        where: { slotSetId: set.id, isActive: true },
        order: [['slotNumber', 'ASC']],
        transaction,
    });
    return {
        ...set,
        slots: slots.map((s) => ({ slotNumber: s.slotNumber, startTime: rules.hhmm(s.startTime), endTime: rules.hhmm(s.endTime), isFrontDesk: s.isFrontDesk === true })),
    };
}

// Active closure blocks on a date: Map(facilityId -> [{ start, end }]) in
// minutes, null = whole day; a type-wide plan (facilityId NULL) lands on
// every unit given.
async function closureBlocks(companyId, facilityTypeId, facilityIds, date, { transaction } = {}) {
    const map = new Map(facilityIds.map((id) => [id, []]));
    const plans = await FacilityClosurePlan.findAll({
        where: { companyId, facilityTypeId, isActive: true, dateFrom: { [Op.lte]: date }, dateTo: { [Op.gte]: date } },
        attributes: ['id', 'facilityId'],
        transaction,
    });
    if (!plans.length) return map;
    const unitByPlan = new Map(plans.map((p) => [p.id, p.facilityId]));
    const days = await FacilityClosureDay.findAll({
        where: { closurePlanId: { [Op.in]: plans.map((p) => p.id) }, closureDate: date, isActive: true },
        transaction,
    });
    for (const d of days) {
        const block = { start: d.startTime ? toMinutes(d.startTime) : null, end: d.endTime ? toMinutes(d.endTime) : null };
        const unitId = unitByPlan.get(d.closurePlanId);
        const targets = unitId ? [unitId] : facilityIds;
        for (const id of targets) if (map.has(id)) map.get(id).push(block);
    }
    return map;
}

// Live slot occupancy of a type on a date: Map(cellKey -> { bookingId,
// bookingNo, status, bookerName, bookerPatronId }).
async function occupancy(companyId, facilityTypeId, date, { transaction } = {}) {
    const slots = await BookingSlot.findAll({
        where: { companyId, facilityTypeId, bookingDate: date, status: { [Op.in]: ACTIVE_SLOT_STATUS_KEYS } },
        transaction,
    });
    const map = new Map();
    if (!slots.length) return map;
    const bookings = await Booking.findAll({
        where: { id: { [Op.in]: [...new Set(slots.map((s) => s.bookingId))] } },
        attributes: ['id', 'bookingNo', 'status', 'bookerPatronId'],
        transaction,
    });
    const bookingById = new Map(bookings.map((b) => [b.id, b]));
    const patrons = await Patron.findAll({
        where: { id: { [Op.in]: [...new Set(bookings.map((b) => b.bookerPatronId))] } },
        attributes: ['id', 'name', 'memberNo'],
        transaction,
    });
    const patronById = new Map(patrons.map((p) => [p.id, p]));
    for (const s of slots) {
        const b = bookingById.get(s.bookingId);
        const p = b ? patronById.get(b.bookerPatronId) : null;
        map.set(cellKey(s.facilityId, s.startTime), {
            bookingId: s.bookingId,
            bookingNo: b ? b.bookingNo : null,
            bookingStatus: b ? b.status : null,
            slotStatus: s.status,
            bookerName: p ? p.name : null,
            bookerMemberNo: p ? p.memberNo : null,
        });
    }
    return map;
}

// Unexpired locks on a date: Map(cellKey -> { groupId, lockedBy, expiresAt }).
async function activeLocks(companyId, date, { transaction } = {}) {
    const locks = await SlotLock.findAll({ where: { companyId, bookingDate: date, expiresAt: { [Op.gt]: new Date() } }, transaction });
    return new Map(locks.map((l) => [cellKey(l.facilityId, l.startTime), { groupId: l.groupId, lockedBy: l.lockedBy, expiresAt: l.expiresAt }]));
}

// Slots of the type a set of patrons HOLD on a date (as booker or as a
// participant; booked or checked-in): Map(patronId -> count). Rule 2.
async function heldSlotsByPatron(companyId, facilityTypeId, date, patronIds, { transaction, excludeBookingId = null } = {}) {
    const out = new Map(patronIds.map((id) => [id, 0]));
    if (!patronIds.length) return out;
    const where = { companyId, facilityTypeId, bookingDate: date, status: { [Op.in]: ACTIVE_SLOT_STATUS_KEYS } };
    if (excludeBookingId) where.bookingId = { [Op.ne]: excludeBookingId };
    const slots = await BookingSlot.findAll({ where, attributes: ['id', 'bookingId'], transaction });
    if (!slots.length) return out;
    const bookings = await Booking.findAll({
        where: { id: { [Op.in]: [...new Set(slots.map((s) => s.bookingId))] }, status: { [Op.ne]: 'cancelled' } },
        attributes: ['id', 'bookerPatronId'],
        transaction,
    });
    const bookerByBooking = new Map(bookings.map((b) => [b.id, b.bookerPatronId]));
    const participants = await BookingParticipant.findAll({
        where: { bookingSlotId: { [Op.in]: slots.map((s) => s.id) }, patronId: { [Op.in]: patronIds } },
        attributes: ['bookingSlotId', 'patronId'],
        transaction,
    });
    const participantsBySlot = new Map();
    for (const p of participants) {
        if (!participantsBySlot.has(p.bookingSlotId)) participantsBySlot.set(p.bookingSlotId, new Set());
        participantsBySlot.get(p.bookingSlotId).add(p.patronId);
    }
    for (const s of slots) {
        const holders = new Set(participantsBySlot.get(s.id) || []);
        const booker = bookerByBooking.get(s.bookingId);
        if (booker) holders.add(booker);
        for (const id of holders) if (out.has(id)) out.set(id, out.get(id) + 1);
    }
    return out;
}

// The grid: one column per active unit of the type, one row per slot of the
// set in force, each cell carrying its state. `callerId` distinguishes the
// caller's own locks ('mine') from other desks' ('locked'); front-desk-only
// slots are reported as 'front-desk' (the desk may still book them; the
// member portal will not). A slot already started on today's date is 'past'.
// Slice 5: a scheduled class session whose venue links to the unit renders
// the overlapping cells as 'class' (`classes` = Map(facilityId -> blocks)).
function buildGrid({ units, slotSet, blocks, occ, locks, callerId, now, date, classes = new Map() }) {
    const slots = slotSet ? slotSet.slots : [];
    const columns = units.map((u) => {
        const unitBlocks = blocks.get(u.id) || [];
        const unitClasses = classes.get(u.id) || [];
        const cells = slots.map((s) => {
            const key = cellKey(u.id, s.startTime);
            const taken = occ.get(key);
            const lock = locks.get(key);
            const cls = classBlockAt(unitClasses, toMinutes(s.startTime), toMinutes(s.endTime));
            let state = 'open';
            if (taken) state = 'booked';
            else if (lock) state = lock.lockedBy === callerId ? 'mine' : 'locked';
            else if (cls) state = 'class';
            else if (rules.isBlocked(unitBlocks, toMinutes(s.startTime), toMinutes(s.endTime))) state = 'closed';
            else if (rules.isPast(now, date, s.startTime)) state = 'past';
            else if (s.isFrontDesk) state = 'front-desk';
            return {
                slotNumber: s.slotNumber,
                startTime: s.startTime,
                endTime: s.endTime,
                state,
                bookingId: taken ? taken.bookingId : null,
                bookingNo: taken ? taken.bookingNo : null,
                bookingStatus: taken ? taken.bookingStatus : null,
                slotStatus: taken ? taken.slotStatus : null,
                bookerName: taken ? taken.bookerName : null,
                lockGroupId: lock && lock.lockedBy === callerId ? lock.groupId : null,
                lockExpiresAt: lock ? lock.expiresAt : null,
                classLabel: cls ? cls.label : null,
            };
        });
        return { id: u.id, code: u.code, name: u.name, location: u.location, isIndoor: u.isIndoor === true, isFloodlit: u.isFloodlit === true, cells };
    });
    return { slots, columns };
}

// The active slot-mode types and the active units of one type.
async function slotTypes(companyId, { transaction } = {}) {
    return FacilityType.findAll({ where: { companyId, usageMode: 'slot', isActive: true }, order: [['sortOrder', 'ASC'], ['code', 'ASC']], transaction });
}
async function unitsOf(companyId, facilityTypeId, { transaction } = {}) {
    return Facility.findAll({ where: { companyId, facilityTypeId, isActive: true }, order: [['sortOrder', 'ASC'], ['code', 'ASC']], transaction });
}

module.exports = {
    cellKey, loadRules, overrideDaysFor, windowFor, resolveSlotSet, closureBlocks, occupancy, activeLocks,
    heldSlotsByPatron, buildGrid, slotTypes, unitsOf,
};
