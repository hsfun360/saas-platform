// Caddy Group master file (Golf Management → Common Setup → Caddy Groups;
// spec 2.1.2, user decisions 2026-10-17: the area dropped). An optional
// grouping of caddies with a size cap and a rotation order. Deleted only
// while no caddy is in it.

const { Op } = require('sequelize');
const GolfCaddyGroup = require('./caddyGroup.model');
const GolfCaddy = require('./caddy.model');
const {
    getUserContext,
    getCallerPlacement,
    canModifyRecord,
    annotateCanModify,
} = require('../../platform/serviceContext');

function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

function str(v) {
    return typeof v === 'string' ? v.trim() : '';
}

function toDto(g, canModify = true) {
    return {
        id: g.id,
        canModify,
        code: g.code,
        name: g.name,
        maxCaddies: g.maxCaddies === null || g.maxCaddies === undefined ? null : Number(g.maxCaddies),
        rotationOrder: Number(g.rotationOrder),
        isActive: g.isActive !== false,
        caddyCount: g.caddyCount === undefined ? undefined : Number(g.caddyCount),
    };
}

function normalizeBody(body) {
    const code = str(body.code).toUpperCase();
    if (!code) return { error: 'Code is required.' };
    if (code.length > 20) return { error: 'Code must be 20 characters or fewer.' };
    if (!/^[A-Z0-9][A-Z0-9-]*$/.test(code)) return { error: 'Code may only contain letters, digits and hyphens.' };
    const name = str(body.name);
    if (!name) return { error: 'Name is required.' };
    if (name.length > 255) return { error: 'Name must be 255 characters or fewer.' };
    let maxCaddies = null;
    if (body.maxCaddies !== undefined && body.maxCaddies !== null && body.maxCaddies !== '') {
        maxCaddies = Number(body.maxCaddies);
        if (!Number.isInteger(maxCaddies) || maxCaddies < 1 || maxCaddies > 999) return { error: 'Max caddies must be a whole number between 1 and 999, or blank for no cap.' };
    }
    const rotationOrder = body.rotationOrder === undefined || body.rotationOrder === null || body.rotationOrder === '' ? 100 : Number(body.rotationOrder);
    if (!Number.isInteger(rotationOrder) || rotationOrder < 1 || rotationOrder > 999) return { error: 'Rotation order must be a whole number between 1 and 999.' };
    return { value: { code, name, maxCaddies, rotationOrder } };
}

// GET /api/golf/caddy-groups
exports.list = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const rows = await GolfCaddyGroup.findAll({ where: { companyId }, order: [['rotationOrder', 'ASC'], ['code', 'ASC']] });
        const counts = await GolfCaddy.findAll({
            where: { companyId, caddyGroupId: { [Op.ne]: null } },
            attributes: ['caddyGroupId', [GolfCaddy.sequelize.fn('COUNT', GolfCaddy.sequelize.col('id')), 'n']],
            group: ['caddyGroupId'],
            raw: true,
        });
        const countByGroup = new Map(counts.map((c) => [c.caddyGroupId, Number(c.n)]));
        const flags = await annotateCanModify(req, rows);
        res.status(200).json({ caddyGroups: rows.map((r, i) => toDto(Object.assign(r, { caddyCount: countByGroup.get(r.id) || 0 }), flags[i])) });
    } catch (error) {
        console.error('Error listing caddy groups:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/golf/caddy-groups
exports.create = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const parsed = normalizeBody(req.body);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;
        const existing = await GolfCaddyGroup.findOne({ where: { companyId, code: { [Op.iLike]: v.code } } });
        if (existing) return res.status(409).json({ message: `Caddy group '${existing.code}' already exists.` });
        const placement = await getCallerPlacement(req);
        const callerId = getUserContext(req).userId;
        const row = await GolfCaddyGroup.create({
            companyId, ...v, isActive: true,
            createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId,
        });
        res.status(201).json({ message: `Caddy group '${row.code}' created.`, caddyGroup: toDto(row) });
    } catch (error) {
        console.error('Error creating caddy group:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

async function findOwned(req, res) {
    const companyId = companyIdOf(req);
    if (!companyId) { res.status(400).json({ message: 'Select a workspace first.' }); return null; }
    const row = await GolfCaddyGroup.findOne({ where: { id: req.params.id, companyId } });
    if (!row) { res.status(404).json({ message: 'Caddy group not found.' }); return null; }
    if (!(await canModifyRecord(req, row))) {
        res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        return null;
    }
    return { companyId, row };
}

// PUT /api/golf/caddy-groups/:id
exports.update = async (req, res) => {
    try {
        const found = await findOwned(req, res);
        if (!found) return;
        const { companyId, row } = found;
        const parsed = normalizeBody(req.body);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;
        if (v.code !== row.code) {
            const clash = await GolfCaddyGroup.findOne({ where: { companyId, code: { [Op.iLike]: v.code }, id: { [Op.ne]: row.id } } });
            if (clash) return res.status(409).json({ message: `Caddy group '${clash.code}' already exists.` });
        }
        if (v.maxCaddies !== null) {
            const members = await GolfCaddy.count({ where: { companyId, caddyGroupId: row.id } });
            if (members > v.maxCaddies) return res.status(409).json({ message: `Caddy group '${row.code}' already has ${members} caddies - the cap cannot be below that.` });
        }
        Object.assign(row, v);
        row.updatedBy = getUserContext(req).userId;
        await row.save();
        res.status(200).json({ message: `Caddy group '${row.code}' updated.`, caddyGroup: toDto(row) });
    } catch (error) {
        console.error('Error updating caddy group:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/golf/caddy-groups/:id - toggle isActive.
exports.setActive = async (req, res) => {
    try {
        const found = await findOwned(req, res);
        if (!found) return;
        const { row } = found;
        if (typeof req.body.isActive === 'boolean') {
            row.isActive = req.body.isActive;
            row.updatedBy = getUserContext(req).userId;
            await row.save();
        }
        res.status(200).json({ message: `Caddy group '${row.code}' updated.`, caddyGroup: toDto(row) });
    } catch (error) {
        console.error('Error updating caddy group:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/golf/caddy-groups/:id - only while empty.
exports.remove = async (req, res) => {
    try {
        const found = await findOwned(req, res);
        if (!found) return;
        const { companyId, row } = found;
        const members = await GolfCaddy.count({ where: { companyId, caddyGroupId: row.id } });
        if (members) return res.status(409).json({ message: `Caddy group '${row.code}' still has ${members} caddies - move them first or disable the group.` });
        await row.destroy();
        res.status(200).json({ message: `Caddy group '${row.code}' deleted.` });
    } catch (error) {
        console.error('Error deleting caddy group:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
