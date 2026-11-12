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
const { getGolfMemberStanding, getGuestAllowanceStanding, recordGuestVisit, voidGuestVisit, findGuestPass, getGuestPass, markGuestArrived } = require('../../platform/membershipGateway');
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
    return { id: g.id, patronId: g.patronId, participantType: g.participantType, name: g.name, memberNo: g.memberNo, guestVisitId: g.guestVisitId, sortOrder: g.sortOrder };
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
            lines.push({ sortOrder: i + 1, participantType: code, base: t.baseIdentity, standing: null, name, memberNo: null, visitor: { name, identityNo: g.identityNo || null, mobile: g.mobile || null, email: g.email || null } });
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
    if (visitors.length && !verdict.allowGuest) return { error: `Visitor guests are not allowed on ${type.code} at ${time} on ${date}.` };
    if (memberGuests.length && !verdict.allowMemberGuest) return { error: `Members as guests are not allowed on ${type.code} at ${time} on ${date}.` };
    if (type.maxGuestsPerBooking != null && visitors.length > Number(type.maxGuestsPerBooking)) return { error: `At most ${type.maxGuestsPerBooking} visitor guest${Number(type.maxGuestsPerBooking) === 1 ? '' : 's'} per visit on ${type.code}.` };
    const allowance = await getGuestAllowanceStanding(companyId, host.memberId, date, { transaction });
    if (allowance && allowance.allowance != null && allowance.remaining + excludeCurrent < lines.length) {
        return { error: `${host.name} (${host.memberNo}) has ${allowance.remaining + excludeCurrent} of ${allowance.allowance} monthly guest visits left - this entry needs ${lines.length}.` };
    }
    return { allowance };
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
        }, { transaction });
        const visit = await recordGuestVisit(companyId, { memberId: host.memberId, visitDate: date, sourceModule: 'facility', sourceRef: row.id, guestName: l.name, guestCount: 1, stamps }, { transaction });
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
    return { message: `${r.registrationNo} signed out.${openBill ? ` Bill ${openBill.billNo} is still open.` : ''}` };
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
    const result = await runTx(sequelize, async (transaction) => {
        const regs = await Registration.findAll({ where: { companyId, facilityTypeId: type.id, registrationDate: r.registrationDate, status: 'in', bookingSlotId: null }, transaction, lock: transaction.LOCK.UPDATE });
        const current = Number(r.guestCount || 0);
        const capError = rules.capacityVerdict({ count: rules.liveCount(regs) - (1 + current), arriving: 1 + lines.length, capacity: type.capacity, label: type.code });
        if (capError) txFail(capError);
        await voidGuests(companyId, r.id, { transaction });
        const g = await checkDoorGuests({ companyId, setting, type, guestRules, dayType: r.dayType, date: String(r.registrationDate), time: now.time, lines, host: standing, types: ptypes, transaction });
        if (g.error) txFail(g.error);
        const pErr = await attachGuestPatrons(companyId, lines, stamps, transaction);
        if (pErr) txFail(pErr);
        await writeGuests({ companyId, registration: r, lines, host: standing, date: String(r.registrationDate), stamps, transaction });
        return {};
    });
    if (result.error) return result;
    return { message: `Guests saved on ${r.registrationNo}.` };
}

// ---- rule 5: issue (a utility item, slice 6a; the holder, slice 6b) --------------------------

// Who the desk serves (slice 6b): a guest on the pass - the host named on it
// is the responsible member - or a member on their own number. `code` is
// whatever was scanned or keyed into the scan box. Returns { error } or
// { isGuest, pass, standing, holderName, participantType }.
async function resolveHolder(companyId, { code = null, guestRegistrationId = null, memberNo = null } = {}) {
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
    return { isGuest: false, pass: null, standing: m.standing, holderName: m.standing.name, participantType: 'member' };
}

// The rows that belong to the person served: a guest's by the pass, a
// member's by the patron with no guest named.
function holderWhere(who, patronId) {
    return who.isGuest ? { guestRegistrationId: who.pass.id } : { patronId, guestRegistrationId: null };
}

async function isInside(companyId, patronId, date, { transaction } = {}) {
    if (!patronId) return false;
    return (await Registration.count({ where: { companyId, patronId, registrationDate: date, status: 'in' }, transaction })) > 0;
}

function standingWarningOf(standing) {
    return standing.actionControl === 'warning' ? `Member ${standing.memberNo} is ${standing.statusLabel || 'under warning'}.` : null;
}

// `body` = { utilityItemId, utilityUnitId (a numbered item; none = the next
// available), quantity (a counted item), memberNo OR guestRegistrationId
// (the holder), registrationId, remarks, panel (answer with the refreshed
// Serve panel) }. A use-only item closes as 'used' at once.
async function issue(req, body) {
    const companyId = getUserContext(req).companyId;
    const item = await UtilityItem.findOne({ where: { companyId, id: String(body.utilityItemId || ''), isActive: true } });
    if (!item) return { error: 'Pick a utility item.' };
    const behaviour = utilityRules.behaviourOf(item);
    const who = await resolveHolder(companyId, { guestRegistrationId: body.guestRegistrationId, memberNo: body.memberNo });
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
        if (item.requiresEntry === true && !(who.isGuest ? false : await isInside(companyId, patron.id, date, { transaction }))) {
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
            holderName: who.isGuest ? String(who.holderName || '').slice(0, 255) : null, guestRegistrationId: who.isGuest ? who.pass.id : null,
            quantity, issuedAt, dueBack, status: behaviour === 'use' ? 'used' : 'issued', remarks: body.remarks ? String(body.remarks).slice(0, 255) : null, ...stamps,
        }, { transaction });
        if (unit) {
            unit.unitStatus = 'issued';
            unit.currentIssueId = record.id;
            unit.updatedBy = stamps.updatedBy;
            await unit.save({ transaction });
        }
        if (item.feeTransactionTypeId) {
            const feeType = await TransactionType.findOne({ where: { companyId, id: item.feeTransactionTypeId, isActive: true }, transaction });
            if (!feeType) warnings.push(`${item.code}'s fee item is missing or disabled - no fee was charged.`);
            else {
                // ONE open bill per person per day (slice 6b): the first paid
                // item opens it in the responsible member's name, the next ones
                // add their lines to it while it is open.
                const earlier = await IssueRecord.findAll({ where: { companyId, ...mine, feeBillId: { [Op.ne]: null }, issuedAt: { [Op.gte]: startOfDay } }, attributes: ['feeBillId'], transaction });
                const billIds = [...new Set(earlier.map((e) => e.feeBillId))];
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
    if (who.isGuest && who.pass.status === 'registered') await markGuestArrived(companyId, who.pass.id, { actorId: getUserContext(req).userId });
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
    const known = who.isGuest || !!patron;
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
    const billIds = [...new Set(mine.map((i) => i.feeBillId).filter(Boolean))];
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
    const inside = who.isGuest ? false : await isInside(companyId, patron ? patron.id : null, date);
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
        pass: who.isGuest ? { id: who.pass.id, registrationNo: who.pass.registrationNo, visitDate: who.pass.visitDate, arrivedAt: who.pass.arrivedAt, firstScan } : null,
        standingWarning: standingWarningOf(who.standing),
        holding: live.map(rowOf),
        usedToday: usedToday.map(rowOf),
        tiles,
        bill: openToday ? billById.get(openToday.id) : null,
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
    const who = await resolveHolder(companyId, { code: body.code, guestRegistrationId: body.guestRegistrationId, memberNo: body.memberNo });
    if (who.error) return who;
    let firstScan = false;
    if (who.isGuest && who.pass.status === 'registered') {
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
        who = patron && patron.memberNo ? await resolveHolder(companyId, { memberNo: patron.memberNo }) : { error: 'no member' };
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
                    Object.assign(bill, { status: 'voided', voidedAt: new Date(), voidedBy: callerId, voidReason: 'Undone at the desk', updatedBy: callerId });
                    await bill.save({ transaction });
                    billNote = ` Bill ${bill.billNo} is voided.`;
                } else billNote = ` Its line is off bill ${bill.billNo}.`;
                row.feeBillId = null;
            } else billNote = ` Its fee stays on bill ${bill.billNo} - remove the line there.`;
        }
        Object.assign(row, { status: 'returned', returnedAt: new Date(), returnedQuantity: row.quantity, returnCondition: 'good', remarks: 'Undone at the desk', updatedBy: callerId });
        await row.save({ transaction });
        if (row.utilityUnitId) await UtilityUnit.update({ unitStatus: 'available', currentIssueId: null, updatedBy: callerId }, { where: { id: row.utilityUnitId }, transaction });
        return { row, billNote };
    });
    if (result.error) return result;
    const unit = record.utilityUnitId ? await UtilityUnit.findOne({ where: { id: record.utilityUnitId }, attributes: ['code'] }) : null;
    const what = unit ? unit.code : `${item ? item.code : 'The item'}${record.quantity > 1 ? ` x ${record.quantity}` : ''}`;
    return { message: `${what} undone.${result.billNote}`, panel: await panelOfRecord(req, result.row) };
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
    classSessionsOn, enrolWalkIn,
};
