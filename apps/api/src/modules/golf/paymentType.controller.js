// Payment Type master file (Golf Management → Master File Setup). The
// settlement-tender catalog: code + payment class (fixed vocabulary) +
// description + icon for the front-desk settlement tiles. Mirrors the golf
// Transaction Type controller.

const { Storage } = require('@google-cloud/storage');
const GolfPaymentType = require('./paymentType.model');
const {
    getUserContext,
    getCallerPlacement,
    canModifyRecord,
    annotateCanModify,
} = require('../../platform/serviceContext');
const { PAYMENT_CLASSES, PAYMENT_CLASS_KEYS } = require('./paymentType.constants');

function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

// Public image uploads go to the per-environment bucket named by ASSETS_BUCKET
// (12-factor: config from env, never hardcoded). Resolved lazily so a missing
// var fails the one upload request with a clear message, not the whole API.
const storage = new Storage(); // default credentials on Cloud Run
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

// Validate + normalise a payload. Returns { value } or { error }.
function normalizeBody(body) {
    const paymentType = str(body.paymentType);
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

// GET /api/golf/payment-types/meta - the payment-class options.
exports.getMeta = async (req, res) => {
    res.status(200).json({ paymentClasses: PAYMENT_CLASSES });
};

// POST /api/golf/payment-types/icon  (multipart, field "icon")
// Upload the settlement-tile icon to GCS and return its public URL; the caller
// stores the URL via create/update (same shape as the transaction-type flow).
exports.uploadIcon = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        if (!req.file) return res.status(400).json({ message: 'No image file uploaded.' });

        const bucket = assetsBucket();
        const fileExtension = req.file.originalname.split('.').pop();
        const gcsFileName = `golf-payment-type-${companyId}-${Date.now()}.${fileExtension}`;
        const blob = bucket.file(gcsFileName);
        await blob.save(req.file.buffer, { resumable: false, contentType: req.file.mimetype });
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
        res.status(200).json({ message: 'Icon uploaded.', url: publicUrl });
    } catch (error) {
        console.error('Payment type icon upload error:', error);
        res.status(500).json({ message: error.message || 'Failed to upload icon.' });
    }
};

// GET /api/golf/payment-types - every payment type for the company.
exports.list = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const rows = await GolfPaymentType.findAll({ where: { companyId }, order: [['paymentType', 'ASC']] });
        const flags = await annotateCanModify(req, rows);
        res.status(200).json(rows.map((r, i) => toDto(r, flags[i])));
    } catch (error) {
        console.error('Error listing golf payment types:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/golf/payment-types
exports.create = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const parsed = normalizeBody(req.body);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;

        const existing = await GolfPaymentType.findOne({ where: { companyId, paymentType: v.paymentType } });
        if (existing) return res.status(409).json({ message: `Payment type '${v.paymentType}' already exists.` });

        const placement = await getCallerPlacement(req);
        const callerId = getUserContext(req).userId;
        const row = await GolfPaymentType.create({
            companyId,
            ...v,
            createdBy: callerId,
            createdByDepartmentId: placement.departmentId,
            updatedBy: callerId,
        });
        res.status(201).json({ message: `Payment type '${row.paymentType}' created.`, paymentType: toDto(row) });
    } catch (error) {
        console.error('Error creating golf payment type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/golf/payment-types/:id - full update.
exports.update = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const row = await GolfPaymentType.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Payment type not found.' });
        if (!(await canModifyRecord(req, row))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }

        const parsed = normalizeBody(req.body);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;

        if (v.paymentType !== row.paymentType) {
            const clash = await GolfPaymentType.findOne({ where: { companyId, paymentType: v.paymentType } });
            if (clash) return res.status(409).json({ message: `Payment type '${v.paymentType}' already exists.` });
        }

        Object.assign(row, v);
        row.updatedBy = getUserContext(req).userId;
        await row.save();
        res.status(200).json({ message: `Payment type '${row.paymentType}' updated.`, paymentType: toDto(row) });
    } catch (error) {
        console.error('Error updating golf payment type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/golf/payment-types/:id - toggle isActive only.
exports.setActive = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const row = await GolfPaymentType.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Payment type not found.' });
        if (!(await canModifyRecord(req, row))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }

        if (typeof req.body.isActive === 'boolean') {
            row.isActive = req.body.isActive;
            row.updatedBy = getUserContext(req).userId;
            await row.save();
        }
        res.status(200).json({ message: `Payment type '${row.paymentType}' updated.`, paymentType: toDto(row) });
    } catch (error) {
        console.error('Error updating golf payment type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
