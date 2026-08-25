// src/platform/dimensionGateway.js
//
// PEER-SERVICE SEAM: product systems (AR today; AP / GL / PO later) ->
// Dimension, the shared financial-analysis capability (promoted 2026-08-25,
// same tier as Tax). Consumers must NOT require() the dimension module
// directly (golden rule #4) - they call through this seam. Today everything is
// one process, so the seam resolves in-process; when Dimension splits out,
// only THIS file changes to HTTP via internalServiceUrl('dimension').
//
// The vocabulary: a company defines CATEGORIES ('Department', 'Project', ...),
// assigns the ones to be stamped on documents a DIMENSION NUMBER 1..6
// (company-global, so Dimension 3 means the same thing in every module), and
// fills each category with OPTIONS referenced by id from the consumers'
// analysis<dimensionNo>Id columns.

const { Op } = require('sequelize');
const { internalServiceUrl } = require('./serviceContext');

const ANALYSIS_COLUMNS = [1, 2, 3, 4, 5, 6].map((n) => `analysis${n}Id`);

// --- Usage checks (the repurpose lock's eyes) -------------------------------
// The dimension service cannot query consumers' tables (that would invert the
// dependency), so each consumer REGISTERS a checker at composition time (same
// pattern as workflow purpose handlers): ({ companyId, dimensionNo, optionIds })
// -> Promise<boolean> "does any of my documents reference one of these options
// in that dimension's column?". WHEN SPLIT: each consumer exposes this as an
// internal HTTP endpoint the dimension service calls.
const usageChecks = [];

function registerUsageCheck(fn) {
    usageChecks.push(fn);
}

// Is a category's dimension number referenced anywhere? (All consumers asked.)
async function dimensionInUse({ companyId, categoryId, dimensionNo }) {
    const n = Number(dimensionNo);
    if (!Number.isInteger(n) || n < 1 || n > 6) return false;
    const DimensionOption = require('../modules/dimension/dimensionOption.model');
    const optionIds = (await DimensionOption.findAll({ where: { categoryId }, attributes: ['id'] })).map((o) => o.id);
    if (!optionIds.length) return false;
    for (const check of usageChecks) {
        if (await check({ companyId, dimensionNo: n, optionIds })) return true;
    }
    return false;
}

// --- Consumer reads ---------------------------------------------------------

// The entry dialogs' picker meta: number-assigned ACTIVE categories with their
// active options, dimension order. Companies without any assignment get [].
// WHEN SPLIT: GET {internalServiceUrl('dimension')}/internal/entry-meta?companyId
async function entryMeta(companyId) {
    const DimensionCategory = require('../modules/dimension/dimensionCategory.model');
    const DimensionOption = require('../modules/dimension/dimensionOption.model');
    const categories = await DimensionCategory.findAll({
        where: { companyId, isActive: true, dimensionNo: { [Op.ne]: null } },
        order: [['dimensionNo', 'ASC']],
        attributes: ['id', 'name', 'dimensionNo', 'isRequired'],
    });
    if (!categories.length) return [];
    const options = await DimensionOption.findAll({
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
        dimensionNo: c.dimensionNo,
        name: c.name,
        isRequired: c.isRequired === true,
        options: byCategory.get(c.id) || [],
    }));
}

// Validate a MANUAL entry's selections (`body.analysis` = { "<dimensionNo>":
// "<optionId>" }) against the company's live assignments. Returns { columns }
// (all six analysis<N>Id keys, unselected = null) or { error }.
// Rules: only number-assigned active categories accept a value; the option
// must belong to that category, this company, and be active; a category
// flagged isRequired must carry a value. System producers bypass this.
// WHEN SPLIT: POST {internalServiceUrl('dimension')}/internal/validate-selections
async function readSelections(companyId, body) {
    const selections = body && typeof body.analysis === 'object' && body.analysis !== null ? body.analysis : {};
    const meta = await entryMeta(companyId);

    const columns = {};
    for (const col of ANALYSIS_COLUMNS) columns[col] = null;

    // Unknown dimension numbers in the payload are rejected rather than
    // dropped - hiding in the UI is never the gate.
    for (const key of Object.keys(selections)) {
        if (!selections[key]) continue;
        if (!meta.some((c) => String(c.dimensionNo) === String(key))) {
            return { error: `Analysis Dimension ${key} is not defined.` };
        }
    }

    for (const cat of meta) {
        const picked = selections[String(cat.dimensionNo)] || null;
        if (!picked) {
            if (cat.isRequired) return { error: `${cat.name} is required.` };
            continue;
        }
        const option = cat.options.find((o) => o.id === picked);
        if (!option) return { error: `Select a valid ${cat.name} option.` };
        columns[`analysis${cat.dimensionNo}Id`] = option.id;
    }
    return { columns };
}

// The six analysis columns of an existing consumer row, for copies (e.g. AR
// void reversals). Pure - no I/O.
function copyColumns(row) {
    const out = {};
    for (const col of ANALYSIS_COLUMNS) out[col] = row[col] || null;
    return out;
}

module.exports = {
    ANALYSIS_COLUMNS,
    registerUsageCheck,
    dimensionInUse,
    entryMeta,
    readSelections,
    copyColumns,
    // Re-exported so a future split can read the peer URL from one import site.
    internalServiceUrl,
};
