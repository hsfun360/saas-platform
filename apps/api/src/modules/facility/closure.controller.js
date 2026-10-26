// Facility Closures (/facility/closures; structure approved 2026-10-25;
// pattern of golf/closure.controller.js). A plan closes a Facility Type -
// ONE unit or every unit of the type - over a date period; the user
// GENERATES per-day rows from it (the server classifies each date through
// the calendar seam, holidays count as weekend), reviews them, and saves the
// set atomically. The screen lists every plan of the company in one place,
// so the endpoints are PLAN-centric: create takes the type plus the target
// units (one plan per unit, or one type-wide plan when none is picked).

const { sequelize } = require('../../platform/db');
const { Op } = require('sequelize');
const FacilityType = require('./facilityType.model');
const Facility = require('./facility.model');
const FacilityClosurePlan = require('./facilityClosurePlan.model');
const FacilityClosureDay = require('./facilityClosureDay.model');
const { getUserContext } = require('../../platform/serviceContext');
const { classifyDateRange } = require('../../platform/calendarGateway');
const { DAY_SCOPE_KEYS, LIMITS } = require('./facility.constants');
const { companyIdOf, stampsFor, normalizeTime, timeDto, DATE_RE, rangeDays } = require('./facilityShared');
const FacilityClassSession = require('./classSession.model');
const FacilityClass = require('./class.model');
const { overlaps } = require('./classScheduleRules.service');
const lifecycle = require('./classLifecycle.service');
const { bookingDateText } = require('./bookingShared');

// Slice 5c: the scheduled class sessions on the plan's unit(s) that a set of
// closure days would cover - the preview warns, the save cancels them.
function toMin(t) { const [h, m] = String(t).split(':'); return Number(h) * 60 + Number(m); }
async function collidingSessions(plan, days, { transaction } = {}) {
    const active = days.filter((d) => d.isActive !== false);
    if (!active.length) return [];
    const units = plan.facilityId ? [plan.facilityId] : (await Facility.findAll({ where: { facilityTypeId: plan.facilityTypeId }, attributes: ['id'], transaction })).map((f) => f.id);
    if (!units.length) return [];
    const byDate = new Map(active.map((d) => [String(d.closureDate), d]));
    const sessions = await FacilityClassSession.findAll({
        where: { companyId: plan.companyId, facilityId: { [Op.in]: units }, status: 'scheduled', sessionDate: { [Op.in]: [...byDate.keys()] } },
        order: [['sessionDate', 'ASC'], ['startTime', 'ASC']], transaction,
    });
    const hit = sessions.filter((s) => {
        const d = byDate.get(String(s.sessionDate));
        if (!d.startTime || !d.endTime) return true;
        return overlaps(toMin(s.startTime), toMin(s.endTime), toMin(d.startTime), toMin(d.endTime));
    });
    if (!hit.length) return [];
    const classes = await FacilityClass.findAll({ where: { id: { [Op.in]: [...new Set(hit.map((s) => s.classId))] } }, attributes: ['id', 'code'], transaction });
    const codeById = new Map(classes.map((c) => [c.id, c.code]));
    return hit.map((s) => ({ sessionId: s.id, sessionDate: String(s.sessionDate), startTime: timeDto(s.startTime), endTime: timeDto(s.endTime), classCode: codeById.get(s.classId) || '', row: s }));
}
function sessionWarning(s) { return `${s.classCode} ${bookingDateText(s.sessionDate)} ${s.startTime} - ${s.endTime}`; }

const MAX_RANGE_DAYS = LIMITS.maxClosureRangeDays;

async function findOwnedPlan(req) {
    const companyId = companyIdOf(req);
    if (!companyId) return { status: 400, message: 'Select a workspace first.' };
    const plan = await FacilityClosurePlan.findOne({ where: { id: req.params.planId, companyId } });
    if (!plan) return { status: 404, message: 'Closure plan not found.' };
    return { companyId, plan };
}

function dayDto(d) {
    const p = d.get ? d.get({ plain: true }) : d;
    return { ...p, startTime: timeDto(p.startTime), endTime: timeDto(p.endTime) };
}

function planDto(plan) {
    const p = plan.get ? plan.get({ plain: true }) : plan;
    const type = p.FacilityType || null;
    const unit = p.Facility || null;
    return {
        ...p,
        FacilityType: undefined,
        Facility: undefined,
        Days: undefined,
        startTime: timeDto(p.startTime),
        endTime: timeDto(p.endTime),
        facilityType: type ? { id: type.id, code: type.code, description: type.description, usageMode: type.usageMode } : null,
        facility: unit ? { id: unit.id, code: unit.code, name: unit.name } : null,
        days: (p.Days || []).map(dayDto),
    };
}

// Validate the header fields present in `body`; `current` supplies the rest.
function validateHeader(body, current) {
    const out = {};
    if ('description' in body) {
        const description = typeof body.description === 'string' ? body.description.trim() : '';
        if (!description) return { error: 'Description is required.' };
        out.description = description;
    }
    if ('dayScope' in body) {
        const dayScope = String(body.dayScope || '').trim();
        if (!DAY_SCOPE_KEYS.includes(dayScope)) return { error: 'Day scope must be All days, Weekdays or Weekends.' };
        out.dayScope = dayScope;
    }
    for (const [field, label] of [['dateFrom', 'Start date'], ['dateTo', 'End date']]) {
        if (!(field in body)) continue;
        const v = String(body[field] || '').trim();
        if (!DATE_RE.test(v)) return { error: `${label} is required (YYYY-MM-DD).` };
        out[field] = v;
    }
    for (const field of ['startTime', 'endTime']) {
        if (!(field in body)) continue;
        const t = normalizeTime(body[field]);
        if (!t.ok) return { error: 'Closure times must be valid times (HH:MM).' };
        out[field] = t.value;
    }
    const from = out.dateFrom !== undefined ? out.dateFrom : current?.dateFrom;
    const to = out.dateTo !== undefined ? out.dateTo : current?.dateTo;
    if (from && to) {
        if (String(to) < String(from)) return { error: 'End date must not be before the start date.' };
        if (rangeDays(String(from), String(to)) > MAX_RANGE_DAYS) return { error: 'A closure plan cannot span more than one year.' };
    }
    const start = out.startTime !== undefined ? out.startTime : (current ? current.startTime : null);
    const end = out.endTime !== undefined ? out.endTime : (current ? current.endTime : null);
    if ((start === null) !== (end === null)) return { error: 'Set both closure times, or leave both empty for a whole-day closure.' };
    if (start && end && String(start) >= String(end)) return { error: 'Closure end time must be after the start time.' };
    return { values: out };
}

const PLAN_INCLUDE = [
    { model: FacilityType, as: 'FacilityType', attributes: ['id', 'code', 'description', 'usageMode'] },
    { model: Facility, as: 'Facility', attributes: ['id', 'code', 'name'], required: false },
    { model: FacilityClosureDay, as: 'Days' },
];

// GET /api/facility/closure-plans - every plan of the company (newest period
// first) with its days, plus the active types and units for the create dialog.
exports.list = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const [plans, types, units] = await Promise.all([
            FacilityClosurePlan.findAll({
                where: { companyId },
                include: PLAN_INCLUDE,
                order: [['dateFrom', 'DESC'], ['createdAt', 'DESC'], [{ model: FacilityClosureDay, as: 'Days' }, 'closureDate', 'ASC']],
            }),
            FacilityType.findAll({ where: { companyId, isActive: true }, attributes: ['id', 'code', 'description', 'usageMode'], order: [['sortOrder', 'ASC'], ['code', 'ASC']] }),
            Facility.findAll({ where: { companyId, isActive: true }, attributes: ['id', 'facilityTypeId', 'code', 'name'], order: [['sortOrder', 'ASC'], ['code', 'ASC']] }),
        ]);
        res.status(200).json({ plans: plans.map(planDto), types, facilities: units });
    } catch (error) {
        console.error('Error listing facility closure plans:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/closure-plans
// Body: { facilityTypeId, facilityIds?: [..], description, dayScope,
//         dateFrom, dateTo, startTime?, endTime? } - one plan per unit, or
// ONE type-wide plan when no unit is picked.
exports.create = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        for (const f of ['facilityTypeId', 'description', 'dayScope', 'dateFrom', 'dateTo']) {
            if (!(f in req.body) || req.body[f] === null || req.body[f] === '') {
                return res.status(400).json({ message: 'Facility type, description, day scope and the date period are required.' });
            }
        }
        const body = { startTime: null, endTime: null, ...req.body };
        const header = validateHeader(body, null);
        if (header.error) return res.status(400).json({ message: header.error });

        const type = await FacilityType.findOne({ where: { id: String(req.body.facilityTypeId), companyId } });
        if (!type) return res.status(400).json({ message: 'Pick a facility type of the active company.' });
        const unitIds = [...new Set((Array.isArray(req.body.facilityIds) ? req.body.facilityIds : []).map(String))];
        if (unitIds.length) {
            const owned = await Facility.count({ where: { id: { [Op.in]: unitIds }, facilityTypeId: type.id } });
            if (owned !== unitIds.length) return res.status(400).json({ message: `Every selected facility must belong to ${type.code}.` });
        }

        const stamps = await stampsFor(req);
        const targets = unitIds.length ? unitIds : [null];
        const created = await sequelize.transaction((t) => Promise.all(targets.map((facilityId) => (
            FacilityClosurePlan.create({ ...header.values, companyId, facilityTypeId: type.id, facilityId, ...stamps }, { transaction: t })
        ))));
        const plans = await FacilityClosurePlan.findAll({ where: { id: { [Op.in]: created.map((p) => p.id) } }, include: PLAN_INCLUDE });
        res.status(201).json({
            message: plans.length === 1 ? 'Closure plan created.' : `Closure plan created on ${plans.length} facilities.`,
            plans: plans.map(planDto),
        });
    } catch (error) {
        console.error('Error creating facility closure plan:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/facility/closure-plans/:planId - header fields + isActive.
// Changing the header does NOT regenerate days; the user regenerates in the
// day editor. The plan's type and unit are fixed.
exports.update = async (req, res) => {
    try {
        const target = await findOwnedPlan(req);
        if (target.status) return res.status(target.status).json({ message: target.message });
        const plan = target.plan;
        const header = validateHeader(req.body, plan);
        if (header.error) return res.status(400).json({ message: header.error });
        Object.assign(plan, header.values, { updatedBy: getUserContext(req).userId });
        if (typeof req.body.isActive === 'boolean') plan.isActive = req.body.isActive;
        await plan.save();
        const full = await FacilityClosurePlan.findOne({ where: { id: plan.id }, include: PLAN_INCLUDE, order: [[{ model: FacilityClosureDay, as: 'Days' }, 'closureDate', 'ASC']] });
        res.status(200).json({ message: 'Closure plan updated.', plan: planDto(full) });
    } catch (error) {
        console.error('Error updating facility closure plan:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/facility/closure-plans/:planId (days cascade).
exports.remove = async (req, res) => {
    try {
        const target = await findOwnedPlan(req);
        if (target.status) return res.status(target.status).json({ message: target.message });
        await target.plan.destroy();
        res.status(200).json({ message: 'Closure plan deleted.' });
    } catch (error) {
        console.error('Error deleting facility closure plan:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/closure-plans/:planId/generate-days - computes (does
// NOT save) the day rows: every date in the period whose day type matches
// the plan's day scope, seeded with the plan's times.
exports.generateDays = async (req, res) => {
    try {
        const target = await findOwnedPlan(req);
        if (target.status) return res.status(target.status).json({ message: target.message });
        const plan = target.plan;
        const dateFrom = String(plan.dateFrom);
        const dateTo = String(plan.dateTo);
        if (rangeDays(dateFrom, dateTo) > MAX_RANGE_DAYS) return res.status(400).json({ message: 'A closure plan cannot span more than one year.' });
        const classified = await classifyDateRange(req, dateFrom, dateTo);
        const days = classified
            .filter((d) => plan.dayScope === 'all' || d.dayType === plan.dayScope)
            .map((d) => ({ closureDate: d.date, dayType: d.dayType, isHoliday: d.isHoliday, startTime: timeDto(plan.startTime), endTime: timeDto(plan.endTime), isActive: true }));
        const colliding = await collidingSessions(plan, days);
        res.status(200).json({ days, totalInPeriod: classified.length, classSessions: colliding.map(({ row, ...c }) => c) });
    } catch (error) {
        console.error('Error generating facility closure days:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/facility/closure-plans/:planId/days - replace the day list
// atomically (generated server-side, then hand-adjusted on the screen).
exports.saveDays = async (req, res) => {
    try {
        const target = await findOwnedPlan(req);
        if (target.status) return res.status(target.status).json({ message: target.message });
        const plan = target.plan;
        const rawDays = Array.isArray(req.body.days) ? req.body.days : [];
        if (rawDays.length > MAX_RANGE_DAYS) return res.status(400).json({ message: 'A closure plan cannot have more than a year of days.' });

        const rows = [];
        const seen = new Set();
        for (const d of rawDays) {
            const closureDate = String(d.closureDate || '').trim();
            if (!DATE_RE.test(closureDate)) return res.status(400).json({ message: 'Every closure day needs a date (YYYY-MM-DD).' });
            if (seen.has(closureDate)) return res.status(400).json({ message: `Closure date ${closureDate} appears more than once.` });
            seen.add(closureDate);
            const start = normalizeTime(d.startTime);
            const end = normalizeTime(d.endTime);
            if (!start.ok || !end.ok) return res.status(400).json({ message: `${closureDate}: closure times must be valid times (HH:MM).` });
            if ((start.value === null) !== (end.value === null)) return res.status(400).json({ message: `${closureDate}: set both closure times, or leave both empty for a whole-day closure.` });
            if (start.value && end.value && String(start.value) >= String(end.value)) return res.status(400).json({ message: `${closureDate}: closure end time must be after the start time.` });
            rows.push({ closurePlanId: plan.id, closureDate, startTime: start.value, endTime: end.value, isActive: d.isActive !== false });
        }

        // Slice 5c: a closure over a scheduled class session of a linked venue
        // cancels the session (the preview warned); its seats cascade.
        const callerId = getUserContext(req).userId;
        const reason = `Facility closed - ${plan.description || 'closure'}`;
        const notify = [];
        let cancelled = 0;
        await sequelize.transaction(async (t) => {
            await FacilityClosureDay.destroy({ where: { closurePlanId: plan.id }, transaction: t });
            if (rows.length) await FacilityClosureDay.bulkCreate(rows, { transaction: t });
            plan.updatedBy = callerId;
            await plan.save({ transaction: t });
            if (plan.isActive !== false) {
                for (const c of await collidingSessions(plan, rows, { transaction: t })) {
                    Object.assign(c.row, { status: 'cancelled', cancelledAt: new Date(), cancelledBy: callerId, cancelReason: reason, updatedBy: callerId });
                    await c.row.save({ transaction: t });
                    cancelled += 1;
                    const cas = await lifecycle.cancelSessionCascade(c.row, { reason, callerId, transaction: t });
                    if (cas.recipients.length) notify.push({ session: c.row, recipients: cas.recipients });
                }
            }
        });
        for (const x of notify) lifecycle.notifySessionCancelled(x.session, reason, x.recipients).catch((e) => console.error('Error emailing a cancelled class session:', e));
        const days = await FacilityClosureDay.findAll({ where: { closurePlanId: plan.id }, order: [['closureDate', 'ASC']] });
        res.status(200).json({ message: `${days.length} closure day${days.length === 1 ? '' : 's'} saved${cancelled ? ` - ${cancelled} class session${cancelled === 1 ? '' : 's'} cancelled` : ''}.`, days: days.map(dayDto), classSessionsCancelled: cancelled });
    } catch (error) {
        console.error('Error saving facility closure days:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
