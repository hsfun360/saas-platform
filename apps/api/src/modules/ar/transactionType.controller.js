// Transaction Type master (Account Receivable → Master File Setup; AR-owned
// since 2026-08-15). The billing/receipting catalog every document entry
// screen and producer module maps into: trxClass = which document book may
// use the entry, usableInModules = which producer modules may post with it
// (offered per company ENTITLEMENT, enforced again at the posting seam),
// e-Invoice relevance + LHDN classification for the future submission flow.

const TransactionType = require('./transactionType.model');
const {
    getUserContext,
    getCallerPlacement,
    canModifyRecord,
    annotateCanModify,
    companyHasModule,
    eInvoiceClassificationCodeExists,
} = require('../../platform/serviceContext');
const { listCompanyTaxSchemes } = require('../../platform/taxGateway');
const { TRX_CLASSES, TRX_CLASS_KEYS, AR_MODULE_KEYS } = require('./ar.constants');

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
        trxClass: t.trxClass,
        description: t.description,
        taxSchemeCode: t.taxSchemeCode,
        isInterestChargeable: t.isInterestChargeable === true,
        usableInModules: Array.isArray(t.usableInModules) ? t.usableInModules : [],
        isEInvoice: t.isEInvoice === true,
        eInvoiceClassificationCode: t.eInvoiceClassificationCode,
        isActive: t.isActive,
    };
}

// The module keys this company may open catalog entries to (entitlement-
// driven: an AR-only subscriber never sees membership controls).
async function entitledModuleKeys(companyId) {
    const out = [];
    for (const m of AR_MODULE_KEYS) {
        if (await companyHasModule(companyId, m.moduleName)) out.push(m.key);
    }
    return out;
}

// Validate + normalise a payload. Returns { value } or { error }.
async function normalizeBody(req, companyId, body) {
    const transactionType = str(body.transactionType);
    if (!transactionType) return { error: 'Transaction type is required.' };
    if (transactionType.length > 50) return { error: 'Transaction type must be 50 characters or fewer.' };

    const trxClass = str(body.trxClass);
    if (!TRX_CLASS_KEYS.includes(trxClass)) return { error: 'Select a valid transaction class.' };

    // Module usability: only known keys, only modules the company is entitled
    // to (hiding in the UI is never the gate).
    const requested = Array.isArray(body.usableInModules) ? body.usableInModules.map((k) => str(k)).filter(Boolean) : [];
    const known = AR_MODULE_KEYS.map((m) => m.key);
    if (requested.some((k) => !known.includes(k))) return { error: 'Unknown module in the usability list.' };
    const entitled = await entitledModuleKeys(companyId);
    const notEntitled = requested.filter((k) => !entitled.includes(k));
    if (notEntitled.length) {
        return { error: `Your workspace is not subscribed to: ${notEntitled.join(', ')}.` };
    }

    const isEInvoice = body.isEInvoice === true;
    const eInvoiceClassificationCode = str(body.eInvoiceClassificationCode) || null;
    if (isEInvoice && !eInvoiceClassificationCode) {
        return { error: 'An e-Invoice classification code is required when the item is e-Invoice relevant.' };
    }
    if (eInvoiceClassificationCode && !(await eInvoiceClassificationCodeExists(eInvoiceClassificationCode))) {
        return { error: `e-Invoice classification '${eInvoiceClassificationCode}' is not in the LHDN list (sync it under e-Invoice Classifications).` };
    }

    return {
        value: {
            transactionType,
            trxClass,
            description: typeof body.description === 'string' ? body.description.trim() || null : null,
            taxSchemeCode: str(body.taxSchemeCode) || null,
            isInterestChargeable: body.isInterestChargeable === true,
            usableInModules: [...new Set(requested)],
            isEInvoice,
            eInvoiceClassificationCode: isEInvoice ? eInvoiceClassificationCode : eInvoiceClassificationCode,
        },
    };
}

// The referenced tax scheme must be usable by the company and OUTPUT-class
// (charges to members are revenue, never INPUT/purchase tax).
async function validateTaxScheme(req, taxSchemeCode) {
    if (!taxSchemeCode) return null;
    const { schemes } = await listCompanyTaxSchemes(req);
    const ok = (schemes || []).some(
        (r) => r.scheme.taxSchemeCode === taxSchemeCode && r.scheme.taxClass !== 'INPUT',
    );
    return ok ? null : 'Tax scheme not found for this company (or is an INPUT scheme).';
}

// Removing 'membership' from a type the Membership masters still reference
// would break the next fee run - block with the count (show-expected-results).
async function membershipRemovalError(companyId, row, nextModules) {
    const had = Array.isArray(row.usableInModules) && row.usableInModules.includes('membership');
    if (!had || nextModules.includes('membership')) return null;
    const membershipGateway = require('../../platform/membershipGateway');
    const count = await membershipGateway.countTransactionTypeReferences(companyId, row.id, row.transactionType);
    if (count > 0) {
        return `Membership still references this type in ${count} fee/standing-charge setup${count === 1 ? '' : 's'} - repoint those first.`;
    }
    return null;
}

// GET /api/ar/transaction-types/meta - classes + the company's entitled
// modules (drives which usability checkboxes the screen shows at all).
exports.getMeta = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const entitled = await entitledModuleKeys(companyId);
        const { listEInvoiceClassificationCodes } = require('../../platform/serviceContext');
        res.status(200).json({
            trxClasses: TRX_CLASSES,
            modules: AR_MODULE_KEYS.filter((m) => entitled.includes(m.key)).map((m) => ({ key: m.key, label: m.label })),
            eInvoiceClassifications: await listEInvoiceClassificationCodes(),
        });
    } catch (error) {
        console.error('Error loading transaction type meta:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/ar/transaction-types/tax-schemes - usable OUTPUT schemes.
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
        console.error('Error listing tax schemes for transaction types:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/ar/transaction-types - the company's full catalog.
exports.list = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const rows = await TransactionType.findAll({ where: { companyId }, order: [['trxClass', 'ASC'], ['transactionType', 'ASC']] });
        const flags = await annotateCanModify(req, rows);
        res.status(200).json(rows.map((r, i) => toDto(r, flags[i])));
    } catch (error) {
        console.error('Error listing transaction types:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/ar/transaction-types
exports.create = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const parsed = await normalizeBody(req, companyId, req.body);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;

        const taxErr = await validateTaxScheme(req, v.taxSchemeCode);
        if (taxErr) return res.status(400).json({ message: taxErr });

        const existing = await TransactionType.findOne({ where: { companyId, transactionType: v.transactionType } });
        if (existing) return res.status(409).json({ message: `Transaction type '${v.transactionType}' already exists.` });

        const placement = await getCallerPlacement(req);
        const callerId = getUserContext(req).userId;
        const row = await TransactionType.create({
            companyId,
            ...v,
            createdBy: callerId,
            createdByDepartmentId: placement.departmentId,
            updatedBy: callerId,
        });
        res.status(201).json({ message: `Transaction type '${row.transactionType}' created.`, transactionType: toDto(row) });
    } catch (error) {
        console.error('Error creating transaction type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/ar/transaction-types/:id - full update.
exports.update = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const row = await TransactionType.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Transaction type not found.' });
        if (!(await canModifyRecord(req, row))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }

        const parsed = await normalizeBody(req, companyId, req.body);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;

        const taxErr = await validateTaxScheme(req, v.taxSchemeCode);
        if (taxErr) return res.status(400).json({ message: taxErr });

        const refErr = await membershipRemovalError(companyId, row, v.usableInModules);
        if (refErr) return res.status(409).json({ message: refErr });

        if (v.transactionType !== row.transactionType) {
            const clash = await TransactionType.findOne({ where: { companyId, transactionType: v.transactionType } });
            if (clash) return res.status(409).json({ message: `Transaction type '${v.transactionType}' already exists.` });
        }

        Object.assign(row, v);
        row.updatedBy = getUserContext(req).userId;
        await row.save();
        res.status(200).json({ message: `Transaction type '${row.transactionType}' updated.`, transactionType: toDto(row) });
    } catch (error) {
        console.error('Error updating transaction type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/ar/transaction-types/:id - toggle isActive only.
exports.setActive = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const row = await TransactionType.findOne({ where: { id: req.params.id, companyId } });
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
        console.error('Error updating transaction type:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
