// Facilities master (/facility/facilities; structure approved 2026-10-25) -
// the physical units under a Facility Type. The type is fixed at creation
// (closures and, from slice 2, bookings hang off the unit's type); a unit is
// deleted only while no closure plan references it (slice 2 adds the booking
// guard).

const { Storage } = require('@google-cloud/storage');
const { Op } = require('sequelize');
const Facility = require('./facility.model');
const FacilityType = require('./facilityType.model');
const FacilityClosurePlan = require('./facilityClosurePlan.model');
const { getUserContext } = require('../../platform/serviceContext');
const { companyIdOf, stampsFor, parseOptionalInt, parseRequiredInt } = require('./facilityShared');

const storage = new Storage();
function assetsBucket() {
    const name = process.env.ASSETS_BUCKET;
    if (!name) throw new Error('ASSETS_BUCKET env var is not set - cannot store uploads.');
    return storage.bucket(name);
}

const CODE_RE = /^[A-Z0-9_-]{1,20}$/;

const TYPE_ATTRS = ['id', 'code', 'description', 'usageMode', 'sortOrder', 'isActive', 'trackUnits'];

function unitDto(row) {
    const p = row.get ? row.get({ plain: true }) : row;
    const type = p.FacilityType || null;
    return {
        ...p,
        FacilityType: undefined,
        facilityType: type ? { id: type.id, code: type.code, description: type.description, usageMode: type.usageMode, trackUnits: type.trackUnits } : null,
    };
}

// Validate the fields present in `body`; `type` is the (fixed) parent type.
function validateUnit(body, type) {
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
    if ('location' in body) out.location = typeof body.location === 'string' && body.location.trim() ? body.location.trim() : null;
    if ('remarks' in body) out.remarks = typeof body.remarks === 'string' && body.remarks.trim() ? body.remarks.trim() : null;
    if ('pictureUrl' in body) out.pictureUrl = typeof body.pictureUrl === 'string' && body.pictureUrl.trim() ? body.pictureUrl.trim() : null;
    for (const flag of ['isIndoor', 'isFloodlit', 'isActive']) {
        if (typeof body[flag] === 'boolean') out[flag] = body[flag];
    }
    if ('sortOrder' in body) {
        const n = parseRequiredInt(body.sortOrder, 0, 9999);
        if (!n.ok) return { error: 'Sort order must be a whole number between 0 and 9999.' };
        out.sortOrder = n.value;
    }
    if ('capacity' in body) {
        const n = parseOptionalInt(body.capacity, 1, 100000);
        if (!n.ok) return { error: 'Capacity must be a whole number between 1 and 100000, or blank.' };
        out.capacity = n.value;
    }
    // Only an entry-mode unit carries its own capacity.
    if (type && type.usageMode !== 'entry') out.capacity = null;
    return { values: out };
}

// GET /api/facility/facilities?facilityTypeId=
exports.list = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const where = { companyId };
        if (req.query.facilityTypeId) where.facilityTypeId = String(req.query.facilityTypeId);
        const rows = await Facility.findAll({
            where,
            include: [{ model: FacilityType, as: 'FacilityType', attributes: TYPE_ATTRS }],
            order: [[{ model: FacilityType, as: 'FacilityType' }, 'sortOrder', 'ASC'], [{ model: FacilityType, as: 'FacilityType' }, 'code', 'ASC'], ['sortOrder', 'ASC'], ['code', 'ASC']],
        });
        res.status(200).json(rows.map(unitDto));
    } catch (error) {
        console.error('Error listing facilities:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/facilities
exports.create = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        for (const f of ['facilityTypeId', 'code', 'name']) {
            if (!(f in req.body) || req.body[f] === null || req.body[f] === '') {
                return res.status(400).json({ message: 'Facility type, code and name are required.' });
            }
        }
        const type = await FacilityType.findOne({ where: { id: String(req.body.facilityTypeId), companyId } });
        if (!type) return res.status(400).json({ message: 'Pick a facility type of the active company.' });

        const v = validateUnit(req.body, type);
        if (v.error) return res.status(400).json({ message: v.error });
        const clash = await Facility.findOne({ where: { companyId, code: v.values.code } });
        if (clash) return res.status(409).json({ message: `Facility '${v.values.code}' already exists.` });

        const stamps = await stampsFor(req);
        const row = await Facility.create({ companyId, facilityTypeId: type.id, ...v.values, ...stamps });
        const full = await Facility.findOne({ where: { id: row.id }, include: [{ model: FacilityType, as: 'FacilityType', attributes: TYPE_ATTRS }] });
        res.status(201).json({ message: 'Facility created.', facility: unitDto(full) });
    } catch (error) {
        console.error('Error creating facility:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/facility/facilities/:id - the type is fixed.
exports.update = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await Facility.findOne({ where: { id: req.params.id, companyId }, include: [{ model: FacilityType, as: 'FacilityType', attributes: TYPE_ATTRS }] });
        if (!row) return res.status(404).json({ message: 'Facility not found.' });
        if ('facilityTypeId' in req.body && String(req.body.facilityTypeId) !== row.facilityTypeId) {
            return res.status(409).json({ message: 'A facility cannot move to another facility type. Create a new facility under that type instead.' });
        }
        const v = validateUnit(req.body, row.FacilityType);
        if (v.error) return res.status(400).json({ message: v.error });
        if (v.values.code && v.values.code !== row.code) {
            const clash = await Facility.findOne({ where: { companyId, code: v.values.code, id: { [Op.ne]: row.id } } });
            if (clash) return res.status(409).json({ message: `Facility '${v.values.code}' already exists.` });
        }
        Object.assign(row, v.values, { updatedBy: getUserContext(req).userId });
        await row.save();
        res.status(200).json({ message: 'Facility updated.', facility: unitDto(row) });
    } catch (error) {
        console.error('Error updating facility:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/facility/facilities/:id
exports.remove = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await Facility.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Facility not found.' });
        const plans = await FacilityClosurePlan.count({ where: { facilityId: row.id } });
        if (plans) return res.status(409).json({ message: `Cannot delete ${row.code} - ${plans} closure plan${plans === 1 ? '' : 's'} still name it. Delete those first.` });
        await row.destroy();
        res.status(200).json({ message: `Facility ${row.code} deleted.` });
    } catch (error) {
        console.error('Error deleting facility:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/facilities/picture (multipart 'picture') -> { url }
exports.uploadPicture = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        if (!req.file) return res.status(400).json({ message: 'No image file uploaded.' });
        const bucket = assetsBucket();
        const ext = req.file.originalname.split('.').pop();
        const blob = bucket.file(`facility-${companyId}-${Date.now()}.${ext}`);
        await blob.save(req.file.buffer, { resumable: false, contentType: req.file.mimetype });
        res.status(200).json({ message: 'Picture uploaded.', url: `https://storage.googleapis.com/${bucket.name}/${blob.name}` });
    } catch (error) {
        console.error('Facility picture upload error:', error);
        res.status(500).json({ message: error.message || 'Failed to upload picture.' });
    }
};
