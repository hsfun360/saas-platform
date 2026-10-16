// Player Type master file (Golf Management → Common Setup → Player Types;
// spec 2.3.1, user decisions 2026-10-15). The club's catalog of player
// categories: code + base identity (fixed vocabulary) + description +
// approval flag. Three system rows per company are seeded by the catalog
// seam (codes locked); club-defined rows may be edited, disabled, and
// deleted while nothing references their code.

const { Op } = require('sequelize');
const GolfPlayerType = require('./playerType.model');
const Player = require('./player.model');
const GroupPlayer = require('./groupPlayer.model');
const GolfTransactionType = require('./transactionType.model');
const {
    getUserContext,
    getCallerPlacement,
    canModifyRecord,
    annotateCanModify,
} = require('../../platform/serviceContext');
const { BASE_IDENTITIES, BASE_IDENTITY_KEYS } = require('./playerType.constants');
const playerTypes = require('./playerType.service');

function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

function str(v) {
    return typeof v === 'string' ? v.trim() : '';
}

function toDto(t, canModify = true) {
    return { ...playerTypes.dto(t), canModify };
}

// Validate + normalise a payload. Returns { value } or { error }.
function normalizeBody(body, { system = false } = {}) {
    const code = str(body.code).toUpperCase();
    if (!system) {
        if (!code) return { error: 'Code is required.' };
        if (code.length > 20) return { error: 'Code must be 20 characters or fewer.' };
        if (!/^[A-Z0-9][A-Z0-9-]*$/.test(code)) return { error: 'Code may only contain letters, digits and hyphens.' };
    }
    const description = str(body.description);
    if (!description) return { error: 'Description is required.' };
    if (description.length > 255) return { error: 'Description must be 255 characters or fewer.' };
    const baseIdentity = str(body.baseIdentity);
    if (!system && !BASE_IDENTITY_KEYS.includes(baseIdentity)) return { error: 'Select a valid base identity.' };
    const sortOrder = body.sortOrder === undefined || body.sortOrder === null || body.sortOrder === '' ? 100 : Number(body.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 1 || sortOrder > 999) return { error: 'Sort order must be a whole number between 1 and 999.' };
    return {
        value: {
            code, description, baseIdentity,
            requiresApproval: body.requiresApproval === true,
            sortOrder,
        },
    };
}

// GET /api/golf/player-types/meta - the base-identity vocabulary.
exports.getMeta = async (req, res) => {
    res.status(200).json({ baseIdentities: BASE_IDENTITIES });
};

// GET /api/golf/player-types - every type of the company (system rows first).
exports.list = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        await playerTypes.ensureSystemTypes(companyId);
        const rows = await GolfPlayerType.findAll({ where: { companyId }, order: [['isSystem', 'DESC'], ['sortOrder', 'ASC'], ['code', 'ASC']] });
        const flags = await annotateCanModify(req, rows);
        res.status(200).json({ playerTypes: rows.map((r, i) => toDto(r, flags[i])), baseIdentities: BASE_IDENTITIES });
    } catch (error) {
        console.error('Error listing golf player types:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/golf/player-types
exports.create = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const parsed = normalizeBody(req.body);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;
        await playerTypes.ensureSystemTypes(companyId);
        const existing = await GolfPlayerType.findOne({ where: { companyId, code: { [Op.iLike]: v.code } } });
        if (existing) return res.status(409).json({ message: `Player type '${existing.code}' already exists.` });
        const placement = await getCallerPlacement(req);
        const callerId = getUserContext(req).userId;
        const row = await GolfPlayerType.create({
            companyId, ...v, isSystem: false, isActive: true,
            createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId,
        });
        res.status(201).json({ message: `Player type '${row.code}' created.`, playerType: toDto(row) });
    } catch (error) {
        console.error('Error creating golf player type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/golf/player-types/:id - full update; a system row keeps its code
// and base identity (only description, approval flag and sort order move).
exports.update = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await GolfPlayerType.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Player type not found.' });
        if (!(await canModifyRecord(req, row))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }
        const parsed = normalizeBody(req.body, { system: row.isSystem === true });
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;
        if (row.isSystem) {
            row.description = v.description;
            row.requiresApproval = v.requiresApproval;
            row.sortOrder = v.sortOrder;
        } else {
            if (v.code !== row.code) {
                const inUse = await codeInUse(companyId, row.code);
                if (inUse) return res.status(409).json({ message: `Player type '${row.code}' is used by ${inUse} - its code cannot change.` });
                const clash = await GolfPlayerType.findOne({ where: { companyId, code: { [Op.iLike]: v.code }, id: { [Op.ne]: row.id } } });
                if (clash) return res.status(409).json({ message: `Player type '${clash.code}' already exists.` });
            }
            if (v.baseIdentity !== row.baseIdentity) {
                const inUse = await codeInUse(companyId, row.code);
                if (inUse) return res.status(409).json({ message: `Player type '${row.code}' is used by ${inUse} - its base identity cannot change.` });
            }
            Object.assign(row, v);
        }
        row.updatedBy = getUserContext(req).userId;
        await row.save();
        res.status(200).json({ message: `Player type '${row.code}' updated.`, playerType: toDto(row) });
    } catch (error) {
        console.error('Error updating golf player type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/golf/player-types/:id - toggle isActive (system rows stay on).
exports.setActive = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await GolfPlayerType.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Player type not found.' });
        if (!(await canModifyRecord(req, row))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }
        if (typeof req.body.isActive === 'boolean') {
            if (row.isSystem && req.body.isActive === false) return res.status(400).json({ message: `'${row.code}' is a system player type and stays active.` });
            row.isActive = req.body.isActive;
            row.updatedBy = getUserContext(req).userId;
            await row.save();
        }
        res.status(200).json({ message: `Player type '${row.code}' updated.`, playerType: toDto(row) });
    } catch (error) {
        console.error('Error updating golf player type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/golf/player-types/:id - club-defined rows nothing references.
exports.remove = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await GolfPlayerType.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Player type not found.' });
        if (row.isSystem) return res.status(400).json({ message: `'${row.code}' is a system player type and cannot be deleted.` });
        if (!(await canModifyRecord(req, row))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }
        const inUse = await codeInUse(companyId, row.code);
        if (inUse) return res.status(409).json({ message: `Player type '${row.code}' is used by ${inUse} - disable it instead.` });
        await row.destroy();
        res.status(200).json({ message: `Player type '${row.code}' deleted.` });
    } catch (error) {
        console.error('Error deleting golf player type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// What references a code (the in-use guard): booking/registration lines, group
// rosters and transaction-type defaults. Returns a description or null.
async function codeInUse(companyId, code) {
    const [players, roster, types] = await Promise.all([
        Player.count({ where: { companyId, playerType: code } }),
        GroupPlayer.count({ where: { companyId, playerType: code } }),
        GolfTransactionType.count({ where: { companyId, golferType: code } }),
    ]);
    const parts = [];
    if (players) parts.push(`${players} player line(s)`);
    if (roster) parts.push(`${roster} group roster line(s)`);
    if (types) parts.push(`${types} transaction type(s)`);
    return parts.length ? parts.join(', ') : null;
}
