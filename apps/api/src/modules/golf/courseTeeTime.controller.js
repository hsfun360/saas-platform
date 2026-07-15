const { sequelize } = require('../../platform/db');
const Course = require('./course.model');
const CourseTeeTimeSet = require('./courseTeeTimeSet.model');
const CourseTeeTimeSlot = require('./courseTeeTimeSlot.model');
const { getUserContext } = require('../../platform/serviceContext');
const { DAY_SCOPE_KEYS } = require('./courseTeeTime.constants');

// Tee-time sets are children of a course; every request scopes through the
// parent (active company + :id), never by set id alone.
async function findOwnedCourse(req) {
    const companyId = getUserContext(req).companyId || null;
    if (!companyId) return { status: 400, message: 'Select a workspace first.' };
    const course = await Course.findOne({ where: { id: req.params.id, companyId } });
    if (!course) return { status: 404, message: 'Course not found.' };
    return { course };
}

async function findOwnedSet(req) {
    const target = await findOwnedCourse(req);
    if (target.status) return target;
    const set = await CourseTeeTimeSet.findOne({ where: { id: req.params.setId, courseId: target.course.id } });
    if (!set) return { status: 404, message: 'Tee-time set not found.' };
    return { course: target.course, set };
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

function parseRequiredInt(v, min, max) {
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) return { ok: false, value: null };
    return { ok: true, value: n };
}

function listQuery(courseId) {
    return CourseTeeTimeSet.findAll({
        where: { courseId },
        include: [{ model: CourseTeeTimeSlot, as: 'Slots' }],
        order: [
            ['dayScope', 'ASC'],
            ['effectiveDate', 'DESC'],
            [{ model: CourseTeeTimeSlot, as: 'Slots' }, 'slotNumber', 'ASC'],
        ],
    });
}

// Validate the header fields shared by create/update. `body` carries only the
// fields being set; `current` (update) supplies the rest for cross-checks.
function validateHeader(body, current) {
    const out = {};

    if ('description' in body) {
        if (typeof body.description === 'string') out.description = body.description.trim() || null;
        else if (body.description === null) out.description = null;
    }

    if ('dayScope' in body) {
        const dayScope = String(body.dayScope || '').trim();
        if (!DAY_SCOPE_KEYS.includes(dayScope)) return { error: 'Day scope must be All days, Weekdays or Weekends.' };
        out.dayScope = dayScope;
    }

    if ('effectiveDate' in body) {
        const effectiveDate = String(body.effectiveDate || '').trim();
        if (!DATE_RE.test(effectiveDate)) return { error: 'Effective date is required (YYYY-MM-DD).' };
        out.effectiveDate = effectiveDate;
    }

    for (const [field, label, required] of [
        ['firstTeeTime', 'First tee-off time', true],
        ['lastTeeTime', 'Last tee-off time', true],
        ['mustPlay18Until', 'Must-play-18 time', false],
        ['mustPlay9Until', 'Must-play-9 time', false],
        ['frontDeskFrom', 'Front desk from time', false],
    ]) {
        if (!(field in body)) continue;
        const t = normalizeTime(body[field]);
        if (!t.ok || (required && t.value === null)) return { error: `${label} must be a valid time (HH:MM).` };
        out[field] = t.value;
    }

    if ('intervalMinutes' in body) {
        const n = parseRequiredInt(body.intervalMinutes, 1, 120);
        if (!n.ok) return { error: 'Flight interval must be a whole number of minutes between 1 and 120.' };
        out.intervalMinutes = n.value;
    }
    if ('playersPerFlight' in body) {
        const n = parseRequiredInt(body.playersPerFlight, 1, 10);
        if (!n.ok) return { error: 'Players per flight must be a whole number between 1 and 10.' };
        out.playersPerFlight = n.value;
    }

    // Cross-check the day window using the intended (merged) state.
    const first = out.firstTeeTime !== undefined ? out.firstTeeTime : current?.firstTeeTime;
    const last = out.lastTeeTime !== undefined ? out.lastTeeTime : current?.lastTeeTime;
    if (first && last && String(first) >= String(last)) {
        return { error: 'Last tee-off time must be after the first tee-off time.' };
    }

    return { values: out };
}

// GET /api/golf/courses/:id/tee-time-sets - the course's sets with their slots.
exports.listSets = async (req, res) => {
    try {
        const target = await findOwnedCourse(req);
        if (target.status) return res.status(target.status).json({ message: target.message });
        res.status(200).json(await listQuery(target.course.id));
    } catch (error) {
        console.error('Error listing tee-time sets:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/golf/courses/:id/tee-time-sets
// Body: { dayScope, effectiveDate, firstTeeTime, lastTeeTime, intervalMinutes,
//         playersPerFlight, description?, mustPlay18Until?, mustPlay9Until?,
//         frontDeskFrom? }
exports.createSet = async (req, res) => {
    try {
        const target = await findOwnedCourse(req);
        if (target.status) return res.status(target.status).json({ message: target.message });

        // Required fields must be present on create.
        for (const f of ['dayScope', 'effectiveDate', 'firstTeeTime', 'lastTeeTime', 'intervalMinutes', 'playersPerFlight']) {
            if (!(f in req.body) || req.body[f] === null || req.body[f] === '') {
                return res.status(400).json({ message: 'Day scope, effective date, first/last tee-off, interval and players per flight are required.' });
            }
        }
        const header = validateHeader(req.body, null);
        if (header.error) return res.status(400).json({ message: header.error });

        const clash = await CourseTeeTimeSet.findOne({
            where: { courseId: target.course.id, dayScope: header.values.dayScope, effectiveDate: header.values.effectiveDate },
        });
        if (clash) return res.status(409).json({ message: 'This course already has a set for that day scope and effective date.' });

        const set = await CourseTeeTimeSet.create({ ...header.values, courseId: target.course.id });
        res.status(201).json({ message: 'Tee-time set created.', set });
    } catch (error) {
        console.error('Error creating tee-time set:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/golf/courses/:id/tee-time-sets/:setId
// Body: any header field plus { isActive }. Changing times/interval does NOT
// regenerate slots - the user regenerates in the slot editor.
exports.updateSet = async (req, res) => {
    try {
        const target = await findOwnedSet(req);
        if (target.status) return res.status(target.status).json({ message: target.message });
        const set = target.set;

        const header = validateHeader(req.body, set);
        if (header.error) return res.status(400).json({ message: header.error });

        const nextScope = header.values.dayScope ?? set.dayScope;
        const nextDate = header.values.effectiveDate ?? set.effectiveDate;
        if (nextScope !== set.dayScope || String(nextDate) !== String(set.effectiveDate)) {
            const clash = await CourseTeeTimeSet.findOne({
                where: { courseId: set.courseId, dayScope: nextScope, effectiveDate: nextDate },
            });
            if (clash && clash.id !== set.id) {
                return res.status(409).json({ message: 'This course already has a set for that day scope and effective date.' });
            }
        }

        Object.assign(set, header.values);
        if (typeof req.body.isActive === 'boolean') set.isActive = req.body.isActive;

        await set.save();
        res.status(200).json({ message: 'Tee-time set updated.', set });
    } catch (error) {
        console.error('Error updating tee-time set:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/golf/courses/:id/tee-time-sets/:setId/slots
// Body: { slots: [{ slotNumber, teeTime, maxPlayers, isFrontDesk? }] }
// Replaces the set's slot list atomically (generated client-side from the
// header, then hand-adjusted).
exports.saveSlots = async (req, res) => {
    try {
        const target = await findOwnedSet(req);
        if (target.status) return res.status(target.status).json({ message: target.message });
        const set = target.set;

        const rawSlots = Array.isArray(req.body.slots) ? req.body.slots : [];
        if (rawSlots.length > 300) return res.status(400).json({ message: 'A tee-time set cannot have more than 300 slots.' });

        const rows = [];
        const seenNumbers = new Set();
        for (const s of rawSlots) {
            const slotNumber = Number(s.slotNumber);
            if (!Number.isInteger(slotNumber) || slotNumber < 1 || slotNumber > 999) {
                return res.status(400).json({ message: 'Every slot needs a number between 1 and 999.' });
            }
            if (seenNumbers.has(slotNumber)) {
                return res.status(400).json({ message: `Slot number ${slotNumber} appears more than once.` });
            }
            seenNumbers.add(slotNumber);

            const teeTime = normalizeTime(s.teeTime);
            if (!teeTime.ok || teeTime.value === null) {
                return res.status(400).json({ message: `Slot ${slotNumber}: tee-off time must be a valid time (HH:MM).` });
            }
            const maxPlayers = parseRequiredInt(s.maxPlayers, 1, 10);
            if (!maxPlayers.ok) {
                return res.status(400).json({ message: `Slot ${slotNumber}: players must be a whole number between 1 and 10.` });
            }

            rows.push({
                teeTimeSetId: set.id,
                slotNumber,
                teeTime: teeTime.value,
                maxPlayers: maxPlayers.value,
                isFrontDesk: s.isFrontDesk === true,
            });
        }

        await sequelize.transaction(async (t) => {
            await CourseTeeTimeSlot.destroy({ where: { teeTimeSetId: set.id }, transaction: t });
            if (rows.length) await CourseTeeTimeSlot.bulkCreate(rows, { transaction: t });
        });

        const slots = await CourseTeeTimeSlot.findAll({
            where: { teeTimeSetId: set.id },
            order: [['slotNumber', 'ASC']],
        });
        res.status(200).json({ message: `${slots.length} slot${slots.length === 1 ? '' : 's'} saved.`, slots });
    } catch (error) {
        console.error('Error saving tee-time slots:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
