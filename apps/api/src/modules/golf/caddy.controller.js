// Caddies - the caddy register (Golf Management → Common Setup → Caddies;
// spec 2.2.1 球僮日常管理, user decisions 2026-10-17): the profile with grade,
// group, identity and contact, photo and badge QR, the register status
// (active | inactive | blacklisted), the caddy's leave records and the notes
// on their record (commendations, complaints, penalties, evaluations). The
// badge QR sheet prints from here; the caddy station (slice 2) scans it.

const { Op } = require('sequelize');
const { Storage } = require('@google-cloud/storage');
const QRCode = require('qrcode');
const GolfCaddy = require('./caddy.model');
const GolfCaddyGrade = require('./caddyGrade.model');
const GolfCaddyGroup = require('./caddyGroup.model');
const GolfCaddyLeave = require('./caddyLeave.model');
const GolfCaddyNote = require('./caddyNote.model');
const svc = require('./caddy.service');
const {
    getUserContext,
    getCallerPlacement,
    canModifyRecord,
    annotateCanModify,
    getCompanyLetterhead,
} = require('../../platform/serviceContext');
const {
    CADDY_STATUSES, CADDY_STATUS_KEYS, LEAVE_TYPES, LEAVE_TYPE_KEYS, NOTE_KINDS, NOTE_KIND_KEYS, GENDERS, GENDER_KEYS,
} = require('./caddy.constants');

const storage = new Storage();
function assetsBucket() {
    const name = process.env.ASSETS_BUCKET;
    if (!name) throw new Error('ASSETS_BUCKET env var is not set - cannot store uploads.');
    return storage.bucket(name);
}

function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

function str(v) {
    return typeof v === 'string' ? v.trim() : '';
}

function esc(v) {
    return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toDto(c, canModify = true, extra = {}) {
    return {
        id: c.id,
        canModify,
        caddyNo: c.caddyNo,
        name: c.name,
        caddyGradeId: c.caddyGradeId,
        grade: c.grade ? { id: c.grade.id, code: c.grade.code, name: c.grade.name, playersPerCaddy: Number(c.grade.playersPerCaddy) } : null,
        caddyGroupId: c.caddyGroupId || null,
        group: c.group ? { id: c.group.id, code: c.group.code, name: c.group.name } : null,
        isLeader: c.isLeader === true,
        staffNo: c.staffNo || null,
        identityNo: c.identityNo || null,
        gender: c.gender || null,
        dateOfBirth: c.dateOfBirth || null,
        mobile: c.mobile || null,
        email: c.email || null,
        languages: c.languages || null,
        nationalityCode: c.nationalityCode || null,
        raceCode: c.raceCode || null,
        photo: c.photo || null,
        qrToken: c.qrToken,
        status: c.status,
        statusReason: c.statusReason || null,
        joinedDate: c.joinedDate || null,
        leftDate: c.leftDate || null,
        remarks: c.remarks || null,
        ...extra,
    };
}

// Validate + normalise a profile payload. Returns { value } or { error }.
async function normalizeBody(companyId, body, selfId = null) {
    const caddyNo = str(body.caddyNo).toUpperCase();
    if (!caddyNo) return { error: 'Caddy number is required.' };
    if (caddyNo.length > 20) return { error: 'Caddy number must be 20 characters or fewer.' };
    if (!/^[A-Z0-9][A-Z0-9-]*$/.test(caddyNo)) return { error: 'Caddy number may only contain letters, digits and hyphens.' };
    const name = str(body.name);
    if (!name) return { error: 'Name is required.' };
    if (name.length > 255) return { error: 'Name must be 255 characters or fewer.' };
    const caddyGradeId = str(body.caddyGradeId);
    if (!caddyGradeId) return { error: 'Select the caddy grade.' };
    const grade = await GolfCaddyGrade.findOne({ where: { companyId, id: caddyGradeId } });
    if (!grade) return { error: 'The caddy grade is not one of this company\'s grades.' };
    if (grade.isActive === false) return { error: `Caddy grade '${grade.code}' is disabled - pick an active grade.` };
    let caddyGroupId = str(body.caddyGroupId) || null;
    let group = null;
    if (caddyGroupId) {
        group = await GolfCaddyGroup.findOne({ where: { companyId, id: caddyGroupId } });
        if (!group) return { error: 'The caddy group is not one of this company\'s groups.' };
        if (group.isActive === false) return { error: `Caddy group '${group.code}' is disabled - pick an active group or none.` };
        if (group.maxCaddies !== null && group.maxCaddies !== undefined) {
            const where = { companyId, caddyGroupId: group.id };
            if (selfId) where.id = { [Op.ne]: selfId };
            const members = await GolfCaddy.count({ where });
            if (members >= Number(group.maxCaddies)) return { error: `Caddy group '${group.code}' is full (${group.maxCaddies}).` };
        }
    }
    const gender = str(body.gender) || null;
    if (gender && !GENDER_KEYS.includes(gender)) return { error: 'Gender must be male, female or blank.' };
    const dateOfBirth = str(body.dateOfBirth) || null;
    if (dateOfBirth && !svc.DATE_RE.test(dateOfBirth)) return { error: 'Date of birth must be a valid date.' };
    const joinedDate = str(body.joinedDate) || null;
    if (joinedDate && !svc.DATE_RE.test(joinedDate)) return { error: 'Joined date must be a valid date.' };
    const leftDate = str(body.leftDate) || null;
    if (leftDate && !svc.DATE_RE.test(leftDate)) return { error: 'Left date must be a valid date.' };
    if (joinedDate && leftDate && leftDate < joinedDate) return { error: 'The left date is before the joined date.' };
    const email = str(body.email).slice(0, 255) || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Enter a valid email address.' };
    return {
        value: {
            caddyNo, name, caddyGradeId, caddyGroupId,
            isLeader: body.isLeader === true,
            staffNo: str(body.staffNo).slice(0, 50) || null,
            identityNo: str(body.identityNo).slice(0, 50) || null,
            gender, dateOfBirth,
            mobile: str(body.mobile).slice(0, 30) || null,
            email,
            languages: str(body.languages).slice(0, 255) || null,
            nationalityCode: str(body.nationalityCode).toUpperCase().slice(0, 20) || null,
            raceCode: str(body.raceCode).toUpperCase().slice(0, 20) || null,
            photo: str(body.photo) || null,
            joinedDate, leftDate,
            remarks: str(body.remarks).slice(0, 255) || null,
        },
        grade,
        group,
    };
}

const INCLUDE = [
    { model: GolfCaddyGrade, as: 'grade', attributes: ['id', 'code', 'name', 'playersPerCaddy'] },
    { model: GolfCaddyGroup, as: 'group', attributes: ['id', 'code', 'name'] },
];

// GET /api/golf/caddies/meta - vocabularies + the active grades and groups.
exports.getMeta = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const [grades, groups] = await Promise.all([
            GolfCaddyGrade.findAll({ where: { companyId, isActive: true }, order: [['sortOrder', 'ASC'], ['code', 'ASC']] }),
            GolfCaddyGroup.findAll({ where: { companyId, isActive: true }, order: [['rotationOrder', 'ASC'], ['code', 'ASC']] }),
        ]);
        res.status(200).json({
            grades: grades.map((g) => ({ id: g.id, code: g.code, name: g.name, playersPerCaddy: Number(g.playersPerCaddy) })),
            groups: groups.map((g) => ({ id: g.id, code: g.code, name: g.name, maxCaddies: g.maxCaddies })),
            statuses: CADDY_STATUSES,
            leaveTypes: LEAVE_TYPES,
            noteKinds: NOTE_KINDS,
            genders: GENDERS,
        });
    } catch (error) {
        console.error('Error loading caddy meta:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/golf/caddies - the register with today's leave flag and the note points.
exports.list = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const today = String(req.query.date || '').match(svc.DATE_RE) ? String(req.query.date) : new Date().toISOString().slice(0, 10);
        const [rows, onLeave, points] = await Promise.all([
            GolfCaddy.findAll({ where: { companyId }, include: INCLUDE, order: [['status', 'ASC'], ['caddyNo', 'ASC']] }),
            svc.caddyIdsOnLeave(companyId, today),
            GolfCaddyNote.findAll({
                where: { companyId },
                attributes: ['caddyId', [GolfCaddyNote.sequelize.fn('SUM', GolfCaddyNote.sequelize.col('points')), 'points'], [GolfCaddyNote.sequelize.fn('COUNT', GolfCaddyNote.sequelize.col('id')), 'n']],
                group: ['caddyId'],
                raw: true,
            }),
        ]);
        const pointsByCaddy = new Map(points.map((p) => [p.caddyId, { points: Number(p.points) || 0, notes: Number(p.n) || 0 }]));
        const flags = await annotateCanModify(req, rows);
        res.status(200).json({
            caddies: rows.map((r, i) => toDto(r, flags[i], {
                onLeaveType: onLeave.get(r.id) || null,
                notePoints: (pointsByCaddy.get(r.id) || {}).points || 0,
                noteCount: (pointsByCaddy.get(r.id) || {}).notes || 0,
            })),
            asOf: today,
        });
    } catch (error) {
        console.error('Error listing caddies:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/golf/caddies
exports.create = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const parsed = await normalizeBody(companyId, req.body);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;
        const existing = await GolfCaddy.findOne({ where: { companyId, caddyNo: v.caddyNo } });
        if (existing) return res.status(409).json({ message: `Caddy ${existing.caddyNo} already exists${existing.status === 'blacklisted' ? ' (blacklisted - the number is not reissued)' : ''}.` });
        const placement = await getCallerPlacement(req);
        const callerId = getUserContext(req).userId;
        const row = await GolfCaddy.create({
            companyId, ...v, qrToken: svc.newQrToken(), status: 'active',
            createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId,
        });
        row.grade = parsed.grade;
        row.group = parsed.group;
        res.status(201).json({ message: `Caddy ${row.caddyNo} added to the register.`, caddy: toDto(row) });
    } catch (error) {
        console.error('Error creating caddy:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

async function findOwned(req, res, { modify = true } = {}) {
    const companyId = companyIdOf(req);
    if (!companyId) { res.status(400).json({ message: 'Select a workspace first.' }); return null; }
    const row = await GolfCaddy.findOne({ where: { id: req.params.id, companyId }, include: INCLUDE });
    if (!row) { res.status(404).json({ message: 'Caddy not found.' }); return null; }
    if (modify && !(await canModifyRecord(req, row))) {
        res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        return null;
    }
    return { companyId, row };
}

// PUT /api/golf/caddies/:id
exports.update = async (req, res) => {
    try {
        const found = await findOwned(req, res);
        if (!found) return;
        const { companyId, row } = found;
        const parsed = await normalizeBody(companyId, req.body, row.id);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;
        if (v.caddyNo !== row.caddyNo) {
            const clash = await GolfCaddy.findOne({ where: { companyId, caddyNo: v.caddyNo, id: { [Op.ne]: row.id } } });
            if (clash) return res.status(409).json({ message: `Caddy ${clash.caddyNo} already exists.` });
        }
        Object.assign(row, v);
        row.updatedBy = getUserContext(req).userId;
        await row.save();
        row.grade = parsed.grade;
        row.group = parsed.group;
        res.status(200).json({ message: `Caddy ${row.caddyNo} updated.`, caddy: toDto(row) });
    } catch (error) {
        console.error('Error updating caddy:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/golf/caddies/:id/status { status, reason? } - active | inactive | blacklisted.
exports.setStatus = async (req, res) => {
    try {
        const found = await findOwned(req, res);
        if (!found) return;
        const { row } = found;
        const status = str(req.body.status);
        if (!CADDY_STATUS_KEYS.includes(status)) return res.status(400).json({ message: 'Status must be active, inactive or blacklisted.' });
        const reason = str(req.body.reason).slice(0, 255);
        if (status !== 'active' && !reason) return res.status(400).json({ message: `Give the reason for marking the caddy ${status}.` });
        if (status === row.status) return res.status(409).json({ message: `Caddy ${row.caddyNo} is already ${status}.` });
        const callerId = getUserContext(req).userId;
        row.status = status;
        row.statusReason = status === 'active' ? null : reason;
        if (status === 'inactive' && !row.leftDate) row.leftDate = new Date().toISOString().slice(0, 10);
        if (status === 'active') row.leftDate = null;
        row.updatedBy = callerId;
        await row.save();
        res.status(200).json({ message: `Caddy ${row.caddyNo} is now ${status}.`, caddy: toDto(row) });
    } catch (error) {
        console.error('Error updating caddy status:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/golf/caddies/:id/regenerate-qr
exports.regenerateQr = async (req, res) => {
    try {
        const found = await findOwned(req, res);
        if (!found) return;
        const { row } = found;
        row.qrToken = svc.newQrToken();
        row.updatedBy = getUserContext(req).userId;
        await row.save();
        res.status(200).json({ message: `New QR code issued for caddy ${row.caddyNo} - reprint the badge.`, caddy: toDto(row) });
    } catch (error) {
        console.error('Error regenerating caddy QR:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/golf/caddies/:id - a mis-keyed record with no leave or note yet.
exports.remove = async (req, res) => {
    try {
        const found = await findOwned(req, res);
        if (!found) return;
        const { row } = found;
        const [leaves, notes] = await Promise.all([
            GolfCaddyLeave.count({ where: { caddyId: row.id } }),
            GolfCaddyNote.count({ where: { caddyId: row.id } }),
        ]);
        if (leaves || notes) return res.status(409).json({ message: `Caddy ${row.caddyNo} has records (${leaves} leave, ${notes} note(s)) - mark the caddy inactive instead.` });
        await row.destroy();
        res.status(200).json({ message: `Caddy ${row.caddyNo} deleted.` });
    } catch (error) {
        console.error('Error deleting caddy:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/golf/caddies/photo (multipart, field "photo") - the caddy photo
// to GCS; the caller stores the URL via create/update.
exports.uploadPhoto = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        if (!req.file) return res.status(400).json({ message: 'No image file uploaded.' });
        const bucket = assetsBucket();
        const fileExtension = req.file.originalname.split('.').pop();
        const gcsFileName = `golf-caddy-${companyId}-${Date.now()}.${fileExtension}`;
        const blob = bucket.file(gcsFileName);
        await blob.save(req.file.buffer, { resumable: false, contentType: req.file.mimetype });
        res.status(200).json({ message: 'Photo uploaded.', url: `https://storage.googleapis.com/${bucket.name}/${blob.name}` });
    } catch (error) {
        console.error('Caddy photo upload error:', error);
        res.status(500).json({ message: error.message || 'Failed to upload photo.' });
    }
};

// ---------------------------------------------------------------------------
// Leave records

// GET /api/golf/caddies/:id/leaves
exports.listLeaves = async (req, res) => {
    try {
        const found = await findOwned(req, res, { modify: false });
        if (!found) return;
        const rows = await GolfCaddyLeave.findAll({ where: { caddyId: found.row.id }, order: [['dateFrom', 'DESC']] });
        res.status(200).json({ leaves: rows.map(svc.leaveDto) });
    } catch (error) {
        console.error('Error listing caddy leaves:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

function normalizeLeave(body) {
    const leaveType = str(body.leaveType);
    if (!LEAVE_TYPE_KEYS.includes(leaveType)) return { error: 'Select the leave type.' };
    const dateFrom = str(body.dateFrom);
    const dateTo = str(body.dateTo) || dateFrom;
    if (!svc.DATE_RE.test(dateFrom) || !svc.DATE_RE.test(dateTo)) return { error: 'Enter the leave dates.' };
    if (dateTo < dateFrom) return { error: 'The leave ends before it starts.' };
    return { value: { leaveType, dateFrom, dateTo, remarks: str(body.remarks).slice(0, 255) || null } };
}

// POST /api/golf/caddies/:id/leaves
exports.createLeave = async (req, res) => {
    try {
        const found = await findOwned(req, res);
        if (!found) return;
        const parsed = normalizeLeave(req.body);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;
        const existing = await GolfCaddyLeave.findAll({ where: { caddyId: found.row.id } });
        const clash = svc.overlappingLeaves(existing, v.dateFrom, v.dateTo);
        if (clash.length) return res.status(409).json({ message: `Caddy ${found.row.caddyNo} already has ${clash[0].leaveType} leave from ${clash[0].dateFrom} to ${clash[0].dateTo}.` });
        const placement = await getCallerPlacement(req);
        const callerId = getUserContext(req).userId;
        const row = await GolfCaddyLeave.create({
            companyId: found.companyId, caddyId: found.row.id, ...v,
            createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId,
        });
        res.status(201).json({ message: `Leave recorded for caddy ${found.row.caddyNo}.`, leave: svc.leaveDto(row) });
    } catch (error) {
        console.error('Error creating caddy leave:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/golf/caddies/:id/leaves/:leaveId
exports.updateLeave = async (req, res) => {
    try {
        const found = await findOwned(req, res);
        if (!found) return;
        const row = await GolfCaddyLeave.findOne({ where: { id: req.params.leaveId, caddyId: found.row.id } });
        if (!row) return res.status(404).json({ message: 'Leave record not found.' });
        const parsed = normalizeLeave(req.body);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;
        const existing = await GolfCaddyLeave.findAll({ where: { caddyId: found.row.id } });
        const clash = svc.overlappingLeaves(existing, v.dateFrom, v.dateTo, row.id);
        if (clash.length) return res.status(409).json({ message: `Caddy ${found.row.caddyNo} already has ${clash[0].leaveType} leave from ${clash[0].dateFrom} to ${clash[0].dateTo}.` });
        Object.assign(row, v);
        row.updatedBy = getUserContext(req).userId;
        await row.save();
        res.status(200).json({ message: 'Leave updated.', leave: svc.leaveDto(row) });
    } catch (error) {
        console.error('Error updating caddy leave:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/golf/caddies/:id/leaves/:leaveId
exports.removeLeave = async (req, res) => {
    try {
        const found = await findOwned(req, res);
        if (!found) return;
        const row = await GolfCaddyLeave.findOne({ where: { id: req.params.leaveId, caddyId: found.row.id } });
        if (!row) return res.status(404).json({ message: 'Leave record not found.' });
        await row.destroy();
        res.status(200).json({ message: 'Leave removed.' });
    } catch (error) {
        console.error('Error deleting caddy leave:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---------------------------------------------------------------------------
// Notes (commendations, complaints, penalties, evaluations)

// GET /api/golf/caddies/:id/notes
exports.listNotes = async (req, res) => {
    try {
        const found = await findOwned(req, res, { modify: false });
        if (!found) return;
        const rows = await GolfCaddyNote.findAll({ where: { caddyId: found.row.id }, order: [['noteDate', 'DESC'], ['createdAt', 'DESC']] });
        res.status(200).json({ notes: rows.map(svc.noteDto), points: rows.reduce((s, n) => s + (Number(n.points) || 0), 0) });
    } catch (error) {
        console.error('Error listing caddy notes:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

function normalizeNote(body) {
    const kind = str(body.kind);
    if (!NOTE_KIND_KEYS.includes(kind)) return { error: 'Select the kind of note.' };
    const noteDate = str(body.noteDate) || new Date().toISOString().slice(0, 10);
    if (!svc.DATE_RE.test(noteDate)) return { error: 'Enter a valid date.' };
    const points = body.points === undefined || body.points === null || body.points === '' ? 0 : Number(body.points);
    if (!Number.isInteger(points) || points < -100 || points > 100) return { error: 'Points must be a whole number between -100 and 100.' };
    const description = str(body.description).slice(0, 255);
    if (!description) return { error: 'Describe the note.' };
    return { value: { kind, noteDate, points, description, followUp: str(body.followUp).slice(0, 255) || null } };
}

// POST /api/golf/caddies/:id/notes
exports.createNote = async (req, res) => {
    try {
        const found = await findOwned(req, res);
        if (!found) return;
        const parsed = normalizeNote(req.body);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const placement = await getCallerPlacement(req);
        const callerId = getUserContext(req).userId;
        const row = await GolfCaddyNote.create({
            companyId: found.companyId, caddyId: found.row.id, ...parsed.value,
            createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId,
        });
        res.status(201).json({ message: `${NOTE_KINDS.find((k) => k.key === row.kind).label} recorded for caddy ${found.row.caddyNo}.`, note: svc.noteDto(row) });
    } catch (error) {
        console.error('Error creating caddy note:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/golf/caddies/:id/notes/:noteId
exports.updateNote = async (req, res) => {
    try {
        const found = await findOwned(req, res);
        if (!found) return;
        const row = await GolfCaddyNote.findOne({ where: { id: req.params.noteId, caddyId: found.row.id } });
        if (!row) return res.status(404).json({ message: 'Note not found.' });
        const parsed = normalizeNote(req.body);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        Object.assign(row, parsed.value);
        row.updatedBy = getUserContext(req).userId;
        await row.save();
        res.status(200).json({ message: 'Note updated.', note: svc.noteDto(row) });
    } catch (error) {
        console.error('Error updating caddy note:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/golf/caddies/:id/notes/:noteId
exports.removeNote = async (req, res) => {
    try {
        const found = await findOwned(req, res);
        if (!found) return;
        const row = await GolfCaddyNote.findOne({ where: { id: req.params.noteId, caddyId: found.row.id } });
        if (!row) return res.status(404).json({ message: 'Note not found.' });
        await row.destroy();
        res.status(200).json({ message: 'Note removed.' });
    } catch (error) {
        console.error('Error deleting caddy note:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---------------------------------------------------------------------------
// GET /api/golf/caddies/badges/html?ids= - the printable badge QR sheet (every
// active caddy when no ids are named). The QR encodes the badge token; the
// caddy station (slice 2) resolves it.
exports.badgesHtml = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const ids = String(req.query.ids || '').split(',').map((s) => s.trim()).filter(Boolean);
        const where = { companyId, ...(ids.length ? { id: { [Op.in]: ids } } : { status: 'active' }) };
        const rows = await GolfCaddy.findAll({ where, include: INCLUDE, order: [['caddyNo', 'ASC']] });
        if (!rows.length) return res.status(404).json({ message: 'No caddies to print.' });
        const letterhead = await getCompanyLetterhead(companyId);
        const cards = [];
        for (const c of rows) {
            const svg = await QRCode.toString(c.qrToken, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
            cards.push(`<div class="badge">${c.photo ? `<img class="photo" src="${esc(c.photo)}" alt="">` : '<div class="photo photo--blank"></div>'}<div class="who"><div class="no">${esc(c.caddyNo)}</div><div class="name">${esc(c.name)}</div><div class="grade">${esc(c.grade ? c.grade.name : '')}</div><div class="club">${esc(letterhead ? letterhead.name : '')}</div></div><div class="qr">${svg}</div></div>`);
        }
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>Caddy badges</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;color:#1e293b;margin:16px}
.sheet{display:grid;grid-template-columns:repeat(auto-fill,minmax(86mm,1fr));gap:6mm}
.badge{display:grid;grid-template-columns:24mm 1fr 26mm;gap:3mm;align-items:center;border:1px dashed #94a3b8;border-radius:3mm;padding:3mm;break-inside:avoid;page-break-inside:avoid}
.photo{width:24mm;height:30mm;object-fit:cover;border-radius:2mm;background:#e2e8f0}
.no{font-size:20px;font-weight:700;letter-spacing:1px}.name{font-size:14px;font-weight:600}.grade{font-size:11px;color:#475569}.club{font-size:10px;color:#64748b;margin-top:2mm}
.qr svg{width:26mm;height:26mm;background:#fff}
.noprint{margin-bottom:12px}
@media print{body{margin:8mm}.noprint{display:none}.badge{border-color:#cbd5e1}}
</style></head><body>
<p class="noprint"><button onclick="window.print()">Print</button> ${rows.length} badge(s)</p>
<div class="sheet">${cards.join('')}</div>
</body></html>`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.status(200).send(html);
    } catch (error) {
        console.error('Error rendering caddy badges:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
