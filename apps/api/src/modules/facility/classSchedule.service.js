// Facility classes - the SCHEDULING engine (slice 5a, structures approved
// 2026-10-26). A schedule header expands into dated sessions through a
// preview the user reviews: every date in the range on the chosen ISO
// weekdays, SKIPPED where the venue's linked facility (or its type) is closed
// or the date is a public holiday, CONFLICT where the venue, the venue's
// slot-type unit (a court is whole, so a live booking or another venue's
// session on it collides) or the instructor is already taken in the time
// range. The pure pieces (date expansion, closure and conflict marking, the
// venue / instructor / capacity resolution ladder) carry no DB and are unit-
// tested; the loaders below them read the day's facts once per preview.

const { Op } = require('sequelize');
const FacilityVenue = require('./venue.model');
const Facility = require('./facility.model');
const FacilityType = require('./facilityType.model');
const FacilityClosurePlan = require('./facilityClosurePlan.model');
const FacilityClosureDay = require('./facilityClosureDay.model');
const FacilityClass = require('./class.model');
const FacilityClassSession = require('./classSession.model');
const BookingSlot = require('./bookingSlot.model');
const Booking = require('./booking.model');
const { classifyDateRangeForCompany } = require('../../platform/calendarGateway');
const { ACTIVE_SLOT_STATUS_KEYS } = require('./booking.constants');
const { toMinutes } = require('./facilityShared');

const rules = require('./classScheduleRules.service');
const { hhmm, venueBlocksUnit, expandDates, applyClosures, applyConflicts, summarize } = rules;

// ---- loaders ---------------------------------------------------------------

const VENUE_INCLUDE = [{ model: Facility, as: 'Facility', attributes: ['id', 'code', 'name', 'facilityTypeId'], required: false, include: [{ model: FacilityType, as: 'FacilityType', attributes: ['id', 'code', 'usageMode'] }] }];

async function loadVenue(companyId, venueId, { transaction } = {}) {
    if (!venueId) return null;
    return FacilityVenue.findOne({ where: { id: venueId, companyId }, include: VENUE_INCLUDE, transaction });
}

// Closure days of a venue's linked unit (its own plans and the type-wide
// ones) inside the range: Map(date -> [{ start, end, label }]).
async function closedDatesFor(companyId, venue, dateFrom, dateTo, { transaction } = {}) {
    const map = new Map();
    const unit = venue && venue.Facility;
    if (!unit) return map;
    const plans = await FacilityClosurePlan.findAll({
        where: { companyId, facilityTypeId: unit.facilityTypeId, isActive: true, dateFrom: { [Op.lte]: dateTo }, dateTo: { [Op.gte]: dateFrom }, [Op.or]: [{ facilityId: null }, { facilityId: unit.id }] },
        attributes: ['id', 'description'],
        transaction,
    });
    if (!plans.length) return map;
    const labelByPlan = new Map(plans.map((p) => [p.id, p.description]));
    const days = await FacilityClosureDay.findAll({
        where: { closurePlanId: { [Op.in]: plans.map((p) => p.id) }, closureDate: { [Op.between]: [dateFrom, dateTo] }, isActive: true },
        transaction,
    });
    for (const d of days) {
        const date = String(d.closureDate);
        if (!map.has(date)) map.set(date, []);
        map.get(date).push({ start: d.startTime ? toMinutes(d.startTime) : null, end: d.endTime ? toMinutes(d.endTime) : null, label: labelByPlan.get(d.closurePlanId) || '' });
    }
    return map;
}

function sessionEntry(s, label) {
    return { date: String(s.sessionDate), start: toMinutes(s.startTime), end: toMinutes(s.endTime), label, sessionId: s.id };
}

// What is already taken in the range for a venue / unit / instructor:
// { venue, unit, bookings, instructor } lists of { date, start, end, label }.
async function takenFor(companyId, { venue, instructorId, dateFrom, dateTo, excludeScheduleId = null, excludeSessionId = null }, { transaction } = {}) {
    const blocksUnit = venueBlocksUnit(venue);
    const unitId = venue && venue.Facility ? venue.Facility.id : null;
    const base = { companyId, status: 'scheduled', sessionDate: { [Op.between]: [dateFrom, dateTo] } };
    if (excludeScheduleId) base.scheduleId = { [Op.or]: [{ [Op.ne]: excludeScheduleId }, { [Op.is]: null }] };
    if (excludeSessionId) base.id = { [Op.ne]: excludeSessionId };
    const or = [];
    if (venue) or.push({ venueId: venue.id });
    if (blocksUnit && unitId) or.push({ facilityId: unitId });
    if (instructorId) or.push({ instructorId });
    const sessions = or.length ? await FacilityClassSession.findAll({ where: { ...base, [Op.or]: or }, transaction }) : [];
    const classIds = [...new Set(sessions.map((s) => s.classId))];
    const classes = classIds.length ? await FacilityClass.findAll({ where: { id: { [Op.in]: classIds } }, attributes: ['id', 'code', 'description'], transaction }) : [];
    const classById = new Map(classes.map((c) => [c.id, c]));
    const labelOf = (s) => { const c = classById.get(s.classId); return c ? `${c.code} ${hhmm(s.startTime)}-${hhmm(s.endTime)}` : `${hhmm(s.startTime)}-${hhmm(s.endTime)}`; };
    const out = { venue: [], unit: [], bookings: [], instructor: [] };
    for (const s of sessions) {
        const entry = sessionEntry(s, labelOf(s));
        if (venue && s.venueId === venue.id) out.venue.push(entry);
        else if (blocksUnit && unitId && s.facilityId === unitId) out.unit.push(entry);
        if (instructorId && s.instructorId === instructorId) out.instructor.push(entry);
    }
    if (blocksUnit && unitId) {
        const slots = await BookingSlot.findAll({
            where: { companyId, facilityId: unitId, bookingDate: { [Op.between]: [dateFrom, dateTo] }, status: { [Op.in]: ACTIVE_SLOT_STATUS_KEYS } },
            attributes: ['id', 'bookingId', 'bookingDate', 'startTime', 'endTime'],
            transaction,
        });
        const bookingIds = [...new Set(slots.map((s) => s.bookingId))];
        const bookings = bookingIds.length ? await Booking.findAll({ where: { id: { [Op.in]: bookingIds } }, attributes: ['id', 'bookingNo'], transaction }) : [];
        const noById = new Map(bookings.map((b) => [b.id, b.bookingNo]));
        for (const s of slots) out.bookings.push({ date: String(s.bookingDate), start: toMinutes(s.startTime), end: toMinutes(s.endTime), label: noById.get(s.bookingId) || 'a booking' });
    }
    return out;
}

// The preview of a header: every date with its outcome, plus the counts.
// `header` carries dateFrom, dateTo, weekdays, startTime, endTime,
// skipClosures, skipPublicHolidays; `facts` the resolved venue (loaded with
// its unit) and instructorId.
async function preview(companyId, { header, venue, instructorId, excludeScheduleId = null }, { transaction } = {}) {
    const classified = await classifyDateRangeForCompany(companyId, header.dateFrom, header.dateTo);
    let rows = expandDates({ classified, weekdays: header.weekdays, skipPublicHolidays: header.skipPublicHolidays !== false });
    if (header.skipClosures !== false) {
        const closed = await closedDatesFor(companyId, venue, header.dateFrom, header.dateTo, { transaction });
        rows = applyClosures(rows, closed, header);
    }
    const taken = await takenFor(companyId, { venue, instructorId, dateFrom: header.dateFrom, dateTo: header.dateTo, excludeScheduleId }, { transaction });
    rows = applyConflicts(rows, taken, header);
    return { rows, counts: summarize(rows) };
}

// One session's conflict verdict (a one-off, a moved session): a message or null.
async function sessionConflict(companyId, { venue, instructorId, date, startTime, endTime, excludeSessionId = null }, { transaction } = {}) {
    const taken = await takenFor(companyId, { venue, instructorId, dateFrom: date, dateTo: date, excludeSessionId }, { transaction });
    const [row] = applyConflicts([{ date, status: 'ok' }], taken, { startTime, endTime });
    return row.status === 'conflict' ? row.reason : null;
}

// The day's scheduled sessions on slot-type units, for the booking grid:
// Map(facilityId -> [{ start, end, label, sessionId }]) in minutes.
async function classBlocks(companyId, facilityIds, date, { transaction } = {}) {
    const map = new Map(facilityIds.map((id) => [id, []]));
    if (!facilityIds.length) return map;
    const sessions = await FacilityClassSession.findAll({
        where: { companyId, facilityId: { [Op.in]: facilityIds }, sessionDate: date, status: 'scheduled' },
        attributes: ['id', 'classId', 'facilityId', 'startTime', 'endTime'],
        transaction,
    });
    if (!sessions.length) return map;
    const classes = await FacilityClass.findAll({ where: { id: { [Op.in]: [...new Set(sessions.map((s) => s.classId))] } }, attributes: ['id', 'code', 'description'], transaction });
    const classById = new Map(classes.map((c) => [c.id, c]));
    for (const s of sessions) {
        const c = classById.get(s.classId);
        map.get(s.facilityId).push({ start: toMinutes(s.startTime), end: toMinutes(s.endTime), label: c ? c.description : 'Class', code: c ? c.code : null, sessionId: s.id });
    }
    return map;
}

module.exports = {
    ...rules,
    VENUE_INCLUDE, loadVenue, closedDatesFor, takenFor, preview, sessionConflict, classBlocks,
};
