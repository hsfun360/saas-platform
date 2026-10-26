// Class schedules (/facility/classes, the Schedules drawer; slice 5a,
// structures approved 2026-10-26) - the recurrence header of a class and its
// generated sessions. The header is PREVIEWED first (every date with its
// outcome: ok / skipped / conflict), then saved with the sessions of the ok
// dates in one transaction. An edit re-plans the FUTURE sessions: those
// still on the pattern take the new facts, those off it are cancelled, new
// dates are generated; past and held sessions are never touched. Closing a
// schedule stops new enrolments (slice 5b); cancelling it cancels every
// future session with the reason.

const { Op } = require('sequelize');
const FacilityClass = require('./class.model');
const FacilityVenue = require('./venue.model');
const FacilityInstructor = require('./instructor.model');
const FacilityClassSchedule = require('./classSchedule.model');
const FacilityClassSession = require('./classSession.model');
const { sequelize } = require('../../platform/db');
const { getUserContext } = require('../../platform/serviceContext');
const { companyTimezoneById } = require('../../platform/calendarGateway');
const { LIMITS } = require('./facility.constants');
const { companyIdOf, stampsFor, normalizeTime, timeDto, DATE_RE, rangeDays, parseOptionalInt } = require('./facilityShared');
const rules = require('./bookingRules.service');
const svc = require('./classSchedule.service');

const SCHEDULE_INCLUDE = [
    { model: FacilityVenue, as: 'Venue', attributes: ['id', 'code', 'name'], required: false },
    { model: FacilityInstructor, as: 'Instructor', attributes: ['id', 'code', 'name'], required: false },
];

function scheduleDto(row, counts = {}) {
    const p = row.get ? row.get({ plain: true }) : row;
    const venue = p.Venue || null;
    const instructor = p.Instructor || null;
    return {
        ...p,
        Venue: undefined,
        Instructor: undefined,
        startTime: timeDto(p.startTime),
        endTime: timeDto(p.endTime),
        weekdays: Array.isArray(p.weekdays) ? p.weekdays : [],
        venue: venue ? { id: venue.id, code: venue.code, name: venue.name } : null,
        instructor: instructor ? { id: instructor.id, code: instructor.code, name: instructor.name } : null,
        sessionCounts: { scheduled: counts.scheduled || 0, held: counts.held || 0, cancelled: counts.cancelled || 0 },
        nextSessionDate: counts.nextSessionDate || null,
    };
}

async function findOwnedClass(req) {
    const companyId = companyIdOf(req);
    if (!companyId) return { status: 400, message: 'Select a workspace first.' };
    const cls = await FacilityClass.findOne({ where: { id: req.params.id, companyId } });
    if (!cls) return { status: 404, message: 'Class not found.' };
    return { companyId, cls };
}

async function findOwnedSchedule(req) {
    const owned = await findOwnedClass(req);
    if (owned.status) return owned;
    const schedule = await FacilityClassSchedule.findOne({ where: { id: req.params.scheduleId, classId: owned.cls.id } });
    if (!schedule) return { status: 404, message: 'Schedule not found.' };
    return { ...owned, schedule };
}

// Validate the header fields present in `body`; `current` supplies the rest.
function validateHeader(body, current) {
    const out = {};
    if ('name' in body) {
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name) return { error: 'Name the schedule (Term 1 2027, Weekday mornings).' };
        out.name = name;
    }
    for (const [field, label] of [['dateFrom', 'First day'], ['dateTo', 'Last day']]) {
        if (!(field in body)) continue;
        const v = String(body[field] || '').trim();
        if (!DATE_RE.test(v)) return { error: `${label} is required (YYYY-MM-DD).` };
        out[field] = v;
    }
    if ('weekdays' in body) {
        const days = svc.normalizeWeekdays(body.weekdays);
        if (!days) return { error: 'Tick at least one weekday the class runs on.' };
        out.weekdays = days;
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
        if (!n.ok) return { error: `Capacity must be a whole number between 1 and ${LIMITS.maxVenueCapacity}, or blank for the class default.` };
        out.capacity = n.value;
    }
    for (const flag of ['skipClosures', 'skipPublicHolidays']) {
        if (typeof body[flag] === 'boolean') out[flag] = body[flag];
    }
    for (const field of ['termFeeNote', 'remarks']) {
        if (field in body) out[field] = typeof body[field] === 'string' && body[field].trim() ? body[field].trim() : null;
    }
    const merged = { ...(current ? current.get({ plain: true }) : {}), ...out };
    if (merged.dateFrom && merged.dateTo) {
        if (String(merged.dateTo) < String(merged.dateFrom)) return { error: 'The last day must not be before the first day.' };
        if (rangeDays(String(merged.dateFrom), String(merged.dateTo)) > LIMITS.maxScheduleRangeDays) return { error: 'A schedule cannot span more than one year.' };
    }
    if (merged.startTime && merged.endTime && String(merged.startTime) >= String(merged.endTime)) return { error: 'The end time must be after the start time.' };
    return { values: out, merged };
}

// The venue and instructor a header resolves to (with the venue's unit for
// the blocking), checked active. Returns { error } or { venue, facts }.
async function resolveHeader(companyId, cls, merged) {
    const venue = await svc.loadVenue(companyId, merged.venueId || cls.venueId);
    if ((merged.venueId || cls.venueId) && !venue) return { error: 'Pick a venue of the active company.' };
    if (venue && venue.isActive === false) return { error: `Venue ${venue.code} is disabled - pick another.` };
    const facts = svc.resolveFacts({ cls, header: merged, venue });
    if (facts.error) return { error: facts.error };
    const instructor = await FacilityInstructor.findOne({ where: { id: facts.instructorId, companyId } });
    if (!instructor) return { error: 'Pick an instructor of the active company.' };
    if (instructor.isActive === false) return { error: `Instructor ${instructor.code} is disabled - pick another.` };
    return { venue, facts: { ...facts, facilityId: venue && venue.Facility ? venue.Facility.id : null } };
}

const DEFAULT_HEADER = { skipClosures: true, skipPublicHolidays: true, venueId: null, instructorId: null, capacity: null, termFeeNote: null, remarks: null };

async function sessionCounts(scheduleIds) {
    if (!scheduleIds.length) return new Map();
    const rows = await FacilityClassSession.findAll({
        where: { scheduleId: { [Op.in]: scheduleIds } },
        attributes: ['scheduleId', 'status', [sequelize.fn('COUNT', sequelize.col('id')), 'n'], [sequelize.fn('MIN', sequelize.col('sessionDate')), 'first']],
        group: ['scheduleId', 'status'],
        raw: true,
    });
    const map = new Map();
    for (const r of rows) {
        const cur = map.get(r.scheduleId) || {};
        cur[r.status] = Number(r.n);
        map.set(r.scheduleId, cur);
    }
    const today = new Date().toISOString().slice(0, 10);
    const next = await FacilityClassSession.findAll({
        where: { scheduleId: { [Op.in]: scheduleIds }, status: 'scheduled', sessionDate: { [Op.gte]: today } },
        attributes: ['scheduleId', [sequelize.fn('MIN', sequelize.col('sessionDate')), 'next']],
        group: ['scheduleId'],
        raw: true,
    });
    for (const r of next) {
        const cur = map.get(r.scheduleId) || {};
        cur.nextSessionDate = r.next ? String(r.next) : null;
        map.set(r.scheduleId, cur);
    }
    return map;
}

async function loadSchedule(id) {
    return FacilityClassSchedule.findOne({ where: { id }, include: SCHEDULE_INCLUDE });
}

// GET /api/facility/classes/:id/schedules
exports.list = async (req, res) => {
    try {
        const owned = await findOwnedClass(req);
        if (owned.status) return res.status(owned.status).json({ message: owned.message });
        const rows = await FacilityClassSchedule.findAll({ where: { classId: owned.cls.id }, include: SCHEDULE_INCLUDE, order: [['dateFrom', 'DESC'], ['createdAt', 'DESC']] });
        const counts = await sessionCounts(rows.map((r) => r.id));
        res.status(200).json(rows.map((r) => scheduleDto(r, counts.get(r.id))));
    } catch (error) {
        console.error('Error listing class schedules:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/classes/:id/schedules/preview - the dates a header
// would generate, each marked ok / skipped / conflict (nothing saved).
exports.preview = async (req, res) => {
    try {
        const owned = await findOwnedClass(req);
        if (owned.status) return res.status(owned.status).json({ message: owned.message });
        const { companyId, cls } = owned;
        const current = req.body.scheduleId ? await FacilityClassSchedule.findOne({ where: { id: String(req.body.scheduleId), classId: cls.id } }) : null;
        const header = validateHeader({ ...(current ? {} : DEFAULT_HEADER), ...req.body }, current);
        if (header.error) return res.status(400).json({ message: header.error });
        for (const f of ['dateFrom', 'dateTo', 'weekdays', 'startTime', 'endTime']) {
            if (header.merged[f] === undefined || header.merged[f] === null) return res.status(400).json({ message: 'The date range, the weekdays and the times are required.' });
        }
        const resolved = await resolveHeader(companyId, cls, header.merged);
        if (resolved.error) return res.status(400).json({ message: resolved.error });
        const out = await svc.preview(companyId, { header: header.merged, venue: resolved.venue, instructorId: resolved.facts.instructorId, excludeScheduleId: current ? current.id : null });
        res.status(200).json({ ...out, facts: resolved.facts, blocksUnit: svc.venueBlocksUnit(resolved.venue) });
    } catch (error) {
        console.error('Error previewing class schedule:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/classes/:id/schedules - the header and the sessions of
// the ok dates, in one transaction.
exports.create = async (req, res) => {
    try {
        const owned = await findOwnedClass(req);
        if (owned.status) return res.status(owned.status).json({ message: owned.message });
        const { companyId, cls } = owned;
        if (cls.isActive === false) return res.status(409).json({ message: `${cls.code} is disabled - enable it before adding a schedule.` });
        for (const f of ['name', 'dateFrom', 'dateTo', 'weekdays', 'startTime', 'endTime']) {
            if (!(f in req.body) || req.body[f] === null || req.body[f] === '') return res.status(400).json({ message: 'Name, the date range, the weekdays and the times are required.' });
        }
        const header = validateHeader({ ...DEFAULT_HEADER, ...req.body }, null);
        if (header.error) return res.status(400).json({ message: header.error });
        const resolved = await resolveHeader(companyId, cls, header.merged);
        if (resolved.error) return res.status(400).json({ message: resolved.error });
        const { rows, counts } = await svc.preview(companyId, { header: header.merged, venue: resolved.venue, instructorId: resolved.facts.instructorId });
        if (!counts.ok) return res.status(400).json({ message: `No session can be generated - ${counts.skipped} date${counts.skipped === 1 ? '' : 's'} skipped, ${counts.conflict} in conflict. Change the dates or the times.` });
        const stamps = await stampsFor(req);
        const created = await sequelize.transaction(async (transaction) => {
            const schedule = await FacilityClassSchedule.create({ companyId, classId: cls.id, ...header.values, status: 'active', ...stamps }, { transaction });
            await FacilityClassSession.bulkCreate(rows.filter((r) => r.status === 'ok').map((r) => ({
                companyId, classId: cls.id, scheduleId: schedule.id, sessionDate: r.date, startTime: header.values.startTime, endTime: header.values.endTime,
                venueId: resolved.facts.venueId, facilityId: resolved.facts.facilityId, instructorId: resolved.facts.instructorId, capacity: resolved.facts.capacity, status: 'scheduled', ...stamps,
            })), { transaction });
            return schedule;
        });
        const full = await loadSchedule(created.id);
        const sc = await sessionCounts([created.id]);
        res.status(201).json({ message: `Schedule saved with ${counts.ok} session${counts.ok === 1 ? '' : 's'}${counts.skipped ? `, ${counts.skipped} skipped` : ''}${counts.conflict ? `, ${counts.conflict} in conflict left out` : ''}.`, schedule: scheduleDto(full, sc.get(created.id)), counts });
    } catch (error) {
        console.error('Error creating class schedule:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/facility/classes/:id/schedules/:scheduleId - the header, re-
// planning the FUTURE sessions: on-pattern ones take the new facts, off-
// pattern ones are cancelled, new dates are generated; past and held
// sessions stay as they are.
exports.update = async (req, res) => {
    try {
        const owned = await findOwnedSchedule(req);
        if (owned.status) return res.status(owned.status).json({ message: owned.message });
        const { companyId, cls, schedule } = owned;
        if (schedule.status === 'cancelled') return res.status(409).json({ message: 'A cancelled schedule cannot be edited.' });
        const header = validateHeader(req.body, schedule);
        if (header.error) return res.status(400).json({ message: header.error });
        const resolved = await resolveHeader(companyId, cls, header.merged);
        if (resolved.error) return res.status(400).json({ message: resolved.error });
        const { rows, counts } = await svc.preview(companyId, { header: header.merged, venue: resolved.venue, instructorId: resolved.facts.instructorId, excludeScheduleId: schedule.id });
        const okDates = new Set(rows.filter((r) => r.status === 'ok').map((r) => r.date));
        const today = rules.clubNow(await companyTimezoneById(companyId)).date;
        const callerId = getUserContext(req).userId;
        const stamps = await stampsFor(req);
        const facts = { startTime: header.merged.startTime, endTime: header.merged.endTime, venueId: resolved.facts.venueId, facilityId: resolved.facts.facilityId, instructorId: resolved.facts.instructorId, capacity: resolved.facts.capacity };
        const summary = { updated: 0, created: 0, cancelled: 0, restored: 0 };
        await sequelize.transaction(async (transaction) => {
            Object.assign(schedule, header.values, { updatedBy: callerId });
            await schedule.save({ transaction });
            const existing = await FacilityClassSession.findAll({ where: { scheduleId: schedule.id }, transaction });
            const byDate = new Map(existing.map((s) => [String(s.sessionDate), s]));
            for (const s of existing) {
                const date = String(s.sessionDate);
                if (date < today || s.status === 'held') continue;
                if (okDates.has(date)) {
                    if (s.status === 'cancelled') { Object.assign(s, facts, { status: 'scheduled', cancelledAt: null, cancelledBy: null, cancelReason: null, updatedBy: callerId }); summary.restored += 1; }
                    else { Object.assign(s, facts, { updatedBy: callerId }); summary.updated += 1; }
                    await s.save({ transaction });
                } else if (s.status === 'scheduled') {
                    Object.assign(s, { status: 'cancelled', cancelledAt: new Date(), cancelledBy: callerId, cancelReason: 'Schedule changed', updatedBy: callerId });
                    await s.save({ transaction });
                    summary.cancelled += 1;
                }
            }
            const fresh = [...okDates].filter((d) => d >= today && !byDate.has(d));
            if (fresh.length) {
                await FacilityClassSession.bulkCreate(fresh.map((date) => ({ companyId, classId: cls.id, scheduleId: schedule.id, sessionDate: date, ...facts, status: 'scheduled', ...stamps })), { transaction });
                summary.created = fresh.length;
            }
        });
        const full = await loadSchedule(schedule.id);
        const sc = await sessionCounts([schedule.id]);
        const parts = [];
        if (summary.updated) parts.push(`${summary.updated} updated`);
        if (summary.created) parts.push(`${summary.created} added`);
        if (summary.restored) parts.push(`${summary.restored} restored`);
        if (summary.cancelled) parts.push(`${summary.cancelled} cancelled`);
        if (counts.conflict) parts.push(`${counts.conflict} in conflict left out`);
        res.status(200).json({ message: `Schedule updated${parts.length ? ' - ' + parts.join(', ') : ''}.`, schedule: scheduleDto(full, sc.get(schedule.id)), summary, counts });
    } catch (error) {
        console.error('Error updating class schedule:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/classes/:id/schedules/:scheduleId/close - no new
// enrolments; the sessions run out.
exports.close = async (req, res) => {
    try {
        const owned = await findOwnedSchedule(req);
        if (owned.status) return res.status(owned.status).json({ message: owned.message });
        const { schedule } = owned;
        if (schedule.status !== 'active') return res.status(409).json({ message: `The schedule is already ${schedule.status}.` });
        Object.assign(schedule, { status: 'closed', updatedBy: getUserContext(req).userId });
        await schedule.save();
        const full = await loadSchedule(schedule.id);
        const sc = await sessionCounts([schedule.id]);
        res.status(200).json({ message: `${schedule.name} closed to new enrolments.`, schedule: scheduleDto(full, sc.get(schedule.id)) });
    } catch (error) {
        console.error('Error closing class schedule:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/classes/:id/schedules/:scheduleId/cancel - every future
// scheduled session is cancelled with the reason.
exports.cancel = async (req, res) => {
    try {
        const owned = await findOwnedSchedule(req);
        if (owned.status) return res.status(owned.status).json({ message: owned.message });
        const { companyId, schedule } = owned;
        if (schedule.status === 'cancelled') return res.status(409).json({ message: 'The schedule is already cancelled.' });
        const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
        if (!reason) return res.status(400).json({ message: 'Give the reason for cancelling the schedule.' });
        const today = rules.clubNow(await companyTimezoneById(companyId)).date;
        const callerId = getUserContext(req).userId;
        let n = 0;
        await sequelize.transaction(async (transaction) => {
            Object.assign(schedule, { status: 'cancelled', updatedBy: callerId });
            await schedule.save({ transaction });
            [n] = await FacilityClassSession.update(
                { status: 'cancelled', cancelledAt: new Date(), cancelledBy: callerId, cancelReason: reason, updatedBy: callerId },
                { where: { scheduleId: schedule.id, status: 'scheduled', sessionDate: { [Op.gte]: today } }, transaction },
            );
        });
        const full = await loadSchedule(schedule.id);
        const sc = await sessionCounts([schedule.id]);
        res.status(200).json({ message: `${schedule.name} cancelled - ${n} future session${n === 1 ? '' : 's'} cancelled.`, schedule: scheduleDto(full, sc.get(schedule.id)) });
    } catch (error) {
        console.error('Error cancelling class schedule:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
