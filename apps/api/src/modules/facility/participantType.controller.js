// Participant Type master (/facility/participant-types; structure approved
// 2026-10-25). The club's catalog of participant categories: code + base
// identity (fixed vocabulary) + description + approval flag. Three system
// rows per company are seeded by the catalog seam (codes locked); club-
// defined rows may be edited, disabled and, while nothing references their
// code, deleted.

const { Op } = require('sequelize');
const ParticipantType = require('./participantType.model');
const TransactionType = require('./transactionType.model');
const TransactionTypeRateCell = require('./transactionTypeRateCell.model');
const TransactionTypeRate = require('./transactionTypeRate.model');
const { getUserContext, canModifyRecord, annotateCanModify } = require('../../platform/serviceContext');
const { BASE_IDENTITIES, BASE_IDENTITY_KEYS } = require('./facility.constants');
const participantTypes = require('./participantType.service');
const { companyIdOf, stampsFor } = require('./facilityShared');

function str(v) {
    return typeof v === 'string' ? v.trim() : '';
}

function toDto(t, canModify = true) {
    return { ...participantTypes.dto(t), canModify };
}

function normalizeBody(body, { system = false } = {}) {
    const code = str(body.code).toUpperCase();
    if (!system) {
        if (!code) return { error: 'Code is required.' };
        if (code.length > 20) return { error: 'Code must be 20 characters or fewer.' };
        if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(code)) return { error: 'Code may only contain letters, digits, underscores and hyphens.' };
    }
    const description = str(body.description);
    if (!description) return { error: 'Description is required.' };
    if (description.length > 255) return { error: 'Description must be 255 characters or fewer.' };
    const baseIdentity = str(body.baseIdentity);
    if (!system && !BASE_IDENTITY_KEYS.includes(baseIdentity)) return { error: 'Select a valid base identity.' };
    const sortOrder = body.sortOrder === undefined || body.sortOrder === null || body.sortOrder === '' ? 100 : Number(body.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 1 || sortOrder > 999) return { error: 'Sort order must be a whole number between 1 and 999.' };
    return { value: { code, description, baseIdentity, requiresApproval: body.requiresApproval === true, sortOrder } };
}

// What references a code (the in-use guard): transaction-type defaults and
// rate cells today; booking participant lines join in slice 2b.
async function codeInUse(companyId, code) {
    const [types, cells] = await Promise.all([
        TransactionType.count({ where: { companyId, participantType: code } }),
        TransactionTypeRateCell.count({
            where: { participantType: code },
            include: [{ model: TransactionTypeRate, as: 'Rate', attributes: [], required: true, include: [{ model: TransactionType, as: 'TransactionType', attributes: [], required: true, where: { companyId } }] }],
        }),
    ]);
    const parts = [];
    if (types) parts.push(`${types} transaction type default(s)`);
    if (cells) parts.push(`${cells} rate card cell(s)`);
    return parts.length ? parts.join(', ') : null;
}

// GET /api/facility/participant-types/meta
exports.getMeta = async (req, res) => {
    res.status(200).json({ baseIdentities: BASE_IDENTITIES });
};

// GET /api/facility/participant-types
exports.list = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        await participantTypes.ensureSystemTypes(companyId);
        const rows = await ParticipantType.findAll({ where: { companyId }, order: [['isSystem', 'DESC'], ['sortOrder', 'ASC'], ['code', 'ASC']] });
        const flags = await annotateCanModify(req, rows);
        res.status(200).json({ participantTypes: rows.map((r, i) => toDto(r, flags[i])), baseIdentities: BASE_IDENTITIES });
    } catch (error) {
        console.error('Error listing facility participant types:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/participant-types
exports.create = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const parsed = normalizeBody(req.body);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;
        await participantTypes.ensureSystemTypes(companyId);
        const existing = await ParticipantType.findOne({ where: { companyId, code: { [Op.iLike]: v.code } } });
        if (existing) return res.status(409).json({ message: `Participant type '${existing.code}' already exists.` });
        const stamps = await stampsFor(req);
        const row = await ParticipantType.create({ companyId, ...v, isSystem: false, isActive: true, ...stamps });
        res.status(201).json({ message: `Participant type '${row.code}' created.`, participantType: toDto(row) });
    } catch (error) {
        console.error('Error creating facility participant type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/facility/participant-types/:id - a system row keeps its code and
// base identity.
exports.update = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await ParticipantType.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Participant type not found.' });
        if (!(await canModifyRecord(req, row))) return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
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
                if (inUse) return res.status(409).json({ message: `Participant type '${row.code}' is used by ${inUse} - its code cannot change.` });
                const clash = await ParticipantType.findOne({ where: { companyId, code: { [Op.iLike]: v.code }, id: { [Op.ne]: row.id } } });
                if (clash) return res.status(409).json({ message: `Participant type '${clash.code}' already exists.` });
            }
            if (v.baseIdentity !== row.baseIdentity) {
                const inUse = await codeInUse(companyId, row.code);
                if (inUse) return res.status(409).json({ message: `Participant type '${row.code}' is used by ${inUse} - its base identity cannot change.` });
            }
            Object.assign(row, v);
        }
        row.updatedBy = getUserContext(req).userId;
        await row.save();
        res.status(200).json({ message: `Participant type '${row.code}' updated.`, participantType: toDto(row) });
    } catch (error) {
        console.error('Error updating facility participant type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/facility/participant-types/:id - toggle isActive (system rows stay on).
exports.setActive = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await ParticipantType.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Participant type not found.' });
        if (!(await canModifyRecord(req, row))) return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        if (typeof req.body.isActive === 'boolean') {
            if (row.isSystem && req.body.isActive === false) return res.status(400).json({ message: `'${row.code}' is a system participant type and stays active.` });
            row.isActive = req.body.isActive;
            row.updatedBy = getUserContext(req).userId;
            await row.save();
        }
        res.status(200).json({ message: `Participant type '${row.code}' updated.`, participantType: toDto(row) });
    } catch (error) {
        console.error('Error updating facility participant type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/facility/participant-types/:id - club-defined rows nothing references.
exports.remove = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await ParticipantType.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Participant type not found.' });
        if (row.isSystem) return res.status(400).json({ message: `'${row.code}' is a system participant type and cannot be deleted.` });
        if (!(await canModifyRecord(req, row))) return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        const inUse = await codeInUse(companyId, row.code);
        if (inUse) return res.status(409).json({ message: `Participant type '${row.code}' is used by ${inUse} - disable it instead.` });
        await row.destroy();
        res.status(200).json({ message: `Participant type '${row.code}' deleted.` });
    } catch (error) {
        console.error('Error deleting facility participant type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
