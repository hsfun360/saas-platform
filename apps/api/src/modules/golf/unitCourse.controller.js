const UnitCourse = require('./unitCourse.model');
const { getUserContext } = require('../../platform/serviceContext');
const { COURSE_TYPES, COURSE_TYPE_KEYS, MEASUREMENT_UNITS } = require('./unitCourse.constants');

// The active company (club) whose unit courses we're maintaining. Master files
// are per-company, so every request must carry a workspace.
function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

// Parse an optional integer field. Absent/blank -> null; anything else must be an
// integer within [min, max]. Returns { ok, value } so callers can 400 cleanly.
function parseOptionalInt(v, min, max) {
    if (v === undefined || v === null || v === '') return { ok: true, value: null };
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) return { ok: false, value: null };
    return { ok: true, value: n };
}

// GET /api/golf/unit-courses/meta
// The fixed vocabularies for the screen (and the source the API validates
// against): course types (incl. hole ranges) and distance measurement units.
// Auth + entitlement already enforced by the parent router.
exports.getMeta = async (req, res) => {
    res.status(200).json({ types: COURSE_TYPES, measurementUnits: MEASUREMENT_UNITS });
};

// GET /api/golf/unit-courses - every unit course for the active company.
exports.listUnitCourses = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const rows = await UnitCourse.findAll({
            where: { companyId },
            // Postgres sorts NULL seq last on ASC, so unnumbered courses trail.
            order: [['seq', 'ASC'], ['unitCourseCode', 'ASC']],
        });
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error listing unit courses:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/golf/unit-courses
// Body: { unitCourseCode, courseType, seq?, description?, remarks?,
//         completionMinutes?, hasFloodlight?, floodlightLeadMinutes? }
exports.createUnitCourse = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const unitCourseCode = String(req.body.unitCourseCode || '').trim().toUpperCase();
        const courseType = String(req.body.courseType || '').trim();
        const description = typeof req.body.description === 'string' ? req.body.description.trim() : null;
        const remarks = typeof req.body.remarks === 'string' ? req.body.remarks.trim() : null;
        const hasFloodlight = req.body.hasFloodlight === true;

        if (!unitCourseCode) return res.status(400).json({ message: 'Unit course code is required.' });
        if (unitCourseCode.length > 20) return res.status(400).json({ message: 'Unit course code must be 20 characters or less.' });
        if (!COURSE_TYPE_KEYS.includes(courseType)) return res.status(400).json({ message: 'Invalid course type.' });

        const seq = parseOptionalInt(req.body.seq, 0, 9999);
        if (!seq.ok) return res.status(400).json({ message: 'Number must be a whole number between 0 and 9999.' });
        const completionMinutes = parseOptionalInt(req.body.completionMinutes, 1, 600);
        if (!completionMinutes.ok) return res.status(400).json({ message: 'Completion time must be a whole number of minutes between 1 and 600.' });
        const lead = parseOptionalInt(req.body.floodlightLeadMinutes, 0, 600);
        if (!lead.ok) return res.status(400).json({ message: 'Lighting-fee lead time must be a whole number of minutes between 0 and 600.' });

        const existing = await UnitCourse.findOne({ where: { companyId, unitCourseCode } });
        if (existing) return res.status(409).json({ message: `Unit course '${unitCourseCode}' already exists.` });

        const unitCourse = await UnitCourse.create({
            companyId,
            unitCourseCode,
            seq: seq.value,
            description: description || null,
            courseType,
            remarks: remarks || null,
            completionMinutes: completionMinutes.value,
            hasFloodlight,
            // Lead time only means something on a floodlit nine.
            floodlightLeadMinutes: hasFloodlight ? lead.value : null,
        });
        res.status(201).json({ message: 'Unit course created.', unitCourse });
    } catch (error) {
        console.error('Error creating unit course:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/golf/unit-courses/:id
// Body: any of { unitCourseCode, courseType, seq, description, remarks,
//                completionMinutes, hasFloodlight, floodlightLeadMinutes, isActive }
exports.updateUnitCourse = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const unitCourse = await UnitCourse.findOne({ where: { id: req.params.id, companyId } });
        if (!unitCourse) return res.status(404).json({ message: 'Unit course not found.' });

        if (typeof req.body.unitCourseCode === 'string' && req.body.unitCourseCode.trim()) {
            const unitCourseCode = req.body.unitCourseCode.trim().toUpperCase();
            if (unitCourseCode.length > 20) return res.status(400).json({ message: 'Unit course code must be 20 characters or less.' });
            if (unitCourseCode !== unitCourse.unitCourseCode) {
                const clash = await UnitCourse.findOne({ where: { companyId, unitCourseCode } });
                if (clash) return res.status(409).json({ message: `Unit course '${unitCourseCode}' already exists.` });
                unitCourse.unitCourseCode = unitCourseCode;
            }
        }
        if (typeof req.body.courseType === 'string' && req.body.courseType.trim()) {
            const courseType = req.body.courseType.trim();
            if (!COURSE_TYPE_KEYS.includes(courseType)) return res.status(400).json({ message: 'Invalid course type.' });
            unitCourse.courseType = courseType;
        }
        if ('seq' in req.body) {
            const seq = parseOptionalInt(req.body.seq, 0, 9999);
            if (!seq.ok) return res.status(400).json({ message: 'Number must be a whole number between 0 and 9999.' });
            unitCourse.seq = seq.value;
        }
        if (typeof req.body.description === 'string') unitCourse.description = req.body.description.trim() || null;
        if (typeof req.body.remarks === 'string') unitCourse.remarks = req.body.remarks.trim() || null;
        if ('completionMinutes' in req.body) {
            const completionMinutes = parseOptionalInt(req.body.completionMinutes, 1, 600);
            if (!completionMinutes.ok) return res.status(400).json({ message: 'Completion time must be a whole number of minutes between 1 and 600.' });
            unitCourse.completionMinutes = completionMinutes.value;
        }
        if (typeof req.body.hasFloodlight === 'boolean') unitCourse.hasFloodlight = req.body.hasFloodlight;
        if ('floodlightLeadMinutes' in req.body) {
            const lead = parseOptionalInt(req.body.floodlightLeadMinutes, 0, 600);
            if (!lead.ok) return res.status(400).json({ message: 'Lighting-fee lead time must be a whole number of minutes between 0 and 600.' });
            unitCourse.floodlightLeadMinutes = lead.value;
        }
        // Lead time only means something on a floodlit nine - clear it when the
        // floodlight flag is (or becomes) off, whatever the request said.
        if (!unitCourse.hasFloodlight) unitCourse.floodlightLeadMinutes = null;
        if (typeof req.body.isActive === 'boolean') unitCourse.isActive = req.body.isActive;

        await unitCourse.save();
        res.status(200).json({ message: 'Unit course updated.', unitCourse });
    } catch (error) {
        console.error('Error updating unit course:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
