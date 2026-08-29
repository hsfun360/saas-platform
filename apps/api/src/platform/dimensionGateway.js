// src/platform/dimensionGateway.js
//
// PEER-SERVICE SEAM: product systems (AR today; POS / Golf / AP / GL later) ->
// Dimension, the shared financial-analysis capability (promoted 2026-08-25,
// same tier as Tax). Consumers must NOT require() the dimension module
// directly (golden rule #4) - they call through this seam. Today everything is
// one process, so the seam resolves in-process; when Dimension splits out,
// only THIS file changes to HTTP via internalServiceUrl('dimension').
//
// The vocabulary: a company defines CATEGORIES ('Department', 'Project', ...),
// assigns the ones to be stamped on documents a DIMENSION NUMBER 1..6
// (company-global, so Dimension 3 means the same thing in every module), fills
// each category with OPTIONS referenced by id from the consumers'
// analysis<dimensionNo>Id columns, and ticks WHICH MODULES the dimension
// applies to (2026-08-27) - a Golf-only dimension never bothers an AR clerk.

const { Op } = require('sequelize');
const { internalServiceUrl, getTenantModuleCatalog, getCompanyModuleIds } = require('./serviceContext');

const ANALYSIS_COLUMNS = [1, 2, 3, 4, 5, 6].map((n) => `analysis${n}Id`);

// --- The consumer registry --------------------------------------------------
// Each consuming module REGISTERS itself at composition time (same pattern as
// workflow purpose handlers), declaring two things:
//   moduleName - its Control-Plane Module name (audience 'tenant'), the same
//                string it passes to requireModule(); ids are resolved from it
//                so the stored moduleId never depends on load order.
//   usageCheck - ({ companyId, dimensionNo, optionIds }) -> Promise<boolean>
//                "does any of my documents reference one of these options in
//                that dimension's column?" (the repurpose lock's eyes; the
//                dimension service cannot query consumers' tables without
//                inverting the dependency).
// The registry is also what the Setup screen lists: a module is offered only
// once it is wired here, so every checkbox on that screen changes behaviour
// somewhere. WHEN SPLIT: each consumer exposes its usage check as an internal
// HTTP endpoint and registers by config instead.
const consumers = [];

function registerConsumer({ moduleName, usageCheck }) {
    consumers.push({ moduleName, usageCheck });
}

// The registered consumers' module names, in registration order.
function consumerModuleNames() {
    return consumers.map((c) => c.moduleName);
}

// Module NAME -> Control-Plane Module id (memoized catalog read). null when
// the catalog has no such tenant module.
async function resolveModuleId(moduleName) {
    if (!moduleName) return null;
    return (await getTenantModuleCatalog()).get(moduleName) || null;
}

// The modules the Setup screen may offer for this company: registered
// consumers INTERSECTED with the company's subscribed modules. A dimension is
// company-scoped and module subscription is per company, so a tenant-level
// list would let a clerk tick a module their company can never use.
async function availableModules(companyId) {
    const [catalog, subscribed] = await Promise.all([getTenantModuleCatalog(), getCompanyModuleIds(companyId)]);
    const out = [];
    for (const { moduleName } of consumers) {
        const moduleId = catalog.get(moduleName);
        if (moduleId && subscribed.has(moduleId)) out.push({ moduleId, name: moduleName });
    }
    return out;
}

// --- Usage checks (the repurpose lock's eyes) -------------------------------

// Is a category's dimension number referenced anywhere? EVERY consumer is
// asked, applicable or not: a module unticked last month still has documents
// pointing at the dimension, and their meaning must stay stable.
async function dimensionInUse({ companyId, categoryId, dimensionNo }) {
    const n = Number(dimensionNo);
    if (!Number.isInteger(n) || n < 1 || n > 6) return false;
    const DimensionOption = require('../modules/dimension/dimensionOption.model');
    const optionIds = (await DimensionOption.findAll({ where: { categoryId }, attributes: ['id'] })).map((o) => o.id);
    if (!optionIds.length) return false;
    for (const { usageCheck } of consumers) {
        if (await usageCheck({ companyId, dimensionNo: n, optionIds })) return true;
    }
    return false;
}

// --- Consumer reads ---------------------------------------------------------

// The entry dialogs' picker meta for ONE module: the number-assigned ACTIVE
// categories that module applies to, with their active options, in dimension
// order. `isRequired` is that module's own flag. A module nothing applies to
// gets [].
// WHEN SPLIT: GET {internalServiceUrl('dimension')}/internal/entry-meta?companyId&module
async function entryMeta(companyId, moduleName) {
    const moduleId = await resolveModuleId(moduleName);
    if (!moduleId) return [];
    const DimensionCategory = require('../modules/dimension/dimensionCategory.model');
    const DimensionCategoryModule = require('../modules/dimension/dimensionCategoryModule.model');
    const DimensionOption = require('../modules/dimension/dimensionOption.model');

    const applies = await DimensionCategoryModule.findAll({
        where: { companyId, moduleId },
        attributes: ['categoryId', 'isRequired'],
    });
    if (!applies.length) return [];
    const requiredBy = new Map(applies.map((a) => [a.categoryId, a.isRequired === true]));

    const categories = await DimensionCategory.findAll({
        where: {
            companyId,
            isActive: true,
            dimensionNo: { [Op.ne]: null },
            id: { [Op.in]: [...requiredBy.keys()] },
        },
        order: [['dimensionNo', 'ASC']],
        attributes: ['id', 'name', 'dimensionNo', 'parentCategoryId'],
    });
    if (!categories.length) return [];
    const options = await DimensionOption.findAll({
        where: { categoryId: { [Op.in]: categories.map((c) => c.id) }, isActive: true },
        order: [['code', 'ASC']],
        attributes: ['id', 'categoryId', 'code', 'description', 'parentOptionId'],
    });
    // A parented category's options are offered only once they are LINKED to a
    // parent option: the cascade has no level to file an unassigned one under,
    // and stamping it would freeze a half-empty pair. They stay visible on the
    // setup screen under their own group so the gap is fixable, never silent.
    const parented = new Set(categories.filter((c) => c.parentCategoryId).map((c) => c.id));
    const byCategory = new Map();
    for (const o of options) {
        if (parented.has(o.categoryId) && !o.parentOptionId) continue;
        if (!byCategory.has(o.categoryId)) byCategory.set(o.categoryId, []);
        byCategory.get(o.categoryId).push({
            id: o.id, code: o.code, description: o.description, parentOptionId: o.parentOptionId || null,
        });
    }
    // parentDimensionNo is what the entry dialogs cascade on - they key
    // selections by dimension number, not by category id. It is null when the
    // parent is not applicable to this module, which the setup screen's
    // nesting rule prevents, but the reader stays defensive.
    const noByCategory = new Map(categories.map((c) => [c.id, c.dimensionNo]));
    return categories.map((c) => ({
        categoryId: c.id,
        dimensionNo: c.dimensionNo,
        name: c.name,
        isRequired: requiredBy.get(c.id) === true,
        parentCategoryId: c.parentCategoryId || null,
        parentDimensionNo: c.parentCategoryId ? (noByCategory.get(c.parentCategoryId) ?? null) : null,
        options: byCategory.get(c.id) || [],
    }));
}

// Validate a MANUAL entry's selections (`body.analysis` = { "<dimensionNo>":
// "<optionId>" }) against what the CALLING MODULE may stamp, deriving any
// ancestor a picked child determines (Department -> its Division). Returns
// { columns } (all six analysis<N>Id keys, unselected = null) or { error }.
// Rules: only dimensions this module applies to accept a value; the option
// must belong to that category, this company, and be active; a dimension
// flagged required FOR THIS MODULE must carry a value.
//
// System producers bypass this entirely, and so do inherited columns (a POS
// sale that charges to account hands its analysis ids to the AR ledger row
// through copyColumns) - applicability governs DATA ENTRY, not what a row is
// allowed to carry, or restricting a dimension from AR would silently strip
// analysis off AR rows another module legitimately created.
// WHEN SPLIT: POST {internalServiceUrl('dimension')}/internal/validate-selections
async function readSelections(companyId, body, moduleName) {
    const selections = body && typeof body.analysis === 'object' && body.analysis !== null ? body.analysis : {};
    const meta = await entryMeta(companyId, moduleName);

    const columns = {};
    for (const col of ANALYSIS_COLUMNS) columns[col] = null;

    // Dimension numbers this module cannot stamp are rejected rather than
    // dropped - hiding in the UI is never the gate.
    for (const key of Object.keys(selections)) {
        if (!selections[key]) continue;
        if (!meta.some((c) => String(c.dimensionNo) === String(key))) {
            return { error: `Analysis Dimension ${key} does not apply to ${moduleName}.` };
        }
    }

    // 1. Resolve what the clerk actually picked.
    const picked = new Map();
    for (const cat of meta) {
        const id = selections[String(cat.dimensionNo)] || null;
        if (!id) continue;
        const option = cat.options.find((o) => o.id === id);
        if (!option) return { error: `Select a valid ${cat.name} option.` };
        picked.set(String(cat.dimensionNo), option);
    }

    // 2. Walk each hierarchy upwards: a child determines its parent, so DERIVE
    //    an unpicked ancestor rather than leaving the pair half-stamped (that
    //    is the whole point of storing both levels), and REJECT a pair the
    //    clerk picked inconsistently. Server-side either way - the entry
    //    dialog's cascade is a convenience, never the gate.
    const byCategoryId = new Map(meta.map((c) => [c.categoryId, c]));
    for (const start of meta) {
        let child = start;
        let chosen = picked.get(String(child.dimensionNo)) || null;
        // The controller rejects cycles on save; the hop cap keeps a corrupt
        // row from spinning here regardless.
        for (let hop = 0; chosen && child.parentCategoryId && hop < 6; hop += 1) {
            const parent = byCategoryId.get(child.parentCategoryId);
            if (!parent) break;
            const wantedId = chosen.parentOptionId || null;
            if (!wantedId) return { error: `${child.name} '${chosen.code}' is not linked to a ${parent.name}.` };
            const already = picked.get(String(parent.dimensionNo)) || null;
            if (already && already.id !== wantedId) {
                return { error: `${child.name} '${chosen.code}' does not belong to the selected ${parent.name}.` };
            }
            let resolved = already;
            if (!resolved) {
                resolved = parent.options.find((o) => o.id === wantedId) || null;
                if (!resolved) return { error: `${child.name} '${chosen.code}' is linked to a ${parent.name} that is no longer available.` };
                picked.set(String(parent.dimensionNo), resolved);
            }
            child = parent;
            chosen = resolved;
        }
    }

    // 3. Required is checked AFTER derivation - a clerk who picked only the
    //    Department has satisfied a required Division too.
    for (const cat of meta) {
        const option = picked.get(String(cat.dimensionNo)) || null;
        if (!option) {
            if (cat.isRequired) return { error: `${cat.name} is required.` };
            continue;
        }
        columns[`analysis${cat.dimensionNo}Id`] = option.id;
    }
    return { columns };
}

// The six analysis columns of an existing consumer row, for copies (e.g. AR
// void reversals, or a producing module handing its stamps to the AR ledger).
// Pure - no I/O, and deliberately unfiltered by applicability.
function copyColumns(row) {
    const out = {};
    for (const col of ANALYSIS_COLUMNS) out[col] = row[col] || null;
    return out;
}

module.exports = {
    ANALYSIS_COLUMNS,
    registerConsumer,
    consumerModuleNames,
    resolveModuleId,
    availableModules,
    dimensionInUse,
    entryMeta,
    readSelections,
    copyColumns,
    // Re-exported so a future split can read the peer URL from one import site.
    internalServiceUrl,
};
