// Dimension Setup (shared financial-analysis capability, promoted 2026-08-25;
// hybrid design locked in the same day). Categories = the company's analysis
// dimensions ('Department', 'Project', ...), each optionally assigned one of
// six dimension numbers; Options = the selectable values, referenced by
// consuming documents BY ID. Enable/disable only, no deletes; the repurpose
// lock (via the gateway's registered consumer usage checks) keeps a used
// dimension number's meaning stable.

const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const DimensionCategory = require('./dimensionCategory.model');
const DimensionCategoryModule = require('./dimensionCategoryModule.model');
const DimensionOption = require('./dimensionOption.model');
const { dimensionInUse, availableModules } = require('../../platform/dimensionGateway');
const {
    getUserContext,
    getCallerPlacement,
    canModifyRecord,
    annotateCanModify,
    getTenantModuleCatalog,
} = require('../../platform/serviceContext');
const { validate, fields, z } = require('../../platform/validate');

function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

function ownershipStamps(req, placement) {
    const callerId = getUserContext(req).userId;
    return { createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId };
}

// `modules` = the consuming modules this dimension applies to, each with its
// OWN isRequired (2026-08-27 - the flag moved off the category so "is
// Department mandatory?" has exactly one answer per module). Rows for modules
// the company no longer subscribes to are still returned, named, so the screen
// can show them greyed instead of silently losing the intent.
function categoryDto(c, canModify = true, modules = []) {
    return {
        id: c.id,
        canModify,
        name: c.name,
        dimensionNo: c.dimensionNo,
        // Entry display order; null = automatic (parent-first).
        displaySeq: c.displaySeq ?? null,
        // Hierarchy: this dimension is a child of that one (Department under
        // Division). Independent of dimensionNo by design.
        parentCategoryId: c.parentCategoryId || null,
        modules,
        isActive: c.isActive,
    };
}

// Module id -> name for every TENANT module, so stored rows render even when
// the module is no longer subscribed (or no longer a registered consumer).
async function moduleNamesById() {
    const catalog = await getTenantModuleCatalog();
    return new Map([...catalog.entries()].map(([name, id]) => [id, name]));
}

function moduleRowDto(row, names) {
    return {
        moduleId: row.moduleId,
        moduleName: names.get(row.moduleId) || 'Unknown module',
        isRequired: row.isRequired === true,
    };
}

// Read the dialog's module ticks against what this company may actually tick:
// registered consumers INTERSECTED with its subscriptions. Returns
// { rows, allowed } or { error }.
//
// Two rules live here. A dimension that IS stamped (has a number) must apply
// to at least one module, or it burns one of the six slots while nothing can
// ever write it. A catalog-only dimension stamps nothing by definition, so its
// module ticks are normalised away rather than rejected.
async function readModules(companyId, dimensionNo, body) {
    const available = await availableModules(companyId);
    const allowed = new Map(available.map((m) => [m.moduleId, m.name]));
    if (dimensionNo === null || dimensionNo === undefined) return { rows: [], allowed };

    const seen = new Set();
    const rows = [];
    for (const m of body.modules || []) {
        if (!allowed.has(m.moduleId)) {
            return { error: 'One of the selected modules cannot use analysis dimensions.' };
        }
        if (seen.has(m.moduleId)) continue;
        seen.add(m.moduleId);
        rows.push({ moduleId: m.moduleId, isRequired: m.isRequired === true });
    }
    if (!rows.length) {
        return { error: 'Pick at least one module - a dimension stamped on documents must apply somewhere.' };
    }
    return { rows, allowed };
}

// Validate a proposed PARENT dimension (hierarchy, 2026-08-27). Returns
// { parentCategoryId } or { error }. Four rules, none of them involving
// dimensionNo - the number is a storage slot, the parent link is semantic:
//   1. no self-parent, and no cycle anywhere up the chain;
//   2. a stamped child needs a stamped parent (a catalog-only parent is never
//      written to a document, so the pair could not be frozen);
//   3. module applicability NESTS - the child cannot be offered anywhere its
//      parent is not, or the pair is unenforceable on that document;
//   4. the parent must belong to this company.
async function readParentCategory(companyId, selfId, dimensionNo, moduleIds, allowed, body) {
    const parentCategoryId = body.parentCategoryId || null;
    if (!parentCategoryId) return { parentCategoryId: null };
    if (selfId && parentCategoryId === selfId) return { error: 'A dimension cannot be its own parent.' };

    const parent = await DimensionCategory.findOne({ where: { id: parentCategoryId, companyId } });
    if (!parent) return { error: 'Parent dimension not found.' };
    if (dimensionNo !== null && dimensionNo !== undefined && parent.dimensionNo === null) {
        return { error: `'${parent.name}' is catalog only - it is never stamped on documents, so it cannot be the parent of a stamped dimension.` };
    }

    // Walk up from the proposed parent. Reaching self would close a cycle and
    // hang every cascade that follows the chain.
    let cursor = parent;
    for (let hop = 0; cursor && cursor.parentCategoryId && hop < 10; hop += 1) {
        if (selfId && cursor.parentCategoryId === selfId) {
            return { error: `That would make '${parent.name}' a descendant of itself.` };
        }
        cursor = await DimensionCategory.findOne({ where: { id: cursor.parentCategoryId, companyId } });
    }

    const parentModules = new Set((await DimensionCategoryModule.findAll({
        where: { categoryId: parent.id }, attributes: ['moduleId'],
    })).map((m) => m.moduleId));
    const missing = moduleIds.filter((id) => !parentModules.has(id));
    if (missing.length) {
        const names = missing.map((id) => allowed.get(id) || 'that module').join(', ');
        return { error: `'${parent.name}' does not apply to ${names}, so this dimension cannot either - a parent must cover every module its child covers.` };
    }
    return { parentCategoryId };
}

// Validate an option's link to its parent category's option. Required once the
// category declares a parent; forced null when it does not.
async function readParentOption(companyId, category, body) {
    if (!category.parentCategoryId) return { parentOptionId: null };
    const parent = await DimensionCategory.findOne({
        where: { id: category.parentCategoryId, companyId }, attributes: ['id', 'name'],
    });
    const label = parent ? parent.name : 'parent dimension';
    const parentOptionId = body.parentOptionId || null;
    if (!parentOptionId) return { error: `Select the ${label} this option belongs to.` };
    const target = await DimensionOption.findOne({
        where: { id: parentOptionId, companyId, categoryId: category.parentCategoryId }, attributes: ['id'],
    });
    if (!target) return { error: `Select a valid ${label} option.` };
    return { parentOptionId };
}

// Reconcile a category's module rows with the dialog's ticks.
// Rows for modules OUTSIDE `allowed` are left untouched: the dialog never
// showed them, so a save must not drop intent that re-subscribing would
// restore. Unticking a module that already has stamped documents is fine and
// needs no lock - it only stops new entry (see the model's header).
async function saveModules(req, companyId, categoryId, rows, allowed, placement, transaction) {
    const userId = getUserContext(req).userId;
    const existing = await DimensionCategoryModule.findAll({ where: { categoryId }, transaction });
    const wanted = new Map(rows.map((r) => [r.moduleId, r]));

    for (const row of existing) {
        if (!allowed.has(row.moduleId)) continue;
        const want = wanted.get(row.moduleId);
        if (!want) {
            await row.destroy({ transaction });
            continue;
        }
        wanted.delete(row.moduleId);
        if ((row.isRequired === true) !== want.isRequired) {
            row.isRequired = want.isRequired;
            row.updatedBy = userId;
            await row.save({ transaction });
        }
    }
    for (const want of wanted.values()) {
        await DimensionCategoryModule.create({
            companyId, categoryId, moduleId: want.moduleId, isRequired: want.isRequired,
            ...ownershipStamps(req, placement),
        }, { transaction });
    }
}

function optionDto(o, canModify = true) {
    return {
        id: o.id,
        canModify,
        categoryId: o.categoryId,
        // Which option of the PARENT category this belongs to. Null under a
        // parented category means UNASSIGNED: kept and listed, but withheld
        // from entry pickers until it is linked.
        parentOptionId: o.parentOptionId || null,
        code: o.code,
        description: o.description,
        isActive: o.isActive,
    };
}

// --- Zod schemas (boundary validation; unknown keys stripped) ---
const categoryBody = z.object({
    name: fields.requiredText(100),
    dimensionNo: z.union([z.null(), z.coerce.number().int().min(1).max(6)]).optional(),
    // Entry display order (null/absent = automatic parent-first ordering).
    displaySeq: z.union([z.null(), z.coerce.number().int().min(1).max(999)]).optional(),
    // Hierarchy: the dimension this one sits under (null = standalone).
    parentCategoryId: fields.uuid.nullable().optional(),
    // Per-module applicability; `isRequired` rides each entry.
    modules: z.array(z.object({
        moduleId: fields.uuid,
        isRequired: z.boolean().optional(),
    })).optional(),
});
// description arrives as null when the field is left blank (the web sends
// `trim() || null`) - accept string, null or absent alike.
const optionBody = z.object({
    categoryId: fields.uuid,
    // The parent category's option this belongs to (required when the category
    // has a parent; ignored otherwise).
    parentOptionId: fields.uuid.nullable().optional(),
    code: fields.requiredText(30),
    description: fields.optionalText(255).nullable(),
});
const optionEditBody = z.object({
    parentOptionId: fields.uuid.nullable().optional(),
    code: fields.requiredText(30),
    description: fields.optionalText(255).nullable(),
});
const activeBody = z.object({ isActive: z.boolean() });
const idParams = z.object({ id: fields.uuid });

exports.validateCategoryCreate = validate({ body: categoryBody });
exports.validateCategoryUpdate = validate({ params: idParams, body: categoryBody });
exports.validateOptionCreate = validate({ body: optionBody });
exports.validateOptionUpdate = validate({ params: idParams, body: optionEditBody });
exports.validateSetActive = validate({ params: idParams, body: activeBody });

// GET /api/dimension - the whole setup (categories + options + the module
// ticks) in one read, plus the modules this company MAY tick.
exports.list = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const [categories, options, moduleRows, available, names] = await Promise.all([
            DimensionCategory.findAll({ where: { companyId }, order: [['name', 'ASC']] }),
            DimensionOption.findAll({ where: { companyId }, order: [['code', 'ASC']] }),
            DimensionCategoryModule.findAll({ where: { companyId } }),
            availableModules(companyId),
            moduleNamesById(),
        ]);
        const [catFlags, optFlags] = await Promise.all([
            annotateCanModify(req, categories),
            annotateCanModify(req, options),
        ]);
        const modulesByCategory = new Map();
        for (const row of moduleRows) {
            if (!modulesByCategory.has(row.categoryId)) modulesByCategory.set(row.categoryId, []);
            modulesByCategory.get(row.categoryId).push(moduleRowDto(row, names));
        }
        for (const list of modulesByCategory.values()) list.sort((a, b) => a.moduleName.localeCompare(b.moduleName));
        res.status(200).json({
            categories: categories.map((c, i) => categoryDto(c, catFlags[i], modulesByCategory.get(c.id) || [])),
            options: options.map((o, i) => optionDto(o, optFlags[i])),
            // Registered dimension consumers this company subscribes to - the
            // dialog's tickable list. A module absent here is either not wired
            // to the capability yet or not subscribed.
            availableModules: available,
        });
    } catch (error) {
        console.error('Error listing dimension setup:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Dimension-number uniqueness pre-check (the partial unique index backstops).
async function dimensionClashError(companyId, dimensionNo, ignoreId = null) {
    if (dimensionNo === null || dimensionNo === undefined) return null;
    const clash = await DimensionCategory.findOne({
        where: { companyId, dimensionNo, ...(ignoreId ? { id: { [Op.ne]: ignoreId } } : {}) },
        attributes: ['name'],
    });
    return clash ? `Dimension ${dimensionNo} is already assigned to '${clash.name}'.` : null;
}

// POST /api/dimension/categories
exports.createCategory = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const { name, dimensionNo = null, displaySeq = null } = req.body;

        const dup = await DimensionCategory.findOne({ where: { companyId, name } });
        if (dup) return res.status(409).json({ message: `Dimension '${name}' already exists.` });
        const clashErr = await dimensionClashError(companyId, dimensionNo);
        if (clashErr) return res.status(409).json({ message: clashErr });
        const mods = await readModules(companyId, dimensionNo ?? null, req.body);
        if (mods.error) return res.status(400).json({ message: mods.error });
        const parent = await readParentCategory(
            companyId, null, dimensionNo ?? null, mods.rows.map((r) => r.moduleId), mods.allowed, req.body,
        );
        if (parent.error) return res.status(400).json({ message: parent.error });

        const placement = await getCallerPlacement(req);
        // One transaction: a numbered dimension with no module rows would
        // violate the invariant readModules() just enforced.
        const { row, modules } = await sequelize.transaction(async (transaction) => {
            const created = await DimensionCategory.create({
                companyId, name, dimensionNo: dimensionNo ?? null,
                displaySeq: displaySeq ?? null,
                parentCategoryId: parent.parentCategoryId,
                ...ownershipStamps(req, placement),
            }, { transaction });
            await saveModules(req, companyId, created.id, mods.rows, mods.allowed, placement, transaction);
            const saved = await DimensionCategoryModule.findAll({ where: { categoryId: created.id }, transaction });
            return { row: created, modules: saved };
        });
        const names = await moduleNamesById();
        res.status(201).json({
            message: `Dimension '${row.name}' created.`,
            category: categoryDto(row, true, modules.map((m) => moduleRowDto(m, names))),
        });
    } catch (error) {
        console.error('Error creating dimension category:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/dimension/categories/:id - rename freely; dimensionNo changes are
// blocked once documents use the dimension (THE repurpose lock, asked of
// every registered consumer through the gateway).
exports.updateCategory = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await DimensionCategory.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Dimension not found.' });
        if (!(await canModifyRecord(req, row))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }
        const { name, dimensionNo = null, displaySeq = null } = req.body;

        const dup = await DimensionCategory.findOne({ where: { companyId, name, id: { [Op.ne]: row.id } } });
        if (dup) return res.status(409).json({ message: `Dimension '${name}' already exists.` });

        const nextNo = dimensionNo ?? null;
        if (nextNo !== row.dimensionNo) {
            if (row.dimensionNo !== null && (await dimensionInUse({ companyId, categoryId: row.id, dimensionNo: row.dimensionNo }))) {
                return res.status(409).json({ message: `'${row.name}' has documents analysed under Dimension ${row.dimensionNo} - its dimension number can no longer change. Disable it and create a new dimension instead.` });
            }
            const clashErr = await dimensionClashError(companyId, nextNo, row.id);
            if (clashErr) return res.status(409).json({ message: clashErr });
        }

        const mods = await readModules(companyId, nextNo, req.body);
        if (mods.error) return res.status(400).json({ message: mods.error });
        const parent = await readParentCategory(
            companyId, row.id, nextNo, mods.rows.map((r) => r.moduleId), mods.allowed, req.body,
        );
        if (parent.error) return res.status(400).json({ message: parent.error });

        // Repointing (or clearing) the parent invalidates every option link at
        // once - they address options of the OLD parent category. Clear them
        // and say how many, rather than leaving links that resolve to the wrong
        // level. Reparenting a single option, by contrast, touches nothing else
        // and never rewrites history: documents froze both columns at save.
        const parentChanged = (parent.parentCategoryId || null) !== (row.parentCategoryId || null);
        let unlinked = 0;

        const placement = await getCallerPlacement(req);
        const modules = await sequelize.transaction(async (transaction) => {
            Object.assign(row, {
                name, dimensionNo: nextNo, displaySeq: displaySeq ?? null,
                parentCategoryId: parent.parentCategoryId,
                updatedBy: getUserContext(req).userId,
            });
            await row.save({ transaction });
            if (parentChanged) {
                const [, affected] = await DimensionOption.update(
                    { parentOptionId: null, updatedBy: getUserContext(req).userId },
                    { where: { categoryId: row.id, parentOptionId: { [Op.ne]: null } }, transaction },
                );
                unlinked = Array.isArray(affected) ? affected.length : (affected || 0);
            }
            await saveModules(req, companyId, row.id, mods.rows, mods.allowed, placement, transaction);
            return DimensionCategoryModule.findAll({ where: { categoryId: row.id }, transaction });
        });
        const names = await moduleNamesById();
        res.status(200).json({
            message: unlinked
                ? `Dimension '${row.name}' updated. ${unlinked} option(s) unlinked from their previous parent - reassign them before they appear on entry screens.`
                : `Dimension '${row.name}' updated.`,
            category: categoryDto(row, true, modules.map((m) => moduleRowDto(m, names))),
        });
    } catch (error) {
        console.error('Error updating dimension category:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/dimension/categories/:id - enable/disable.
exports.setCategoryActive = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await DimensionCategory.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Dimension not found.' });
        if (!(await canModifyRecord(req, row))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }
        row.isActive = req.body.isActive;
        row.updatedBy = getUserContext(req).userId;
        await row.save();
        const [modules, names] = await Promise.all([
            DimensionCategoryModule.findAll({ where: { categoryId: row.id } }),
            moduleNamesById(),
        ]);
        res.status(200).json({
            message: `Dimension '${row.name}' ${row.isActive ? 'enabled' : 'disabled'}.`,
            category: categoryDto(row, true, modules.map((m) => moduleRowDto(m, names))),
        });
    } catch (error) {
        console.error('Error toggling dimension category:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/dimension/options
exports.createOption = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const { categoryId, code, description = null } = req.body;

        const category = await DimensionCategory.findOne({ where: { id: categoryId, companyId } });
        if (!category) return res.status(404).json({ message: 'Dimension not found.' });
        const dup = await DimensionOption.findOne({ where: { categoryId, code } });
        if (dup) return res.status(409).json({ message: `Option '${code}' already exists under '${category.name}'.` });
        const parentOption = await readParentOption(companyId, category, req.body);
        if (parentOption.error) return res.status(400).json({ message: parentOption.error });

        const placement = await getCallerPlacement(req);
        const row = await DimensionOption.create({
            companyId, categoryId, code, description: description || null,
            parentOptionId: parentOption.parentOptionId,
            ...ownershipStamps(req, placement),
        });
        res.status(201).json({ message: `Option '${row.code}' created.`, option: optionDto(row) });
    } catch (error) {
        console.error('Error creating dimension option:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/dimension/options/:id - edit code/description (documents reference
// the id, so renames never strand history).
exports.updateOption = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await DimensionOption.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Option not found.' });
        if (!(await canModifyRecord(req, row))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }
        const { code, description = null } = req.body;
        const dup = await DimensionOption.findOne({ where: { categoryId: row.categoryId, code, id: { [Op.ne]: row.id } } });
        if (dup) return res.status(409).json({ message: `Option '${code}' already exists under this dimension.` });

        const category = await DimensionCategory.findOne({ where: { id: row.categoryId, companyId } });
        if (!category) return res.status(404).json({ message: 'Dimension not found.' });
        const parentOption = await readParentOption(companyId, category, req.body);
        if (parentOption.error) return res.status(400).json({ message: parentOption.error });

        Object.assign(row, {
            code, description: description || null,
            parentOptionId: parentOption.parentOptionId,
            updatedBy: getUserContext(req).userId,
        });
        await row.save();
        res.status(200).json({ message: `Option '${row.code}' updated.`, option: optionDto(row) });
    } catch (error) {
        console.error('Error updating dimension option:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/dimension/options/:id - enable/disable.
exports.setOptionActive = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const row = await DimensionOption.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Option not found.' });
        if (!(await canModifyRecord(req, row))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }
        row.isActive = req.body.isActive;
        row.updatedBy = getUserContext(req).userId;
        await row.save();
        res.status(200).json({ message: `Option '${row.code}' ${row.isActive ? 'enabled' : 'disabled'}.`, option: optionDto(row) });
    } catch (error) {
        console.error('Error toggling dimension option:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
