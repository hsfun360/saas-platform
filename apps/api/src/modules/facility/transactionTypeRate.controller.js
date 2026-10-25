// Pricing of a facility Transaction Type (structure approved 2026-10-25).
// Effective-dated price cards: matrix charge types (facility-fee /
// guest-fee) carry CELL rows keyed participant x day scope x session; flat
// charge types one flat amount. Resolution at billing (rateCard.service):
// the active card with the latest effective date on or before the booking
// date, then the most specific matching cell.

const { sequelize } = require('../../platform/db');
const TransactionType = require('./transactionType.model');
const TransactionTypeRate = require('./transactionTypeRate.model');
const TransactionTypeRateCell = require('./transactionTypeRateCell.model');
const FacilitySession = require('./facilitySession.model');
const { getUserContext, canModifyRecord, annotateCanModify } = require('../../platform/serviceContext');
const { MATRIX_CHARGE_TYPE_KEYS } = require('./facility.constants');
const participantTypes = require('./participantType.service');
const { parseAmount, normalizeCells } = require('./rateCard.service');
const { companyIdOf, stampsFor, DATE_RE } = require('./facilityShared');

function cellDto(c) {
    return { id: c.id, participantType: c.participantType, dayScope: c.dayScope, sessionId: c.sessionId || null, amount: Number(c.amount) };
}

function toDto(r, canModify = true) {
    return {
        id: r.id,
        canModify,
        effectiveDate: r.effectiveDate,
        flatAmount: r.flatAmount === null || r.flatAmount === undefined ? null : Number(r.flatAmount),
        isActive: r.isActive,
        cells: (r.Cells || []).map(cellDto),
    };
}

async function findParent(req) {
    const companyId = companyIdOf(req);
    if (!companyId) return { status: 400, message: 'Select a workspace first.' };
    const parent = await TransactionType.findOne({ where: { id: req.params.id, companyId } });
    if (!parent) return { status: 404, message: 'Transaction type not found.' };
    return { companyId, parent };
}

async function findRate(parentId, rateId) {
    return TransactionTypeRate.findOne({ where: { id: rateId, transactionTypeId: parentId }, include: [{ model: TransactionTypeRateCell, as: 'Cells' }] });
}

// Validate the header + (matrix) cells against the parent's charge type.
async function normalizeBody(body, companyId, parent) {
    const effectiveDate = typeof body.effectiveDate === 'string' ? body.effectiveDate.trim() : '';
    if (!DATE_RE.test(effectiveDate)) return { error: 'A valid effective date is required.' };
    if (MATRIX_CHARGE_TYPE_KEYS.includes(parent.chargeType)) {
        const [types, sessions] = await Promise.all([
            participantTypes.catalog(companyId),
            FacilitySession.findAll({ where: { companyId }, attributes: ['id'] }),
        ]);
        const parsed = normalizeCells(body.cells, { knownParticipantCodes: new Set(types.map((t) => t.code)), knownSessionIds: new Set(sessions.map((s) => s.id)) });
        if (parsed.error) return { error: parsed.error };
        return { value: { effectiveDate, flatAmount: null }, cells: parsed.cells };
    }
    const amount = parseAmount(body.flatAmount);
    if (amount === undefined) return { error: 'The amount must be 0.00 or more.' };
    return { value: { effectiveDate, flatAmount: amount }, cells: [] };
}

function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

// GET /api/facility/transaction-types/:id/rates - cards newest first, with cells.
exports.list = async (req, res) => {
    try {
        const found = await findParent(req);
        if (!found.parent) return res.status(found.status).json({ message: found.message });
        const rows = await TransactionTypeRate.findAll({
            where: { transactionTypeId: found.parent.id },
            include: [{ model: TransactionTypeRateCell, as: 'Cells' }],
            order: [['effectiveDate', 'DESC']],
        });
        const flags = await annotateCanModify(req, rows);
        res.status(200).json(rows.map((r, i) => toDto(r, flags[i])));
    } catch (error) {
        console.error('Error listing facility rate cards:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/facility/transaction-types/:id/rates - header + cells in one transaction.
exports.create = async (req, res) => {
    try {
        const found = await findParent(req);
        if (!found.parent) return res.status(found.status).json({ message: found.message });
        const { companyId, parent } = found;
        const parsed = await normalizeBody(req.body, companyId, parent);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const clash = await TransactionTypeRate.findOne({ where: { transactionTypeId: parent.id, effectiveDate: parsed.value.effectiveDate } });
        if (clash) return res.status(409).json({ message: `A price effective ${parsed.value.effectiveDate} already exists.` });
        const stamps = await stampsFor(req);
        const created = await sequelize.transaction(async (t) => {
            const row = await TransactionTypeRate.create({ transactionTypeId: parent.id, ...parsed.value, ...stamps }, { transaction: t });
            if (parsed.cells.length) await TransactionTypeRateCell.bulkCreate(parsed.cells.map((c) => ({ ...c, rateId: row.id })), { transaction: t });
            return row;
        });
        const full = await findRate(parent.id, created.id);
        res.status(201).json({ message: `Price effective ${full.effectiveDate} created.`, rate: toDto(full) });
    } catch (error) {
        console.error('Error creating facility rate card:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/facility/transaction-types/:id/rates/:rateId - full update, cells replaced.
exports.update = async (req, res) => {
    try {
        const found = await findParent(req);
        if (!found.parent) return res.status(found.status).json({ message: found.message });
        const { companyId, parent } = found;
        const row = await findRate(parent.id, req.params.rateId);
        if (!row) return res.status(404).json({ message: 'Price not found.' });
        if (!(await canModifyRecord(req, row))) return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        const parsed = await normalizeBody(req.body, companyId, parent);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        if (parsed.value.effectiveDate !== String(row.effectiveDate)) {
            const clash = await TransactionTypeRate.findOne({ where: { transactionTypeId: parent.id, effectiveDate: parsed.value.effectiveDate } });
            if (clash) return res.status(409).json({ message: `A price effective ${parsed.value.effectiveDate} already exists.` });
        }
        await sequelize.transaction(async (t) => {
            Object.assign(row, parsed.value, { updatedBy: getUserContext(req).userId });
            await row.save({ transaction: t });
            await TransactionTypeRateCell.destroy({ where: { rateId: row.id }, transaction: t });
            if (parsed.cells.length) await TransactionTypeRateCell.bulkCreate(parsed.cells.map((c) => ({ ...c, rateId: row.id })), { transaction: t });
        });
        const full = await findRate(parent.id, row.id);
        res.status(200).json({ message: `Price effective ${full.effectiveDate} updated.`, rate: toDto(full) });
    } catch (error) {
        console.error('Error updating facility rate card:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/facility/transaction-types/:id/rates/:rateId - toggle isActive.
exports.setActive = async (req, res) => {
    try {
        const found = await findParent(req);
        if (!found.parent) return res.status(found.status).json({ message: found.message });
        const row = await findRate(found.parent.id, req.params.rateId);
        if (!row) return res.status(404).json({ message: 'Price not found.' });
        if (!(await canModifyRecord(req, row))) return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        if (typeof req.body.isActive === 'boolean') {
            row.isActive = req.body.isActive;
            row.updatedBy = getUserContext(req).userId;
            await row.save();
        }
        res.status(200).json({ message: `Price effective ${row.effectiveDate} updated.`, rate: toDto(row) });
    } catch (error) {
        console.error('Error updating facility rate card:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/facility/transaction-types/:id/rates/:rateId - future-dated only.
exports.remove = async (req, res) => {
    try {
        const found = await findParent(req);
        if (!found.parent) return res.status(found.status).json({ message: found.message });
        const row = await findRate(found.parent.id, req.params.rateId);
        if (!row) return res.status(404).json({ message: 'Price not found.' });
        if (!(await canModifyRecord(req, row))) return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        if (String(row.effectiveDate) <= todayStr()) return res.status(409).json({ message: 'This price is already in force - disable it instead of deleting.' });
        await row.destroy();
        res.status(200).json({ message: `Price effective ${row.effectiveDate} deleted.` });
    } catch (error) {
        console.error('Error deleting facility rate card:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
