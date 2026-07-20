// Course Closure Plan (spec 2.2.8). A plan is a rule header on a course; the
// user GENERATES per-day rows from it (server classifies each date in the
// period against Company Weekend Days + Public Holidays via the calendar seam
// - holidays count as weekend), reviews them, and saves the set atomically.

const { sequelize } = require('../../platform/db');
const Course = require('./course.model');
const CourseClosurePlan = require('./courseClosurePlan.model');
const CourseClosureDay = require('./courseClosureDay.model');
const { getUserContext, getCallerPlacement } = require('../../platform/serviceContext');
const { classifyDateRange } = require('../../platform/calendarGateway');
const { DAY_SCOPE_KEYS } = require('./courseTeeTime.constants');
const { NINE_SCOPE_KEYS } = require('./courseClosure.constants');

// A plan's period (and therefore a generation run) is capped at one year.
const MAX_RANGE_DAYS = 366;

// Closure plans are children of a course; every request scopes through the
// parent (active company + :id), never by plan id alone.
async function findOwnedCourse(req) {
    const companyId = getUserContext(req).companyId || null;
    if (!companyId) return { status: 400, message: 'Select a workspace first.' };
    const course = await Course.findOne({ where: { id: req.params.id, companyId } });
    if (!course) return { status: 404, message: 'Course not found.' };
    return { course };
}

async function findOwnedPlan(req) {
    const target = await findOwnedCourse(req);
    if (target.status) return target;
    const plan = await CourseClosurePlan.findOne({ where: { id: req.params.planId, courseId: target.course.id } });
    if (!plan) return { status: 404, message: 'Closure plan not found.' };
    return { course: target.course, plan };
}

// 'HH:MM' (or 'HH:MM:SS') time of day; normalized to 'HH:MM:00' for storage.
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;
function normalizeTime(v) {
    if (v === undefined || v === null || v === '') return { ok: true, value: null };
    const s = String(v).trim();
    if (!TIME_RE.test(s)) return { ok: false, value: null };
    return { ok: true, value: `${s.slice(0, 5)}:00` };
}

// 'YYYY-MM-DD'.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function rangeDays(dateFrom, dateTo) {
    const from = new Date(`${dateFrom}T00:00:00Z`).getTime();
    const to = new Date(`${dateTo}T00:00:00Z`).getTime();
    return Math.round((to - from) / 86400000) + 1;
}

// Validate the header fields shared by create/update. `body` carries only the
// fields being set; `current` (update) supplies the rest for cross-checks.
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

    if ('nineScope' in body) {
        const nineScope = String(body.nineScope || '').trim();
        if (!NINE_SCOPE_KEYS.includes(nineScope)) return { error: 'Scope must be First nine, Second nine or Whole course.' };
        out.nineScope = nineScope;
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

    // Cross-checks on the intended (merged) state.
    const from = out.dateFrom !== undefined ? out.dateFrom : current?.dateFrom;
    const to = out.dateTo !== undefined ? out.dateTo : current?.dateTo;
    if (from && to) {
        if (String(to) < String(from)) return { error: 'End date must not be before the start date.' };
        if (rangeDays(String(from), String(to)) > MAX_RANGE_DAYS) {
            return { error: 'A closure plan cannot span more than one year.' };
        }
    }

    const start = out.startTime !== undefined ? out.startTime : current?.startTime;
    const end = out.endTime !== undefined ? out.endTime : current?.endTime;
    if ((start === null) !== (end === null) && (start === null || end === null)) {
        return { error: 'Set both closure times, or leave both empty for a whole-day closure.' };
    }
    if (start && end && String(start) >= String(end)) {
        return { error: 'Closure end time must be after the start time.' };
    }

    return { values: out };
}

function listQuery(courseId) {
    return CourseClosurePlan.findAll({
        where: { courseId },
        include: [{ model: CourseClosureDay, as: 'Days' }],
        order: [
            ['dateFrom', 'DESC'],
            [{ model: CourseClosureDay, as: 'Days' }, 'closureDate', 'ASC'],
        ],
    });
}

// GET /api/golf/courses/:id/closure-plans - the course's plans with their days.
exports.listPlans = async (req, res) => {
    try {
        const target = await findOwnedCourse(req);
        if (target.status) return res.status(target.status).json({ message: target.message });
        res.status(200).json(await listQuery(target.course.id));
    } catch (error) {
        console.error('Error listing closure plans:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/golf/courses/:id/closure-plans
// Body: { description, dayScope, nineScope, dateFrom, dateTo, startTime?, endTime? }
exports.createPlan = async (req, res) => {
    try {
        const target = await findOwnedCourse(req);
        if (target.status) return res.status(target.status).json({ message: target.message });

        for (const f of ['description', 'dayScope', 'nineScope', 'dateFrom', 'dateTo']) {
            if (!(f in req.body) || req.body[f] === null || req.body[f] === '') {
                return res.status(400).json({ message: 'Description, day scope, scope and the date period are required.' });
            }
        }
        // Ensure both time fields go through validation even when omitted.
        const body = { startTime: null, endTime: null, ...req.body };
        const header = validateHeader(body, null);
        if (header.error) return res.status(400).json({ message: header.error });

        const placement = await getCallerPlacement(req);
        const callerId = getUserContext(req).userId;
        const plan = await CourseClosurePlan.create({
            ...header.values,
            courseId: target.course.id,
            createdBy: callerId,
            createdByDepartmentId: placement.departmentId,
            updatedBy: callerId,
        });
        res.status(201).json({ message: 'Closure plan created.', plan });
    } catch (error) {
        console.error('Error creating closure plan:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/golf/courses/:id/closure-plans/:planId
// Body: any header field plus { isActive }. Changing the header does NOT
// regenerate days - the user regenerates in the day editor.
exports.updatePlan = async (req, res) => {
    try {
        const target = await findOwnedPlan(req);
        if (target.status) return res.status(target.status).json({ message: target.message });
        const plan = target.plan;

        const header = validateHeader(req.body, plan);
        if (header.error) return res.status(400).json({ message: header.error });

        Object.assign(plan, header.values);
        if (typeof req.body.isActive === 'boolean') plan.isActive = req.body.isActive;
        plan.updatedBy = getUserContext(req).userId;

        await plan.save();
        res.status(200).json({ message: 'Closure plan updated.', plan });
    } catch (error) {
        console.error('Error updating closure plan:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/golf/courses/:id/closure-plans/:planId/generate-days
// Computes (does NOT save) the day rows for the plan: every date in the period
// whose day type matches the plan's day scope, seeded with the plan's times and
// nine scope. The screen shows the result for review; saving is the PUT below.
exports.generateDays = async (req, res) => {
    try {
        const target = await findOwnedPlan(req);
        if (target.status) return res.status(target.status).json({ message: target.message });
        const plan = target.plan;

        const dateFrom = String(plan.dateFrom);
        const dateTo = String(plan.dateTo);
        if (rangeDays(dateFrom, dateTo) > MAX_RANGE_DAYS) {
            return res.status(400).json({ message: 'A closure plan cannot span more than one year.' });
        }

        const classified = await classifyDateRange(req, dateFrom, dateTo);
        const days = classified
            .filter((d) => plan.dayScope === 'all' || d.dayType === plan.dayScope)
            .map((d) => ({
                closureDate: d.date,
                dayType: d.dayType,
                isHoliday: d.isHoliday,
                nineScope: plan.nineScope,
                startTime: plan.startTime,
                endTime: plan.endTime,
                isActive: true,
            }));

        res.status(200).json({ days, totalInPeriod: classified.length });
    } catch (error) {
        console.error('Error generating closure days:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/golf/courses/:id/closure-plans/:planId/days
// Body: { days: [{ closureDate, nineScope, startTime?, endTime?, isActive? }] }
// Replaces the plan's day list atomically (generated server-side, then
// hand-adjusted on the screen).
exports.saveDays = async (req, res) => {
    try {
        const target = await findOwnedPlan(req);
        if (target.status) return res.status(target.status).json({ message: target.message });
        const plan = target.plan;

        const rawDays = Array.isArray(req.body.days) ? req.body.days : [];
        if (rawDays.length > MAX_RANGE_DAYS) {
            return res.status(400).json({ message: 'A closure plan cannot have more than a year of days.' });
        }

        const rows = [];
        const seenDates = new Set();
        for (const d of rawDays) {
            const closureDate = String(d.closureDate || '').trim();
            if (!DATE_RE.test(closureDate)) {
                return res.status(400).json({ message: 'Every closure day needs a date (YYYY-MM-DD).' });
            }
            if (seenDates.has(closureDate)) {
                return res.status(400).json({ message: `Closure date ${closureDate} appears more than once.` });
            }
            seenDates.add(closureDate);

            const nineScope = String(d.nineScope || '').trim();
            if (!NINE_SCOPE_KEYS.includes(nineScope)) {
                return res.status(400).json({ message: `${closureDate}: scope must be First nine, Second nine or Whole course.` });
            }

            const start = normalizeTime(d.startTime);
            const end = normalizeTime(d.endTime);
            if (!start.ok || !end.ok) {
                return res.status(400).json({ message: `${closureDate}: closure times must be valid times (HH:MM).` });
            }
            if ((start.value === null) !== (end.value === null)) {
                return res.status(400).json({ message: `${closureDate}: set both closure times, or leave both empty for a whole-day closure.` });
            }
            if (start.value && end.value && String(start.value) >= String(end.value)) {
                return res.status(400).json({ message: `${closureDate}: closure end time must be after the start time.` });
            }

            rows.push({
                closurePlanId: plan.id,
                closureDate,
                nineScope,
                startTime: start.value,
                endTime: end.value,
                isActive: d.isActive !== false,
            });
        }

        await sequelize.transaction(async (t) => {
            await CourseClosureDay.destroy({ where: { closurePlanId: plan.id }, transaction: t });
            if (rows.length) await CourseClosureDay.bulkCreate(rows, { transaction: t });
        });

        const days = await CourseClosureDay.findAll({
            where: { closurePlanId: plan.id },
            order: [['closureDate', 'ASC']],
        });
        res.status(200).json({ message: `${days.length} closure day${days.length === 1 ? '' : 's'} saved.`, days });
    } catch (error) {
        console.error('Error saving closure days:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
