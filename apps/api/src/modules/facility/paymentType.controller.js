// Payment Type master (/facility/payment-types; structure approved
// 2026-10-25). The settlement-tender catalog: code + payment class (fixed
// vocabulary) + description + icon for the settlement tiles. Enable /
// disable, no delete (golf's shape).

const { Storage } = require('@google-cloud/storage');
const { Op } = require('sequelize');
const PaymentType = require('./paymentType.model');
const { getUserContext, canModifyRecord, annotateCanModify } = require('../../platform/serviceContext');
const { PAYMENT_CLASSES, PAYMENT_CLASS_KEYS } = require('./facility.constants');
const { companyIdOf, stampsFor } = require('./facilityShared');

const storage = new Storage();
function assetsBucket() {
    const name = process.env.ASSETS_BUCKET;
    if (!name) throw new Error('ASSETS_BUCKET env var is not set - cannot store uploads.');
    return storage.bucket(name);
}

function str(v) {
    return typeof v === 'string' ? v.trim() : '';
}

function toDto(t, canModify = true) {
    return {
        id: t.id,
        canModify,
        paymentType: t.paymentType,
        paymentClass: t.paymentClass,
        description: t.description,
        iconUrl: t.iconUrl,
        isActive: t.isActive,
    };
}

function normalizeBody(body) {
    const paymentType = str(body.paymentType).toUpperCase();
    if (!paymentType) return { error: 'Payment type is required.' };
    if (paymentType.length > 50) return { error: 'Payment type must be 50 characters or fewer.' };
    const paymentClass = str(body.paymentClass);
    if (!PAYMENT_CLASS_KEYS.includes(paymentClass)) return { error: 'Select a valid payment class.' };
    return {
        value: {
            paymentType,
            paymentClass,
            description: typeof body.description === 'string' ? body.description.trim() || null : null,
            iconUrl: str(body.iconUrl) || null,
        },
    };
}

// GET /api/facility/payment-types/meta
exports.getMeta = async (req, res) => {
    res.status(200).json({ paymentClasses: PAYMENT_CLASSES });
};

// POST /api/facility/payment-types/icon (multipart 'icon') -> { url }
exports.uploadIcon = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        if (!req.file) return res.status(400).json({ message: 'No image file uploaded.' });
        const bucket = assetsBucket();
        const ext = req.file.originalname.split('.').pop();
        const blob = bucket.file(`facility-payment-type-${companyId}-${Date.now()}.${ext}`);
        await blob.save(req.file.buffer, { resumable: false, contentType: req.file.mimetype });
        res.status(200).json({ message: 'Icon uploaded.', url: `https://storage.googleapis.com/${bucket.name}/${blob.name}` });
    } catch (error) {
        console.error('Facility payment type icon upload error:', error);
        res.status(500).json({ message: error.message || 'Failed to upload icon.' });
    }
};

// GET /api/facility/payment-types
exports.list = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const rows = await PaymentType.findAll({ where: { companyId }, order: [['paymentType', 'ASC']] });
        const flags = await annotateCanModify(req, rows);
        res.status(200).json(rows.map((r, i) => toDto(r, flags[i])));
    } catch (error) {
        console.error('Error listing facility payment types:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/payment-types
exports.create = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const parsed = normalizeBody(req.body);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;
        const existing = await PaymentType.findOne({ where: { companyId, paymentType: v.paymentType } });
        if (existing) return res.status(409).json({ message: `Payment type '${v.paymentType}' already exists.` });
        const stamps = await stampsFor(req);
        const row = await PaymentType.create({ companyId, ...v, ...stamps });
        res.status(201).json({ message: `Payment type '${row.paymentType}' created.`, paymentType: toDto(row) });
    } catch (error) {
        console.error('Error creating facility payment type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/facility/payment-types/:id
exports.update = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await PaymentType.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Payment type not found.' });
        if (!(await canModifyRecord(req, row))) return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        const parsed = normalizeBody(req.body);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;
        if (v.paymentType !== row.paymentType) {
            const clash = await PaymentType.findOne({ where: { companyId, paymentType: v.paymentType, id: { [Op.ne]: row.id } } });
            if (clash) return res.status(409).json({ message: `Payment type '${v.paymentType}' already exists.` });
        }
        Object.assign(row, v, { updatedBy: getUserContext(req).userId });
        await row.save();
        res.status(200).json({ message: `Payment type '${row.paymentType}' updated.`, paymentType: toDto(row) });
    } catch (error) {
        console.error('Error updating facility payment type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/facility/payment-types/:id - toggle isActive.
exports.setActive = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await PaymentType.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Payment type not found.' });
        if (!(await canModifyRecord(req, row))) return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        if (typeof req.body.isActive === 'boolean') {
            row.isActive = req.body.isActive;
            row.updatedBy = getUserContext(req).userId;
            await row.save();
        }
        res.status(200).json({ message: `Payment type '${row.paymentType}' updated.`, paymentType: toDto(row) });
    } catch (error) {
        console.error('Error updating facility payment type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
