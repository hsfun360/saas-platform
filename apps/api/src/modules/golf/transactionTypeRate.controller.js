// Pricing of a Transaction Type (Golf Management → Master File Setup →
// Transaction Type → Pricing). Effective-dated price cards: the 8-cell
// member/visitor × 9/18 holes × weekday/weekend matrix for green-fee /
// caddy-fee / buggy-fee, a single flat amount for no-show / miscellaneous.
// Resolution at billing: the active card with the latest effective date
// on-or-before the play date.

const GolfTransactionType = require('./transactionType.model');
const GolfTransactionTypeRate = require('./transactionTypeRate.model');
const {
    getUserContext,
    getCallerPlacement,
    canModifyRecord,
    annotateCanModify,
} = require('../../platform/serviceContext');
const { MATRIX_CHARGE_TYPE_KEYS } = require('./transactionType.constants');

const MATRIX_CELLS = [
    'member9Weekday', 'member18Weekday', 'member9Weekend', 'member18Weekend',
    'visitor9Weekday', 'visitor18Weekday', 'visitor9Weekend', 'visitor18Weekend',
];

function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

function toDto(r, canModify = true) {
    const num = (v) => (v === null || v === undefined ? null : Number(v));
    const dto = {
        id: r.id,
        canModify,
        effectiveDate: r.effectiveDate,
        flatAmount: num(r.flatAmount),
        isActive: r.isActive,
    };
    for (const cell of MATRIX_CELLS) dto[cell] = num(r[cell]);
    return dto;
}

// Parse one money amount: number or numeric string, >= 0, 2dp. Returns the
// rounded number or undefined when invalid.
function parseAmount(v) {
    const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
    if (!Number.isFinite(n) || n < 0) return undefined;
    return Math.round(n * 100) / 100;
}

// Validate + normalise a rate payload against the parent's charge type.
// Returns { value } or { error }.
function normalizeBody(body, chargeType) {
    const effectiveDate = typeof body.effectiveDate === 'string' ? body.effectiveDate.trim() : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return { error: 'A valid effective date is required.' };

    const value = { effectiveDate, flatAmount: null };
    for (const cell of MATRIX_CELLS) value[cell] = null;

    if (MATRIX_CHARGE_TYPE_KEYS.includes(chargeType)) {
        for (const cell of MATRIX_CELLS) {
            const amount = parseAmount(body[cell]);
            if (amount === undefined) return { error: 'Every price cell needs an amount of 0.00 or more.' };
            value[cell] = amount;
        }
    } else {
        const amount = parseAmount(body.flatAmount);
        if (amount === undefined) return { error: 'The amount must be 0.00 or more.' };
        value.flatAmount = amount;
    }
    return { value };
}

// The parent transaction type, scoped to the caller's company.
async function findParent(req) {
    const companyId = companyIdOf(req);
    if (!companyId) return { status: 400, message: 'Select a workspace first.' };
    const parent = await GolfTransactionType.findOne({ where: { id: req.params.id, companyId } });
    if (!parent) return { status: 404, message: 'Transaction type not found.' };
    return { parent };
}

// 'YYYY-MM-DD' of today in UTC - only used to guard hard deletes of rows
// already in force.
function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

// GET /api/golf/transaction-types/:id/rates - the price cards, newest first.
exports.list = async (req, res) => {
    try {
        const found = await findParent(req);
        if (!found.parent) return res.status(found.status).json({ message: found.message });

        const rows = await GolfTransactionTypeRate.findAll({
            where: { transactionTypeId: found.parent.id },
            order: [['effectiveDate', 'DESC']],
        });
        const flags = await annotateCanModify(req, rows);
        res.status(200).json(rows.map((r, i) => toDto(r, flags[i])));
    } catch (error) {
        console.error('Error listing golf transaction type rates:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/golf/transaction-types/:id/rates
exports.create = async (req, res) => {
    try {
        const found = await findParent(req);
        if (!found.parent) return res.status(found.status).json({ message: found.message });
        const parent = found.parent;

        const parsed = normalizeBody(req.body, parent.chargeType);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;

        const clash = await GolfTransactionTypeRate.findOne({
            where: { transactionTypeId: parent.id, effectiveDate: v.effectiveDate },
        });
        if (clash) return res.status(409).json({ message: `A price effective ${v.effectiveDate} already exists.` });

        const placement = await getCallerPlacement(req);
        const callerId = getUserContext(req).userId;
        const row = await GolfTransactionTypeRate.create({
            transactionTypeId: parent.id,
            ...v,
            createdBy: callerId,
            createdByDepartmentId: placement.departmentId,
            updatedBy: callerId,
        });
        res.status(201).json({ message: `Price effective ${row.effectiveDate} created.`, rate: toDto(row) });
    } catch (error) {
        console.error('Error creating golf transaction type rate:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/golf/transaction-types/:id/rates/:rateId - full update.
exports.update = async (req, res) => {
    try {
        const found = await findParent(req);
        if (!found.parent) return res.status(found.status).json({ message: found.message });
        const parent = found.parent;

        const row = await GolfTransactionTypeRate.findOne({
            where: { id: req.params.rateId, transactionTypeId: parent.id },
        });
        if (!row) return res.status(404).json({ message: 'Price not found.' });
        if (!(await canModifyRecord(req, row))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }

        const parsed = normalizeBody(req.body, parent.chargeType);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;

        if (v.effectiveDate !== row.effectiveDate) {
            const clash = await GolfTransactionTypeRate.findOne({
                where: { transactionTypeId: parent.id, effectiveDate: v.effectiveDate },
            });
            if (clash) return res.status(409).json({ message: `A price effective ${v.effectiveDate} already exists.` });
        }

        Object.assign(row, v);
        row.updatedBy = getUserContext(req).userId;
        await row.save();
        res.status(200).json({ message: `Price effective ${row.effectiveDate} updated.`, rate: toDto(row) });
    } catch (error) {
        console.error('Error updating golf transaction type rate:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/golf/transaction-types/:id/rates/:rateId - toggle isActive only.
exports.setActive = async (req, res) => {
    try {
        const found = await findParent(req);
        if (!found.parent) return res.status(found.status).json({ message: found.message });

        const row = await GolfTransactionTypeRate.findOne({
            where: { id: req.params.rateId, transactionTypeId: found.parent.id },
        });
        if (!row) return res.status(404).json({ message: 'Price not found.' });
        if (!(await canModifyRecord(req, row))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }

        if (typeof req.body.isActive === 'boolean') {
            row.isActive = req.body.isActive;
            row.updatedBy = getUserContext(req).userId;
            await row.save();
        }
        res.status(200).json({ message: `Price effective ${row.effectiveDate} updated.`, rate: toDto(row) });
    } catch (error) {
        console.error('Error updating golf transaction type rate:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/golf/transaction-types/:id/rates/:rateId - future-dated rows
// only; a card already in force is history (disable it instead).
exports.remove = async (req, res) => {
    try {
        const found = await findParent(req);
        if (!found.parent) return res.status(found.status).json({ message: found.message });

        const row = await GolfTransactionTypeRate.findOne({
            where: { id: req.params.rateId, transactionTypeId: found.parent.id },
        });
        if (!row) return res.status(404).json({ message: 'Price not found.' });
        if (!(await canModifyRecord(req, row))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }
        if (String(row.effectiveDate) <= todayStr()) {
            return res.status(409).json({ message: 'This price is already in force - disable it instead of deleting.' });
        }

        await row.destroy();
        res.status(200).json({ message: `Price effective ${row.effectiveDate} deleted.` });
    } catch (error) {
        console.error('Error deleting golf transaction type rate:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
