// Dimension Setup (shared financial-analysis capability, promoted 2026-08-25;
// hybrid design locked in the same day). Categories = the company's analysis
// dimensions ('Department', 'Project', ...), each optionally assigned to one
// of six document slots; Options = the selectable values, referenced by
// consuming documents BY ID. Enable/disable only, no deletes; the
// slot-repurpose lock (via the gateway's registered consumer usage checks)
// keeps a used slot's meaning stable.

const DimensionCategory = require('./dimensionCategory.model');
const DimensionOption = require('./dimensionOption.model');
const { slotInUse } = require('../../platform/dimensionGateway');
const {
    getUserContext,
    getCallerPlacement,
    canModifyRecord,
    annotateCanModify,
} = require('../../platform/serviceContext');
const { validate, fields, z } = require('../../platform/validate');

function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

function ownershipStamps(req, placement) {
    const callerId = getUserContext(req).userId;
    return { createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId };
}

function categoryDto(c, canModify = true) {
    return {
        id: c.id,
        canModify,
        name: c.name,
        slotNo: c.slotNo,
        isRequired: c.isRequired === true,
        isActive: c.isActive,
    };
}

function optionDto(o, canModify = true) {
    return {
        id: o.id,
        canModify,
        categoryId: o.categoryId,
        code: o.code,
        description: o.description,
        isActive: o.isActive,
    };
}

// --- Zod schemas (boundary validation; unknown keys stripped) ---
const categoryBody = z.object({
    name: fields.requiredText(100),
    slotNo: z.union([z.null(), z.coerce.number().int().min(1).max(6)]).optional(),
    isRequired: z.boolean().optional(),
});
const optionBody = z.object({
    categoryId: fields.uuid,
    code: fields.requiredText(30),
    description: fields.optionalText(255),
});
const optionEditBody = z.object({
    code: fields.requiredText(30),
    description: fields.optionalText(255),
});
const activeBody = z.object({ isActive: z.boolean() });
const idParams = z.object({ id: fields.uuid });

exports.validateCategoryCreate = validate({ body: categoryBody });
exports.validateCategoryUpdate = validate({ params: idParams, body: categoryBody });
exports.validateOptionCreate = validate({ body: optionBody });
exports.validateOptionUpdate = validate({ params: idParams, body: optionEditBody });
exports.validateSetActive = validate({ params: idParams, body: activeBody });

// GET /api/dimension - the whole setup (categories + options) in one read.
exports.list = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const [categories, options] = await Promise.all([
            DimensionCategory.findAll({ where: { companyId }, order: [['name', 'ASC']] }),
            DimensionOption.findAll({ where: { companyId }, order: [['code', 'ASC']] }),
        ]);
        const [catFlags, optFlags] = await Promise.all([
            annotateCanModify(req, categories),
            annotateCanModify(req, options),
        ]);
        res.status(200).json({
            categories: categories.map((c, i) => categoryDto(c, catFlags[i])),
            options: options.map((o, i) => optionDto(o, optFlags[i])),
        });
    } catch (error) {
        console.error('Error listing dimension setup:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Slot uniqueness pre-check (the partial unique index is the backstop).
async function slotClashError(companyId, slotNo, ignoreId = null) {
    if (slotNo === null || slotNo === undefined) return null;
    const { Op } = require('sequelize');
    const clash = await DimensionCategory.findOne({
        where: { companyId, slotNo, ...(ignoreId ? { id: { [Op.ne]: ignoreId } } : {}) },
        attributes: ['name'],
    });
    return clash ? `Slot ${slotNo} is already assigned to '${clash.name}'.` : null;
}

// POST /api/dimension/categories
exports.createCategory = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const { name, slotNo = null, isRequired = false } = req.body;

        const dup = await DimensionCategory.findOne({ where: { companyId, name } });
        if (dup) return res.status(409).json({ message: `Dimension '${name}' already exists.` });
        const slotErr = await slotClashError(companyId, slotNo);
        if (slotErr) return res.status(409).json({ message: slotErr });

        const placement = await getCallerPlacement(req);
        const row = await DimensionCategory.create({
            companyId, name, slotNo: slotNo ?? null, isRequired: isRequired === true,
            ...ownershipStamps(req, placement),
        });
        res.status(201).json({ message: `Dimension '${row.name}' created.`, category: categoryDto(row) });
    } catch (error) {
        console.error('Error creating dimension category:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/dimension/categories/:id - rename freely; slotNo changes are
// blocked once documents use the slot (THE slot-repurpose lock, asked of
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
        const { name, slotNo = null, isRequired = false } = req.body;

        const { Op } = require('sequelize');
        const dup = await DimensionCategory.findOne({ where: { companyId, name, id: { [Op.ne]: row.id } } });
        if (dup) return res.status(409).json({ message: `Dimension '${name}' already exists.` });

        const nextSlot = slotNo ?? null;
        if (nextSlot !== row.slotNo) {
            if (row.slotNo !== null && (await slotInUse({ companyId, categoryId: row.id, slotNo: row.slotNo }))) {
                return res.status(409).json({ message: `'${row.name}' has documents analysed under slot ${row.slotNo} - its slot can no longer change. Disable it and create a new dimension instead.` });
            }
            const slotErr = await slotClashError(companyId, nextSlot, row.id);
            if (slotErr) return res.status(409).json({ message: slotErr });
        }

        Object.assign(row, { name, slotNo: nextSlot, isRequired: isRequired === true, updatedBy: getUserContext(req).userId });
        await row.save();
        res.status(200).json({ message: `Dimension '${row.name}' updated.`, category: categoryDto(row) });
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
        res.status(200).json({ message: `Dimension '${row.name}' ${row.isActive ? 'enabled' : 'disabled'}.`, category: categoryDto(row) });
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

        const placement = await getCallerPlacement(req);
        const row = await DimensionOption.create({
            companyId, categoryId, code, description: description || null,
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
        const { Op } = require('sequelize');
        const dup = await DimensionOption.findOne({ where: { categoryId: row.categoryId, code, id: { [Op.ne]: row.id } } });
        if (dup) return res.status(409).json({ message: `Option '${code}' already exists under this dimension.` });

        Object.assign(row, { code, description: description || null, updatedBy: getUserContext(req).userId });
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
