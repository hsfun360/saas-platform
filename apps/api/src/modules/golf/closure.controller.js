// Course Closure (spec 2.2.8; STANDALONE MENU 2026-09-30). A plan closes ONE
// physical nine over a date period; the user GENERATES per-day rows from it
// (server classifies each date against Company Weekend Days + Public
// Holidays via the calendar seam - holidays count as weekend), reviews them,
// and saves the set atomically.
//
// Moved out of the Unit Courses screen so closure keying is grantable on its
// own (user decision: maintenance schedulers must not need - or get - the
// Unit Course setup grant). The screen lists EVERY nine's plans in one
// place, so the endpoints are PLAN-centric: create takes the target nines
// (one plan per nine), and :planId requests scope through the plan's unit
// course to the active company.

const { sequelize } = require('../../platform/db');
const { Op } = require('sequelize');
const UnitCourse = require('./unitCourse.model');
const UnitCourseClosurePlan = require('./unitCourseClosurePlan.model');
const UnitCourseClosureDay = require('./unitCourseClosureDay.model');
const { getUserContext, getCallerPlacement } = require('../../platform/serviceContext');
const { classifyDateRange } = require('../../platform/calendarGateway');
const { DAY_SCOPE_KEYS } = require('./courseTeeTime.constants');

// A plan's period (and therefore a generation run) is capped at one year.
const MAX_RANGE_DAYS = 366;

function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

// Resolve :planId to a plan OWNED by the active company (scoped through the
// plan's unit course - closure plans have no companyId of their own).
async function findOwnedPlan(req) {
    const companyId = companyIdOf(req);
    if (!companyId) return { status: 400, message: 'Select a workspace first.' };
    const plan = await UnitCourseClosurePlan.findOne({
        where: { id: req.params.planId },
        include: [{ model: UnitCourse, as: 'UnitCourse', where: { companyId } }],
    });
    if (!plan) return { status: 404, message: 'Closure plan not found.' };
    return { companyId, plan };
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

// GET /api/golf/closures - EVERY closure plan of the active company, newest
// period first, each with its days and its nine's code/description (the
// screen's one listing across all nines). Also returns the active nines for
// the create dialog's picker.
exports.list = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const plans = await UnitCourseClosurePlan.findAll({
            include: [
                { model: UnitCourse, as: 'UnitCourse', where: { companyId }, attributes: ['id', 'unitCourseCode', 'description'] },
                { model: UnitCourseClosureDay, as: 'Days' },
            ],
            order: [
                ['dateFrom', 'DESC'],
                ['createdAt', 'DESC'],
                [{ model: UnitCourseClosureDay, as: 'Days' }, 'closureDate', 'ASC'],
            ],
        });
        const nines = await UnitCourse.findAll({
            where: { companyId, isActive: true },
            attributes: ['id', 'unitCourseCode', 'description'],
            order: [['seq', 'ASC'], ['unitCourseCode', 'ASC']],
        });
        res.status(200).json({ plans, nines });
    } catch (error) {
        console.error('Error listing closure plans:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/golf/closures
// Body: { unitCourseIds: [..], description, dayScope, dateFrom, dateTo,
//         startTime?, endTime? } - ONE plan per selected nine (whole-course
// closure keyed once); day generation stays per plan.
exports.create = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        for (const f of ['description', 'dayScope', 'dateFrom', 'dateTo']) {
            if (!(f in req.body) || req.body[f] === null || req.body[f] === '') {
                return res.status(400).json({ message: 'Description, day scope and the date period are required.' });
            }
        }
        // Ensure both time fields go through validation even when omitted.
        const body = { startTime: null, endTime: null, ...req.body };
        const header = validateHeader(body, null);
        if (header.error) return res.status(400).json({ message: header.error });

        const nineIds = [...new Set((Array.isArray(req.body.unitCourseIds) ? req.body.unitCourseIds : []).map(String))];
        if (!nineIds.length) return res.status(400).json({ message: 'Pick at least one unit course to close.' });
        const owned = await UnitCourse.count({ where: { id: { [Op.in]: nineIds }, companyId } });
        if (owned !== nineIds.length) {
            return res.status(400).json({ message: 'Every selected unit course must belong to the active company.' });
        }

        const placement = await getCallerPlacement(req);
        const callerId = getUserContext(req).userId;
        const plans = await sequelize.transaction((t) => Promise.all(nineIds.map((unitCourseId) => (
            UnitCourseClosurePlan.create({
                ...header.values,
                unitCourseId,
                createdBy: callerId,
                createdByDepartmentId: placement.departmentId,
                updatedBy: callerId,
            }, { transaction: t })
        ))));
        res.status(201).json({
            message: plans.length === 1 ? 'Closure plan created.' : `Closure plan created on ${plans.length} unit courses.`,
            plans,
        });
    } catch (error) {
        console.error('Error creating closure plan:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/golf/closures/:planId
// Body: any header field plus { isActive }. Changing the header does NOT
// regenerate days - the user regenerates in the day editor. The plan's nine
// is fixed (delete-and-rekey is create + disable).
exports.update = async (req, res) => {
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

// POST /api/golf/closures/:planId/generate-days
// Computes (does NOT save) the day rows for the plan: every date in the period
// whose day type matches the plan's day scope, seeded with the plan's times.
// The screen shows the result for review; saving is the PUT below.
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

// PUT /api/golf/closures/:planId/days
// Body: { days: [{ closureDate, startTime?, endTime?, isActive? }] }
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
                startTime: start.value,
                endTime: end.value,
                isActive: d.isActive !== false,
            });
        }

        await sequelize.transaction(async (t) => {
            await UnitCourseClosureDay.destroy({ where: { closurePlanId: plan.id }, transaction: t });
            if (rows.length) await UnitCourseClosureDay.bulkCreate(rows, { transaction: t });
        });

        const days = await UnitCourseClosureDay.findAll({
            where: { closurePlanId: plan.id },
            order: [['closureDate', 'ASC']],
        });
        res.status(200).json({ message: `${days.length} closure day${days.length === 1 ? '' : 's'} saved.`, days });
    } catch (error) {
        console.error('Error saving closure days:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
