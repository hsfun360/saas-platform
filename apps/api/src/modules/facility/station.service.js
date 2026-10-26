// Control Station engine (structures approved 2026-10-26, slice 3): the
// day's picture per facility type, the check-in of a booked slot, the walk-in
// entry with its guests and its bill, sign-out, the issue and return of units
// and consumables, the end-of-day sweep and the worker's auto sign-out. The
// pure verdicts live in stationRules.service.js and bookingRules.service.js;
// bills open through billing.service.js exactly as a booking's bill does.

const crypto = require('crypto');
const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { getUserContext } = require('../../platform/serviceContext');
const { getGolfMemberStanding, getGuestAllowanceStanding, recordGuestVisit, voidGuestVisit } = require('../../platform/membershipGateway');
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
const { stampsFor, toMinutes } = require('./facilityShared');
const { ACTIVE_SLOT_STATUS_KEYS } = require('./booking.constants');
const { STATION_LIMITS } = require('./station.constants');

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
        patron: patron ? { id: patron.id, name: patron.name, memberNo: patron.memberNo } : null,
        facilityTypeId: i.facilityTypeId,
        facilityId: i.facilityId,
        facility: unit ? { id: unit.id, code: unit.code, name: unit.name } : null,
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
    return { id: u.id, code: u.code, name: u.name, location: u.location, capacity: u.capacity, isActive: u.isActive !== false, unitStatus: u.unitStatus || 'available', currentIssueId: u.currentIssueId || null };
}

// ---- the day's picture --------------------------------------------------------------

// Everything the station shows for one date: per active type, by mode.
async function dayPicture(companyId, date, callerId) {
    const [{ now }, types, units, { setting, sessions }, dayType] = await Promise.all([
        clock(companyId),
        FacilityType.findAll({ where: { companyId, isActive: true }, order: [['usageMode', 'ASC'], ['sortOrder', 'ASC'], ['code', 'ASC']] }),
        Facility.findAll({ where: { companyId }, order: [['sortOrder', 'ASC'], ['code', 'ASC']] }),
        availability.loadRules(companyId),
        shared.dayTypeOf(companyId, date),
    ]);
    const unitById = new Map(units.map((u) => [u.id, u]));
    const typeIds = types.map((t) => t.id);
    const [slots, registrations, issues] = await Promise.all([
        BookingSlot.findAll({ where: { companyId, bookingDate: date, status: { [Op.in]: ACTIVE_SLOT_STATUS_KEYS } }, order: [['startTime', 'ASC']] }),
        Registration.findAll({ where: { companyId, registrationDate: date }, order: [['timeIn', 'ASC']] }),
        IssueRecord.findAll({ where: { companyId, [Op.or]: [{ status: 'issued' }, { returnedAt: { [Op.gte]: new Date(`${date}T00:00:00Z`) } }] }, order: [['issuedAt', 'ASC']] }),
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

    const out = types.map((t) => {
        const typeUnits = units.filter((u) => u.facilityTypeId === t.id);
        const hours = rules.openingHours(t, dayType);
        const base = {
            id: t.id, code: t.code, description: t.description, usageMode: t.usageMode, iconUrl: t.iconUrl,
            capacity: t.capacity, trackUnits: t.trackUnits !== false, maxIssuePerPatron: t.maxIssuePerPatron, issueDueDays: t.issueDueDays || 0,
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
                        registration: reg ? registrationDto(reg, { patron: patronById.get(reg.patronId), unit }) : null,
                        bill: b ? billByBooking.get(b.id) || null : null,
                    };
                }),
            };
        }
        if (t.usageMode === 'entry') {
            const regs = registrations.filter((r) => r.facilityTypeId === t.id && !r.bookingSlotId);
            return {
                ...base,
                liveCount: rules.liveCount(regs),
                registrations: regs.map((r) => registrationDto(r, { patron: patronById.get(r.patronId), unit: r.facilityId ? unitById.get(r.facilityId) : null, guests: guestsByReg.get(r.id) || [], bill: billByReg.get(r.id) || null })),
            };
        }
        const typeIssues = issues.filter((i) => i.facilityTypeId === t.id);
        return {
            ...base,
            outCount: typeIssues.filter((i) => i.status === 'issued').reduce((s, i) => s + Number(i.quantity), 0),
            issues: typeIssues.map((i) => issueDto(i, { patron: patronById.get(i.patronId), unit: i.facilityId ? unitById.get(i.facilityId) : null, bill: billByIssue.get(i.id) || null }, nowDate)),
        };
    });
    return { date, dayType, clubNow: now, checkInOpenMinutes: setting.checkInOpenMinutes ?? 30, types: out, callerId };
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
    const result = await sequelize.transaction(async (transaction) => {
        const no = await issueRegistrationNo(req, { transaction });
        if (no.error) return { error: no.error };
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
    const result = await sequelize.transaction(async (transaction) => {
        const regs = await Registration.findAll({ where: { companyId, facilityTypeId: type.id, registrationDate: date, status: 'in', bookingSlotId: null, ...(unit && unit.capacity != null ? { facilityId: unit.id } : {}) }, transaction, lock: transaction.LOCK.UPDATE });
        const capacity = unit && unit.capacity != null ? unit.capacity : type.capacity;
        const capError = rules.capacityVerdict({ count: rules.liveCount(regs), arriving: 1 + lines.length, capacity, label: unit && unit.capacity != null ? unit.code : type.code });
        if (capError) return { error: capError };
        const g = await checkDoorGuests({ companyId, setting, type, guestRules, dayType, date, time: now.time, lines, host: standing, types: ptypes, transaction });
        if (g.error) return { error: g.error };
        const patron = await patrons.ensureMemberPatron(companyId, standing, stamps, { transaction });
        const pErr = await attachGuestPatrons(companyId, lines, stamps, transaction);
        if (pErr) return { error: pErr };
        const no = await issueRegistrationNo(req, { transaction });
        if (no.error) return { error: no.error };
        const registration = await Registration.create({
            companyId, registrationNo: no.no, patronId: patron.id, facilityTypeId: type.id, facilityId: unit ? unit.id : null, bookingSlotId: null,
            registrationDate: date, timeIn: new Date(), dayType, sessionId: session ? session.id : null, status: 'in', remarks: body.remarks ? String(body.remarks).slice(0, 255) : null, ...stamps,
        }, { transaction });
        await writeGuests({ companyId, registration, lines, host: standing, date, stamps, transaction });
        const billed = await openEntryBill({ req, companyId, registration, type, patron, lines, date, dayType, sessionId: session ? session.id : null, sessionName: session ? session.name : null, stamps, warnings, transaction });
        if (billed.error) return { error: billed.error };
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
    const result = await sequelize.transaction(async (transaction) => {
        const regs = await Registration.findAll({ where: { companyId, facilityTypeId: type.id, registrationDate: r.registrationDate, status: 'in', bookingSlotId: null }, transaction, lock: transaction.LOCK.UPDATE });
        const current = Number(r.guestCount || 0);
        const capError = rules.capacityVerdict({ count: rules.liveCount(regs) - (1 + current), arriving: 1 + lines.length, capacity: type.capacity, label: type.code });
        if (capError) return { error: capError };
        await voidGuests(companyId, r.id, { transaction });
        const g = await checkDoorGuests({ companyId, setting, type, guestRules, dayType: r.dayType, date: String(r.registrationDate), time: now.time, lines, host: standing, types: ptypes, transaction });
        if (g.error) return { error: g.error };
        const pErr = await attachGuestPatrons(companyId, lines, stamps, transaction);
        if (pErr) return { error: pErr };
        await writeGuests({ companyId, registration: r, lines, host: standing, date: String(r.registrationDate), stamps, transaction });
        return {};
    });
    if (result.error) return result;
    return { message: `Guests saved on ${r.registrationNo}.` };
}

// ---- rule 5: issue -----------------------------------------------------------------------------

async function issue(req, body) {
    const companyId = getUserContext(req).companyId;
    const type = await FacilityType.findOne({ where: { companyId, id: String(body.facilityTypeId || ''), usageMode: 'issue', isActive: true } });
    if (!type) return { error: 'Pick an issue facility type.' };
    const trackUnits = type.trackUnits !== false;
    const m = await memberStanding(companyId, body.memberNo);
    if (m.error) return m;
    const standing = m.standing;
    const [{ now, timezone }] = await Promise.all([clock(companyId)]);
    const date = now.date;
    const dayType = await shared.dayTypeOf(companyId, date);
    const hours = rules.openingHours(type, dayType);
    if (!rules.isOpenAt(hours, now.time)) return { error: `${type.code} is closed at ${now.time}.` };
    const quantity = trackUnits ? 1 : Number(body.quantity || 1);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > STATION_LIMITS.maxIssueQuantity) return { error: `Quantity must be between 1 and ${STATION_LIMITS.maxIssueQuantity}.` };
    const units = await availability.unitsOf(companyId, type.id);
    const blocks = await availability.closureBlocks(companyId, type.id, units.map((u) => u.id), date);
    const nowMin = toMinutes(now.time);
    const stamps = await stampsFor(req);
    const warnings = [];
    const result = await sequelize.transaction(async (transaction) => {
        let unit = null;
        if (trackUnits) {
            const wanted = body.facilityId ? String(body.facilityId) : null;
            const candidates = await Facility.findAll({ where: { companyId, facilityTypeId: type.id, isActive: true, unitStatus: 'available', ...(wanted ? { id: wanted } : {}) }, order: [['sortOrder', 'ASC'], ['code', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
            unit = candidates.find((u) => !bookingRules.isBlocked(blocks.get(u.id) || [], nowMin, nowMin + 1)) || null;
            if (!unit) return { error: wanted ? 'That unit is not available.' : `No ${type.code} unit is available right now.` };
        } else {
            unit = units[0] || null;
            if (unit && bookingRules.isBlocked(blocks.get(unit.id) || [], nowMin, nowMin + 1)) return { error: `${type.code} is closed right now.` };
        }
        const patron = await patrons.ensureMemberPatron(companyId, standing, stamps, { transaction });
        const live = await IssueRecord.findAll({ where: { companyId, facilityTypeId: type.id, status: 'issued', patronId: patron.id }, transaction });
        const limitError = rules.issueLimitVerdict({ held: rules.heldByPatron(live, patron.id), taking: quantity, limit: Number(type.maxIssuePerPatron || 0), name: standing.name, unitWord: trackUnits ? `${type.code} units` : `${type.code} pieces` });
        if (limitError) return { error: limitError };
        const dueBack = localToDate(rules.dueBackLocal({ issueDate: date, dueDays: type.issueDueDays || 0, hours }), timezone);
        const record = await IssueRecord.create({
            companyId, patronId: patron.id, facilityTypeId: type.id, facilityId: unit ? unit.id : null, registrationId: body.registrationId ? String(body.registrationId) : null,
            quantity, issuedAt: new Date(), dueBack, status: 'issued', remarks: body.remarks ? String(body.remarks).slice(0, 255) : null, ...stamps,
        }, { transaction });
        if (trackUnits && unit) {
            unit.unitStatus = 'issued';
            unit.currentIssueId = record.id;
            unit.updatedBy = stamps.updatedBy;
            await unit.save({ transaction });
        }
        if (type.issueFeeTransactionTypeId) {
            const feeType = await TransactionType.findOne({ where: { companyId, id: type.issueFeeTransactionTypeId, isActive: true }, transaction });
            if (!feeType) warnings.push(`${type.code}'s issue fee item is missing or disabled - no fee was charged.`);
            else {
                const issued = await billing.issueBillNo(req, { transaction });
                if (issued.error) return { error: issued.error };
                const bill = await billing.Bill.create({ companyId, billNo: issued.billNo, issueRecordId: record.id, patronId: patron.id, billDate: date, status: 'open', ...stamps }, { transaction });
                const added = await billing.addItem({ req, bill, type: feeType, quantity, stamps, transaction, context: { date, dayType, sessionId: null, sessionName: null, participantType: 'member' } });
                if (added.error) return { error: added.error };
                await billing.recomputeTotals(bill, transaction);
                record.feeBillId = bill.id;
                await record.save({ transaction });
            }
        }
        return { record, unit };
    });
    if (result.error) return result;
    const what = trackUnits ? `${result.unit.code}` : `${quantity} ${type.code}`;
    return { message: `${what} issued to ${standing.name}.`, issueId: result.record.id, warnings };
}

// ---- rule 6: return ------------------------------------------------------------------------------

async function returnIssue(req, id, body) {
    const companyId = getUserContext(req).companyId;
    const record = await IssueRecord.findOne({ where: { companyId, id } });
    if (!record) return { error: 'Issue record not found.', status: 404 };
    if (record.status !== 'issued') return { error: `Already ${record.status}.` };
    const type = await FacilityType.findOne({ where: { id: record.facilityTypeId } });
    const trackUnits = type ? type.trackUnits !== false : true;
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
        if (trackUnits && record.facilityId) {
            await Facility.update({ unitStatus: outcome.unitStatus, currentIssueId: null, updatedBy: callerId }, { where: { id: record.facilityId }, transaction });
        }
    });
    const lost = outcome.lostQuantity ? ` ${outcome.lostQuantity} lost - charge it from the bill's tiles if the club bills losses.` : '';
    return { message: `Returned${outcome.unitStatus === 'out-of-service' ? ' - the unit is out of service until cleared' : ''}.${lost}` };
}

async function clearUnit(req, unitId) {
    const companyId = getUserContext(req).companyId;
    const unit = await Facility.findOne({ where: { companyId, id: unitId } });
    if (!unit) return { error: 'Unit not found.', status: 404 };
    if (unit.unitStatus !== 'out-of-service') return { error: `${unit.code} is ${unit.unitStatus}.` };
    unit.unitStatus = 'available';
    unit.updatedBy = getUserContext(req).userId;
    await unit.save();
    return { message: `${unit.code} is available again.` };
}

// ---- rule 7: end of day ------------------------------------------------------------------------

async function endOfDay(req, { facilityTypeId = null, date }) {
    const companyId = getUserContext(req).companyId;
    const where = { companyId, status: 'in', registrationDate: { [Op.lte]: date } };
    if (facilityTypeId) where.facilityTypeId = facilityTypeId;
    const [n] = await Registration.update({ status: 'out', timeOut: new Date(), updatedBy: getUserContext(req).userId }, { where });
    const overdue = await IssueRecord.count({ where: { companyId, status: 'issued', dueBack: { [Op.lt]: new Date() }, ...(facilityTypeId ? { facilityTypeId } : {}) } });
    return { message: `${n} registration${n === 1 ? '' : 's'} signed out.${overdue ? ` ${overdue} issue${overdue === 1 ? '' : 's'} overdue.` : ''}`, signedOut: n, overdue };
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
    checkIn, register, signOut, replaceGuests, issue, returnIssue, clearUnit, endOfDay, scanAutoSignOut,
};
