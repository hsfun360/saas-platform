// Class sessions (/facility/class-schedule, the timetable; slice 5a,
// structures approved 2026-10-26) - the dated meetings across every class:
// the week's listing with its filters, a one-off session (a make-up, a
// workshop), a moved session (times, venue, instructor, capacity) and a
// cancellation with a reason. Every change runs the conflict verdict of the
// scheduling engine (the venue, the venue's slot-type unit and its bookings,
// the instructor). The roster, attendance and hold arrive with slice 5b.

const { Op } = require('sequelize');
const FacilityClass = require('./class.model');
const FacilityVenue = require('./venue.model');
const FacilityInstructor = require('./instructor.model');
const Facility = require('./facility.model');
const FacilityClassSchedule = require('./classSchedule.model');
const FacilityClassSession = require('./classSession.model');
const { getUserContext, annotateCanModify, canModifyRecord } = require('../../platform/serviceContext');
const { companyTimezoneById } = require('../../platform/calendarGateway');
const { LIMITS } = require('./facility.constants');
const { companyIdOf, stampsFor, normalizeTime, timeDto, DATE_RE, rangeDays, parseOptionalInt } = require('./facilityShared');
const rules = require('./bookingRules.service');
const svc = require('./classSchedule.service');
const { pickers } = require('./class.controller');

const SESSION_INCLUDE = [
    { model: FacilityClass, as: 'Class', attributes: ['id', 'code', 'description', 'enrolmentMode', 'walkInAllowed', 'visitorsAllowed'] },
    { model: FacilityVenue, as: 'Venue', attributes: ['id', 'code', 'name'] },
    { model: FacilityInstructor, as: 'Instructor', attributes: ['id', 'code', 'name'] },
    { model: Facility, as: 'Facility', attributes: ['id', 'code', 'name'], required: false },
    { model: FacilityClassSchedule, as: 'Schedule', attributes: ['id', 'name', 'status'], required: false },
];

function sessionDto(row, canModify) {
    const p = row.get ? row.get({ plain: true }) : row;
    const pick = (o, keys) => (o ? Object.fromEntries(keys.map((k) => [k, o[k]])) : null);
    return {
        id: p.id,
        classId: p.classId,
        class: pick(p.Class, ['id', 'code', 'description', 'enrolmentMode', 'walkInAllowed', 'visitorsAllowed']),
        scheduleId: p.scheduleId || null,
        schedule: pick(p.Schedule, ['id', 'name', 'status']),
        sessionDate: String(p.sessionDate),
        startTime: timeDto(p.startTime),
        endTime: timeDto(p.endTime),
        venueId: p.venueId,
        venue: pick(p.Venue, ['id', 'code', 'name']),
        facilityId: p.facilityId || null,
        facility: pick(p.Facility, ['id', 'code', 'name']),
        instructorId: p.instructorId,
        instructor: pick(p.Instructor, ['id', 'code', 'name']),
        capacity: p.capacity,
        status: p.status,
        heldAt: p.heldAt,
        cancelledAt: p.cancelledAt,
        cancelReason: p.cancelReason,
        remarks: p.remarks,
        canModify,
    };
}

async function loadFull(id) {
    return FacilityClassSession.findOne({ where: { id }, include: SESSION_INCLUDE });
}

// GET /api/facility/class-sessions?from&to&classId&instructorId&venueId
exports.list = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const from = String(req.query.from || '');
        const to = String(req.query.to || '');
        if (!DATE_RE.test(from) || !DATE_RE.test(to) || to < from) return res.status(400).json({ message: 'Give the date range (from, to).' });
        if (rangeDays(from, to) > 62) return res.status(400).json({ message: 'The timetable shows up to two months at a time.' });
        const where = { companyId, sessionDate: { [Op.between]: [from, to] } };
        for (const f of ['classId', 'instructorId', 'venueId']) if (req.query[f]) where[f] = String(req.query[f]);
        const [rows, picks, timezone] = await Promise.all([
            FacilityClassSession.findAll({ where, include: SESSION_INCLUDE, order: [['sessionDate', 'ASC'], ['startTime', 'ASC'], ['createdAt', 'ASC']] }),
            pickers(companyId),
            companyTimezoneById(companyId),
        ]);
        const flags = await annotateCanModify(req, rows);
        const classes = await FacilityClass.findAll({ where: { companyId }, attributes: ['id', 'code', 'description', 'enrolmentMode', 'isActive', 'venueId', 'instructorId', 'capacity'], order: [['sortOrder', 'ASC'], ['code', 'ASC']] });
        res.status(200).json({
            from, to,
            clubNow: rules.clubNow(timezone),
            sessions: rows.map((r, i) => sessionDto(r, flags[i])),
            classes: classes.map((c) => ({ id: c.id, code: c.code, description: c.description, enrolmentMode: c.enrolmentMode, isActive: c.isActive !== false, venueId: c.venueId, instructorId: c.instructorId, capacity: c.capacity })),
            venues: picks.venues,
            instructors: picks.instructors,
        });
    } catch (error) {
        console.error('Error listing class sessions:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// The times, venue, instructor and capacity of a session body; `current`
// supplies the rest on an edit. Returns { error } or { values, merged }.
function validateSession(body, current) {
    const out = {};
    if ('sessionDate' in body) {
        const v = String(body.sessionDate || '').trim();
        if (!DATE_RE.test(v)) return { error: 'The session date is required (YYYY-MM-DD).' };
        out.sessionDate = v;
    }
    for (const field of ['startTime', 'endTime']) {
        if (!(field in body)) continue;
        const t = normalizeTime(body[field]);
        if (!t.ok || !t.value) return { error: 'The session times must be valid times (HH:MM).' };
        out[field] = t.value;
    }
    for (const field of ['venueId', 'instructorId']) {
        if (field in body) out[field] = typeof body[field] === 'string' && body[field].trim() ? body[field].trim() : null;
    }
    if ('capacity' in body) {
        const n = parseOptionalInt(body.capacity, 1, LIMITS.maxVenueCapacity);
        if (!n.ok) return { error: `Capacity must be a whole number between 1 and ${LIMITS.maxVenueCapacity}.` };
        out.capacity = n.value;
    }
    if ('remarks' in body) out.remarks = typeof body.remarks === 'string' && body.remarks.trim() ? body.remarks.trim() : null;
    const merged = { ...(current ? current.get({ plain: true }) : {}), ...out };
    if (merged.startTime && merged.endTime && String(merged.startTime) >= String(merged.endTime)) return { error: 'The end time must be after the start time.' };
    return { values: out, merged };
}

// POST /api/facility/class-sessions - a one-off session of a class.
exports.create = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const cls = await FacilityClass.findOne({ where: { id: String(req.body.classId || ''), companyId } });
        if (!cls) return res.status(400).json({ message: 'Pick a class of the active company.' });
        if (cls.isActive === false) return res.status(409).json({ message: `${cls.code} is disabled.` });
        for (const f of ['sessionDate', 'startTime', 'endTime']) {
            if (!(f in req.body) || req.body[f] === null || req.body[f] === '') return res.status(400).json({ message: 'The date and the times are required.' });
        }
        const v = validateSession(req.body, null);
        if (v.error) return res.status(400).json({ message: v.error });
        const today = rules.clubNow(await companyTimezoneById(companyId)).date;
        if (v.merged.sessionDate < today) return res.status(400).json({ message: 'A session cannot be added in the past.' });
        let schedule = null;
        if (req.body.scheduleId) {
            schedule = await FacilityClassSchedule.findOne({ where: { id: String(req.body.scheduleId), classId: cls.id } });
            if (!schedule) return res.status(400).json({ message: 'That schedule does not belong to the class.' });
            if (schedule.status === 'cancelled') return res.status(409).json({ message: 'That schedule is cancelled.' });
            const clash = await FacilityClassSession.findOne({ where: { scheduleId: schedule.id, sessionDate: v.merged.sessionDate } });
            if (clash) return res.status(409).json({ message: `${schedule.name} already has a session on ${v.merged.sessionDate} - edit that one.` });
        }
        const venue = await svc.loadVenue(companyId, v.merged.venueId || (schedule && schedule.venueId) || cls.venueId);
        if (!venue) return res.status(400).json({ message: 'Pick a venue - the class has no default venue.' });
        if (venue.isActive === false) return res.status(400).json({ message: `Venue ${venue.code} is disabled - pick another.` });
        const facts = svc.resolveFacts({ cls: { venueId: cls.venueId, instructorId: (schedule && schedule.instructorId) || cls.instructorId, capacity: (schedule && schedule.capacity != null) ? schedule.capacity : cls.capacity }, header: { venueId: venue.id, instructorId: v.merged.instructorId, capacity: v.merged.capacity }, venue });
        if (facts.error) return res.status(400).json({ message: facts.error });
        const instructor = await FacilityInstructor.findOne({ where: { id: facts.instructorId, companyId } });
        if (!instructor || instructor.isActive === false) return res.status(400).json({ message: 'Pick an active instructor of the active company.' });
        const conflict = await svc.sessionConflict(companyId, { venue, instructorId: facts.instructorId, date: v.merged.sessionDate, startTime: v.merged.startTime, endTime: v.merged.endTime });
        if (conflict) return res.status(409).json({ message: `${v.merged.sessionDate} ${timeDto(v.merged.startTime)} - ${conflict}.` });
        const stamps = await stampsFor(req);
        const row = await FacilityClassSession.create({
            companyId, classId: cls.id, scheduleId: schedule ? schedule.id : null, sessionDate: v.merged.sessionDate, startTime: v.merged.startTime, endTime: v.merged.endTime,
            venueId: venue.id, facilityId: venue.Facility ? venue.Facility.id : null, instructorId: facts.instructorId, capacity: facts.capacity, status: 'scheduled', remarks: v.merged.remarks || null, ...stamps,
        });
        const full = await loadFull(row.id);
        res.status(201).json({ message: `Session added on ${v.merged.sessionDate}.`, session: sessionDto(full, true) });
    } catch (error) {
        console.error('Error creating class session:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/facility/class-sessions/:id - a scheduled session's times,
// venue, instructor, capacity or remarks.
exports.update = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await FacilityClassSession.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Session not found.' });
        if (!(await canModifyRecord(req, row))) return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        if (row.status !== 'scheduled') return res.status(409).json({ message: `A ${row.status} session cannot be edited.` });
        const v = validateSession(req.body, row);
        if (v.error) return res.status(400).json({ message: v.error });
        const venue = await svc.loadVenue(companyId, v.merged.venueId);
        if (!venue) return res.status(400).json({ message: 'Pick a venue of the active company.' });
        if (venue.isActive === false && v.values.venueId) return res.status(400).json({ message: `Venue ${venue.code} is disabled - pick another.` });
        if (Number(v.merged.capacity) > Number(venue.capacity)) return res.status(400).json({ message: `Capacity ${v.merged.capacity} exceeds the venue's ${venue.capacity}.` });
        const instructor = await FacilityInstructor.findOne({ where: { id: v.merged.instructorId, companyId } });
        if (!instructor) return res.status(400).json({ message: 'Pick an instructor of the active company.' });
        if (instructor.isActive === false && v.values.instructorId) return res.status(400).json({ message: `Instructor ${instructor.code} is disabled - pick another.` });
        const conflict = await svc.sessionConflict(companyId, { venue, instructorId: v.merged.instructorId, date: String(row.sessionDate), startTime: v.merged.startTime, endTime: v.merged.endTime, excludeSessionId: row.id });
        if (conflict) return res.status(409).json({ message: `${timeDto(v.merged.startTime)} - ${conflict}.` });
        Object.assign(row, v.values, { facilityId: venue.Facility ? venue.Facility.id : null, updatedBy: getUserContext(req).userId });
        await row.save();
        const full = await loadFull(row.id);
        res.status(200).json({ message: 'Session updated.', session: sessionDto(full, true) });
    } catch (error) {
        console.error('Error updating class session:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/class-sessions/:id/cancel - with a reason; the roster
// emails arrive with slice 5c.
exports.cancel = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await FacilityClassSession.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Session not found.' });
        if (!(await canModifyRecord(req, row))) return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        if (row.status !== 'scheduled') return res.status(409).json({ message: `The session is already ${row.status}.` });
        const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
        if (!reason) return res.status(400).json({ message: 'Give the reason for cancelling the session.' });
        const callerId = getUserContext(req).userId;
        Object.assign(row, { status: 'cancelled', cancelledAt: new Date(), cancelledBy: callerId, cancelReason: reason, updatedBy: callerId });
        await row.save();
        const full = await loadFull(row.id);
        res.status(200).json({ message: `Session on ${String(row.sessionDate)} cancelled.`, session: sessionDto(full, true) });
    } catch (error) {
        console.error('Error cancelling class session:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

exports.sessionDto = sessionDto;
exports.SESSION_INCLUDE = SESSION_INCLUDE;
