// Control Station engine (structures approved 2026-10-26, slice 3): the
// day's picture per facility type, the check-in of a booked slot, the walk-in
// entry with its guests and its bill, sign-out, the issue and return of the
// UTILITY ITEMS (slice 6a, 2026-11-11: lockers, towels and showers live in
// their own master, no longer as issue-mode facility types), the end-of-day
// sweep and the worker's auto sign-out. The
// pure verdicts live in stationRules.service.js and bookingRules.service.js;
// bills open through billing.service.js exactly as a booking's bill does.

const crypto = require('crypto');
const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { getUserContext } = require('../../platform/serviceContext');
const {
    getGolfMemberStanding, getGuestAllowanceStanding, recordGuestVisit, voidGuestVisit, findGuestPass, getGuestPass, markGuestArrived,
    registerGuestAtDoor, cancelGuestAtDoor, getGuestPassShare, sendGuestPass, listGuestPassesOfHost,
} = require('../../platform/membershipGateway');
const { companyTimezoneById } = require('../../platform/calendarGateway');
const numberingGateway = require('../../platform/numberingGateway');
const FacilityType = require('./facilityType.model');
const Facility = require('./facility.model');
const Booking = require('./booking.model');
const BookingSlot = require('./bookingSlot.model');
const BookingParticipant = require('./bookingParticipant.model');
const Registration = require('./registration.model');
const RegistrationGuest = require('./registrationGuest.model');
const IssueRecord = require('./issueRecord.model');
const UtilityItem = require('./utilityItem.model');
const UtilityUnit = require('./utilityUnit.model');
const utilityRules = require('./utilityRules.service');
const Patron = require('./patron.model');
const TransactionType = require('./transactionType.model');
const availability = require('./bookingAvailability.service');
const bookingRules = require('./bookingRules.service');
const rules = require('./stationRules.service');
const participantTypes = require('./participantType.service');
const patrons = require('./patron.service');
const billing = require('./billing.service');
const pricing = require('./billPricing.service');
const shared = require('./bookingShared');
const { stampsFor, toMinutes, txFail, runTx } = require('./facilityShared');
const { ACTIVE_SLOT_STATUS_KEYS } = require('./booking.constants');
const { STATION_LIMITS } = require('./station.constants');
const noShow = require('./noShow.service');

// ---- club clock helpers -------------------------------------------------------

// A club-local 'YYYY-MM-DDTHH:MM' as a Date (UTC instant) in `timezone`.
function localToDate(local, timezone) {
    const [d, t] = local.split('T');
    const [y, m, day] = d.split('-').map(Number);
    const [hh, mm] = t.split(':').map(Number);
    const guess = Date.UTC(y, m - 1, day, hh, mm);
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const parts = {};
    for (const p of fmt.formatToParts(new Date(guess))) parts[p.type] = p.value;
    const seen = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    return new Date(guess - (seen - guess));
}

async function clock(companyId) {
    const timezone = await companyTimezoneById(companyId);
    return { timezone, now: bookingRules.clubNow(timezone) };
}

function hhmm(t) {
    return t ? String(t).slice(0, 5) : null;
}

// ---- DTOs ----------------------------------------------------------------------

function guestDto(g) {
    return {
        id: g.id, patronId: g.patronId, participantType: g.participantType, name: g.name, memberNo: g.memberNo, guestVisitId: g.guestVisitId, sortOrder: g.sortOrder,
        // Slice 6c: the day pass behind the line, and whether the station created it.
        guestRegistrationId: g.guestRegistrationId || null, passCreatedHere: g.passCreatedHere === true,
    };
}

function registrationDto(r, { patron, unit, guests = [], bill = null } = {}) {
    return {
        id: r.id,
        registrationNo: r.registrationNo,
        patron: patron ? { id: patron.id, name: patron.name, memberNo: patron.memberNo, patronType: patron.patronType } : null,
        facilityTypeId: r.facilityTypeId,
        facilityId: r.facilityId,
        facility: unit ? { id: unit.id, code: unit.code, name: unit.name } : null,
        bookingSlotId: r.bookingSlotId,
        registrationDate: String(r.registrationDate),
        timeIn: r.timeIn,
        timeOut: r.timeOut,
        dayType: r.dayType,
        guestCount: r.guestCount,
        // false = the guests went in on a pass before the host arrived (slice 6d).
        hostPresent: r.hostPresent !== false,
        status: r.status,
        billId: r.billId,
        bill,
        remarks: r.remarks,
        guests: guests.map(guestDto),
    };
}

function issueDto(i, { patron, unit, bill = null } = {}, now = new Date()) {
    return {
        id: i.id,
        // The responsible member; the holder is that member unless holderName
        // names a guest served on the pass (slice 6b).
        patron: patron ? { id: patron.id, name: patron.name, memberNo: patron.memberNo } : null,
        holderName: i.holderName || null,
        guestRegistrationId: i.guestRegistrationId || null,
        utilityItemId: i.utilityItemId,
        utilityUnitId: i.utilityUnitId,
        unit: unit ? { id: unit.id, code: unit.code, location: unit.location } : null,
        registrationId: i.registrationId,
        quantity: i.quantity,
        issuedAt: i.issuedAt,
        dueBack: i.dueBack,
        overdue: i.status === 'issued' && new Date(i.dueBack).getTime() < now.getTime(),
        returnedAt: i.returnedAt,
        returnedQuantity: i.returnedQuantity,
        returnCondition: i.returnCondition,
        status: i.status,
        feeBillId: i.feeBillId,
        bill,
        remarks: i.remarks,
    };
}

function unitDto(u) {
    return { id: u.id, code: u.code, name: u.name, location: u.location, capacity: u.capacity, isActive: u.isActive !== false };
}

// A numbered unit of a utility item on the station's board.
function utilityUnitDto(u) {
    return { id: u.id, code: u.code, location: u.location, isActive: u.isActive !== false, unitStatus: u.unitStatus || 'available', currentIssueId: u.currentIssueId || null, remarks: u.remarks };
}

// ---- the day's picture --------------------------------------------------------------

// Everything the station shows for one date: per active facility type, by
// mode, and per active utility item (the unit board or the counter).
async function dayPicture(companyId, date, callerId) {
    const [{ now, timezone }, types, units, { setting, sessions }, dayType] = await Promise.all([
        clock(companyId),
        FacilityType.findAll({ where: { companyId, isActive: true, usageMode: { [Op.in]: ['slot', 'entry'] } }, order: [['usageMode', 'ASC'], ['sortOrder', 'ASC'], ['code', 'ASC']] }),
        Facility.findAll({ where: { companyId }, order: [['sortOrder', 'ASC'], ['code', 'ASC']] }),
        availability.loadRules(companyId),
        shared.dayTypeOf(companyId, date),
    ]);
    const unitById = new Map(units.map((u) => [u.id, u]));
    const [utilityItems, utilityUnits] = await Promise.all([
        UtilityItem.findAll({ where: { companyId, isActive: true }, order: [['sortOrder', 'ASC'], ['code', 'ASC']] }),
        UtilityUnit.findAll({ where: { companyId }, order: [['sortOrder', 'ASC'], ['code', 'ASC']] }),
    ]);
    const utilityUnitById = new Map(utilityUnits.map((u) => [u.id, u]));
    const [slots, registrations, issues] = await Promise.all([
        BookingSlot.findAll({ where: { companyId, bookingDate: date, status: { [Op.in]: ACTIVE_SLOT_STATUS_KEYS } }, order: [['startTime', 'ASC']] }),
        Registration.findAll({ where: { companyId, registrationDate: date }, order: [['timeIn', 'ASC']] }),
        IssueRecord.findAll({ where: { companyId, [Op.or]: [{ status: 'issued' }, { returnedAt: { [Op.gte]: new Date(`${date}T00:00:00Z`) } }, { status: 'used', issuedAt: { [Op.gte]: localToDate(`${date}T00:00`, timezone) } }] }, order: [['issuedAt', 'ASC']] }),
    ]);
    const bookingIds = [...new Set(slots.map((s) => s.bookingId))];
    const bookings = bookingIds.length ? await Booking.findAll({ where: { id: { [Op.in]: bookingIds } } }) : [];
    const bookingById = new Map(bookings.map((b) => [b.id, b]));
    const patronIds = [...new Set([...bookings.map((b) => b.bookerPatronId), ...registrations.map((r) => r.patronId), ...issues.map((i) => i.patronId)])];
    const patronById = await patrons.byIds(companyId, patronIds);
    const regIds = registrations.map((r) => r.id);
    const guests = regIds.length ? await RegistrationGuest.findAll({ where: { registrationId: { [Op.in]: regIds } }, order: [['sortOrder', 'ASC']] }) : [];
    const guestsByReg = new Map();
    for (const g of guests) {
        if (!guestsByReg.has(g.registrationId)) guestsByReg.set(g.registrationId, []);
        guestsByReg.get(g.registrationId).push(g);
    }
    const slotIds = slots.map((s) => s.id);
    const participants = slotIds.length ? await BookingParticipant.findAll({ where: { bookingSlotId: { [Op.in]: slotIds } }, order: [['sortOrder', 'ASC']] }) : [];
    const participantsBySlot = new Map();
    for (const p of participants) {
        if (!participantsBySlot.has(p.bookingSlotId)) participantsBySlot.set(p.bookingSlotId, []);
        participantsBySlot.get(p.bookingSlotId).push(p);
    }
    const regBySlot = new Map(registrations.filter((r) => r.bookingSlotId).map((r) => [r.bookingSlotId, r]));
    const billIds = [...new Set([...bookings.map((b) => b.id)])];
    const billByBooking = await billing.summariesFor(companyId, billIds);
    const billsOfRegs = regIds.length ? await billing.Bill.findAll({ where: { companyId, registrationId: { [Op.in]: regIds }, status: { [Op.ne]: 'voided' } }, attributes: ['id', 'registrationId', 'billNo', 'status', 'totalAmount'] }) : [];
    const billByReg = new Map(billsOfRegs.map((b) => [b.registrationId, { id: b.id, billNo: b.billNo, status: b.status, totalAmount: Number(b.totalAmount) }]));
    const billsOfIssues = issues.length ? await billing.Bill.findAll({ where: { companyId, issueRecordId: { [Op.in]: issues.map((i) => i.id) }, status: { [Op.ne]: 'voided' } }, attributes: ['id', 'issueRecordId', 'billNo', 'status', 'totalAmount'] }) : [];
    const billByIssue = new Map(billsOfIssues.map((b) => [b.issueRecordId, { id: b.id, billNo: b.billNo, status: b.status, totalAmount: Number(b.totalAmount) }]));
    const nowDate = new Date();

    const cfg = await noShow.config(companyId);
    const out = types.map((t) => {
        const typeUnits = units.filter((u) => u.facilityTypeId === t.id);
        const hours = rules.openingHours(t, dayType);
        const base = {
            id: t.id, code: t.code, description: t.description, usageMode: t.usageMode, iconUrl: t.iconUrl,
            capacity: t.capacity,
            entryRequiresBooking: t.entryRequiresBooking === true, guestsAllowed: t.guestsAllowed !== false, memberGuestsAllowed: t.memberGuestsAllowed !== false,
            maxGuestsPerBooking: t.maxGuestsPerBooking,
            hours: hours ? { open: hhmm(dayType === 'weekend' ? t.openTimeWeekend : t.openTimeWeekday), close: hhmm(dayType === 'weekend' ? t.closeTimeWeekend : t.closeTimeWeekday) } : null,
            isOpenNow: date === now.date ? rules.isOpenAt(hours, now.time) : true,
            units: typeUnits.map(unitDto),
        };
        if (t.usageMode === 'slot') {
            const typeSlots = slots.filter((s) => s.facilityTypeId === t.id);
            return {
                ...base,
                slots: typeSlots.map((s) => {
                    const b = bookingById.get(s.bookingId);
                    const booker = b ? patronById.get(b.bookerPatronId) : null;
                    const reg = regBySlot.get(s.id);
                    const unit = unitById.get(s.facilityId);
                    const state = reg || s.status === 'checked-in' ? 'checked-in' : rules.checkInState(now, { bookingDate: String(s.bookingDate), startTime: hhmm(s.startTime), endTime: hhmm(s.endTime) }, setting.checkInOpenMinutes ?? 30);
                    return {
                        slotId: s.id, bookingId: s.bookingId, bookingNo: b ? b.bookingNo : null, bookingStatus: b ? b.status : null,
                        facility: unit ? { id: unit.id, code: unit.code, name: unit.name } : null,
                        startTime: hhmm(s.startTime), endTime: hhmm(s.endTime), slotStatus: s.status,
                        booker: booker ? { id: booker.id, name: booker.name, memberNo: booker.memberNo, patronType: booker.patronType } : null,
                        participants: (participantsBySlot.get(s.id) || []).map((p) => ({ id: p.id, name: p.name, memberNo: p.memberNo, participantType: p.participantType, isHost: p.isHost === true })),
                        checkInState: state,
                        // Slice 4 rule 2: a booked slot past start + grace with no check-in.
                        noShowEligible: !!(cfg && t.noShowChargeEnabled !== false && s.status === 'booked' && !reg && date <= now.date
                            && bookingRules.minutesUntil(now, String(s.bookingDate), hhmm(s.startTime)) <= -Number(cfg.graceMinutes || 0)),
                        registration: reg ? registrationDto(reg, { patron: patronById.get(reg.patronId), unit }) : null,
                        bill: b ? billByBooking.get(b.id) || null : null,
                    };
                }),
            };
        }
        const regs = registrations.filter((r) => r.facilityTypeId === t.id && !r.bookingSlotId);
        return {
            ...base,
            liveCount: rules.liveCount(regs),
            registrations: regs.map((r) => registrationDto(r, { patron: patronById.get(r.patronId), unit: r.facilityId ? unitById.get(r.facilityId) : null, guests: guestsByReg.get(r.id) || [], bill: billByReg.get(r.id) || null })),
        };
    });
    // The fee each utility item would bill today, so the desk sees it before
    // issuing (tax-exclusive, the member price; null amount = no price in force).
    const feeTypeIds = [...new Set(utilityItems.map((it) => it.feeTransactionTypeId).filter(Boolean))];
    const feeTypes = feeTypeIds.length ? await TransactionType.findAll({ where: { companyId, id: { [Op.in]: feeTypeIds }, isActive: true } }) : [];
    const feeById = new Map();
    for (const ft of feeTypes) {
        const priced = pricing.unitPriceOf(ft, await billing.cardsOf(ft.id), { date, dayType, participantType: 'member' });
        feeById.set(ft.id, { code: ft.transactionType, description: ft.description, unitAmount: priced.missing ? null : priced.unitAmount });
    }
    // The utility items: the unit board of a numbered item, the counter of a
    // counted one, the day's uses of a use-only one.
    const utilityOut = utilityItems.map((it) => {
        const itemIssues = issues.filter((i) => i.utilityItemId === it.id);
        const itemUnits = utilityUnits.filter((u) => u.utilityItemId === it.id);
        return {
            id: it.id, code: it.code, description: it.description, iconUrl: it.iconUrl,
            behaviour: utilityRules.behaviourOf(it), trackUnits: it.trackUnits === true, returnRequired: it.returnRequired !== false,
            stockQuantity: it.stockQuantity, maxPerPerson: it.maxPerPerson, dueDays: it.dueDays || 0,
            guestsAllowed: it.guestsAllowed !== false, requiresEntry: it.requiresEntry === true,
            fee: it.feeTransactionTypeId ? (feeById.get(it.feeTransactionTypeId) || null) : null,
            units: itemUnits.map(utilityUnitDto),
            outCount: itemIssues.filter((i) => i.status === 'issued').reduce((sum, i) => sum + Number(i.quantity), 0),
            usedCount: itemIssues.filter((i) => i.status === 'used').reduce((sum, i) => sum + Number(i.quantity), 0),
            issues: itemIssues.map((i) => issueDto(i, { patron: patronById.get(i.patronId), unit: i.utilityUnitId ? utilityUnitById.get(i.utilityUnitId) : null, bill: billByIssue.get(i.id) || null }, nowDate)),
        };
    });
    const classesEnabled = setting.classesEnabled === true;
    const classSessions = classesEnabled ? await classSessionsOn(companyId, date) : [];
    return { date, dayType, clubNow: now, checkInOpenMinutes: setting.checkInOpenMinutes ?? 30, noShowControlled: !!cfg, noShowGraceMinutes: cfg ? cfg.graceMinutes : null, types: out, utilityItems: utilityOut, classesEnabled, classSessions, callerId };
}

// ---- slice 5b: the day's class sessions (the station's Classes view) ----------------

async function classSessionsOn(companyId, date) {
    const FacilityClassSession = require('./classSession.model');
    const FacilityClass = require('./class.model');
    const FacilityVenue = require('./venue.model');
    const FacilityInstructor = require('./instructor.model');
    const enrolment = require('./classEnrolment.service');
    const rows = await FacilityClassSession.findAll({
        where: { companyId, sessionDate: date, status: { [Op.ne]: 'cancelled' } },
        include: [
            { model: FacilityClass, as: 'Class', attributes: ['id', 'code', 'description', 'enrolmentMode', 'walkInAllowed', 'visitorsAllowed'] },
            { model: FacilityVenue, as: 'Venue', attributes: ['id', 'code', 'name'] },
            { model: FacilityInstructor, as: 'Instructor', attributes: ['id', 'code', 'name'] },
        ],
        order: [['startTime', 'ASC']],
    });
    const seats = await enrolment.seatsBySession(rows.map((r) => r.id));
    return rows.map((s) => ({
        id: s.id, classId: s.classId, class: s.Class ? s.Class.get({ plain: true }) : null,
        sessionDate: String(s.sessionDate), startTime: hhmm(s.startTime), endTime: hhmm(s.endTime),
        venue: s.Venue ? s.Venue.get({ plain: true }) : null, instructor: s.Instructor ? s.Instructor.get({ plain: true }) : null,
        capacity: s.capacity, seatsTaken: seats.get(s.id) || 0, status: s.status, heldAt: s.heldAt, remarks: s.remarks,
    }));
}

// A walk-in enrolment at the desk (channel 'station'; the class must allow walk-ins).
async function enrolWalkIn(req, body) {
    return require('./classEnrolment.service').enrol(req, body, { channel: 'station' });
}

// ---- slice 4 rules 2 + 3: mark booked slots as no-show ----------------------------

// Mark the given booked slots no-show (each must be past its start plus the
// grace), raising ONE charge per booking at its first no-show slot (a later
// slot of the same booking updates the quantity under the slot basis) and
// counting the strike; the charges post AFTER commit. Returns the summary.
async function markNoShows(req, { slotIds }) {
    const companyId = getUserContext(req).companyId;
    const ids = [...new Set((Array.isArray(slotIds) ? slotIds : []).map(String))];
    if (!ids.length) return { error: 'Pick at least one slot.' };
    const cfg = await noShow.config(companyId);
    if (!cfg) return { error: 'No-show control is off on Facility Specification.' };
    const { now } = await clock(companyId);
    const slots = await BookingSlot.findAll({ where: { companyId, id: { [Op.in]: ids }, status: 'booked' } });
    if (!slots.length) return { error: 'None of the slots is still booked - refresh the day.' };
    const bookingIds = [...new Set(slots.map((s) => s.bookingId))];
    const bookings = await Booking.findAll({ where: { companyId, id: { [Op.in]: bookingIds }, status: 'booked' } });
    const bookingById = new Map(bookings.map((b) => [b.id, b]));
    const typeIds = [...new Set(bookings.map((b) => b.facilityTypeId))];
    const types = await FacilityType.findAll({ where: { id: { [Op.in]: typeIds } } });
    const typeById = new Map(types.map((t) => [t.id, t]));
    const registered = new Set((await Registration.findAll({ where: { bookingSlotId: { [Op.in]: slots.map((s) => s.id) } }, attributes: ['bookingSlotId'] })).map((r) => r.bookingSlotId));
    for (const s of slots) {
        if (registered.has(s.id)) return { error: `The ${hhmm(s.startTime)} slot was checked in.` };
        if (bookingRules.minutesUntil(now, String(s.bookingDate), hhmm(s.startTime)) > -Number(cfg.graceMinutes || 0)) return { error: `The ${hhmm(s.startTime)} slot is inside its grace of ${cfg.graceMinutes} minutes - not a no-show yet.` };
        if (!bookingById.has(s.bookingId)) return { error: 'One of the bookings is no longer booked - refresh the day.' };
    }
    const stamps = await stampsFor(req);
    const callerId = getUserContext(req).userId;
    const raised = [];
    const suspensions = [];
    let marked = 0;
    await sequelize.transaction(async (transaction) => {
        for (const bookingId of bookingIds) {
            const booking = bookingById.get(bookingId);
            const type = typeById.get(booking.facilityTypeId);
            const mine = slots.filter((s) => s.bookingId === bookingId);
            const [n] = await BookingSlot.update({ status: 'no-show' }, { where: { id: { [Op.in]: mine.map((s) => s.id) }, status: 'booked' }, transaction });
            marked += n;
            if (!type || type.noShowChargeEnabled === false) continue;
            const facts = await shared.bookingFacts(booking, { transaction });
            const noShowSlots = facts.slots.filter((s) => s.row.status === 'no-show').length;
            const existing = await noShow.NoShowCharge.findOne({ where: { companyId, bookingId, chargeReason: 'no-show' }, transaction });
            if (existing) {
                if (cfg.basis === 'slot' && existing.status === 'pending' && existing.transactionTypeId) {
                    const re = await noShow.quote(req, cfg, { facilityTypeId: type.id, bookingDate: String(facts.shownSlots[0].bookingDate), slots: noShowSlots, participants: facts.roster.length }, { transaction });
                    if (!re.unpriced) {
                        Object.assign(existing, { quantity: re.quantity, unitAmount: re.unitAmount, amount: re.amount, taxAmount: re.taxAmount, taxBreakdown: re.taxBreakdown, totalAmount: re.totalAmount, updatedBy: callerId });
                        await existing.save({ transaction });
                    }
                }
                continue;
            }
            const priced = await noShow.quote(req, cfg, { facilityTypeId: type.id, bookingDate: String(facts.shownSlots[0].bookingDate), slots: noShowSlots, participants: facts.roster.length }, { transaction });
            const row = await noShow.raise({ req, booking, facts, chargeReason: 'no-show', priced, waive: null, strike: type.noShowStrikeEnabled === true, stamps, transaction });
            raised.push(row);
            const susp = await noShow.strike({ req, row, cfg, stamps, transaction });
            if (susp) suspensions.push(susp);
        }
    });
    // Post AFTER commit (the marks survive an AR hiccup).
    let posted = 0;
    const pending = [];
    for (const row of raised) {
        const r = await noShow.postPending(req, row);
        if (r.status === 'posted') posted += 1;
        else pending.push(`${r.bookingNo}: ${r.remarks}`);
    }
    for (const s of suspensions) await noShow.queueSuspensionEmail(s);
    const parts = [`${marked} slot${marked === 1 ? '' : 's'} recorded as no-show on ${bookingIds.length} booking${bookingIds.length === 1 ? '' : 's'}.`];
    if (posted) parts.push(`${posted} charge${posted === 1 ? '' : 's'} posted.`);
    if (pending.length) parts.push(`${pending.length} charge${pending.length === 1 ? '' : 's'} pending - ${pending.join('; ')}`);
    if (suspensions.length) parts.push(`${suspensions.length} member${suspensions.length === 1 ? '' : 's'} suspended from booking.`);
    return { message: parts.join(' '), marked, posted, pending: pending.length, suspended: suspensions.length };
}

// ---- shared pieces ---------------------------------------------------------------------

async function memberStanding(companyId, memberNo, label = 'Member') {
    const no = String(memberNo || '').trim();
    if (!no) return { error: `${label}: key in the member number.` };
    const s = await getGolfMemberStanding(companyId, no);
    if (!s) return { error: `${label}: no member found with number '${no}'.`, status: 404 };
    if (s.actionControl === 'barred') return { error: `${label}: member ${s.memberNo} (${s.statusLabel || 'status'}) is barred.` };
    return { standing: s };
}

// Resolve guest lines keyed at the door: every line is guest-like (visitor
// guest with a name, member-as-guest with a number).
async function resolveGuests(companyId, raw, types) {
    const lines = [];
    const list = Array.isArray(raw) ? raw : [];
    if (list.length > STATION_LIMITS.maxGuestsPerRegistration) return { error: 'Too many guests.' };
    for (let i = 0; i < list.length; i += 1) {
        const g = list[i] || {};
        const code = String(g.participantType || '');
        const t = participantTypes.findType(types, code);
        if (!t || t.isActive === false || !participantTypes.isGuestLike(types, code)) return { error: `Guest ${i + 1}: pick a guest participant type.` };
        if (participantTypes.hasMemberStanding(types, code)) {
            const r = await memberStanding(companyId, g.memberNo, `Guest ${i + 1}`);
            if (r.error) return r;
            lines.push({ sortOrder: i + 1, participantType: code, base: t.baseIdentity, standing: r.standing, name: r.standing.name, memberNo: r.standing.memberNo, visitor: null });
        } else {
            const name = String(g.name || '').trim();
            if (!name) return { error: `Guest ${i + 1}: key in the guest's name.` };
            // The phone input sends the bare dialling code when no number was keyed.
            const mobile = rules.hasMobile(g.mobile) ? String(g.mobile).replace(/[\s\-()]/g, '') : null;
            const email = String(g.email || '').trim() || null;
            lines.push({ sortOrder: i + 1, participantType: code, base: t.baseIdentity, standing: null, name, memberNo: null, passId: g.guestRegistrationId ? String(g.guestRegistrationId) : null, visitor: { name, identityNo: g.identityNo || null, mobile, email } });
        }
    }
    return { lines };
}

// Rule 3 - the guest verdict at the door for a host and a set of lines.
async function checkDoorGuests({ companyId, setting, type, guestRules, dayType, date, time, lines, host, types, transaction, excludeCurrent = 0 }) {
    if (!lines.length) return {};
    const visitors = lines.filter((l) => participantTypes.isVisitorGuest(types, l.participantType));
    const memberGuests = lines.filter((l) => l.base === 'member-guest');
    const verdict = bookingRules.resolveGuestRule({ setting, type, rules: guestRules, facilityTypeId: type.id, dayType, date, startTime: time });
    if (visitors.length && !verdict.allowGuest) return { error: `Visitor guests are not allowed on ${type.code} at ${time} on ${shared.bookingDateText(date)}.` };
    if (memberGuests.length && !verdict.allowMemberGuest) return { error: `Members as guests are not allowed on ${type.code} at ${time} on ${shared.bookingDateText(date)}.` };
    if (type.maxGuestsPerBooking != null && visitors.length > Number(type.maxGuestsPerBooking)) return { error: `At most ${type.maxGuestsPerBooking} visitor guest${Number(type.maxGuestsPerBooking) === 1 ? '' : 's'} per visit on ${type.code}.` };
    // Only the lines that would draw a NEW visit: a known guest (slice 6c) was
    // counted when the pass was registered.
    const draws = lines.filter((l) => !l.guestId).length;
    const allowance = await getGuestAllowanceStanding(companyId, host.memberId, date, { transaction });
    if (draws && allowance && allowance.allowance != null && allowance.remaining + excludeCurrent < draws) {
        return { error: `${host.name} (${host.memberNo}) has ${allowance.remaining + excludeCurrent} of ${allowance.allowance} monthly guest visits left - this entry needs ${draws}.` };
    }
    return { allowance };
}

// Slice 6c - give the visitor lines of an entry their identity before they
// are checked and written: a line standing on a day pass keeps it; a line
// keyed with a mobile or an email is registered with Membership (the pass a
// guest already holds with this host today is found, never doubled); a name
// alone stays a name unless the club insists on a contact. `keep` = the
// passes the entry's earlier lines stood on (pass id -> created here).
async function linkDoorGuests({ req, companyId, lines, host, date, door, warnings, transaction, keep = new Map() }) {
    for (const l of lines) {
        if (l.standing || !l.visitor) continue;
        const label = `Guest ${l.sortOrder}`;
        if (l.passId) {
            const pass = await getGuestPass(companyId, l.passId, { transaction });
            if (!pass || pass.status === 'cancelled' || pass.host.memberId !== host.memberId || pass.visitDate !== date) txFail(`${label}: that pass is not ${host.name}'s guest pass for today.`);
            Object.assign(l, { guestId: pass.guest.id, guestRegistrationId: pass.id, name: pass.guest.name, passCreatedHere: keep.get(pass.id) === true });
            if (pass.status === 'registered') await markGuestArrived(companyId, pass.id, { actorId: getUserContext(req).userId, transaction });
            continue;
        }
        const verdict = rules.doorGuestVerdict({ name: l.name, mobile: l.visitor.mobile, email: l.visitor.email, passEnabled: door.passEnabled, contactRequired: door.contactRequired });
        if (verdict.error) txFail(`${label}: ${verdict.error}`);
        if (verdict.mode !== 'pass') continue;
        const r = await registerGuestAtDoor(req, { memberId: host.memberId, visitDate: date, guest: { name: l.name, mobile: l.visitor.mobile, email: l.visitor.email }, channel: 'facility' }, { transaction });
        if (r.error) txFail(`${label}: ${r.error}`, r.status || 400);
        if (r.nameOnly) { if (!warnings.includes(r.warning)) warnings.push(r.warning); continue; }
        Object.assign(l, { guestId: r.pass.guest.id, guestRegistrationId: r.pass.id, name: r.pass.guest.name, passCreatedHere: r.created || keep.get(r.pass.id) === true });
    }
}

function doorOf(setting) {
    return { passEnabled: setting.doorGuestPassEnabled !== false, contactRequired: setting.doorGuestContactRequired === true };
}

async function attachGuestPatrons(companyId, lines, stamps, transaction) {
    for (const l of lines) {
        if (l.standing) l.patronId = (await patrons.ensureMemberPatron(companyId, l.standing, stamps, { transaction })).id;
        else if (l.visitor && (l.visitor.identityNo || l.visitor.mobile)) {
            const r = await patrons.ensureOtherPatron(companyId, l.visitor, stamps, { transaction });
            if (r.error) return r.error;
            l.patronId = r.patron.id;
        } else l.patronId = null;
    }
    return null;
}

// Write the guest rows of a registration and record one visit each.
async function writeGuests({ companyId, registration, lines, host, date, stamps, transaction }) {
    for (const l of lines) {
        const row = await RegistrationGuest.create({
            companyId, registrationId: registration.id, patronId: l.patronId || null, participantType: l.participantType, name: l.name, memberNo: l.memberNo, sortOrder: l.sortOrder,
            guestId: l.guestId || null, guestRegistrationId: l.guestRegistrationId || null, passCreatedHere: l.passCreatedHere === true,
        }, { transaction });
        // A known guest's line names the guest, so it joins the once-per-day rule.
        const visit = await recordGuestVisit(companyId, { memberId: host.memberId, visitDate: date, sourceModule: 'facility', sourceRef: row.id, guestId: l.guestId || null, guestName: l.name, guestCount: 1, stamps }, { transaction });
        if (visit && visit.id) { row.guestVisitId = visit.id; await row.save({ transaction }); }
    }
    registration.guestCount = lines.length;
    await registration.save({ transaction });
}

async function voidGuests(companyId, registrationId, { transaction }) {
    const rows = await RegistrationGuest.findAll({ where: { registrationId }, transaction });
    for (const g of rows) if (g.guestVisitId) await voidGuestVisit(companyId, 'facility', g.id, { transaction });
    if (rows.length) await RegistrationGuest.destroy({ where: { registrationId }, transaction });
}

async function issueRegistrationNo(req, { transaction }) {
    const issued = await numberingGateway.issueNumber(req, 'facility-registration', { transaction });
    if (issued && issued.number) return { no: issued.number };
    if (issued && issued.manual) return { no: `R-${crypto.randomUUID().slice(0, 8).toUpperCase()}` };
    return { error: 'Configure the Registration No. numbering scheme first (Facility Management - Numbering Control).' };
}

// Open the bill of a walk-in entry: the facility fee once (per entry), the
// guest fee per guest line. Returns { bill } | { error }; a missing default
// item is a warning, a missing price refuses.
async function openEntryBill({ req, companyId, registration, type, patron, lines, date, dayType, sessionId, sessionName, stamps, warnings, transaction }) {
    const types = await TransactionType.findAll({ where: { companyId }, transaction });
    const feeType = pricing.defaultTypeFor(types, { chargeType: 'facility-fee', participantType: 'member', facilityTypeId: type.id, explicitId: type.feeTransactionTypeId });
    const guestFees = lines.map((l) => ({ line: l, type: pricing.defaultTypeFor(types, { chargeType: 'guest-fee', participantType: l.participantType, facilityTypeId: type.id, explicitId: type.guestFeeTransactionTypeId }) }));
    if (!feeType && !guestFees.some((g) => g.type)) {
        if (!feeType) warnings.push(`No active facility-fee item is the default for members on ${type.code} - nothing to bill for this entry.`);
        return { bill: null };
    }
    const issued = await billing.issueBillNo(req, { transaction });
    if (issued.error) return { error: issued.error };
    const bill = await billing.Bill.create({ companyId, billNo: issued.billNo, registrationId: registration.id, patronId: patron.id, billDate: date, status: 'open', ...stamps }, { transaction });
    if (feeType) {
        const added = await billing.addItem({ req, bill, type: feeType, quantity: 1, stamps, transaction, context: { date, dayType, sessionId, sessionName, participantType: 'member' } });
        if (added.error) return { error: added.error };
    } else warnings.push(`No active facility-fee item is the default for members on ${type.code} - the entry fee was not auto-charged.`);
    for (const g of guestFees) {
        if (!g.type) { warnings.push(`No active guest-fee item is the default for '${g.line.participantType}' on ${type.code} - ${g.line.name}'s guest fee was not auto-charged.`); continue; }
        const added = await billing.addItem({ req, bill, type: g.type, quantity: 1, stamps, transaction, context: { date, dayType, sessionId, sessionName, participantType: g.line.participantType } });
        if (added.error) return { error: `${g.line.name}: ${added.error}` };
    }
    await billing.recomputeTotals(bill, transaction);
    return { bill };
}

// ---- rule 1: check-in ----------------------------------------------------------------------

async function checkIn(req, { bookingSlotId, droppedParticipantIds = [] }) {
    const companyId = getUserContext(req).companyId;
    const slot = await BookingSlot.findOne({ where: { companyId, id: bookingSlotId } });
    if (!slot) return { error: 'Slot not found.', status: 404 };
    if (slot.status === 'checked-in') return { error: 'This slot is already checked in.' };
    if (slot.status !== 'booked') return { error: `This slot is ${slot.status}.` };
    const booking = await Booking.findOne({ where: { companyId, id: slot.bookingId } });
    if (!booking || booking.status !== 'booked') return { error: `Booking ${booking ? booking.bookingNo : ''} is ${booking ? booking.status : 'missing'} - only a booked booking checks in.` };
    const [{ now }, { setting }, type] = await Promise.all([clock(companyId), availability.loadRules(companyId), FacilityType.findOne({ where: { id: booking.facilityTypeId } })]);
    const state = rules.checkInState(now, { bookingDate: String(slot.bookingDate), startTime: hhmm(slot.startTime), endTime: hhmm(slot.endTime) }, setting.checkInOpenMinutes ?? 30);
    if (state === 'early') return { error: `Check-in for ${hhmm(slot.startTime)} opens ${setting.checkInOpenMinutes ?? 30} minutes before the slot (club time ${now.time}).` };
    if (state === 'closed') return { error: `The ${hhmm(slot.startTime)} slot has ended - it can no longer be checked in.` };
    const stamps = await stampsFor(req);
    const result = await runTx(sequelize, async (transaction) => {
        const no = await issueRegistrationNo(req, { transaction });
        if (no.error) txFail(no.error);
        // Drop the guests who failed to show (every slot of the booking,
        // matched by sort order) and void their visits.
        const dropped = Array.isArray(droppedParticipantIds) ? droppedParticipantIds.map(String) : [];
        if (dropped.length) {
            const first = await BookingParticipant.findAll({ where: { id: { [Op.in]: dropped }, bookingSlotId: slot.id }, transaction });
            const orders = first.map((p) => p.sortOrder);
            const slotIds = (await BookingSlot.findAll({ where: { bookingId: booking.id }, attributes: ['id'], transaction })).map((s) => s.id);
            const rows = await BookingParticipant.findAll({ where: { bookingSlotId: { [Op.in]: slotIds }, sortOrder: { [Op.in]: orders }, isHost: false }, transaction });
            for (const p of rows) if (p.guestVisitId) await voidGuestVisit(companyId, 'facility', p.id, { transaction });
            if (rows.length) await BookingParticipant.destroy({ where: { id: { [Op.in]: rows.map((p) => p.id) } }, transaction });
        }
        const registration = await Registration.create({
            companyId, registrationNo: no.no, patronId: booking.bookerPatronId, facilityTypeId: booking.facilityTypeId, facilityId: slot.facilityId,
            bookingSlotId: slot.id, registrationDate: slot.bookingDate, timeIn: new Date(), dayType: slot.dayType, sessionId: slot.sessionId, status: 'in', ...stamps,
        }, { transaction });
        slot.status = 'checked-in';
        slot.checkedInAt = new Date();
        await slot.save({ transaction });
        return { registration };
    });
    if (result.error) return result;
    return { message: `${type ? type.code : ''} ${hhmm(slot.startTime)} checked in - registration ${result.registration.registrationNo}.`, registrationId: result.registration.id };
}

// ---- rules 2 + 3 + 8: a walk-in entry ------------------------------------------------------

async function register(req, body) {
    const companyId = getUserContext(req).companyId;
    const type = await FacilityType.findOne({ where: { companyId, id: String(body.facilityTypeId || ''), usageMode: 'entry', isActive: true } });
    if (!type) return { error: 'Pick an entry facility type.' };
    let unit = null;
    if (body.facilityId) {
        unit = await Facility.findOne({ where: { companyId, id: String(body.facilityId), facilityTypeId: type.id, isActive: true } });
        if (!unit) return { error: 'Pick a facility of that type.' };
    }
    const m = await memberStanding(companyId, body.memberNo);
    if (m.error) return m;
    const standing = m.standing;
    const [{ now }, { setting, sessions, guestRules }, ptypes] = await Promise.all([clock(companyId), availability.loadRules(companyId), participantTypes.catalog(companyId)]);
    const date = now.date;
    const dayType = await shared.dayTypeOf(companyId, date);
    const hours = rules.openingHours(type, dayType);
    if (!rules.isOpenAt(hours, now.time)) return { error: `${type.code} is closed at ${now.time} (open ${hhmm(dayType === 'weekend' ? type.openTimeWeekend : type.openTimeWeekday) || '00:00'} to ${hhmm(dayType === 'weekend' ? type.closeTimeWeekend : type.closeTimeWeekday) || '24:00'}).` };
    const units = await availability.unitsOf(companyId, type.id);
    const blocks = await availability.closureBlocks(companyId, type.id, units.map((u) => u.id), date);
    const nowMin = toMinutes(now.time);
    const targets = unit ? [unit.id] : units.map((u) => u.id);
    if (targets.length && targets.every((id) => bookingRules.isBlocked(blocks.get(id) || [], nowMin, nowMin + 1))) return { error: `${unit ? unit.code : type.code} is closed right now.` };
    const guests = await resolveGuests(companyId, body.guests, ptypes);
    if (guests.error) return guests;
    const { lines } = guests;
    if (type.entryRequiresBooking) {
        const patron = await Patron.findOne({ where: { companyId, patronType: 'member', sourceId: standing.memberId }, attributes: ['id'] });
        const held = patron ? await BookingSlot.count({ where: { companyId, bookingDate: date, status: { [Op.in]: ACTIVE_SLOT_STATUS_KEYS } }, include: [{ model: Booking, as: 'Booking', where: { bookerPatronId: patron.id, status: 'booked' } }] }) : 0;
        if (!held) return { error: `${type.code} admits members holding a booking today - ${standing.name} has none.` };
    }
    const session = bookingRules.sessionOf(sessions, `${now.time}:00`);
    const stamps = await stampsFor(req);
    const warnings = [];
    const result = await runTx(sequelize, async (transaction) => {
        const regs = await Registration.findAll({ where: { companyId, facilityTypeId: type.id, registrationDate: date, status: 'in', bookingSlotId: null, ...(unit && unit.capacity != null ? { facilityId: unit.id } : {}) }, transaction, lock: transaction.LOCK.UPDATE });
        const capacity = unit && unit.capacity != null ? unit.capacity : type.capacity;
        const capError = rules.capacityVerdict({ count: rules.liveCount(regs), arriving: 1 + lines.length, capacity, label: unit && unit.capacity != null ? unit.code : type.code });
        if (capError) txFail(capError);
        // Slice 6d: guests already inside ahead of this member hold the entry -
        // the member joins it from the Serve panel rather than opening a second.
        const ahead = await Patron.findOne({ where: { companyId, patronType: 'member', sourceId: standing.memberId }, attributes: ['id'], transaction });
        if (ahead && regs.some((x) => x.patronId === ahead.id && x.hostPresent === false)) txFail(`${standing.name}'s guests are already inside ${type.code} - admit ${standing.name} from the Serve panel (key the member number in the scan box).`);
        await linkDoorGuests({ req, companyId, lines, host: standing, date, door: doorOf(setting), warnings, transaction });
        const g = await checkDoorGuests({ companyId, setting, type, guestRules, dayType, date, time: now.time, lines, host: standing, types: ptypes, transaction });
        if (g.error) txFail(g.error);
        const patron = await patrons.ensureMemberPatron(companyId, standing, stamps, { transaction });
        const pErr = await attachGuestPatrons(companyId, lines, stamps, transaction);
        if (pErr) txFail(pErr);
        const no = await issueRegistrationNo(req, { transaction });
        if (no.error) txFail(no.error);
        const registration = await Registration.create({
            companyId, registrationNo: no.no, patronId: patron.id, facilityTypeId: type.id, facilityId: unit ? unit.id : null, bookingSlotId: null,
            registrationDate: date, timeIn: new Date(), dayType, sessionId: session ? session.id : null, status: 'in', remarks: body.remarks ? String(body.remarks).slice(0, 255) : null, ...stamps,
        }, { transaction });
        await writeGuests({ companyId, registration, lines, host: standing, date, stamps, transaction });
        const billed = await openEntryBill({ req, companyId, registration, type, patron, lines, date, dayType, sessionId: session ? session.id : null, sessionName: session ? session.name : null, stamps, warnings, transaction });
        if (billed.error) txFail(billed.error);
        if (billed.bill) { registration.billId = billed.bill.id; await registration.save({ transaction }); }
        return { registration };
    });
    if (result.error) return result;
    return { message: `${standing.name} registered on ${type.code}${lines.length ? ` with ${lines.length} guest${lines.length === 1 ? '' : 's'}` : ''} - ${result.registration.registrationNo}.`, registrationId: result.registration.id, warnings, standingWarning: standing.actionControl === 'warning' ? `Member ${standing.memberNo} is ${standing.statusLabel || 'under warning'}.` : null };
}

// ---- rule 4: sign-out ------------------------------------------------------------------------

async function signOut(req, id) {
    const companyId = getUserContext(req).companyId;
    const r = await Registration.findOne({ where: { companyId, id } });
    if (!r) return { error: 'Registration not found.', status: 404 };
    if (r.status !== 'in') return { error: 'Already signed out.' };
    r.status = 'out';
    r.timeOut = new Date();
    r.updatedBy = getUserContext(req).userId;
    await r.save();
    const openBill = r.billId ? await billing.Bill.findOne({ where: { id: r.billId, status: 'open' }, attributes: ['billNo'] }) : null;
    // Slice 6d: sign-out never blocks, but it says what the party still holds.
    const stillOut = await partyItemsOut(companyId, r);
    const outNote = stillOut.length ? ` Still out: ${stillOut.map((x) => `${x.label} (${x.holder})`).join(', ')}.` : '';
    return { message: `${r.registrationNo} signed out.${openBill ? ` Bill ${openBill.billNo} is still open.` : ''}${outNote}`, stillOut };
}

// Replace the guests of a live entry (rule 3 re-run; visits follow).
async function replaceGuests(req, id, body) {
    const companyId = getUserContext(req).companyId;
    const r = await Registration.findOne({ where: { companyId, id } });
    if (!r) return { error: 'Registration not found.', status: 404 };
    if (r.status !== 'in') return { error: 'The entry is signed out - its guests are closed.' };
    if (r.bookingSlotId) return { error: 'A checked-in slot carries its booking\'s roster - edit the booking\'s participants instead.' };
    const [type, patron, { now }, { setting, guestRules }, ptypes] = await Promise.all([
        FacilityType.findOne({ where: { id: r.facilityTypeId } }), Patron.findOne({ where: { id: r.patronId } }), clock(companyId), availability.loadRules(companyId), participantTypes.catalog(companyId),
    ]);
    const standing = patron && patron.memberNo ? await getGolfMemberStanding(companyId, patron.memberNo) : null;
    if (!standing) return { error: 'The host member could not be resolved.' };
    const guests = await resolveGuests(companyId, body.guests, ptypes);
    if (guests.error) return guests;
    const { lines } = guests;
    const stamps = await stampsFor(req);
    const warnings = [];
    const result = await runTx(sequelize, async (transaction) => {
        const regs = await Registration.findAll({ where: { companyId, facilityTypeId: type.id, registrationDate: r.registrationDate, status: 'in', bookingSlotId: null }, transaction, lock: transaction.LOCK.UPDATE });
        const current = Number(r.guestCount || 0);
        // Slice 6c: the passes and the names the entry's lines stood on.
        const before = await RegistrationGuest.findAll({ where: { registrationId: r.id }, transaction });
        const keep = new Map(before.filter((b) => b.guestRegistrationId).map((b) => [b.guestRegistrationId, b.passCreatedHere === true]));
        const hostIn = r.hostPresent === false ? 0 : 1;
        const capError = rules.capacityVerdict({ count: rules.liveCount(regs) - (hostIn + current), arriving: hostIn + lines.length, capacity: type.capacity, label: type.code });
        if (capError) txFail(capError);
        await voidGuests(companyId, r.id, { transaction });
        await linkDoorGuests({ req, companyId, lines, host: standing, date: String(r.registrationDate), door: doorOf(setting), warnings, transaction, keep });
        const g = await checkDoorGuests({ companyId, setting, type, guestRules, dayType: r.dayType, date: String(r.registrationDate), time: now.time, lines, host: standing, types: ptypes, transaction });
        if (g.error) txFail(g.error);
        const pErr = await attachGuestPatrons(companyId, lines, stamps, transaction);
        if (pErr) txFail(pErr);
        await writeGuests({ companyId, registration: r, lines, host: standing, date: String(r.registrationDate), stamps, transaction });
        // Rule 9: a guest taken off the entry must hold nothing, and the
        // pass the station created for them is cancelled (one registered
        // upfront is never cancelled here).
        const stays = new Set(lines.map((l) => l.guestRegistrationId).filter(Boolean));
        const stayNames = new Set(lines.filter((l) => !l.guestRegistrationId && !l.standing).map((l) => l.name.toLowerCase()));
        for (const b of before) {
            if (b.guestRegistrationId) {
                if (stays.has(b.guestRegistrationId)) continue;
                if (await IssueRecord.count({ where: { companyId, guestRegistrationId: b.guestRegistrationId, status: 'issued' }, transaction })) txFail(`${b.name} still holds an item - take it back before removing them from the entry.`);
                if (b.passCreatedHere === true) await cancelGuestAtDoor(companyId, b.guestRegistrationId, { channel: 'facility', actorId: getUserContext(req).userId, reason: 'Removed from the entry at the facility station', transaction });
            } else if (!b.memberNo && !stayNames.has(String(b.name).toLowerCase())) {
                if (await IssueRecord.count({ where: { companyId, patronId: r.patronId, guestRegistrationId: null, holderName: sameName(b.name), status: 'issued' }, transaction })) txFail(`${b.name} still holds an item - take it back before removing them from the entry.`);
            }
        }
        return {};
    });
    if (result.error) return result;
    return { message: `Guests saved on ${r.registrationNo}.`, warnings };
}

// ---- rule 5: issue (a utility item, slice 6a; the holder, slice 6b) --------------------------

// Who the desk serves (slice 6b): a guest on the pass - the host named on it
// is the responsible member - or a member on their own number. `code` is
// whatever was scanned or keyed into the scan box. Slice 6c adds the guest
// WITHOUT a pass, served by name together with the member: `memberNo` with
// `guestName` (pass stays null). Returns { error } or
// { isGuest, pass, standing, holderName, participantType }.
async function resolveHolder(companyId, { code = null, guestRegistrationId = null, memberNo = null, guestName = null } = {}) {
    let pass = null;
    let number = memberNo ? String(memberNo).trim() : '';
    let scanned = false;
    if (guestRegistrationId) {
        pass = await getGuestPass(companyId, String(guestRegistrationId));
        if (!pass) return { error: 'That guest pass was not found.', status: 404 };
    } else if (code !== null && code !== undefined && !number) {
        const kind = rules.scanKind(code);
        if (!kind) return { error: 'Scan a guest pass or key a member number.' };
        scanned = true;
        if (kind === 'pass') {
            pass = await findGuestPass(companyId, String(code));
            if (!pass) return { error: rules.passVerdict(null), status: 404 };
        } else number = String(code).trim();
    }
    if (pass) {
        const refusal = rules.passVerdict(pass);
        if (refusal) return { error: refusal };
        const host = await memberStanding(companyId, pass.host.memberNo, 'Host');
        if (host.error) return host;
        return { isGuest: true, pass, standing: host.standing, holderName: pass.guest.name, participantType: 'guest' };
    }
    if (scanned && !(await getGolfMemberStanding(companyId, number))) {
        return { error: `'${number.slice(0, 50)}' is not a guest pass of this club or a member number.`, status: 404 };
    }
    const m = await memberStanding(companyId, number);
    if (m.error) return m;
    const byName = guestName ? String(guestName).trim().slice(0, 255) : '';
    if (byName) return { isGuest: true, pass: null, standing: m.standing, holderName: byName, participantType: 'guest' };
    return { isGuest: false, pass: null, standing: m.standing, holderName: m.standing.name, participantType: 'member' };
}

// A name matched as keyed, whatever its capitals.
function sameName(name) {
    return { [Op.iLike]: String(name || '').replace(/[\\%_]/g, (c) => `\\${c}`) };
}

// The rows that belong to the person served: a guest's by the pass, a guest
// without one by the host and the name, a member's by the patron with no
// guest named.
function holderWhere(who, patronId) {
    if (who.isGuest && who.pass) return { guestRegistrationId: who.pass.id };
    if (who.isGuest) return { patronId, guestRegistrationId: null, holderName: sameName(who.holderName) };
    return { patronId, guestRegistrationId: null, holderName: null };
}

// A guest served by NAME is known to the day only through what the desk
// recorded for them: an item under the same host and name that was not
// undone, or a line of that name on one of the host's entries today. Either
// means the visit already drew on the host's allowance.
async function nameGuestCounted(companyId, patronId, name, date, startOfDay, { transaction, exceptIssueId = null } = {}) {
    if (!patronId) return false;
    const where = {
        companyId, patronId, guestRegistrationId: null, holderName: sameName(name), issuedAt: { [Op.gte]: startOfDay },
        [Op.or]: [{ remarks: null }, { remarks: { [Op.ne]: rules.UNDONE_REMARK } }],
    };
    if (exceptIssueId) where.id = { [Op.ne]: exceptIssueId };
    if (await IssueRecord.count({ where, transaction })) return true;
    const entries = await Registration.findAll({ where: { companyId, patronId, registrationDate: date }, attributes: ['id'], transaction });
    if (!entries.length) return false;
    return (await RegistrationGuest.count({ where: { registrationId: { [Op.in]: entries.map((e) => e.id) }, name: sameName(name), guestVisitId: { [Op.ne]: null } }, transaction })) > 0;
}

function allowanceRefusal(standing, allowance) {
    return allowance.allowance === 0
        ? `${standing.name} (${standing.memberNo}) may not bring guests under their membership type.`
        : `${standing.name} (${standing.memberNo}) has used all ${allowance.allowance} guest visits of the month.`;
}

// The undo of a name-only guest's item: once nothing of theirs is left for
// the day, the visit it drew is voided (whichever of their records carries it).
async function releaseNameGuestVisit(companyId, row, startOfDay, { transaction, updatedBy, date }) {
    const all = await IssueRecord.findAll({
        where: { companyId, patronId: row.patronId, guestRegistrationId: null, holderName: sameName(row.holderName), issuedAt: { [Op.gte]: startOfDay } },
        attributes: ['id', 'remarks'], transaction,
    });
    if (all.some((r) => r.id !== row.id && r.remarks !== rules.UNDONE_REMARK)) return;
    // A guest who also stands on one of the host's entries today is still a visit.
    const entries = await Registration.findAll({ where: { companyId, patronId: row.patronId, registrationDate: date }, attributes: ['id'], transaction });
    if (entries.length && await RegistrationGuest.count({ where: { registrationId: { [Op.in]: entries.map((e) => e.id) }, guestRegistrationId: null, name: sameName(row.holderName) }, transaction })) return;
    for (const r of all) await voidGuestVisit(companyId, 'facility', r.id, { transaction, updatedBy });
}

// Whether the person served is inside a facility today: the member on an
// entry of their own, a guest on a line of one of the host's entries (found
// by the pass, or by the name for a guest without one).
async function isInside(companyId, who, patronId, date, { transaction } = {}) {
    if (!patronId) return false;
    const live = await Registration.findAll({ where: { companyId, patronId, registrationDate: date, status: 'in' }, attributes: ['id', 'hostPresent'], transaction });
    if (!who.isGuest) return live.some((r) => r.hostPresent !== false);
    if (!live.length) return false;
    const line = who.pass ? { guestRegistrationId: who.pass.id } : { guestRegistrationId: null, memberNo: null, name: sameName(who.holderName) };
    return (await RegistrationGuest.count({ where: { registrationId: { [Op.in]: live.map((r) => r.id) }, ...line }, transaction })) > 0;
}

function standingWarningOf(standing) {
    return standing.actionControl === 'warning' ? `Member ${standing.memberNo} is ${standing.statusLabel || 'under warning'}.` : null;
}

// `body` = { utilityItemId, utilityUnitId (a numbered item; none = the next
// available), quantity (a counted item), the holder (memberNo, OR
// guestRegistrationId for a guest on a pass, OR memberNo with guestName for a
// guest served by name with the member), registrationId, remarks, panel
// (answer with the refreshed Serve panel) }. A use-only item closes as 'used'
// at once. A guest served by name draws ONE visit on the host's monthly
// allowance for the day, at their first item.
async function issue(req, body) {
    const companyId = getUserContext(req).companyId;
    const item = await UtilityItem.findOne({ where: { companyId, id: String(body.utilityItemId || ''), isActive: true } });
    if (!item) return { error: 'Pick a utility item.' };
    const behaviour = utilityRules.behaviourOf(item);
    const who = await resolveHolder(companyId, { guestRegistrationId: body.guestRegistrationId, memberNo: body.memberNo, guestName: body.guestName });
    if (who.error) return who;
    const standing = who.standing;
    if (who.isGuest && item.guestsAllowed === false) return { error: `${item.code} is for members only.` };
    const { now, timezone } = await clock(companyId);
    const date = now.date;
    const dayType = await shared.dayTypeOf(companyId, date);
    const quantity = behaviour === 'quantity' ? Number(body.quantity || 1) : 1;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > STATION_LIMITS.maxIssueQuantity) return { error: `Quantity must be between 1 and ${STATION_LIMITS.maxIssueQuantity}.` };
    const stamps = await stampsFor(req);
    const warnings = [];
    const startOfDay = localToDate(`${date}T00:00`, timezone);
    const result = await runTx(sequelize, async (transaction) => {
        let unit = null;
        if (behaviour === 'units') {
            const wanted = body.utilityUnitId ? String(body.utilityUnitId) : null;
            const candidates = await UtilityUnit.findAll({ where: { companyId, utilityItemId: item.id, isActive: true, unitStatus: 'available', ...(wanted ? { id: wanted } : {}) }, order: [['sortOrder', 'ASC'], ['code', 'ASC']], limit: 1, transaction, lock: transaction.LOCK.UPDATE });
            unit = candidates[0] || null;
            if (!unit) txFail(wanted ? 'That unit is not available.' : `No ${item.code} unit is available right now.`);
        }
        const patron = await patrons.ensureMemberPatron(companyId, standing, stamps, { transaction });
        const mine = holderWhere(who, patron.id);
        if (item.requiresEntry === true && !(await isInside(companyId, who, patron.id, date, { transaction }))) {
            txFail(`${item.code} is only for a person inside a facility today.`);
        }
        // The limit is per HOLDER: what the person holds now, or (a use-only
        // item) what they have used today.
        const liveWhere = behaviour === 'use'
            ? { companyId, utilityItemId: item.id, status: 'used', ...mine, issuedAt: { [Op.gte]: startOfDay } }
            : { companyId, utilityItemId: item.id, status: 'issued', ...mine };
        const live = await IssueRecord.findAll({ where: liveWhere, attributes: ['quantity'], transaction });
        const held = live.reduce((sum, i) => sum + Number(i.quantity || 1), 0);
        const unitWord = behaviour === 'units' ? `${item.code} units` : `${item.code} pieces`;
        const limitError = rules.issueLimitVerdict({ held, taking: quantity, limit: Number(item.maxPerPerson || 0), name: who.holderName, unitWord, usedToday: behaviour === 'use' ? item.code : null });
        if (limitError) txFail(limitError);
        const issuedAt = new Date();
        const dueBack = behaviour === 'use' ? issuedAt : localToDate(rules.dueBackLocal({ issueDate: date, dueDays: item.dueDays || 0, hours: null }), timezone);
        const record = await IssueRecord.create({
            companyId, patronId: patron.id, utilityItemId: item.id, utilityUnitId: unit ? unit.id : null, registrationId: body.registrationId ? String(body.registrationId) : null,
            holderName: who.isGuest ? String(who.holderName || '').slice(0, 255) : null, guestRegistrationId: who.isGuest && who.pass ? who.pass.id : null,
            quantity, issuedAt, dueBack, status: behaviour === 'use' ? 'used' : 'issued', remarks: body.remarks ? String(body.remarks).slice(0, 255) : null, ...stamps,
        }, { transaction });
        if (unit) {
            unit.unitStatus = 'issued';
            unit.currentIssueId = record.id;
            unit.updatedBy = stamps.updatedBy;
            await unit.save({ transaction });
        }
        if (who.isGuest && !who.pass && !(await nameGuestCounted(companyId, patron.id, who.holderName, date, startOfDay, { transaction, exceptIssueId: record.id }))) {
            // The first item of the day of a guest served by name: one visit
            // on the host's allowance (a guest on a pass was counted when the
            // pass was registered).
            const allowance = await getGuestAllowanceStanding(companyId, standing.memberId, date, { transaction });
            if (allowance && allowance.allowance != null && allowance.remaining < 1) txFail(allowanceRefusal(standing, allowance));
            await recordGuestVisit(companyId, { memberId: standing.memberId, visitDate: date, sourceModule: 'facility', sourceRef: record.id, guestName: who.holderName, guestCount: 1, stamps }, { transaction });
        }
        if (item.feeTransactionTypeId) {
            const feeType = await TransactionType.findOne({ where: { companyId, id: item.feeTransactionTypeId, isActive: true }, transaction });
            if (!feeType) warnings.push(`${item.code}'s fee item is missing or disabled - no fee was charged.`);
            else {
                // ONE open bill per person per day (slice 6b): the first paid
                // item opens it in the responsible member's name, the next ones
                // add their lines to it while it is open.
                const earlier = await IssueRecord.findAll({ where: { companyId, ...mine, feeBillId: { [Op.ne]: null }, issuedAt: { [Op.gte]: startOfDay } }, attributes: ['feeBillId'], transaction });
                const billIds = [...new Set([...earlier.map((e) => e.feeBillId), ...(who.isGuest ? [] : await entryBillIds(companyId, patron.id, date, { transaction }))])];
                let bill = billIds.length
                    ? await billing.Bill.findOne({ where: { companyId, id: { [Op.in]: billIds }, status: 'open', billDate: date }, order: [['createdAt', 'DESC']], transaction, lock: transaction.LOCK.UPDATE })
                    : null;
                if (!bill) {
                    const issued = await billing.issueBillNo(req, { transaction });
                    if (issued.error) txFail(issued.error);
                    bill = await billing.Bill.create({ companyId, billNo: issued.billNo, issueRecordId: record.id, patronId: patron.id, billDate: date, status: 'open', ...stamps }, { transaction });
                }
                const added = await billing.addItem({ req, bill, type: feeType, quantity, stamps, transaction, context: { date, dayType, sessionId: null, sessionName: null, participantType: who.participantType } });
                if (added.error) txFail(added.error);
                await billing.recomputeTotals(bill, transaction);
                record.feeBillId = bill.id;
                await record.save({ transaction });
            }
        }
        return { record, unit };
    });
    if (result.error) return result;
    // Serving a guest IS the arrival, however the request came in.
    if (who.isGuest && who.pass && who.pass.status === 'registered') await markGuestArrived(companyId, who.pass.id, { actorId: getUserContext(req).userId });
    const to = who.isGuest ? `${who.holderName}, guest of ${standing.name}` : standing.name;
    const message = behaviour === 'units' ? `${result.unit.code} issued to ${to}.`
        : behaviour === 'use' ? `${item.code} recorded for ${to}.`
            : `${quantity} ${item.code} issued to ${to}.`;
    const out = { message, issueId: result.record.id, warnings };
    if (body.panel === true) out.panel = await servePicture(req, who);
    return out;
}

// ---- rule 6: return ------------------------------------------------------------------------------

async function returnIssue(req, id, body) {
    const companyId = getUserContext(req).companyId;
    const record = await IssueRecord.findOne({ where: { companyId, id } });
    if (!record) return { error: 'Issue record not found.', status: 404 };
    if (record.status === 'used') return { error: 'A use has nothing to return.' };
    if (record.status !== 'issued') return { error: `Already ${record.status}.` };
    const item = await UtilityItem.findOne({ where: { id: record.utilityItemId } });
    const trackUnits = item ? item.trackUnits === true : !!record.utilityUnitId;
    const outcome = rules.returnOutcome({ condition: String(body.condition || ''), quantity: record.quantity, returnedQuantity: body.returnedQuantity, trackUnits });
    if (outcome.error) return { error: outcome.error };
    const callerId = getUserContext(req).userId;
    await sequelize.transaction(async (transaction) => {
        record.status = outcome.status;
        record.returnedAt = new Date();
        record.returnedQuantity = outcome.returnedQuantity;
        record.returnCondition = String(body.condition);
        record.remarks = body.remarks ? String(body.remarks).slice(0, 255) : record.remarks;
        record.updatedBy = callerId;
        await record.save({ transaction });
        if (trackUnits && record.utilityUnitId) {
            await UtilityUnit.update({ unitStatus: outcome.unitStatus, currentIssueId: null, updatedBy: callerId }, { where: { id: record.utilityUnitId }, transaction });
        }
    });
    const lost = outcome.lostQuantity ? ` ${outcome.lostQuantity} lost - charge it from the bill's tiles if the club bills losses.` : '';
    // The message names what came back: the unit's number, or the item's code.
    const unit = record.utilityUnitId ? await UtilityUnit.findOne({ where: { id: record.utilityUnitId }, attributes: ['code'] }) : null;
    const what = unit ? unit.code : (item ? item.code : 'Item');
    const out = { message: `${what} returned${outcome.unitStatus === 'out-of-service' ? ' - the unit is out of service until cleared' : ''}.${lost}` };
    if (body.panel === true) out.panel = await panelOfRecord(req, record);
    return out;
}

async function clearUnit(req, unitId) {
    const companyId = getUserContext(req).companyId;
    const unit = await UtilityUnit.findOne({ where: { companyId, id: unitId } });
    if (!unit) return { error: 'Unit not found.', status: 404 };
    if (unit.unitStatus !== 'out-of-service') return { error: `${unit.code} is ${unit.unitStatus}.` };
    unit.unitStatus = 'available';
    unit.updatedBy = getUserContext(req).userId;
    await unit.save();
    return { message: `${unit.code} is available again.` };
}

// ---- slice 6b: scan and serve -------------------------------------------------------------------

// The Serve panel of one person: who they are, what they hold, and one tile
// per active utility item stating whether it can be tapped and what it
// bills. The same checks run again when a tile is tapped (issue()).
async function servePicture(req, who, { firstScan = false } = {}) {
    const companyId = getUserContext(req).companyId;
    const { now, timezone } = await clock(companyId);
    const date = now.date;
    const startOfDay = localToDate(`${date}T00:00`, timezone);
    const [dayType, patron, items] = await Promise.all([
        shared.dayTypeOf(companyId, date),
        Patron.findOne({ where: { companyId, patronType: 'member', sourceId: who.standing.memberId } }),
        UtilityItem.findAll({ where: { companyId, isActive: true }, order: [['sortOrder', 'ASC'], ['code', 'ASC']] }),
    ]);
    const known = !!(who.isGuest && who.pass) || !!patron;
    const mine = known ? await IssueRecord.findAll({
        where: { companyId, ...holderWhere(who, patron ? patron.id : null), [Op.or]: [{ status: 'issued' }, { issuedAt: { [Op.gte]: startOfDay } }] },
        order: [['issuedAt', 'ASC']],
    }) : [];
    const itemById = new Map(items.map((it) => [it.id, it]));
    const unitIds = [...new Set(mine.map((i) => i.utilityUnitId).filter(Boolean))];
    const numbered = items.filter((it) => it.trackUnits === true).map((it) => it.id);
    const [heldUnits, freeUnits] = await Promise.all([
        unitIds.length ? UtilityUnit.findAll({ where: { id: { [Op.in]: unitIds } } }) : [],
        numbered.length ? UtilityUnit.findAll({ where: { companyId, utilityItemId: { [Op.in]: numbered }, isActive: true, unitStatus: 'available' }, order: [['sortOrder', 'ASC'], ['code', 'ASC']] }) : [],
    ]);
    const unitById = new Map(heldUnits.map((u) => [u.id, u]));
    const billIds = [...new Set([...mine.map((i) => i.feeBillId).filter(Boolean), ...(who.isGuest || !patron ? [] : await entryBillIds(companyId, patron.id, date))])];
    const bills = billIds.length ? await billing.Bill.findAll({ where: { companyId, id: { [Op.in]: billIds }, status: { [Op.ne]: 'voided' } }, attributes: ['id', 'billNo', 'status', 'totalAmount', 'billDate', 'createdAt'], order: [['createdAt', 'ASC']] }) : [];
    const billById = new Map(bills.map((b) => [b.id, { id: b.id, billNo: b.billNo, status: b.status, totalAmount: Number(b.totalAmount) }]));
    const openToday = bills.filter((b) => b.status === 'open' && String(b.billDate) === date).pop() || null;
    // The fee of each item at the HOLDER's participant type, before tax.
    const feeTypeIds = [...new Set(items.map((it) => it.feeTransactionTypeId).filter(Boolean))];
    const feeTypes = feeTypeIds.length ? await TransactionType.findAll({ where: { companyId, id: { [Op.in]: feeTypeIds }, isActive: true } }) : [];
    const feeById = new Map();
    for (const ft of feeTypes) {
        const priced = pricing.unitPriceOf(ft, await billing.cardsOf(ft.id), { date, dayType, participantType: who.participantType });
        feeById.set(ft.id, { code: ft.transactionType, description: ft.description, unitAmount: priced.missing ? null : priced.unitAmount, priceRequired: ft.allowPriceOverride !== true });
    }
    const inside = await isInside(companyId, who, patron ? patron.id : null, date);
    const nowDate = new Date();
    const live = mine.filter((i) => i.status === 'issued');
    const usedToday = mine.filter((i) => i.status === 'used' && new Date(i.issuedAt).getTime() >= startOfDay.getTime());
    const rowOf = (i) => {
        const it = itemById.get(i.utilityItemId);
        const bill = i.feeBillId ? billById.get(i.feeBillId) || null : null;
        return {
            ...issueDto(i, { patron, unit: i.utilityUnitId ? unitById.get(i.utilityUnitId) : null, bill }, nowDate),
            item: it ? { id: it.id, code: it.code, description: it.description, behaviour: utilityRules.behaviourOf(it) } : null,
            undoable: !rules.undoVerdict({ status: i.status, issuedAt: i.issuedAt, now: nowDate, billStatus: bill ? bill.status : null }),
        };
    };
    const tiles = items.map((it) => {
        const behaviour = utilityRules.behaviourOf(it);
        const held = (behaviour === 'use' ? usedToday : live).filter((i) => i.utilityItemId === it.id).reduce((sum, i) => sum + Number(i.quantity || 1), 0);
        const free = behaviour === 'units' ? freeUnits.filter((u) => u.utilityItemId === it.id) : [];
        const fee = it.feeTransactionTypeId ? feeById.get(it.feeTransactionTypeId) || null : null;
        const verdict = rules.serveTileVerdict({
            behaviour, isGuest: who.isGuest, guestsAllowed: it.guestsAllowed !== false, requiresEntry: it.requiresEntry === true, inside,
            held, limit: Number(it.maxPerPerson || 0), freeUnits: free.length, fee, priceRequired: fee ? fee.priceRequired : true,
        });
        return {
            utilityItemId: it.id, code: it.code, description: it.description, iconUrl: it.iconUrl, behaviour,
            fee: fee ? { code: fee.code, description: fee.description, unitAmount: fee.unitAmount } : null,
            allowed: verdict.allowed, reason: verdict.reason,
            held, limit: Number(it.maxPerPerson || 0), dueDays: it.dueDays || 0,
            freeUnits: free.map((u) => ({ id: u.id, code: u.code, location: u.location })),
            suggestedUnitId: free.length ? free[0].id : null,
        };
    });
    const host = { memberId: who.standing.memberId, memberNo: who.standing.memberNo, name: who.standing.name };
    return {
        kind: who.isGuest ? 'guest' : 'member',
        person: { name: who.holderName },
        host,
        // A guest served by name has no pass. `createdHere` = the station
        // registered this pass (slice 6c), so the station may take it back.
        // `removable` = a guest added by mistake can still be taken back: the
        // station made the pass and the guest has neither taken an item nor
        // entered a facility on it.
        pass: who.pass ? {
            id: who.pass.id, registrationNo: who.pass.registrationNo, visitDate: who.pass.visitDate, arrivedAt: who.pass.arrivedAt, firstScan,
            createdHere: who.pass.channel === 'facility',
            removable: who.pass.channel === 'facility' && !mine.some((i) => i.status === 'issued' || i.remarks !== rules.UNDONE_REMARK)
                && (await RegistrationGuest.count({ where: { companyId, guestRegistrationId: who.pass.id } })) === 0,
        } : null,
        standingWarning: standingWarningOf(who.standing),
        // A member's panel: the guests served under them today, and how a
        // guest keyed here is served (the two door switches).
        guests: who.isGuest ? [] : await guestsOfHost(companyId, patron, { memberId: who.standing.memberId, date, startOfDay }),
        door: who.isGuest ? null : await doorRules(companyId),
        holding: live.map(rowOf),
        usedToday: usedToday.map(rowOf),
        tiles,
        // Slice 6d: the facilities the person may enter from here.
        entries: await entryTiles(companyId, who, { patron, now, date, dayType, startOfDay }),
        bill: openToday ? billById.get(openToday.id) : (who.isGuest ? await entryBillOfGuest(companyId, who, patron, date) : null),
        undoMinutes: rules.UNDO_MINUTES,
        clubNow: now,
    };
}

// POST /scan { code } - or { guestRegistrationId } / { memberNo } to redraw
// the panel of the person already being served. The first scan of a pass on
// its day marks the guest arrived.
async function scan(req, body) {
    const companyId = getUserContext(req).companyId;
    if (!companyId) return { error: 'Select a workspace first.' };
    const who = await resolveHolder(companyId, { code: body.code, guestRegistrationId: body.guestRegistrationId, memberNo: body.memberNo, guestName: body.guestName });
    if (who.error) return who;
    let firstScan = false;
    if (who.isGuest && who.pass && who.pass.status === 'registered') {
        firstScan = await markGuestArrived(companyId, who.pass.id, { actorId: getUserContext(req).userId });
        if (firstScan) who.pass = (await getGuestPass(companyId, who.pass.id)) || who.pass;
    }
    return { panel: await servePicture(req, who, { firstScan }) };
}

// The panel of whoever an issue record belongs to (after a return or an
// undo from the panel); null when that person can no longer be served.
async function panelOfRecord(req, record) {
    const companyId = getUserContext(req).companyId;
    let who;
    if (record.guestRegistrationId) who = await resolveHolder(companyId, { guestRegistrationId: record.guestRegistrationId });
    else {
        const patron = await Patron.findOne({ where: { companyId, id: record.patronId }, attributes: ['memberNo'] });
        who = patron && patron.memberNo ? await resolveHolder(companyId, { memberNo: patron.memberNo, guestName: record.holderName || null }) : { error: 'no member' };
    }
    return who.error ? null : servePicture(req, who);
}

// POST /issues/:id/undo - a wrong tap, inside the undo window: the item is
// taken back as a good return, its unpaid bill line removed (a bill left
// empty is voided) and the record noted. No new status: it reads 'returned'.
async function undoIssue(req, id) {
    const companyId = getUserContext(req).companyId;
    const record = await IssueRecord.findOne({ where: { companyId, id } });
    if (!record) return { error: 'Issue record not found.', status: 404 };
    const item = await UtilityItem.findOne({ where: { id: record.utilityItemId } });
    const callerId = getUserContext(req).userId;
    const { now, timezone } = await clock(companyId);
    const startOfDay = localToDate(`${now.date}T00:00`, timezone);
    const result = await runTx(sequelize, async (transaction) => {
        const row = await IssueRecord.findOne({ where: { id: record.id }, transaction, lock: transaction.LOCK.UPDATE });
        const bill = row.feeBillId ? await billing.Bill.findOne({ where: { companyId, id: row.feeBillId }, transaction, lock: transaction.LOCK.UPDATE }) : null;
        const refusal = rules.undoVerdict({ status: row.status, issuedAt: row.issuedAt, billStatus: bill ? bill.status : null });
        if (refusal) txFail(refusal);
        let billNote = '';
        if (bill && bill.status === 'open') {
            // The line this issue added: the fee item at this quantity, written
            // in the same transaction as the record (no column links the two).
            const lines = item && item.feeTransactionTypeId
                ? await billing.BillItem.findAll({ where: { billId: bill.id, transactionTypeId: item.feeTransactionTypeId, quantity: row.quantity }, order: [['createdAt', 'ASC']], transaction })
                : [];
            const t0 = new Date(row.createdAt).getTime();
            const line = lines.find((l) => { const d = new Date(l.createdAt).getTime() - t0; return d >= -1000 && d <= 5000; });
            if (line) {
                await billing.removeItem({ bill, item: line, transaction });
                if ((await billing.BillItem.count({ where: { billId: bill.id }, transaction })) === 0) {
                    Object.assign(bill, { status: 'voided', voidedAt: new Date(), voidedBy: callerId, voidReason: rules.UNDONE_REMARK, updatedBy: callerId });
                    await bill.save({ transaction });
                    billNote = ` Bill ${bill.billNo} is voided.`;
                } else billNote = ` Its line is off bill ${bill.billNo}.`;
                row.feeBillId = null;
            } else billNote = ` Its fee stays on bill ${bill.billNo} - remove the line there.`;
        }
        Object.assign(row, { status: 'returned', returnedAt: new Date(), returnedQuantity: row.quantity, returnCondition: 'good', remarks: rules.UNDONE_REMARK, updatedBy: callerId });
        await row.save({ transaction });
        if (row.holderName && !row.guestRegistrationId) await releaseNameGuestVisit(companyId, row, startOfDay, { transaction, updatedBy: callerId, date: now.date });
        if (row.utilityUnitId) await UtilityUnit.update({ unitStatus: 'available', currentIssueId: null, updatedBy: callerId }, { where: { id: row.utilityUnitId }, transaction });
        return { row, billNote };
    });
    if (result.error) return result;
    const unit = record.utilityUnitId ? await UtilityUnit.findOne({ where: { id: record.utilityUnitId }, attributes: ['code'] }) : null;
    const what = unit ? unit.code : `${item ? item.code : 'The item'}${record.quantity > 1 ? ` x ${record.quantity}` : ''}`;
    return { message: `${what} undone.${result.billNote}`, panel: await panelOfRecord(req, result.row) };
}

// ---- slice 6c: the guest without a pass, with the member ---------------------------------------

// The guests served under a member today (or still holding something of
// theirs): the ones on a pass and the ones served by name.
async function guestsOfHost(companyId, patron, { memberId, date, startOfDay }) {
    const byKey = new Map();
    const keyOf = (passId, name) => passId || `name:${String(name).toLowerCase()}`;
    // Today's passes of this host: a guest registered today is one tap away
    // from the member's panel before they have taken anything.
    for (const p of await listGuestPassesOfHost(companyId, memberId, date)) byKey.set(p.id, { name: p.guest.name, guestRegistrationId: p.id, holding: 0 });
    if (!patron) return [...byKey.values()];
    // The guests on the lines of the host's entries today (a guest by name
    // who entered a facility).
    const entries = await Registration.findAll({ where: { companyId, patronId: patron.id, registrationDate: date }, attributes: ['id'] });
    const lines = entries.length
        ? await RegistrationGuest.findAll({ where: { registrationId: { [Op.in]: entries.map((e) => e.id) }, memberNo: null }, attributes: ['name', 'guestRegistrationId'], order: [['createdAt', 'ASC']] })
        : [];
    for (const l of lines) {
        const key = keyOf(l.guestRegistrationId, l.name);
        if (!byKey.has(key)) byKey.set(key, { name: l.name, guestRegistrationId: l.guestRegistrationId || null, holding: 0 });
    }
    const rows = await IssueRecord.findAll({
        where: { companyId, patronId: patron.id, holderName: { [Op.ne]: null }, [Op.or]: [{ status: 'issued' }, { issuedAt: { [Op.gte]: startOfDay } }] },
        attributes: ['holderName', 'guestRegistrationId', 'status', 'remarks'], order: [['issuedAt', 'ASC']],
    });
    for (const r of rows) {
        if (r.status !== 'issued' && r.remarks === rules.UNDONE_REMARK) continue;
        const key = keyOf(r.guestRegistrationId, r.holderName);
        const g = byKey.get(key) || { name: r.holderName, guestRegistrationId: r.guestRegistrationId || null, holding: 0 };
        if (r.status === 'issued') g.holding += 1;
        byKey.set(key, g);
    }
    return [...byKey.values()];
}

// How a guest keyed at the station is served (Facility Specification).
async function doorRules(companyId) {
    const { setting } = await availability.loadRules(companyId);
    return { passEnabled: setting.doorGuestPassEnabled !== false, contactRequired: setting.doorGuestContactRequired === true };
}

// POST /door-guests { memberNo, name, mobile, email } - the member is at the
// counter with a guest who holds no pass. Keyed with a mobile or an email
// (and door passes ON) the guest is registered with Membership, already
// arrived, and holds a pass from then on; keyed with a name only, the guest
// is served by name, together with the member. Answers the GUEST's panel.
async function addDoorGuest(req, body) {
    const companyId = getUserContext(req).companyId;
    if (!companyId) return { error: 'Select a workspace first.' };
    const m = await memberStanding(companyId, body.memberNo);
    if (m.error) return m;
    const standing = m.standing;
    const name = String(body.name || '').trim().slice(0, 255);
    const door = await doorRules(companyId);
    const verdict = rules.doorGuestVerdict({ name, mobile: body.mobile, email: body.email, passEnabled: door.passEnabled, contactRequired: door.contactRequired });
    if (verdict.error) return { error: verdict.error };
    const warnings = [];
    let who = null;
    let share = null;
    let message = '';
    if (verdict.mode === 'pass') {
        const r = await registerGuestAtDoor(req, { memberId: standing.memberId, guest: { name, mobile: body.mobile || null, email: body.email || null }, channel: 'facility' });
        if (r.error) return r;
        if (r.nameOnly) warnings.push(r.warning);
        else {
            who = { isGuest: true, pass: r.pass, standing, holderName: r.pass.guest.name, participantType: 'guest' };
            share = r.share;
            message = r.created
                ? `${r.pass.guest.name} is registered as ${standing.name}'s guest - pass ${r.pass.registrationNo}.`
                : `${r.pass.guest.name} already holds pass ${r.pass.registrationNo} as ${standing.name}'s guest today.`;
        }
    }
    if (!who) {
        const { now, timezone } = await clock(companyId);
        const patron = await Patron.findOne({ where: { companyId, patronType: 'member', sourceId: standing.memberId }, attributes: ['id'] });
        const counted = await nameGuestCounted(companyId, patron ? patron.id : null, name, now.date, localToDate(`${now.date}T00:00`, timezone));
        if (!counted) {
            const allowance = await getGuestAllowanceStanding(companyId, standing.memberId, now.date);
            if (allowance && allowance.allowance != null && allowance.remaining < 1) return { error: allowanceRefusal(standing, allowance) };
        }
        who = { isGuest: true, pass: null, standing, holderName: name, participantType: 'guest' };
        message = `${name} is served as ${standing.name}'s guest, by name - no pass.`;
    }
    return { message, warnings, panel: await servePicture(req, who), share };
}

// GET /door-guests/:id/pass - what the desk needs to hand a pass over again.
async function doorPass(req, guestRegistrationId) {
    const companyId = getUserContext(req).companyId;
    const pass = await getGuestPass(companyId, guestRegistrationId);
    if (!pass) return { error: 'That guest pass was not found.', status: 404 };
    const share = await getGuestPassShare(req, pass.id);
    if (!share) return { error: `Pass ${pass.registrationNo} is cancelled.` };
    return { share };
}

// POST /door-guests/:id/send { via } - email the pass, or record that the
// desk shared it over its own WhatsApp.
async function sendDoorPass(req, guestRegistrationId, body) {
    const companyId = getUserContext(req).companyId;
    const pass = await getGuestPass(companyId, guestRegistrationId);
    if (!pass) return { error: 'That guest pass was not found.', status: 404 };
    const sent = await sendGuestPass(req, pass.id, String(body.via || ''));
    if (sent.error) return sent;
    return { message: sent.message, share: await getGuestPassShare(req, pass.id) };
}

// POST /door-guests/:id/remove - a guest added by mistake: the pass the
// STATION registered is cancelled and its visit no longer counts. Refused
// once the guest holds or has used anything today, and for a pass the front
// desk registered. Answers the member's panel.
async function removeDoorGuest(req, guestRegistrationId) {
    const companyId = getUserContext(req).companyId;
    const pass = await getGuestPass(companyId, guestRegistrationId);
    if (!pass) return { error: 'That guest pass was not found.', status: 404 };
    if (pass.status === 'cancelled') return { error: `Pass ${pass.registrationNo} is already cancelled.` };
    if (pass.channel !== 'facility') return { error: `Pass ${pass.registrationNo} was not registered at the station - cancel it under Guest Registrations.` };
    const { now, timezone } = await clock(companyId);
    const startOfDay = localToDate(`${now.date}T00:00`, timezone);
    const taken = await IssueRecord.findAll({ where: { companyId, guestRegistrationId: pass.id, [Op.or]: [{ status: 'issued' }, { issuedAt: { [Op.gte]: startOfDay } }] }, attributes: ['status', 'remarks'] });
    if (taken.some((r) => r.status === 'issued' || r.remarks !== rules.UNDONE_REMARK)) return { error: `${pass.guest.name} holds or has taken an item today - the pass stays.` };
    if (await RegistrationGuest.count({ where: { companyId, guestRegistrationId: pass.id } })) return { error: `${pass.guest.name} has entered a facility on this pass - the pass stays.` };
    const done = await cancelGuestAtDoor(companyId, pass.id, { channel: 'facility', actorId: getUserContext(req).userId, reason: 'Removed at the facility station' });
    if (!done) return { error: `Pass ${pass.registrationNo} could not be cancelled.` };
    const host = await resolveHolder(companyId, { memberNo: pass.host.memberNo });
    return {
        message: `${pass.guest.name} is removed - pass ${pass.registrationNo} is cancelled and no longer counts against ${pass.host.name}'s allowance.`,
        panel: host.error ? null : await servePicture(req, host),
    };
}

// ---- slice 6d: entering a facility from the Serve panel ----------------------------------------

// The open bill of the entry a guest stands on today: where the guest fee
// went, shown in the guest's panel while they have no bill of their own.
async function entryBillOfGuest(companyId, who, patron, date) {
    if (!patron) return null;
    const regs = await Registration.findAll({ where: { companyId, patronId: patron.id, registrationDate: date, billId: { [Op.ne]: null } }, attributes: ['id', 'billId'] });
    if (!regs.length) return null;
    const line = who.pass ? { guestRegistrationId: who.pass.id } : { guestRegistrationId: null, memberNo: null, name: sameName(who.holderName) };
    const lines = await RegistrationGuest.findAll({ where: { registrationId: { [Op.in]: regs.map((r) => r.id) }, ...line }, attributes: ['registrationId'] });
    const billIds = regs.filter((r) => lines.some((l) => l.registrationId === r.id)).map((r) => r.billId);
    if (!billIds.length) return null;
    const b = await billing.Bill.findOne({ where: { companyId, id: { [Op.in]: billIds }, status: 'open', billDate: date }, attributes: ['id', 'billNo', 'status', 'totalAmount'], order: [['createdAt', 'DESC']] });
    return b ? { id: b.id, billNo: b.billNo, status: b.status, totalAmount: Number(b.totalAmount) } : null;
}

// The bills the member's entries of the day carry (the member's ONE open
// bill may have been opened by an entry rather than by a utility item).
async function entryBillIds(companyId, patronId, date, { transaction } = {}) {
    const rows = await Registration.findAll({ where: { companyId, patronId, registrationDate: date, billId: { [Op.ne]: null } }, attributes: ['billId'], transaction });
    return rows.map((r) => r.billId);
}

// What the people of an entry still hold when it signs out: the host (when
// inside) and every guest on its lines.
async function partyItemsOut(companyId, r) {
    const lines = await RegistrationGuest.findAll({ where: { registrationId: r.id }, attributes: ['name', 'guestRegistrationId', 'memberNo'] });
    const out = await IssueRecord.findAll({ where: { companyId, patronId: r.patronId, status: 'issued' }, order: [['issuedAt', 'ASC']] });
    if (!out.length) return [];
    const patron = await Patron.findOne({ where: { id: r.patronId }, attributes: ['name'] });
    const passes = new Set(lines.map((l) => l.guestRegistrationId).filter(Boolean));
    const names = new Set(lines.filter((l) => !l.guestRegistrationId && !l.memberNo).map((l) => String(l.name).toLowerCase()));
    const mine = out.filter((i) => (i.guestRegistrationId ? passes.has(i.guestRegistrationId) : i.holderName ? names.has(String(i.holderName).toLowerCase()) : r.hostPresent !== false));
    if (!mine.length) return [];
    const [items, units] = await Promise.all([
        UtilityItem.findAll({ where: { id: { [Op.in]: [...new Set(mine.map((i) => i.utilityItemId))] } }, attributes: ['id', 'code'] }),
        UtilityUnit.findAll({ where: { id: { [Op.in]: mine.map((i) => i.utilityUnitId).filter(Boolean) } }, attributes: ['id', 'code'] }),
    ]);
    const itemCode = new Map(items.map((x) => [x.id, x.code]));
    const unitCode = new Map(units.map((x) => [x.id, x.code]));
    return mine.map((i) => ({
        issueId: i.id,
        label: i.utilityUnitId ? unitCode.get(i.utilityUnitId) || 'unit' : `${itemCode.get(i.utilityItemId) || 'item'}${i.quantity > 1 ? ` x ${i.quantity}` : ''}`,
        holder: i.holderName || (patron ? patron.name : 'the member'),
    }));
}

// Why an entry type admits nobody right now (its hours, a closure), or null.
async function entryClosedReason(companyId, type, { now, date, dayType }) {
    const hours = rules.openingHours(type, dayType);
    if (!rules.isOpenAt(hours, now.time)) {
        return `${type.code} is closed at ${now.time} (open ${hhmm(dayType === 'weekend' ? type.openTimeWeekend : type.openTimeWeekday) || '00:00'} to ${hhmm(dayType === 'weekend' ? type.closeTimeWeekend : type.closeTimeWeekday) || '24:00'}).`;
    }
    const units = await availability.unitsOf(companyId, type.id);
    if (!units.length) return null;
    const blocks = await availability.closureBlocks(companyId, type.id, units.map((u) => u.id), date);
    const nowMin = toMinutes(now.time);
    return units.every((u) => bookingRules.isBlocked(blocks.get(u.id) || [], nowMin, nowMin + 1)) ? `${type.code} is closed right now.` : null;
}

async function holdsBookingToday(companyId, patronId, date, { transaction } = {}) {
    if (!patronId) return false;
    return (await BookingSlot.count({ where: { companyId, bookingDate: date, status: { [Op.in]: ACTIVE_SLOT_STATUS_KEYS } }, include: [{ model: Booking, as: 'Booking', where: { bookerPatronId: patronId, status: 'booked' } }], transaction })) > 0;
}

// The guest line a person stands on among the host's live entries of a type.
function lineOf(who, lines) {
    return who.pass
        ? lines.find((l) => l.guestRegistrationId === who.pass.id)
        : lines.find((l) => !l.guestRegistrationId && !l.memberNo && String(l.name).toLowerCase() === String(who.holderName).toLowerCase());
}

// Everything one person's entry to one type turns on, read fresh: used to
// draw the tile and again, inside the transaction, when it is tapped.
async function entryFacts(companyId, who, type, ctx, { transaction, lock = false } = {}) {
    const { patron, now, date, dayType, startOfDay, setting, guestRules, ptypes } = ctx;
    const regs = await Registration.findAll({
        where: { companyId, facilityTypeId: type.id, registrationDate: date, status: 'in', bookingSlotId: null },
        transaction, ...(lock ? { lock: transaction.LOCK.UPDATE } : {}),
    });
    const hostRegs = patron ? regs.filter((r) => r.patronId === patron.id) : [];
    const hostReg = hostRegs[0] || null;
    const lines = hostRegs.length ? await RegistrationGuest.findAll({ where: { registrationId: { [Op.in]: hostRegs.map((r) => r.id) } }, transaction }) : [];
    const myLine = who.isGuest ? lineOf(who, lines) || null : null;
    const hostInside = hostRegs.some((r) => r.hostPresent !== false);
    const inside = who.isGuest ? !!myLine : hostInside;
    const count = rules.liveCount(regs);
    let guestsAllowed = true;
    let allowanceLeft = null;
    if (who.isGuest && !inside) {
        guestsAllowed = bookingRules.resolveGuestRule({ setting, type, rules: guestRules, facilityTypeId: type.id, dayType, date, startTime: now.time }).allowGuest;
        // A guest on a pass was counted when the pass was registered; a guest
        // by name draws a visit unless an item or an entry already drew it.
        const counted = who.pass ? true : await nameGuestCounted(companyId, patron ? patron.id : null, who.holderName, date, startOfDay, { transaction });
        if (!counted) {
            const a = await getGuestAllowanceStanding(companyId, who.standing.memberId, date, { transaction });
            allowanceLeft = a && a.allowance != null ? a.remaining : null;
        }
    }
    const visitorsOnEntry = hostReg ? lines.filter((l) => l.registrationId === hostReg.id && participantTypes.isVisitorGuest(ptypes, l.participantType)).length : 0;
    const closedReason = inside ? null : await entryClosedReason(companyId, type, { now, date, dayType });
    const needsBooking = type.entryRequiresBooking === true && !inside;
    const verdict = rules.entryVerdict({
        code: type.code, inside, closedReason, needsBooking, hasBooking: needsBooking ? await holdsBookingToday(companyId, patron ? patron.id : null, date, { transaction }) : false,
        isGuest: who.isGuest, hostName: who.standing.name, guestsAllowed, hostMustBePresent: type.hostMustBePresent === true, hostInside,
        guestCap: type.maxGuestsPerBooking, guestsOnEntry: visitorsOnEntry, allowanceLeft, count, capacity: type.capacity,
    });
    const myReg = who.isGuest ? (myLine ? hostRegs.find((r) => r.id === myLine.registrationId) : null) : hostRegs.find((r) => r.hostPresent !== false) || null;
    return { regs, hostReg, myLine, myReg, hostInside, inside, count, verdict };
}

// The entry tiles of the Serve panel: one per active entry type, each
// stating the count it will reach and what it bills before it is tapped.
async function entryTiles(companyId, who, { patron, now, date, dayType, startOfDay }) {
    const types = await FacilityType.findAll({ where: { companyId, isActive: true, usageMode: 'entry' }, order: [['sortOrder', 'ASC'], ['code', 'ASC']] });
    if (!types.length) return [];
    const [{ setting, guestRules }, ptypes, feeTypes] = await Promise.all([
        availability.loadRules(companyId), participantTypes.catalog(companyId), TransactionType.findAll({ where: { companyId } }),
    ]);
    const ctx = { patron, now, date, dayType, startOfDay, setting, guestRules, ptypes };
    // The visitor-guest types the club keeps: more than one = the desk picks.
    const guestTypes = who.isGuest ? ptypes.filter((t) => t.isActive !== false && participantTypes.isVisitorGuest(ptypes, t.code)).map((t) => ({ code: t.code, description: t.description })) : [];
    const out = [];
    for (const type of types) {
        const f = await entryFacts(companyId, who, type, ctx);
        const feeType = who.isGuest
            ? pricing.defaultTypeFor(feeTypes, { chargeType: 'guest-fee', participantType: 'guest', facilityTypeId: type.id, explicitId: type.guestFeeTransactionTypeId })
            : pricing.defaultTypeFor(feeTypes, { chargeType: 'facility-fee', participantType: 'member', facilityTypeId: type.id, explicitId: type.feeTransactionTypeId });
        let fee = null;
        let verdict = f.verdict;
        if (feeType) {
            const priced = pricing.unitPriceOf(feeType, await billing.cardsOf(feeType.id), { date, dayType, participantType: who.isGuest ? 'guest' : 'member' });
            fee = { code: feeType.transactionType, description: feeType.description, unitAmount: priced.missing ? null : priced.unitAmount };
            // The tap would be refused at the bill: say so on the tile instead.
            if (verdict.allowed && priced.missing && feeType.allowPriceOverride !== true) verdict = { allowed: false, reason: `${feeType.transactionType} has no price today.` };
        }
        out.push({
            facilityTypeId: type.id, code: type.code, description: type.description, iconUrl: type.iconUrl,
            liveCount: f.count, capacity: type.capacity, willReach: f.count + 1,
            fee, allowed: verdict.allowed, reason: verdict.reason,
            // Where the person stands on this type: the entry they are on, and
            // whether it is theirs to sign out here (a guest on the host's
            // entry signs out with the host).
            inside: f.inside && f.myReg ? {
                registrationId: f.myReg.id, registrationNo: f.myReg.registrationNo, timeIn: f.myReg.timeIn, guestCount: f.myReg.guestCount,
                own: !who.isGuest || f.myReg.hostPresent === false,
            } : null,
            hostInside: f.hostInside,
            guestTypes: guestTypes.length > 1 ? guestTypes : [],
        });
    }
    return out;
}

// Charge an entry: the facility fee once for the member, a guest fee per
// guest line named, on the ENTRY's bill - the bill the entry already carries
// while it is open, else the member's open bill of the day (so the member
// keeps ONE open bill), else a new one. Returns { bill } | { error }.
async function chargeEntry({ req, companyId, registration, type, patron, memberFee, guestLines, joinBillIds = [], date, dayType, session, stamps, warnings, transaction }) {
    const types = await TransactionType.findAll({ where: { companyId }, transaction });
    const feeType = memberFee ? pricing.defaultTypeFor(types, { chargeType: 'facility-fee', participantType: 'member', facilityTypeId: type.id, explicitId: type.feeTransactionTypeId }) : null;
    const guestFees = guestLines.map((l) => ({ line: l, type: pricing.defaultTypeFor(types, { chargeType: 'guest-fee', participantType: l.participantType, facilityTypeId: type.id, explicitId: type.guestFeeTransactionTypeId }) }));
    // A facility with no fee item is free and its tile said so before the
    // tap: nothing to warn about. A PICKED guest type with no fee item of its
    // own does warn - the tile showed the standard guest price.
    for (const g of guestFees) if (!g.type && g.line.participantType !== 'guest') warnings.push(`No active guest-fee item is the default for '${g.line.participantType}' on ${type.code} - ${g.line.name}'s guest fee was not charged.`);
    if (!feeType && !guestFees.some((g) => g.type)) return { bill: null };
    const candidates = [...new Set([registration.billId, ...joinBillIds].filter(Boolean))];
    let bill = candidates.length
        ? await billing.Bill.findOne({ where: { companyId, id: { [Op.in]: candidates }, status: 'open', billDate: date }, order: [['createdAt', 'DESC']], transaction, lock: transaction.LOCK.UPDATE })
        : null;
    if (!bill) {
        const issued = await billing.issueBillNo(req, { transaction });
        if (issued.error) return { error: issued.error };
        bill = await billing.Bill.create({ companyId, billNo: issued.billNo, registrationId: registration.id, patronId: patron.id, billDate: date, status: 'open', ...stamps }, { transaction });
    }
    const context = { date, dayType, sessionId: session ? session.id : null, sessionName: session ? session.name : null };
    if (feeType) {
        const added = await billing.addItem({ req, bill, type: feeType, quantity: 1, stamps, transaction, context: { ...context, participantType: 'member' } });
        if (added.error) return { error: added.error };
    }
    for (const g of guestFees) {
        if (!g.type) continue;
        const added = await billing.addItem({ req, bill, type: g.type, quantity: 1, stamps, transaction, context: { ...context, participantType: g.line.participantType } });
        if (added.error) return { error: `${g.line.name}: ${added.error}` };
    }
    await billing.recomputeTotals(bill, transaction);
    if (registration.billId !== bill.id) { registration.billId = bill.id; await registration.save({ transaction }); }
    return { bill };
}

// POST /admissions { facilityTypeId, the person (memberNo | guestRegistrationId
// | memberNo with guestName), participantType (a guest, when the club keeps
// more than one visitor-guest type), panel } - ONE person enters an entry
// facility from the Serve panel.
//   - The member: a new entry, or - when their guests went in ahead on a
//     pass - the member joins that entry (hostPresent turns true).
//   - A guest: a line on the host's live entry of that type; with the host
//     not inside, an entry in the host's name with hostPresent false (refused
//     when the type says the host must be present).
// The entry fee and the guest fee go on the entry's bill.
async function admit(req, body) {
    const companyId = getUserContext(req).companyId;
    if (!companyId) return { error: 'Select a workspace first.' };
    const type = await FacilityType.findOne({ where: { companyId, id: String(body.facilityTypeId || ''), usageMode: 'entry', isActive: true } });
    if (!type) return { error: 'Pick an entry facility.' };
    const who = await resolveHolder(companyId, { guestRegistrationId: body.guestRegistrationId, memberNo: body.memberNo, guestName: body.guestName });
    if (who.error) return who;
    const standing = who.standing;
    const [{ now, timezone }, { setting, sessions, guestRules }, ptypes] = await Promise.all([clock(companyId), availability.loadRules(companyId), participantTypes.catalog(companyId)]);
    const date = now.date;
    const dayType = await shared.dayTypeOf(companyId, date);
    const startOfDay = localToDate(`${date}T00:00`, timezone);
    let guestType = 'guest';
    if (who.isGuest && body.participantType) {
        const code = String(body.participantType);
        const t = participantTypes.findType(ptypes, code);
        if (!t || t.isActive === false || !participantTypes.isVisitorGuest(ptypes, code)) return { error: 'Pick a visitor guest type.' };
        guestType = code;
    }
    const session = bookingRules.sessionOf(sessions, `${now.time}:00`);
    const stamps = await stampsFor(req);
    const warnings = [];
    const result = await runTx(sequelize, async (transaction) => {
        const patron = await patrons.ensureMemberPatron(companyId, standing, stamps, { transaction });
        const ctx = { patron, now, date, dayType, startOfDay, setting, guestRules, ptypes };
        const f = await entryFacts(companyId, who, type, ctx, { transaction, lock: true });
        if (f.inside) txFail(`${who.holderName} is already inside ${type.code}${f.myReg ? ` (${f.myReg.registrationNo})` : ''}.`);
        if (!f.verdict.allowed) txFail(f.verdict.reason);
        let registration = f.hostReg;
        let joined = false;
        if (!registration) {
            const no = await issueRegistrationNo(req, { transaction });
            if (no.error) txFail(no.error);
            registration = await Registration.create({
                companyId, registrationNo: no.no, patronId: patron.id, facilityTypeId: type.id, facilityId: null, bookingSlotId: null,
                registrationDate: date, timeIn: new Date(), dayType, sessionId: session ? session.id : null, status: 'in',
                hostPresent: !who.isGuest, ...stamps,
            }, { transaction });
        } else if (!who.isGuest) {
            // The guests went in ahead: the member joins their entry.
            registration.hostPresent = true;
            registration.updatedBy = stamps.updatedBy;
            await registration.save({ transaction });
            joined = true;
        }
        let line = null;
        if (who.isGuest) {
            const taken = await RegistrationGuest.max('sortOrder', { where: { registrationId: registration.id }, transaction });
            line = await RegistrationGuest.create({
                companyId, registrationId: registration.id, patronId: null, participantType: guestType, name: String(who.holderName).slice(0, 255), memberNo: null,
                sortOrder: (Number(taken) || 0) + 1, guestId: who.pass ? who.pass.guest.id : null, guestRegistrationId: who.pass ? who.pass.id : null, passCreatedHere: false,
            }, { transaction });
            // A guest on a pass names the guest (once per day with the pass's
            // own visit); a guest by name draws the visit here unless an item
            // already drew it today.
            const counted = who.pass ? false : await nameGuestCounted(companyId, patron.id, who.holderName, date, startOfDay, { transaction });
            if (!counted) {
                const visit = await recordGuestVisit(companyId, { memberId: standing.memberId, visitDate: date, sourceModule: 'facility', sourceRef: line.id, guestId: line.guestId, guestName: line.name, guestCount: 1, stamps }, { transaction });
                if (visit && visit.id) { line.guestVisitId = visit.id; await line.save({ transaction }); }
            }
            registration.guestCount = Number(registration.guestCount || 0) + 1;
            await registration.save({ transaction });
        }
        const billed = await chargeEntry({
            req, companyId, registration, type, patron, memberFee: !who.isGuest, guestLines: line ? [{ participantType: guestType, name: line.name }] : [],
            joinBillIds: who.isGuest ? [] : (await IssueRecord.findAll({ where: { companyId, ...holderWhere(who, patron.id), feeBillId: { [Op.ne]: null }, issuedAt: { [Op.gte]: startOfDay } }, attributes: ['feeBillId'], transaction })).map((e) => e.feeBillId),
            date, dayType, session, stamps, warnings, transaction,
        });
        if (billed.error) txFail(billed.error);
        return { registration, joined, count: f.count + 1 };
    });
    if (result.error) return result;
    if (who.isGuest && who.pass && who.pass.status === 'registered') await markGuestArrived(companyId, who.pass.id, { actorId: getUserContext(req).userId });
    const where = type.capacity != null ? ` - ${result.count} of ${type.capacity} inside` : '';
    const message = who.isGuest
        ? `${who.holderName}, guest of ${standing.name}, is in ${type.code} (${result.registration.registrationNo})${where}.`
        : `${standing.name} is in ${type.code} (${result.registration.registrationNo})${result.joined ? ', with the guests already inside' : ''}${where}.`;
    const out = { message, registrationId: result.registration.id, warnings, standingWarning: standingWarningOf(standing) };
    if (body.panel === true) out.panel = await servePicture(req, who);
    return out;
}

// ---- rule 7: end of day ------------------------------------------------------------------------

async function endOfDay(req, { facilityTypeId = null, date }) {
    const companyId = getUserContext(req).companyId;
    const where = { companyId, status: 'in', registrationDate: { [Op.lte]: date } };
    if (facilityTypeId) where.facilityTypeId = facilityTypeId;
    const [n] = await Registration.update({ status: 'out', timeOut: new Date(), updatedBy: getUserContext(req).userId }, { where });
    const overdue = facilityTypeId ? 0 : await IssueRecord.count({ where: { companyId, status: 'issued', dueBack: { [Op.lt]: new Date() } } });
    // Slice 4 rule 3: every still-booked slot past its end on the date is a
    // no-show (charges raised, strikes counted) while the control is ON.
    let sweep = null;
    if (await noShow.config(companyId)) {
        const { now } = await clock(companyId);
        const booked = await BookingSlot.findAll({ where: { companyId, bookingDate: date, status: 'booked', ...(facilityTypeId ? { facilityTypeId } : {}) }, attributes: ['id', 'bookingDate', 'endTime'] });
        const past = booked.filter((s) => bookingRules.minutesUntil(now, String(s.bookingDate), hhmm(s.endTime)) <= 0).map((s) => s.id);
        if (past.length) sweep = await markNoShows(req, { slotIds: past });
    }
    const msg = `${n} registration${n === 1 ? '' : 's'} signed out.${overdue ? ` ${overdue} utility item${overdue === 1 ? '' : 's'} overdue.` : ''}${sweep && !sweep.error ? ` ${sweep.message}` : ''}`;
    return { message: msg, signedOut: n, overdue, noShows: sweep && !sweep.error ? sweep.marked : 0 };
}

// Worker tick: companies with the auto sign-out ON (the default) sign out the
// registrations still in once their type's close time has passed club-local,
// and any left from an earlier date.
async function scanAutoSignOut() {
    const FacilitySetting = require('./facilitySetting.model');
    const live = await Registration.findAll({ where: { status: 'in' }, attributes: ['id', 'companyId', 'facilityTypeId', 'registrationDate', 'dayType'] });
    if (!live.length) return { signedOut: 0 };
    const byCompany = new Map();
    for (const r of live) {
        if (!byCompany.has(r.companyId)) byCompany.set(r.companyId, []);
        byCompany.get(r.companyId).push(r);
    }
    let signedOut = 0;
    for (const [companyId, regs] of byCompany) {
        const setting = await FacilitySetting.findOne({ where: { companyId }, attributes: ['autoSignOutAtClose'] });
        if (setting && setting.autoSignOutAtClose === false) continue;
        const { now } = await clock(companyId);
        const types = await FacilityType.findAll({ where: { id: { [Op.in]: [...new Set(regs.map((r) => r.facilityTypeId))] } } });
        const typeById = new Map(types.map((t) => [t.id, t]));
        const ids = regs.filter((r) => {
            if (String(r.registrationDate) < now.date) return true;
            const t = typeById.get(r.facilityTypeId);
            const hours = t ? rules.openingHours(t, r.dayType) : null;
            return !!(hours && hours.close < 24 * 60 && toMinutes(now.time) >= hours.close);
        }).map((r) => r.id);
        if (ids.length) {
            const [n] = await Registration.update({ status: 'out', timeOut: new Date() }, { where: { id: { [Op.in]: ids }, status: 'in' } });
            signedOut += n;
        }
    }
    if (signedOut) console.log(`[FACILITY STATION] ${signedOut} registration(s) signed out at close.`);
    return { signedOut };
}

module.exports = {
    localToDate, clock, registrationDto, issueDto, unitDto, dayPicture,
    checkIn, register, signOut, replaceGuests, issue, returnIssue, clearUnit, endOfDay, scanAutoSignOut, markNoShows,
    resolveHolder, servePicture, scan, undoIssue,
    addDoorGuest, doorPass, sendDoorPass, removeDoorGuest,
    admit,
    classSessionsOn, enrolWalkIn,
};
