// Financial-analysis dimension rules (hybrid design locked in 2026-08-25):
// unlimited AnalysisCategory catalog, at most six slot-assigned categories,
// stamped onto Ledger.analysis<slotNo>Id by option ID. This module owns the
// reads the entry doors need and the validation of a manual entry's
// selections; the setup CRUD lives in analysis.controller.js.

const { Op } = require('sequelize');
const AnalysisCategory = require('./analysisCategory.model');
const AnalysisOption = require('./analysisOption.model');

const SLOT_COLUMNS = [1, 2, 3, 4, 5, 6].map((n) => `analysis${n}Id`);

// The entry dialogs' picker meta: slot-assigned ACTIVE categories with their
// active options, slot order. Companies without any assignment get [] and the
// dialogs render nothing.
async function entryMeta(companyId) {
    const categories = await AnalysisCategory.findAll({
        where: { companyId, isActive: true, slotNo: { [Op.ne]: null } },
        order: [['slotNo', 'ASC']],
        attributes: ['id', 'name', 'slotNo', 'isRequired'],
    });
    if (!categories.length) return [];
    const options = await AnalysisOption.findAll({
        where: { categoryId: { [Op.in]: categories.map((c) => c.id) }, isActive: true },
        order: [['code', 'ASC']],
        attributes: ['id', 'categoryId', 'code', 'description'],
    });
    const byCategory = new Map();
    for (const o of options) {
        if (!byCategory.has(o.categoryId)) byCategory.set(o.categoryId, []);
        byCategory.get(o.categoryId).push({ id: o.id, code: o.code, description: o.description });
    }
    return categories.map((c) => ({
        categoryId: c.id,
        slotNo: c.slotNo,
        name: c.name,
        isRequired: c.isRequired === true,
        options: byCategory.get(c.id) || [],
    }));
}

// Validate a MANUAL entry's selections (`body.analysis` = { "<slotNo>":
// "<optionId>" }) against the company's live slot assignments. Returns
// { columns } (all six analysis<N>Id keys, unselected = null) or { error }.
// Rules: only slot-assigned active categories accept a value; the option must
// belong to that category, this company, and be active; a category flagged
// isRequired must carry a value. System producers bypass this (no clerk).
async function readAnalysisSelections(companyId, body) {
    const selections = body && typeof body.analysis === 'object' && body.analysis !== null ? body.analysis : {};
    const meta = await entryMeta(companyId);

    const columns = {};
    for (const col of SLOT_COLUMNS) columns[col] = null;

    // Unknown slots in the payload are rejected rather than dropped - hiding
    // in the UI is never the gate.
    for (const key of Object.keys(selections)) {
        if (!selections[key]) continue;
        if (!meta.some((c) => String(c.slotNo) === String(key))) {
            return { error: `Analysis slot ${key} is not assigned to a dimension.` };
        }
    }

    for (const cat of meta) {
        const picked = selections[String(cat.slotNo)] || null;
        if (!picked) {
            if (cat.isRequired) return { error: `${cat.name} is required.` };
            continue;
        }
        const option = cat.options.find((o) => o.id === picked);
        if (!option) return { error: `Select a valid ${cat.name} option.` };
        columns[`analysis${cat.slotNo}Id`] = option.id;
    }
    return { columns };
}

// The six analysis columns of an existing row, for copies (void reversals).
function copyColumns(row) {
    const out = {};
    for (const col of SLOT_COLUMNS) out[col] = row[col] || null;
    return out;
}

// Is any of this category's options referenced by a Ledger document in its
// slot column? Drives the SLOT-REPURPOSE LOCK (slotNo immutable once used).
// slotNo is validated 1..6 by the caller - the column name never carries
// user input.
async function slotInUse(companyId, categoryId, slotNo) {
    const n = Number(slotNo);
    if (!Number.isInteger(n) || n < 1 || n > 6) return false;
    const Ledger = require('./ledger.model');
    const row = await Ledger.findOne({
        where: {
            companyId,
            [`analysis${n}Id`]: { [Op.in]: (await AnalysisOption.findAll({
                where: { categoryId }, attributes: ['id'],
            })).map((o) => o.id) },
        },
        attributes: ['id'],
    });
    return !!row;
}

module.exports = { SLOT_COLUMNS, entryMeta, readAnalysisSelections, copyColumns, slotInUse };
