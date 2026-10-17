// Caddy Grade master file (Golf Management → Common Setup → Caddy Grades;
// spec 2.1.1, user decisions 2026-10-17: pay rates dropped, the club pays
// caddies outside the system). Code + name + the golfers one caddy of the
// grade serves at once. Deleted only while no caddy holds the grade.

const { Op } = require('sequelize');
const GolfCaddyGrade = require('./caddyGrade.model');
const GolfCaddy = require('./caddy.model');
const {
    getUserContext,
    getCallerPlacement,
    canModifyRecord,
    annotateCanModify,
} = require('../../platform/serviceContext');
const { MIN_PLAYERS_PER_CADDY, MAX_PLAYERS_PER_CADDY } = require('./caddy.constants');

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
        playersPerCaddy: Number(t.playersPerCaddy),
        isActive: t.isActive !== false,
        sortOrder: Number(t.sortOrder),
        caddyCount: t.caddyCount === undefined ? undefined : Number(t.caddyCount),
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
    const playersPerCaddy = body.playersPerCaddy === undefined || body.playersPerCaddy === null || body.playersPerCaddy === '' ? 1 : Number(body.playersPerCaddy);
    if (!Number.isInteger(playersPerCaddy) || playersPerCaddy < MIN_PLAYERS_PER_CADDY || playersPerCaddy > MAX_PLAYERS_PER_CADDY) {
        return { error: `Players per caddy must be a whole number between ${MIN_PLAYERS_PER_CADDY} and ${MAX_PLAYERS_PER_CADDY}.` };
    }
    const sortOrder = body.sortOrder === undefined || body.sortOrder === null || body.sortOrder === '' ? 100 : Number(body.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 1 || sortOrder > 999) return { error: 'Sort order must be a whole number between 1 and 999.' };
    return { value: { code, name, playersPerCaddy, sortOrder } };
}

exports.getMeta = async (req, res) => {
    res.status(200).json({ minPlayersPerCaddy: MIN_PLAYERS_PER_CADDY, maxPlayersPerCaddy: MAX_PLAYERS_PER_CADDY });
};

// GET /api/golf/caddy-grades
exports.list = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const rows = await GolfCaddyGrade.findAll({ where: { companyId }, order: [['sortOrder', 'ASC'], ['code', 'ASC']] });
        const counts = await GolfCaddy.findAll({
            where: { companyId },
            attributes: ['caddyGradeId', [GolfCaddy.sequelize.fn('COUNT', GolfCaddy.sequelize.col('id')), 'n']],
            group: ['caddyGradeId'],
            raw: true,
        });
        const countByGrade = new Map(counts.map((c) => [c.caddyGradeId, Number(c.n)]));
        const flags = await annotateCanModify(req, rows);
        res.status(200).json({
            caddyGrades: rows.map((r, i) => toDto(Object.assign(r, { caddyCount: countByGrade.get(r.id) || 0 }), flags[i])),
            minPlayersPerCaddy: MIN_PLAYERS_PER_CADDY,
            maxPlayersPerCaddy: MAX_PLAYERS_PER_CADDY,
        });
    } catch (error) {
        console.error('Error listing caddy grades:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/golf/caddy-grades
exports.create = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const parsed = normalizeBody(req.body);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;
        const existing = await GolfCaddyGrade.findOne({ where: { companyId, code: { [Op.iLike]: v.code } } });
        if (existing) return res.status(409).json({ message: `Caddy grade '${existing.code}' already exists.` });
        const placement = await getCallerPlacement(req);
        const callerId = getUserContext(req).userId;
        const row = await GolfCaddyGrade.create({
            companyId, ...v, isActive: true,
            createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId,
        });
        res.status(201).json({ message: `Caddy grade '${row.code}' created.`, caddyGrade: toDto(row) });
    } catch (error) {
        console.error('Error creating caddy grade:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

async function findOwned(req, res) {
    const companyId = companyIdOf(req);
    if (!companyId) { res.status(400).json({ message: 'Select a workspace first.' }); return null; }
    const row = await GolfCaddyGrade.findOne({ where: { id: req.params.id, companyId } });
    if (!row) { res.status(404).json({ message: 'Caddy grade not found.' }); return null; }
    if (!(await canModifyRecord(req, row))) {
        res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        return null;
    }
    return { companyId, row };
}

// PUT /api/golf/caddy-grades/:id
exports.update = async (req, res) => {
    try {
        const found = await findOwned(req, res);
        if (!found) return;
        const { companyId, row } = found;
        const parsed = normalizeBody(req.body);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;
        if (v.code !== row.code) {
            const clash = await GolfCaddyGrade.findOne({ where: { companyId, code: { [Op.iLike]: v.code }, id: { [Op.ne]: row.id } } });
            if (clash) return res.status(409).json({ message: `Caddy grade '${clash.code}' already exists.` });
        }
        Object.assign(row, v);
        row.updatedBy = getUserContext(req).userId;
        await row.save();
        res.status(200).json({ message: `Caddy grade '${row.code}' updated.`, caddyGrade: toDto(row) });
    } catch (error) {
        console.error('Error updating caddy grade:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/golf/caddy-grades/:id - toggle isActive.
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
        res.status(200).json({ message: `Caddy grade '${row.code}' updated.`, caddyGrade: toDto(row) });
    } catch (error) {
        console.error('Error updating caddy grade:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/golf/caddy-grades/:id - only while no caddy holds it.
exports.remove = async (req, res) => {
    try {
        const found = await findOwned(req, res);
        if (!found) return;
        const { companyId, row } = found;
        const inUse = await GolfCaddy.count({ where: { companyId, caddyGradeId: row.id } });
        if (inUse) return res.status(409).json({ message: `Caddy grade '${row.code}' is held by ${inUse} caddy record(s) - disable it instead.` });
        await row.destroy();
        res.status(200).json({ message: `Caddy grade '${row.code}' deleted.` });
    } catch (error) {
        console.error('Error deleting caddy grade:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
