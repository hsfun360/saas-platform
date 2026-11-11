// Utility Items master (/facility/utility-items; slice 6a, structures
// approved 2026-11-11) - what the Control Station hands out or lets a person
// use (LOCKER, TOWEL, SHOWER), and the numbered units of the items that
// track them. Before this master they were Facility Types of usage mode
// "issue". The code and the behaviour switches freeze once the item has
// units or has been issued; a unit is part of its item's definition, so
// every unit write is checked against the ITEM row's data scope.

const { Storage } = require('@google-cloud/storage');
const { Op } = require('sequelize');
const UtilityItem = require('./utilityItem.model');
const UtilityUnit = require('./utilityUnit.model');
const IssueRecord = require('./issueRecord.model');
const TransactionType = require('./transactionType.model');
const { sequelize } = require('../../platform/db');
const { getUserContext, annotateCanModify, canModifyRecord } = require('../../platform/serviceContext');
const { companyIdOf, stampsFor, parseOptionalInt, parseRequiredInt } = require('./facilityShared');
const rules = require('./utilityRules.service');
const { UNIT_STATUSES } = require('./station.constants');

const storage = new Storage();
function assetsBucket() {
    const name = process.env.ASSETS_BUCKET;
    if (!name) throw new Error('ASSETS_BUCKET env var is not set - cannot store uploads.');
    return storage.bucket(name);
}

const CODE_RE = /^[A-Z0-9_]{1,20}$/;
const SCOPE_REFUSAL = "Your role's data scope does not allow amending this record.";

function itemDto(row, counts = {}) {
    const p = row.get ? row.get({ plain: true }) : row;
    return {
        ...p,
        behaviour: rules.behaviourOf(p),
        unitCount: counts.unitCount || 0,
        unitsAvailable: counts.unitsAvailable || 0,
        outCount: counts.outCount || 0,
    };
}

function unitDto(row) {
    return row.get ? row.get({ plain: true }) : row;
}

// Per item: its units (all, available) and the pieces out right now.
async function countsByItem(companyId) {
    const [units, out] = await Promise.all([
        UtilityUnit.findAll({ where: { companyId }, attributes: ['utilityItemId', 'unitStatus', 'isActive'], raw: true }),
        IssueRecord.findAll({ where: { companyId, status: 'issued' }, attributes: ['utilityItemId', [sequelize.fn('SUM', sequelize.col('quantity')), 'n']], group: ['utilityItemId'], raw: true }),
    ]);
    const map = new Map();
    const of = (id) => { if (!map.has(id)) map.set(id, { unitCount: 0, unitsAvailable: 0, outCount: 0 }); return map.get(id); };
    for (const u of units) {
        const c = of(u.utilityItemId);
        c.unitCount += 1;
        if (u.isActive !== false && u.unitStatus === 'available') c.unitsAvailable += 1;
    }
    for (const o of out) of(o.utilityItemId).outCount = Number(o.n);
    return map;
}

// Validate the fields present in `body`; `current` (update) supplies the
// rest for the behaviour normalisation. Returns { error } or { values }.
function validateItem(body, current) {
    const out = {};
    if ('code' in body) {
        const code = String(body.code || '').trim().toUpperCase();
        if (!CODE_RE.test(code)) return { error: 'Code is required: 1-20 characters, letters, digits and underscores only.' };
        out.code = code;
    }
    if ('description' in body) {
        const description = typeof body.description === 'string' ? body.description.trim() : '';
        if (!description) return { error: 'Description is required.' };
        out.description = description;
    }
    for (const flag of ['trackUnits', 'returnRequired', 'guestsAllowed', 'requiresEntry', 'isActive']) {
        if (typeof body[flag] === 'boolean') out[flag] = body[flag];
    }
    if ('stockQuantity' in body) {
        const n = parseOptionalInt(body.stockQuantity, 0, 1000000);
        if (!n.ok) return { error: 'Stock quantity must be a whole number between 0 and 1000000, or blank.' };
        out.stockQuantity = n.value;
    }
    const requiredInts = [
        ['maxPerPerson', 0, 100, 'Limit per person must be a whole number between 0 and 100 (0 = no limit).'],
        ['dueDays', 0, 365, 'Due days must be a whole number between 0 and 365 (0 = same day).'],
        ['sortOrder', 0, 9999, 'Sort order must be a whole number between 0 and 9999.'],
    ];
    for (const [field, min, max, message] of requiredInts) {
        if (!(field in body)) continue;
        const n = parseRequiredInt(body[field], min, max);
        if (!n.ok) return { error: message };
        out[field] = n.value;
    }
    if ('feeTransactionTypeId' in body) out.feeTransactionTypeId = typeof body.feeTransactionTypeId === 'string' && body.feeTransactionTypeId.trim() ? body.feeTransactionTypeId.trim() : null;
    if ('iconUrl' in body) out.iconUrl = typeof body.iconUrl === 'string' && body.iconUrl.trim() ? body.iconUrl.trim() : null;

    // The stored behaviour of the intended (merged) state.
    const merged = { ...(current ? current.get({ plain: true }) : {}), ...out };
    Object.assign(out, rules.normalizeBehaviour(merged));
    return { values: out };
}

// The fee item: an active issue-fee transaction type of the company.
async function validateFee(companyId, feeTransactionTypeId) {
    if (!feeTransactionTypeId) return null;
    const tt = await TransactionType.findOne({ where: { id: feeTransactionTypeId, companyId } });
    if (!tt) return 'Fee item: pick a transaction type of the active company.';
    if (tt.chargeType !== 'issue-fee') return `Fee item: '${tt.transactionType}' is not an issue fee.`;
    if (tt.isActive === false) return `Fee item: '${tt.transactionType}' is disabled.`;
    return null;
}

async function feeItems(companyId) {
    const rows = await TransactionType.findAll({ where: { companyId, chargeType: 'issue-fee' }, attributes: ['id', 'transactionType', 'description', 'isActive'], order: [['transactionType', 'ASC']] });
    return rows.map((t) => ({ id: t.id, transactionType: t.transactionType, description: t.description, isActive: t.isActive !== false }));
}

// GET /api/facility/utility-items -> { items, feeItems, unitStatuses, limits }
exports.list = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const [rows, counts, fees] = await Promise.all([
            UtilityItem.findAll({ where: { companyId }, order: [['sortOrder', 'ASC'], ['code', 'ASC']] }),
            countsByItem(companyId),
            feeItems(companyId),
        ]);
        const flags = await annotateCanModify(req, rows);
        res.status(200).json({
            items: rows.map((r, i) => ({ ...itemDto(r, counts.get(r.id)), canModify: flags[i] })),
            feeItems: fees,
            unitStatuses: UNIT_STATUSES,
            limits: { maxGenerate: rules.MAX_GENERATE },
        });
    } catch (error) {
        console.error('Error listing utility items:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/utility-items
exports.create = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        for (const f of ['code', 'description']) {
            if (!(f in req.body) || req.body[f] === null || req.body[f] === '') return res.status(400).json({ message: 'Code and description are required.' });
        }
        const v = validateItem(req.body, null);
        if (v.error) return res.status(400).json({ message: v.error });
        const clash = await UtilityItem.findOne({ where: { companyId, code: v.values.code } });
        if (clash) return res.status(409).json({ message: `Utility item '${v.values.code}' already exists.` });
        const feeError = await validateFee(companyId, v.values.feeTransactionTypeId);
        if (feeError) return res.status(400).json({ message: feeError });
        const stamps = await stampsFor(req);
        const row = await UtilityItem.create({ companyId, ...v.values, ...stamps });
        res.status(201).json({ message: 'Utility item created.', item: { ...itemDto(row), canModify: true } });
    } catch (error) {
        console.error('Error creating utility item:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/facility/utility-items/:id
exports.update = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await UtilityItem.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Utility item not found.' });
        if (!(await canModifyRecord(req, row))) return res.status(403).json({ message: SCOPE_REFUSAL });
        const v = validateItem(req.body, row);
        if (v.error) return res.status(400).json({ message: v.error });
        const [units, issues] = await Promise.all([
            UtilityUnit.count({ where: { utilityItemId: row.id } }),
            IssueRecord.count({ where: { utilityItemId: row.id } }),
        ]);
        if (v.values.code && v.values.code !== row.code) {
            if (issues) return res.status(409).json({ message: `The code is frozen - ${row.code} has already been issued.` });
            const clash = await UtilityItem.findOne({ where: { companyId, code: v.values.code, id: { [Op.ne]: row.id } } });
            if (clash) return res.status(409).json({ message: `Utility item '${v.values.code}' already exists.` });
        }
        if (v.values.trackUnits !== row.trackUnits || v.values.returnRequired !== row.returnRequired) {
            if (units) return res.status(409).json({ message: `Delete the ${units} unit${units === 1 ? '' : 's'} of ${row.code} before changing how it is issued.` });
            const live = await IssueRecord.count({ where: { utilityItemId: row.id, status: 'issued' } });
            if (live) return res.status(409).json({ message: `${row.code} is out with ${live} issue${live === 1 ? '' : 's'} - take them back before changing how it is issued.` });
        }
        const feeError = 'feeTransactionTypeId' in req.body ? await validateFee(companyId, v.values.feeTransactionTypeId) : null;
        if (feeError) return res.status(400).json({ message: feeError });
        Object.assign(row, v.values, { updatedBy: getUserContext(req).userId });
        await row.save();
        const counts = await countsByItem(companyId);
        res.status(200).json({ message: 'Utility item updated.', item: { ...itemDto(row, counts.get(row.id)), canModify: true } });
    } catch (error) {
        console.error('Error updating utility item:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/facility/utility-items/:id
exports.remove = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await UtilityItem.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Utility item not found.' });
        if (!(await canModifyRecord(req, row))) return res.status(403).json({ message: SCOPE_REFUSAL });
        const [units, issues] = await Promise.all([
            UtilityUnit.count({ where: { utilityItemId: row.id } }),
            IssueRecord.count({ where: { utilityItemId: row.id } }),
        ]);
        if (issues) return res.status(409).json({ message: `Cannot delete ${row.code} - it has ${issues} issue record${issues === 1 ? '' : 's'}. Disable it instead.` });
        if (units) return res.status(409).json({ message: `Delete the ${units} unit${units === 1 ? '' : 's'} of ${row.code} first.` });
        await row.destroy();
        res.status(200).json({ message: `Utility item ${row.code} deleted.` });
    } catch (error) {
        console.error('Error deleting utility item:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/utility-items/icon (multipart 'icon') -> { url }
exports.uploadIcon = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        if (!req.file) return res.status(400).json({ message: 'No image file uploaded.' });
        const bucket = assetsBucket();
        const ext = req.file.originalname.split('.').pop();
        const blob = bucket.file(`facility-utility-${companyId}-${Date.now()}.${ext}`);
        await blob.save(req.file.buffer, { resumable: false, contentType: req.file.mimetype });
        res.status(200).json({ message: 'Icon uploaded.', url: `https://storage.googleapis.com/${bucket.name}/${blob.name}` });
    } catch (error) {
        console.error('Utility item icon upload error:', error);
        res.status(500).json({ message: error.message || 'Failed to upload icon.' });
    }
};

// ---- units -----------------------------------------------------------------

// The item of a unit route, amendable by the caller unless `readOnly`.
async function ownedItem(req, { readOnly = false } = {}) {
    const companyId = companyIdOf(req);
    if (!companyId) return { status: 400, message: 'Select a workspace first.' };
    const item = await UtilityItem.findOne({ where: { id: req.params.id, companyId } });
    if (!item) return { status: 404, message: 'Utility item not found.' };
    if (!readOnly && !(await canModifyRecord(req, item))) return { status: 403, message: SCOPE_REFUSAL };
    if (!readOnly && item.trackUnits !== true) return { status: 400, message: `${item.code} is not issued by numbered unit.` };
    return { companyId, item };
}

function validateUnit(body) {
    const out = {};
    if ('code' in body) {
        const code = String(body.code || '').trim().toUpperCase();
        if (!rules.UNIT_CODE_RE.test(code)) return { error: 'Unit code is required: 1-20 characters, letters, digits, underscores and hyphens only.' };
        out.code = code;
    }
    for (const field of ['location', 'remarks']) {
        if (field in body) out[field] = typeof body[field] === 'string' && body[field].trim() ? body[field].trim() : null;
    }
    if ('sortOrder' in body) {
        const n = parseRequiredInt(body.sortOrder, 0, 9999);
        if (!n.ok) return { error: 'Sort order must be a whole number between 0 and 9999.' };
        out.sortOrder = n.value;
    }
    if (typeof body.isActive === 'boolean') out.isActive = body.isActive;
    return { values: out };
}

// GET /api/facility/utility-items/:id/units
exports.listUnits = async (req, res) => {
    try {
        const o = await ownedItem(req, { readOnly: true });
        if (o.status) return res.status(o.status).json({ message: o.message });
        const rows = await UtilityUnit.findAll({ where: { utilityItemId: o.item.id }, order: [['sortOrder', 'ASC'], ['code', 'ASC']] });
        res.status(200).json(rows.map(unitDto));
    } catch (error) {
        console.error('Error listing utility units:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/utility-items/:id/units
exports.createUnit = async (req, res) => {
    try {
        const o = await ownedItem(req);
        if (o.status) return res.status(o.status).json({ message: o.message });
        if (!req.body.code) return res.status(400).json({ message: 'Unit code is required.' });
        const v = validateUnit(req.body);
        if (v.error) return res.status(400).json({ message: v.error });
        const clash = await UtilityUnit.findOne({ where: { utilityItemId: o.item.id, code: v.values.code } });
        if (clash) return res.status(409).json({ message: `${o.item.code} already has a unit '${v.values.code}'.` });
        const stamps = await stampsFor(req);
        const row = await UtilityUnit.create({ companyId: o.companyId, utilityItemId: o.item.id, ...v.values, ...stamps });
        res.status(201).json({ message: `Unit ${row.code} added.`, unit: unitDto(row) });
    } catch (error) {
        console.error('Error creating utility unit:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/utility-items/:id/units/generate { prefix, from, to, pad, location, preview }
// Without `preview: false` it only answers the codes it would add.
exports.generateUnits = async (req, res) => {
    try {
        const o = await ownedItem(req);
        if (o.status) return res.status(o.status).json({ message: o.message });
        const existing = await UtilityUnit.findAll({ where: { utilityItemId: o.item.id }, attributes: ['code', 'sortOrder'] });
        const plan = rules.generateUnitCodes({ prefix: req.body.prefix, from: req.body.from, to: req.body.to, pad: req.body.pad, existing: existing.map((u) => u.code) });
        if (plan.error) return res.status(400).json({ message: plan.error });
        if (req.body.preview !== false) return res.status(200).json({ codes: plan.codes, fresh: plan.fresh, existing: plan.codes.length - plan.fresh });
        if (!plan.fresh) return res.status(409).json({ message: 'Every one of those units already exists.' });
        const location = typeof req.body.location === 'string' && req.body.location.trim() ? req.body.location.trim() : null;
        const stamps = await stampsFor(req);
        let order = existing.reduce((m, u) => Math.max(m, Number(u.sortOrder) || 0), 0);
        const rows = plan.codes.filter((c) => !c.exists).map((c) => {
            order += 1;
            return { companyId: o.companyId, utilityItemId: o.item.id, code: c.code, location, sortOrder: Math.min(order, 9999), ...stamps };
        });
        await UtilityUnit.bulkCreate(rows);
        res.status(201).json({ message: `${rows.length} unit${rows.length === 1 ? '' : 's'} added to ${o.item.code} (${rows[0].code} to ${rows[rows.length - 1].code}).`, added: rows.length });
    } catch (error) {
        console.error('Error generating utility units:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/facility/utility-items/:id/units/:unitId
exports.updateUnit = async (req, res) => {
    try {
        const o = await ownedItem(req);
        if (o.status) return res.status(o.status).json({ message: o.message });
        const row = await UtilityUnit.findOne({ where: { id: req.params.unitId, utilityItemId: o.item.id } });
        if (!row) return res.status(404).json({ message: 'Unit not found.' });
        const v = validateUnit(req.body);
        if (v.error) return res.status(400).json({ message: v.error });
        if (v.values.code && v.values.code !== row.code) {
            const clash = await UtilityUnit.findOne({ where: { utilityItemId: o.item.id, code: v.values.code, id: { [Op.ne]: row.id } } });
            if (clash) return res.status(409).json({ message: `${o.item.code} already has a unit '${v.values.code}'.` });
        }
        if (v.values.isActive === false && row.unitStatus === 'issued') return res.status(409).json({ message: `${row.code} is issued - take it back before disabling it.` });
        Object.assign(row, v.values, { updatedBy: getUserContext(req).userId });
        await row.save();
        res.status(200).json({ message: `Unit ${row.code} updated.`, unit: unitDto(row) });
    } catch (error) {
        console.error('Error updating utility unit:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/facility/utility-items/:id/units/:unitId
exports.removeUnit = async (req, res) => {
    try {
        const o = await ownedItem(req);
        if (o.status) return res.status(o.status).json({ message: o.message });
        const row = await UtilityUnit.findOne({ where: { id: req.params.unitId, utilityItemId: o.item.id } });
        if (!row) return res.status(404).json({ message: 'Unit not found.' });
        const issues = await IssueRecord.count({ where: { utilityUnitId: row.id } });
        if (issues) return res.status(409).json({ message: `Cannot delete ${row.code} - it has ${issues} issue record${issues === 1 ? '' : 's'}. Disable it instead.` });
        await row.destroy();
        res.status(200).json({ message: `Unit ${row.code} deleted.` });
    } catch (error) {
        console.error('Error deleting utility unit:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
