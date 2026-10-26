// Classes master (/facility/classes; slice 5, structure approved
// 2026-10-26) - the programmes the club offers: code, description, the
// default venue and instructor, the capacity (capped by the venue's), ONE
// enrolment mode (session | term, frozen once a schedule exists) and ONE fee
// item per audience (class-fee transaction types priced by their flat card),
// visitors and walk-ins allowed, a notice override. The timetable lives on
// the class's schedules (classSchedule.controller.js).

const { Op } = require('sequelize');
const FacilityClass = require('./class.model');
const FacilityVenue = require('./venue.model');
const FacilityInstructor = require('./instructor.model');
const FacilityClassSchedule = require('./classSchedule.model');
const FacilityClassSession = require('./classSession.model');
const TransactionType = require('./transactionType.model');
const { sequelize } = require('../../platform/db');
const { getUserContext, annotateCanModify, canModifyRecord } = require('../../platform/serviceContext');
const { ENROLMENT_MODE_KEYS, LIMITS } = require('./facility.constants');
const { companyIdOf, stampsFor, parseOptionalInt, parseRequiredInt } = require('./facilityShared');
const { VENUE_INCLUDE, venueBlocksUnit } = require('./classSchedule.service');

const CODE_RE = /^[A-Z0-9_-]{1,30}$/;

const CLASS_INCLUDE = [
    { model: FacilityVenue, as: 'Venue', attributes: ['id', 'code', 'name', 'capacity', 'isActive'], required: false },
    { model: FacilityInstructor, as: 'Instructor', attributes: ['id', 'code', 'name', 'isActive'], required: false },
];

function classDto(row, { counts = {}, feeById = new Map() } = {}) {
    const p = row.get ? row.get({ plain: true }) : row;
    const venue = p.Venue || null;
    const instructor = p.Instructor || null;
    const fee = p.feeTransactionTypeId ? feeById.get(p.feeTransactionTypeId) || null : null;
    const visitorFee = p.visitorFeeTransactionTypeId ? feeById.get(p.visitorFeeTransactionTypeId) || null : null;
    return {
        ...p,
        Venue: undefined,
        Instructor: undefined,
        venue: venue ? { id: venue.id, code: venue.code, name: venue.name, capacity: venue.capacity, isActive: venue.isActive !== false } : null,
        instructor: instructor ? { id: instructor.id, code: instructor.code, name: instructor.name, isActive: instructor.isActive !== false } : null,
        feeItem: fee ? { id: fee.id, transactionType: fee.transactionType, description: fee.description } : null,
        visitorFeeItem: visitorFee ? { id: visitorFee.id, transactionType: visitorFee.transactionType, description: visitorFee.description } : null,
        scheduleCount: counts.scheduleCount || 0,
        sessionCount: counts.sessionCount || 0,
        canModify: p.canModify,
    };
}

// Validate the fields present in `body`; `current` (update) supplies the rest.
function validateClass(body, current) {
    const out = {};
    if ('code' in body) {
        const code = String(body.code || '').trim().toUpperCase();
        if (!CODE_RE.test(code)) return { error: 'Code is required: 1-30 characters, letters, digits, underscores and hyphens only.' };
        out.code = code;
    }
    if ('description' in body) {
        const description = typeof body.description === 'string' ? body.description.trim() : '';
        if (!description) return { error: 'Description is required.' };
        out.description = description;
    }
    if ('details' in body) out.details = typeof body.details === 'string' && body.details.trim() ? body.details.trim() : null;
    for (const field of ['venueId', 'instructorId', 'feeTransactionTypeId', 'visitorFeeTransactionTypeId']) {
        if (field in body) out[field] = typeof body[field] === 'string' && body[field].trim() ? body[field].trim() : null;
    }
    if ('capacity' in body) {
        const n = parseOptionalInt(body.capacity, 1, LIMITS.maxVenueCapacity);
        if (!n.ok) return { error: `Capacity must be a whole number between 1 and ${LIMITS.maxVenueCapacity}, or blank for the venue's.` };
        out.capacity = n.value;
    }
    if ('enrolmentMode' in body) {
        const mode = String(body.enrolmentMode || '').trim();
        if (!ENROLMENT_MODE_KEYS.includes(mode)) return { error: 'Enrolment mode must be Per session or Per term.' };
        out.enrolmentMode = mode;
    }
    if ('cancellationNoticeHours' in body) {
        const n = parseOptionalInt(body.cancellationNoticeHours, 0, 720);
        if (!n.ok) return { error: 'The cancellation notice must be a whole number of hours between 0 and 720, or blank for the Specification\'s.' };
        out.cancellationNoticeHours = n.value;
    }
    if ('sortOrder' in body) {
        const n = parseRequiredInt(body.sortOrder, 0, 9999);
        if (!n.ok) return { error: 'Sort order must be a whole number between 0 and 9999.' };
        out.sortOrder = n.value;
    }
    for (const flag of ['visitorsAllowed', 'walkInAllowed', 'isActive']) {
        if (typeof body[flag] === 'boolean') out[flag] = body[flag];
    }
    const merged = { ...(current ? current.get({ plain: true }) : {}), ...out };
    if (!merged.visitorsAllowed) out.visitorFeeTransactionTypeId = null;
    return { values: out };
}

// The venue, instructor and fee references must be the company's own and
// active; the capacity may not exceed the venue's. Returns an error or null.
async function validateRefs(companyId, values, current) {
    const merged = { ...(current ? current.get({ plain: true }) : {}), ...values };
    if (merged.venueId) {
        const venue = await FacilityVenue.findOne({ where: { id: merged.venueId, companyId } });
        if (!venue) return 'Pick a venue of the active company.';
        if (venue.isActive === false && values.venueId) return `Venue ${venue.code} is disabled.`;
        if (merged.capacity != null && Number(merged.capacity) > Number(venue.capacity)) return `Capacity ${merged.capacity} exceeds the venue's ${venue.capacity} (${venue.code}).`;
    }
    if (merged.instructorId) {
        const ins = await FacilityInstructor.findOne({ where: { id: merged.instructorId, companyId } });
        if (!ins) return 'Pick an instructor of the active company.';
        if (ins.isActive === false && values.instructorId) return `Instructor ${ins.code} is disabled.`;
    }
    for (const [field, label] of [['feeTransactionTypeId', 'Fee item'], ['visitorFeeTransactionTypeId', 'Visitor fee item']]) {
        if (!merged[field]) continue;
        const tt = await TransactionType.findOne({ where: { id: merged[field], companyId } });
        if (!tt) return `${label}: pick a transaction type of the active company.`;
        if (tt.chargeType !== 'class-fee') return `${label}: '${tt.transactionType}' is not a Class Fee.`;
        if (tt.isActive === false) return `${label}: '${tt.transactionType}' is disabled.`;
    }
    return null;
}

async function countsByClass(companyId) {
    const [schedules, sessions] = await Promise.all([
        FacilityClassSchedule.findAll({ where: { companyId }, attributes: ['classId', [sequelize.fn('COUNT', sequelize.col('id')), 'n']], group: ['classId'], raw: true }),
        FacilityClassSession.findAll({ where: { companyId, status: 'scheduled' }, attributes: ['classId', [sequelize.fn('COUNT', sequelize.col('id')), 'n']], group: ['classId'], raw: true }),
    ]);
    const map = new Map();
    for (const s of schedules) map.set(s.classId, { scheduleCount: Number(s.n), sessionCount: 0 });
    for (const s of sessions) {
        const cur = map.get(s.classId) || { scheduleCount: 0, sessionCount: 0 };
        cur.sessionCount = Number(s.n);
        map.set(s.classId, cur);
    }
    return map;
}

async function feeItems(companyId) {
    const rows = await TransactionType.findAll({ where: { companyId, chargeType: 'class-fee' }, attributes: ['id', 'transactionType', 'description', 'isActive'], order: [['transactionType', 'ASC']] });
    return rows.map((t) => ({ id: t.id, transactionType: t.transactionType, description: t.description, isActive: t.isActive !== false }));
}

// The pickers the Classes and Class Schedule screens share.
async function pickers(companyId) {
    const [venues, instructors, fees] = await Promise.all([
        FacilityVenue.findAll({ where: { companyId }, include: VENUE_INCLUDE, order: [['code', 'ASC']] }),
        FacilityInstructor.findAll({ where: { companyId }, attributes: ['id', 'code', 'name', 'isActive'], order: [['name', 'ASC']] }),
        feeItems(companyId),
    ]);
    return {
        venues: venues.map((v) => ({
            id: v.id, code: v.code, name: v.name, capacity: v.capacity, isActive: v.isActive !== false, blocksUnit: venueBlocksUnit(v),
            facility: v.Facility ? { id: v.Facility.id, code: v.Facility.code, name: v.Facility.name, usageMode: v.Facility.FacilityType ? v.Facility.FacilityType.usageMode : null } : null,
        })),
        instructors: instructors.map((i) => ({ id: i.id, code: i.code, name: i.name, isActive: i.isActive !== false })),
        feeItems: fees,
    };
}

// GET /api/facility/classes - every class with its defaults and counts, plus
// the pickers.
exports.list = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const [rows, counts, picks, { setting }] = await Promise.all([
            FacilityClass.findAll({ where: { companyId }, include: CLASS_INCLUDE, order: [['sortOrder', 'ASC'], ['code', 'ASC']] }),
            countsByClass(companyId),
            pickers(companyId),
            require('./bookingAvailability.service').loadRules(companyId),
        ]);
        const flags = await annotateCanModify(req, rows);
        const feeById = new Map(picks.feeItems.map((f) => [f.id, f]));
        res.status(200).json({
            classes: rows.map((r, i) => classDto(r, { counts: counts.get(r.id), feeById })).map((d, i) => ({ ...d, canModify: flags[i] })),
            classesEnabled: setting.classesEnabled === true,
            ...picks,
        });
    } catch (error) {
        console.error('Error listing facility classes:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

async function loadFull(id) {
    return FacilityClass.findOne({ where: { id }, include: CLASS_INCLUDE });
}

// POST /api/facility/classes
exports.create = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        for (const f of ['code', 'description', 'enrolmentMode']) {
            if (!(f in req.body) || req.body[f] === null || req.body[f] === '') return res.status(400).json({ message: 'Code, description and enrolment mode are required.' });
        }
        const v = validateClass(req.body, null);
        if (v.error) return res.status(400).json({ message: v.error });
        const clash = await FacilityClass.findOne({ where: { companyId, code: v.values.code } });
        if (clash) return res.status(409).json({ message: `Class '${v.values.code}' already exists.` });
        const refErr = await validateRefs(companyId, v.values, null);
        if (refErr) return res.status(400).json({ message: refErr });
        const stamps = await stampsFor(req);
        const row = await FacilityClass.create({ companyId, ...v.values, ...stamps });
        const full = await loadFull(row.id);
        const feeById = new Map((await feeItems(companyId)).map((f) => [f.id, f]));
        res.status(201).json({ message: 'Class created.', class: classDto(full, { feeById }) });
    } catch (error) {
        console.error('Error creating facility class:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/facility/classes/:id - the enrolment mode is frozen once a
// schedule exists.
exports.update = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await FacilityClass.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Class not found.' });
        if (!(await canModifyRecord(req, row))) return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        const v = validateClass(req.body, row);
        if (v.error) return res.status(400).json({ message: v.error });
        if (v.values.code && v.values.code !== row.code) {
            const clash = await FacilityClass.findOne({ where: { companyId, code: v.values.code, id: { [Op.ne]: row.id } } });
            if (clash) return res.status(409).json({ message: `Class '${v.values.code}' already exists.` });
        }
        if (v.values.enrolmentMode && v.values.enrolmentMode !== row.enrolmentMode) {
            const schedules = await FacilityClassSchedule.count({ where: { classId: row.id } });
            if (schedules) return res.status(409).json({ message: `The enrolment mode is frozen - ${row.code} already has ${schedules} schedule${schedules === 1 ? '' : 's'}.` });
        }
        const refErr = await validateRefs(companyId, v.values, row);
        if (refErr) return res.status(400).json({ message: refErr });
        Object.assign(row, v.values, { updatedBy: getUserContext(req).userId });
        await row.save();
        const [full, counts, fees] = await Promise.all([loadFull(row.id), countsByClass(companyId), feeItems(companyId)]);
        res.status(200).json({ message: 'Class updated.', class: classDto(full, { counts: counts.get(row.id), feeById: new Map(fees.map((f) => [f.id, f])) }) });
    } catch (error) {
        console.error('Error updating facility class:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/facility/classes/:id - refused while a schedule or a session
// exists (disable the class instead).
exports.remove = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await FacilityClass.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Class not found.' });
        const [schedules, sessions] = await Promise.all([
            FacilityClassSchedule.count({ where: { classId: row.id } }),
            FacilityClassSession.count({ where: { classId: row.id } }),
        ]);
        if (schedules || sessions) return res.status(409).json({ message: `Cannot delete ${row.code} - ${schedules} schedule${schedules === 1 ? '' : 's'} and ${sessions} session${sessions === 1 ? '' : 's'} belong to it. Disable the class to keep it out of use.` });
        await row.destroy();
        res.status(200).json({ message: `Class ${row.code} deleted.` });
    } catch (error) {
        console.error('Error deleting facility class:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

exports.classDto = classDto;
exports.pickers = pickers;
exports.CLASS_INCLUDE = CLASS_INCLUDE;
