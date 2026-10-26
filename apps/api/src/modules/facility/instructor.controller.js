// Instructors master (/facility/instructors; slice 5, structure approved
// 2026-10-26) - the people who lead class sessions. No login of their own in
// this slice. The code is frozen once a session references the instructor;
// an inactive instructor keeps past sessions and cannot be picked for new
// ones; deletion is refused while a class or a session names them.

const { Storage } = require('@google-cloud/storage');
const { Op } = require('sequelize');
const FacilityInstructor = require('./instructor.model');
const FacilityClass = require('./class.model');
const FacilityClassSession = require('./classSession.model');
const { sequelize } = require('../../platform/db');
const { getUserContext } = require('../../platform/serviceContext');
const { companyIdOf, stampsFor } = require('./facilityShared');

const storage = new Storage();
function assetsBucket() {
    const name = process.env.ASSETS_BUCKET;
    if (!name) throw new Error('ASSETS_BUCKET env var is not set - cannot store uploads.');
    return storage.bucket(name);
}

const CODE_RE = /^[A-Z0-9_-]{1,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function instructorDto(row, counts = {}) {
    const p = row.get ? row.get({ plain: true }) : row;
    return { ...p, sessionCount: counts.sessionCount || 0, classCount: counts.classCount || 0 };
}

function validateInstructor(body) {
    const out = {};
    if ('code' in body) {
        const code = String(body.code || '').trim().toUpperCase();
        if (!CODE_RE.test(code)) return { error: 'Code is required: 1-20 characters, letters, digits, underscores and hyphens only.' };
        out.code = code;
    }
    if ('name' in body) {
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name) return { error: 'Name is required.' };
        out.name = name;
    }
    if ('email' in body) {
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
        if (email && !EMAIL_RE.test(email)) return { error: 'Enter a valid email address, or leave it blank.' };
        out.email = email || null;
    }
    if ('mobile' in body) out.mobile = typeof body.mobile === 'string' && body.mobile.trim() ? body.mobile.trim().slice(0, 30) : null;
    for (const field of ['specialities', 'remarks', 'photoUrl']) {
        if (field in body) out[field] = typeof body[field] === 'string' && body[field].trim() ? body[field].trim() : null;
    }
    if (typeof body.isActive === 'boolean') out.isActive = body.isActive;
    return { values: out };
}

async function countsByInstructor(companyId) {
    const [sessions, classes] = await Promise.all([
        FacilityClassSession.findAll({ where: { companyId }, attributes: ['instructorId', [sequelize.fn('COUNT', sequelize.col('id')), 'n']], group: ['instructorId'], raw: true }),
        FacilityClass.findAll({ where: { companyId, instructorId: { [Op.ne]: null } }, attributes: ['instructorId', [sequelize.fn('COUNT', sequelize.col('id')), 'n']], group: ['instructorId'], raw: true }),
    ]);
    const map = new Map();
    for (const s of sessions) map.set(s.instructorId, { sessionCount: Number(s.n), classCount: 0 });
    for (const c of classes) {
        const cur = map.get(c.instructorId) || { sessionCount: 0, classCount: 0 };
        cur.classCount = Number(c.n);
        map.set(c.instructorId, cur);
    }
    return map;
}

// GET /api/facility/instructors
exports.list = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const [rows, counts] = await Promise.all([
            FacilityInstructor.findAll({ where: { companyId }, order: [['name', 'ASC']] }),
            countsByInstructor(companyId),
        ]);
        res.status(200).json(rows.map((r) => instructorDto(r, counts.get(r.id))));
    } catch (error) {
        console.error('Error listing facility instructors:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/instructors
exports.create = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        for (const f of ['code', 'name']) {
            if (!(f in req.body) || req.body[f] === null || req.body[f] === '') return res.status(400).json({ message: 'Code and name are required.' });
        }
        const v = validateInstructor(req.body);
        if (v.error) return res.status(400).json({ message: v.error });
        const clash = await FacilityInstructor.findOne({ where: { companyId, code: v.values.code } });
        if (clash) return res.status(409).json({ message: `Instructor '${v.values.code}' already exists.` });
        const stamps = await stampsFor(req);
        const row = await FacilityInstructor.create({ companyId, ...v.values, ...stamps });
        res.status(201).json({ message: 'Instructor created.', instructor: instructorDto(row) });
    } catch (error) {
        console.error('Error creating facility instructor:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/facility/instructors/:id
exports.update = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await FacilityInstructor.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Instructor not found.' });
        const v = validateInstructor(req.body);
        if (v.error) return res.status(400).json({ message: v.error });
        if (v.values.code && v.values.code !== row.code) {
            const inUse = await FacilityClassSession.count({ where: { instructorId: row.id } });
            if (inUse) return res.status(409).json({ message: `The code is frozen - ${inUse} session${inUse === 1 ? '' : 's'} already reference ${row.code}.` });
            const clash = await FacilityInstructor.findOne({ where: { companyId, code: v.values.code, id: { [Op.ne]: row.id } } });
            if (clash) return res.status(409).json({ message: `Instructor '${v.values.code}' already exists.` });
        }
        Object.assign(row, v.values, { updatedBy: getUserContext(req).userId });
        await row.save();
        const counts = await countsByInstructor(companyId);
        res.status(200).json({ message: 'Instructor updated.', instructor: instructorDto(row, counts.get(row.id)) });
    } catch (error) {
        console.error('Error updating facility instructor:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/facility/instructors/:id
exports.remove = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await FacilityInstructor.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Instructor not found.' });
        const [classes, sessions] = await Promise.all([
            FacilityClass.count({ where: { instructorId: row.id } }),
            FacilityClassSession.count({ where: { instructorId: row.id } }),
        ]);
        if (classes || sessions) return res.status(409).json({ message: `Cannot delete ${row.code} - ${classes} class${classes === 1 ? '' : 'es'} and ${sessions} session${sessions === 1 ? '' : 's'} still name ${row.name}. Disable the instructor instead.` });
        await row.destroy();
        res.status(200).json({ message: `Instructor ${row.code} deleted.` });
    } catch (error) {
        console.error('Error deleting facility instructor:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/instructors/photo (multipart 'photo') -> { url }
exports.uploadPhoto = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        if (!req.file) return res.status(400).json({ message: 'No image file uploaded.' });
        const bucket = assetsBucket();
        const ext = req.file.originalname.split('.').pop();
        const blob = bucket.file(`facility-instructor-${companyId}-${Date.now()}.${ext}`);
        await blob.save(req.file.buffer, { resumable: false, contentType: req.file.mimetype });
        res.status(200).json({ message: 'Photo uploaded.', url: `https://storage.googleapis.com/${bucket.name}/${blob.name}` });
    } catch (error) {
        console.error('Facility instructor photo upload error:', error);
        res.status(500).json({ message: error.message || 'Failed to upload photo.' });
    }
};
