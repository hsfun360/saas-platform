// Buggy Type master file (Golf Management → Common Setup → Buggy Types;
// spec 2.1.1 球车类型主文件, user decisions 2026-10-17): the kinds of buggy the
// club runs - code, name, seats. Deleted only while no unit references it.

const { Op } = require('sequelize');
const GolfBuggyType = require('./buggyType.model');
const GolfBuggy = require('./buggy.model');
const {
    getUserContext,
    getCallerPlacement,
    canModifyRecord,
    annotateCanModify,
} = require('../../platform/serviceContext');
const { MIN_SEATS, MAX_SEATS } = require('./buggy.constants');

function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

function str(v) {
    return typeof v === 'string' ? v.trim() : '';
}

function toDto(t, canModify = true) {
    return {
        id: t.id,
        canModify,
        code: t.code,
        name: t.name,
        seats: Number(t.seats),
        isActive: t.isActive !== false,
        sortOrder: Number(t.sortOrder),
        buggyCount: t.buggyCount === undefined ? undefined : Number(t.buggyCount),
    };
}

// Validate + normalise a payload. Returns { value } or { error }.
function normalizeBody(body) {
    const code = str(body.code).toUpperCase();
    if (!code) return { error: 'Code is required.' };
    if (code.length > 20) return { error: 'Code must be 20 characters or fewer.' };
    if (!/^[A-Z0-9][A-Z0-9-]*$/.test(code)) return { error: 'Code may only contain letters, digits and hyphens.' };
    const name = str(body.name);
    if (!name) return { error: 'Name is required.' };
    if (name.length > 255) return { error: 'Name must be 255 characters or fewer.' };
    const seats = body.seats === undefined || body.seats === null || body.seats === '' ? 2 : Number(body.seats);
    if (!Number.isInteger(seats) || seats < MIN_SEATS || seats > MAX_SEATS) return { error: `Seats must be a whole number between ${MIN_SEATS} and ${MAX_SEATS}.` };
    const sortOrder = body.sortOrder === undefined || body.sortOrder === null || body.sortOrder === '' ? 100 : Number(body.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 1 || sortOrder > 999) return { error: 'Sort order must be a whole number between 1 and 999.' };
    return { value: { code, name, seats, sortOrder } };
}

// GET /api/golf/buggy-types/meta
exports.getMeta = async (req, res) => {
    res.status(200).json({ minSeats: MIN_SEATS, maxSeats: MAX_SEATS });
};

// GET /api/golf/buggy-types - every type of the company with its unit count.
exports.list = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const rows = await GolfBuggyType.findAll({ where: { companyId }, order: [['sortOrder', 'ASC'], ['code', 'ASC']] });
        const counts = await GolfBuggy.findAll({
            where: { companyId },
            attributes: ['buggyTypeId', [GolfBuggy.sequelize.fn('COUNT', GolfBuggy.sequelize.col('id')), 'n']],
            group: ['buggyTypeId'],
            raw: true,
        });
        const countByType = new Map(counts.map((c) => [c.buggyTypeId, Number(c.n)]));
        const flags = await annotateCanModify(req, rows);
        res.status(200).json({
            buggyTypes: rows.map((r, i) => toDto(Object.assign(r, { buggyCount: countByType.get(r.id) || 0 }), flags[i])),
            minSeats: MIN_SEATS,
            maxSeats: MAX_SEATS,
        });
    } catch (error) {
        console.error('Error listing golf buggy types:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/golf/buggy-types
exports.create = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const parsed = normalizeBody(req.body);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;
        const existing = await GolfBuggyType.findOne({ where: { companyId, code: { [Op.iLike]: v.code } } });
        if (existing) return res.status(409).json({ message: `Buggy type '${existing.code}' already exists.` });
        const placement = await getCallerPlacement(req);
        const callerId = getUserContext(req).userId;
        const row = await GolfBuggyType.create({
            companyId, ...v, isActive: true,
            createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId,
        });
        res.status(201).json({ message: `Buggy type '${row.code}' created.`, buggyType: toDto(row) });
    } catch (error) {
        console.error('Error creating golf buggy type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/golf/buggy-types/:id
exports.update = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await GolfBuggyType.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Buggy type not found.' });
        if (!(await canModifyRecord(req, row))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }
        const parsed = normalizeBody(req.body);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;
        if (v.code !== row.code) {
            const clash = await GolfBuggyType.findOne({ where: { companyId, code: { [Op.iLike]: v.code }, id: { [Op.ne]: row.id } } });
            if (clash) return res.status(409).json({ message: `Buggy type '${clash.code}' already exists.` });
        }
        Object.assign(row, v);
        row.updatedBy = getUserContext(req).userId;
        await row.save();
        res.status(200).json({ message: `Buggy type '${row.code}' updated.`, buggyType: toDto(row) });
    } catch (error) {
        console.error('Error updating golf buggy type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/golf/buggy-types/:id - toggle isActive.
exports.setActive = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await GolfBuggyType.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Buggy type not found.' });
        if (!(await canModifyRecord(req, row))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }
        if (typeof req.body.isActive === 'boolean') {
            row.isActive = req.body.isActive;
            row.updatedBy = getUserContext(req).userId;
            await row.save();
        }
        res.status(200).json({ message: `Buggy type '${row.code}' updated.`, buggyType: toDto(row) });
    } catch (error) {
        console.error('Error updating golf buggy type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/golf/buggy-types/:id - only while no unit references it.
exports.remove = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await GolfBuggyType.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Buggy type not found.' });
        if (!(await canModifyRecord(req, row))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }
        const inUse = await GolfBuggy.count({ where: { companyId, buggyTypeId: row.id } });
        if (inUse) return res.status(409).json({ message: `Buggy type '${row.code}' is used by ${inUse} buggy record(s) - disable it instead.` });
        await row.destroy();
        res.status(200).json({ message: `Buggy type '${row.code}' deleted.` });
    } catch (error) {
        console.error('Error deleting golf buggy type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
