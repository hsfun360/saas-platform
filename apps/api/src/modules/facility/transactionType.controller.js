// Transaction Type master (/facility/transaction-types; structure approved
// 2026-10-25). The billing-item catalog: code + charge type + fee basis +
// the Facility Type it belongs to + the participant category it is the
// auto-charged default for + THE tax scheme (by code via the tax seam) +
// price override flag + icon. Packages and deposits keep their keys but are
// refused until their slice lands.

const { Storage } = require('@google-cloud/storage');
const { Op } = require('sequelize');
const TransactionType = require('./transactionType.model');
const TransactionTypeRate = require('./transactionTypeRate.model');
const FacilityType = require('./facilityType.model');
const FacilitySession = require('./facilitySession.model');
const { getUserContext, canModifyRecord, annotateCanModify } = require('../../platform/serviceContext');
const { listCompanyTaxSchemes } = require('../../platform/taxGateway');
const {
    CHARGE_TYPES, CHARGE_TYPE_KEYS, MATRIX_CHARGE_TYPE_KEYS, DEFAULT_TYPED_CHARGE_TYPE_KEYS, RESERVED_CHARGE_TYPE_KEYS,
    FEE_BASES, FEE_BASIS_KEYS, DAY_SCOPES,
} = require('./facility.constants');
const participantTypes = require('./participantType.service');
const { companyIdOf, stampsFor, timeDto } = require('./facilityShared');

const storage = new Storage();
function assetsBucket() {
    const name = process.env.ASSETS_BUCKET;
    if (!name) throw new Error('ASSETS_BUCKET env var is not set - cannot store uploads.');
    return storage.bucket(name);
}

function str(v) {
    return typeof v === 'string' ? v.trim() : '';
}

function toDto(t, canModify = true, rateCount = 0) {
    return {
        id: t.id,
        canModify,
        transactionType: t.transactionType,
        chargeType: t.chargeType,
        feeBasis: t.feeBasis,
        facilityTypeId: t.facilityTypeId || null,
        description: t.description,
        participantType: t.participantType || null,
        taxSchemeCode: t.taxSchemeCode,
        allowPriceOverride: t.allowPriceOverride === true,
        iconUrl: t.iconUrl,
        isActive: t.isActive,
        isMatrix: MATRIX_CHARGE_TYPE_KEYS.includes(t.chargeType),
        rateCount,
    };
}

// Validate + normalise a payload. `types` = the participant catalog,
// `facilityTypeIds` = the company's facility type ids.
function normalizeBody(body, { types = [], facilityTypeIds = new Set() } = {}) {
    const transactionType = str(body.transactionType).toUpperCase();
    if (!transactionType) return { error: 'Transaction type is required.' };
    if (transactionType.length > 50) return { error: 'Transaction type must be 50 characters or fewer.' };

    const chargeType = str(body.chargeType);
    if (!CHARGE_TYPE_KEYS.includes(chargeType)) return { error: 'Select a valid charge type.' };
    if (RESERVED_CHARGE_TYPE_KEYS.includes(chargeType)) return { error: `${chargeType === 'package' ? 'Packages' : 'Deposits'} arrive in a later slice - pick another charge type for now.` };

    const feeBasis = str(body.feeBasis) || 'per-slot';
    if (!FEE_BASIS_KEYS.includes(feeBasis)) return { error: 'Select a valid fee basis.' };

    const facilityTypeId = str(body.facilityTypeId) || null;
    if (facilityTypeId && !facilityTypeIds.has(facilityTypeId)) return { error: 'Pick a facility type of the active company, or leave it blank for any type.' };

    let participantType = null;
    if (DEFAULT_TYPED_CHARGE_TYPE_KEYS.includes(chargeType)) {
        const raw = str(body.participantType);
        if (raw) {
            if (!participantTypes.findType(types, raw)) return { error: 'Select a valid participant type for the default.' };
            participantType = raw;
        }
    }

    return {
        value: {
            transactionType,
            chargeType,
            feeBasis,
            facilityTypeId,
            participantType,
            description: typeof body.description === 'string' ? body.description.trim() || null : null,
            taxSchemeCode: str(body.taxSchemeCode) || null,
            allowPriceOverride: body.allowPriceOverride === true,
            iconUrl: str(body.iconUrl) || null,
        },
    };
}

// At most one ACTIVE DEFAULT per (facility type, charge type, participant
// category) - otherwise the bill engine cannot resolve the auto-charge.
async function activeDefaultConflict(companyId, v, selfId) {
    if (!v.participantType) return null;
    const where = { companyId, chargeType: v.chargeType, participantType: v.participantType, isActive: true, facilityTypeId: v.facilityTypeId };
    if (selfId) where.id = { [Op.ne]: selfId };
    const clash = await TransactionType.findOne({ where });
    if (!clash) return null;
    return `'${clash.transactionType}' is already the active ${v.chargeType === 'guest-fee' ? 'guest fee' : 'facility fee'} default for ${v.participantType}${v.facilityTypeId ? ' on this facility type' : ' on any type'}.`;
}

async function validateTaxScheme(req, taxSchemeCode) {
    if (!taxSchemeCode) return null;
    const { schemes } = await listCompanyTaxSchemes(req);
    const ok = (schemes || []).some((r) => r.scheme.taxSchemeCode === taxSchemeCode && r.scheme.taxClass !== 'INPUT');
    return ok ? null : 'Tax scheme not found for this company (or is an INPUT scheme).';
}

async function facilityTypeIdsOf(companyId) {
    const rows = await FacilityType.findAll({ where: { companyId }, attributes: ['id'] });
    return new Set(rows.map((r) => r.id));
}

async function rateCounts(companyId) {
    const rows = await TransactionTypeRate.findAll({
        attributes: ['transactionTypeId', [TransactionTypeRate.sequelize.fn('COUNT', TransactionTypeRate.sequelize.col('FacilityTransactionTypeRate.id')), 'n']],
        include: [{ model: TransactionType, as: 'TransactionType', attributes: [], where: { companyId } }],
        group: ['FacilityTransactionTypeRate.transactionTypeId'],
        raw: true,
    });
    return new Map(rows.map((r) => [r.transactionTypeId, Number(r.n)]));
}

// GET /api/facility/transaction-types/meta - vocabularies plus the pickers
// the screen and the rate editor need (participant types, facility types,
// the club's sessions).
exports.getMeta = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const [types, facilityTypes, sessions] = await Promise.all([
            participantTypes.catalog(companyId, { activeOnly: true }),
            FacilityType.findAll({ where: { companyId }, attributes: ['id', 'code', 'description', 'usageMode', 'isActive'], order: [['sortOrder', 'ASC'], ['code', 'ASC']] }),
            FacilitySession.findAll({ where: { companyId }, attributes: ['id', 'name', 'startTime', 'endTime'], order: [['sequence', 'ASC'], ['startTime', 'ASC']] }),
        ]);
        res.status(200).json({
            chargeTypes: CHARGE_TYPES,
            matrixChargeTypes: MATRIX_CHARGE_TYPE_KEYS,
            defaultTypedChargeTypes: DEFAULT_TYPED_CHARGE_TYPE_KEYS,
            reservedChargeTypes: RESERVED_CHARGE_TYPE_KEYS,
            feeBases: FEE_BASES,
            dayScopes: DAY_SCOPES,
            participantTypes: participantTypes.asVocabulary(types),
            facilityTypes,
            sessions: sessions.map((s) => ({ id: s.id, name: s.name, startTime: timeDto(s.startTime), endTime: timeDto(s.endTime) })),
        });
    } catch (error) {
        console.error('Error loading facility transaction-type meta:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/facility/transaction-types/tax-schemes
exports.getTaxSchemes = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const { scope, schemes } = await listCompanyTaxSchemes(req);
        const list = (schemes || []).filter((r) => r.scheme.taxClass !== 'INPUT').map((r) => ({ taxSchemeCode: r.scheme.taxSchemeCode, name: r.scheme.name }));
        res.status(200).json({ schemes: list, countrySet: !!scope });
    } catch (error) {
        console.error('Error listing tax schemes for facility transaction types:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/transaction-types/icon (multipart 'icon') -> { url }
exports.uploadIcon = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        if (!req.file) return res.status(400).json({ message: 'No image file uploaded.' });
        const bucket = assetsBucket();
        const ext = req.file.originalname.split('.').pop();
        const blob = bucket.file(`facility-transaction-type-${companyId}-${Date.now()}.${ext}`);
        await blob.save(req.file.buffer, { resumable: false, contentType: req.file.mimetype });
        res.status(200).json({ message: 'Icon uploaded.', url: `https://storage.googleapis.com/${bucket.name}/${blob.name}` });
    } catch (error) {
        console.error('Facility transaction type icon upload error:', error);
        res.status(500).json({ message: error.message || 'Failed to upload icon.' });
    }
};

// GET /api/facility/transaction-types
exports.list = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const [rows, counts] = await Promise.all([
            TransactionType.findAll({ where: { companyId }, order: [['transactionType', 'ASC']] }),
            rateCounts(companyId),
        ]);
        const flags = await annotateCanModify(req, rows);
        res.status(200).json(rows.map((r, i) => toDto(r, flags[i], counts.get(r.id) || 0)));
    } catch (error) {
        console.error('Error listing facility transaction types:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/transaction-types
exports.create = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const parsed = normalizeBody(req.body, { types: await participantTypes.catalog(companyId), facilityTypeIds: await facilityTypeIdsOf(companyId) });
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;
        const taxErr = await validateTaxScheme(req, v.taxSchemeCode);
        if (taxErr) return res.status(400).json({ message: taxErr });
        const existing = await TransactionType.findOne({ where: { companyId, transactionType: v.transactionType } });
        if (existing) return res.status(409).json({ message: `Transaction type '${v.transactionType}' already exists.` });
        const conflict = await activeDefaultConflict(companyId, v, null);
        if (conflict) return res.status(409).json({ message: conflict });
        const stamps = await stampsFor(req);
        const row = await TransactionType.create({ companyId, ...v, ...stamps });
        res.status(201).json({ message: `Transaction type '${row.transactionType}' created.`, transactionType: toDto(row) });
    } catch (error) {
        console.error('Error creating facility transaction type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/facility/transaction-types/:id - full update. The charge type is
// frozen once a price card exists (the cards' shape follows it).
exports.update = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await TransactionType.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Transaction type not found.' });
        if (!(await canModifyRecord(req, row))) return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        const parsed = normalizeBody(req.body, { types: await participantTypes.catalog(companyId), facilityTypeIds: await facilityTypeIdsOf(companyId) });
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;
        const taxErr = await validateTaxScheme(req, v.taxSchemeCode);
        if (taxErr) return res.status(400).json({ message: taxErr });
        if (v.transactionType !== row.transactionType) {
            const clash = await TransactionType.findOne({ where: { companyId, transactionType: v.transactionType, id: { [Op.ne]: row.id } } });
            if (clash) return res.status(409).json({ message: `Transaction type '${v.transactionType}' already exists.` });
        }
        if (v.chargeType !== row.chargeType) {
            const cards = await TransactionTypeRate.count({ where: { transactionTypeId: row.id } });
            if (cards) return res.status(409).json({ message: `The charge type is frozen: '${row.transactionType}' already has ${cards} price card${cards === 1 ? '' : 's'}.` });
        }
        if (row.isActive !== false) {
            const conflict = await activeDefaultConflict(companyId, v, row.id);
            if (conflict) return res.status(409).json({ message: conflict });
        }
        Object.assign(row, v, { updatedBy: getUserContext(req).userId });
        await row.save();
        const counts = await rateCounts(companyId);
        res.status(200).json({ message: `Transaction type '${row.transactionType}' updated.`, transactionType: toDto(row, true, counts.get(row.id) || 0) });
    } catch (error) {
        console.error('Error updating facility transaction type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/facility/transaction-types/:id - toggle isActive (re-enabling
// re-checks the default conflict).
exports.setActive = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await TransactionType.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Transaction type not found.' });
        if (!(await canModifyRecord(req, row))) return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        if (typeof req.body.isActive === 'boolean') {
            if (req.body.isActive && row.isActive === false) {
                const conflict = await activeDefaultConflict(companyId, row, row.id);
                if (conflict) return res.status(409).json({ message: conflict });
            }
            row.isActive = req.body.isActive;
            row.updatedBy = getUserContext(req).userId;
            await row.save();
        }
        res.status(200).json({ message: `Transaction type '${row.transactionType}' updated.`, transactionType: toDto(row) });
    } catch (error) {
        console.error('Error updating facility transaction type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
