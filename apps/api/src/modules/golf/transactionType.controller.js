// Transaction Type master file (Golf Management → Master File Setup).
// The billing-item catalog: code + charge type + description + THE tax scheme
// (single source - consuming rows don't store their own tax). Mirrors the
// membership Transaction Type controller.

const GolfTransactionType = require('./transactionType.model');
const {
    getUserContext,
    getCallerPlacement,
    canModifyRecord,
    annotateCanModify,
} = require('../../platform/serviceContext');
const { listCompanyTaxSchemes } = require('../../platform/taxGateway');
const { CHARGE_TYPES, CHARGE_TYPE_KEYS } = require('./transactionType.constants');

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
        transactionType: t.transactionType,
        chargeType: t.chargeType,
        description: t.description,
        taxSchemeCode: t.taxSchemeCode,
        isActive: t.isActive,
    };
}

// Validate + normalise a payload. Returns { value } or { error }.
function normalizeBody(body) {
    const transactionType = str(body.transactionType);
    if (!transactionType) return { error: 'Transaction type is required.' };
    if (transactionType.length > 50) return { error: 'Transaction type must be 50 characters or fewer.' };

    const chargeType = str(body.chargeType);
    if (!CHARGE_TYPE_KEYS.includes(chargeType)) return { error: 'Select a valid charge type.' };

    return {
        value: {
            transactionType,
            chargeType,
            description: typeof body.description === 'string' ? body.description.trim() || null : null,
            taxSchemeCode: str(body.taxSchemeCode) || null,
        },
    };
}

// The referenced tax scheme must be one the company can actually use (adopted /
// country-resolved via the tax seam) and OUTPUT-class (charges to players are
// revenue, never INPUT/purchase tax).
async function validateTaxScheme(req, taxSchemeCode) {
    if (!taxSchemeCode) return null;
    const { schemes } = await listCompanyTaxSchemes(req);
    const ok = (schemes || []).some(
        (r) => r.scheme.taxSchemeCode === taxSchemeCode && r.scheme.taxClass !== 'INPUT',
    );
    return ok ? null : 'Tax scheme not found for this company (or is an INPUT scheme).';
}

// GET /api/golf/transaction-types/meta - the charge-type options.
exports.getMeta = async (req, res) => {
    res.status(200).json({ chargeTypes: CHARGE_TYPES });
};

// GET /api/golf/transaction-types/tax-schemes - the company's usable OUTPUT
// tax schemes for the picker.
exports.getTaxSchemes = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const { scope, schemes } = await listCompanyTaxSchemes(req);
        const list = (schemes || [])
            .filter((r) => r.scheme.taxClass !== 'INPUT')
            .map((r) => ({ taxSchemeCode: r.scheme.taxSchemeCode, name: r.scheme.name }));
        res.status(200).json({ schemes: list, countrySet: !!scope });
    } catch (error) {
        console.error('Error listing tax schemes for golf transaction types:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/golf/transaction-types - every transaction type for the company.
exports.list = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const rows = await GolfTransactionType.findAll({ where: { companyId }, order: [['transactionType', 'ASC']] });
        const flags = await annotateCanModify(req, rows);
        res.status(200).json(rows.map((r, i) => toDto(r, flags[i])));
    } catch (error) {
        console.error('Error listing golf transaction types:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/golf/transaction-types
exports.create = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const parsed = normalizeBody(req.body);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;

        const taxErr = await validateTaxScheme(req, v.taxSchemeCode);
        if (taxErr) return res.status(400).json({ message: taxErr });

        const existing = await GolfTransactionType.findOne({ where: { companyId, transactionType: v.transactionType } });
        if (existing) return res.status(409).json({ message: `Transaction type '${v.transactionType}' already exists.` });

        const placement = await getCallerPlacement(req);
        const callerId = getUserContext(req).userId;
        const row = await GolfTransactionType.create({
            companyId,
            ...v,
            createdBy: callerId,
            createdByDepartmentId: placement.departmentId,
            updatedBy: callerId,
        });
        res.status(201).json({ message: `Transaction type '${row.transactionType}' created.`, transactionType: toDto(row) });
    } catch (error) {
        console.error('Error creating golf transaction type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/golf/transaction-types/:id - full update.
exports.update = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const row = await GolfTransactionType.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Transaction type not found.' });
        if (!(await canModifyRecord(req, row))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }

        const parsed = normalizeBody(req.body);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;

        const taxErr = await validateTaxScheme(req, v.taxSchemeCode);
        if (taxErr) return res.status(400).json({ message: taxErr });

        if (v.transactionType !== row.transactionType) {
            const clash = await GolfTransactionType.findOne({ where: { companyId, transactionType: v.transactionType } });
            if (clash) return res.status(409).json({ message: `Transaction type '${v.transactionType}' already exists.` });
        }

        Object.assign(row, v);
        row.updatedBy = getUserContext(req).userId;
        await row.save();
        res.status(200).json({ message: `Transaction type '${row.transactionType}' updated.`, transactionType: toDto(row) });
    } catch (error) {
        console.error('Error updating golf transaction type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/golf/transaction-types/:id - toggle isActive only.
exports.setActive = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const row = await GolfTransactionType.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Transaction type not found.' });
        if (!(await canModifyRecord(req, row))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }

        if (typeof req.body.isActive === 'boolean') {
            row.isActive = req.body.isActive;
            row.updatedBy = getUserContext(req).userId;
            await row.save();
        }
        res.status(200).json({ message: `Transaction type '${row.transactionType}' updated.`, transactionType: toDto(row) });
    } catch (error) {
        console.error('Error updating golf transaction type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
