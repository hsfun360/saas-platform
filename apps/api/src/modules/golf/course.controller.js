const { Storage } = require('@google-cloud/storage');
const Course = require('./course.model');
const UnitCourse = require('./unitCourse.model');
const { getUserContext } = require('../../platform/serviceContext');

// Same GCS bucket as the company/platform logo uploads (default credentials on
// Cloud Run); the stored value is the public URL.
const storage = new Storage();
const bucket = storage.bucket('membership-app-avatars-123');

// The active company (club) whose courses we're maintaining.
function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

// Parse an optional integer field. Absent/blank -> null; anything else must be
// an integer within [min, max]. Returns { ok, value } so callers can 400 cleanly.
function parseOptionalInt(v, min, max) {
    if (v === undefined || v === null || v === '') return { ok: true, value: null };
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) return { ok: false, value: null };
    return { ok: true, value: n };
}

// Validate the four nine-references of a course against the company's unit
// courses. `patch` holds the WHOLE intended state (create body, or current row
// merged with the update). Returns { error } or { values }.
async function resolveNines(companyId, patch) {
    const ids = [patch.firstNineId, patch.secondNineId, patch.alternateNineId, patch.nightNineId]
        .filter((v) => typeof v === 'string' && v);
    const rows = ids.length
        ? await UnitCourse.findAll({ where: { id: [...new Set(ids)], companyId } })
        : [];
    const byId = new Map(rows.map((u) => [u.id, u]));

    function pick(id, label) {
        if (!id) return { value: null };
        const u = byId.get(id);
        if (!u) return { error: `${label} is not one of this company's unit courses.` };
        if (u.isActive === false) return { error: `${label} (${u.unitCourseCode}) is disabled.` };
        return { value: u };
    }

    const first = pick(patch.firstNineId, 'First nine');
    if (first.error) return { error: first.error };
    if (!first.value) return { error: 'First nine is required.' };
    if (!['out', 'composite'].includes(first.value.courseType)) {
        return { error: `First nine (${first.value.unitCourseCode}) must be an OUT or COMPOSITE unit course.` };
    }

    const second = pick(patch.secondNineId, 'Second nine');
    if (second.error) return { error: second.error };
    if (!second.value) return { error: 'Second nine is required.' };
    if (!['in', 'composite'].includes(second.value.courseType)) {
        return { error: `Second nine (${second.value.unitCourseCode}) must be an IN or COMPOSITE unit course.` };
    }
    if (second.value.id === first.value.id) {
        return { error: 'First nine and second nine must be two different unit courses.' };
    }

    const alternate = pick(patch.alternateNineId, 'Alternate nine');
    if (alternate.error) return { error: alternate.error };

    const night = pick(patch.nightNineId, 'Night nine');
    if (night.error) return { error: night.error };
    if (night.value && night.value.hasFloodlight !== true) {
        return { error: `Night nine (${night.value.unitCourseCode}) must be a floodlit unit course.` };
    }

    return {
        values: {
            firstNineId: first.value.id,
            secondNineId: second.value.id,
            alternateNineId: alternate.value ? alternate.value.id : null,
            nightNineId: night.value ? night.value.id : null,
        },
    };
}

// GET /api/golf/courses - every course for the active company.
exports.listCourses = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const rows = await Course.findAll({
            where: { companyId },
            order: [['displaySequence', 'ASC'], ['courseCode', 'ASC']],
        });
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error listing courses:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/golf/courses
// Body: { courseCode, displaySequence?, description?, firstNineId, secondNineId,
//         alternateNineId?, nightNineId?, crossOverMinutes?, photo? }
exports.createCourse = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const courseCode = String(req.body.courseCode || '').trim().toUpperCase();
        const description = typeof req.body.description === 'string' ? req.body.description.trim() : null;
        const photo = typeof req.body.photo === 'string' && req.body.photo.trim() ? req.body.photo.trim() : null;

        if (!courseCode) return res.status(400).json({ message: 'Course code is required.' });
        if (courseCode.length > 20) return res.status(400).json({ message: 'Course code must be 20 characters or less.' });

        const displaySequence = parseOptionalInt(req.body.displaySequence, 1, 999);
        if (!displaySequence.ok) return res.status(400).json({ message: 'Display sequence must be a whole number between 1 and 999.' });
        const crossOverMinutes = parseOptionalInt(req.body.crossOverMinutes, 1, 600);
        if (!crossOverMinutes.ok) return res.status(400).json({ message: 'Cross over time must be a whole number of minutes between 1 and 600.' });

        const nines = await resolveNines(companyId, req.body);
        if (nines.error) return res.status(400).json({ message: nines.error });

        const existing = await Course.findOne({ where: { companyId, courseCode } });
        if (existing) return res.status(409).json({ message: `Course '${courseCode}' already exists.` });

        const course = await Course.create({
            companyId,
            courseCode,
            displaySequence: displaySequence.value,
            description: description || null,
            ...nines.values,
            crossOverMinutes: crossOverMinutes.value,
            photo,
        });
        res.status(201).json({ message: 'Course created.', course });
    } catch (error) {
        console.error('Error creating course:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/golf/courses/:id
// Body: any of the create fields plus { isActive }.
exports.updateCourse = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const course = await Course.findOne({ where: { id: req.params.id, companyId } });
        if (!course) return res.status(404).json({ message: 'Course not found.' });

        if (typeof req.body.courseCode === 'string' && req.body.courseCode.trim()) {
            const courseCode = req.body.courseCode.trim().toUpperCase();
            if (courseCode.length > 20) return res.status(400).json({ message: 'Course code must be 20 characters or less.' });
            if (courseCode !== course.courseCode) {
                const clash = await Course.findOne({ where: { companyId, courseCode } });
                if (clash) return res.status(409).json({ message: `Course '${courseCode}' already exists.` });
                course.courseCode = courseCode;
            }
        }
        if ('displaySequence' in req.body) {
            const displaySequence = parseOptionalInt(req.body.displaySequence, 1, 999);
            if (!displaySequence.ok) return res.status(400).json({ message: 'Display sequence must be a whole number between 1 and 999.' });
            course.displaySequence = displaySequence.value;
        }
        if (typeof req.body.description === 'string') course.description = req.body.description.trim() || null;
        if ('crossOverMinutes' in req.body) {
            const crossOverMinutes = parseOptionalInt(req.body.crossOverMinutes, 1, 600);
            if (!crossOverMinutes.ok) return res.status(400).json({ message: 'Cross over time must be a whole number of minutes between 1 and 600.' });
            course.crossOverMinutes = crossOverMinutes.value;
        }
        if ('photo' in req.body) {
            course.photo = typeof req.body.photo === 'string' && req.body.photo.trim() ? req.body.photo.trim() : null;
        }

        // Nine references: when any of them is touched, re-validate the whole
        // intended pairing (current values overlaid with the patch).
        if ('firstNineId' in req.body || 'secondNineId' in req.body || 'alternateNineId' in req.body || 'nightNineId' in req.body) {
            const intended = {
                firstNineId: 'firstNineId' in req.body ? req.body.firstNineId : course.firstNineId,
                secondNineId: 'secondNineId' in req.body ? req.body.secondNineId : course.secondNineId,
                alternateNineId: 'alternateNineId' in req.body ? req.body.alternateNineId : course.alternateNineId,
                nightNineId: 'nightNineId' in req.body ? req.body.nightNineId : course.nightNineId,
            };
            const nines = await resolveNines(companyId, intended);
            if (nines.error) return res.status(400).json({ message: nines.error });
            Object.assign(course, nines.values);
        }

        if (typeof req.body.isActive === 'boolean') course.isActive = req.body.isActive;

        await course.save();
        res.status(200).json({ message: 'Course updated.', course });
    } catch (error) {
        console.error('Error updating course:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/golf/courses/photo  (multipart, field "photo")
// Upload the course picture to GCS and return its public URL; the caller stores
// the URL via create/patch (same shape as the company/platform logo flow).
exports.uploadPhoto = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        if (!req.file) return res.status(400).json({ message: 'No image file uploaded.' });

        const fileExtension = req.file.originalname.split('.').pop();
        const gcsFileName = `golf-course-${companyId}-${Date.now()}.${fileExtension}`;
        const blob = bucket.file(gcsFileName);
        await blob.save(req.file.buffer, { resumable: false, contentType: req.file.mimetype });
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
        res.status(200).json({ message: 'Photo uploaded.', url: publicUrl });
    } catch (error) {
        console.error('Course photo upload error:', error);
        res.status(500).json({ message: error.message || 'Failed to upload photo.' });
    }
};
