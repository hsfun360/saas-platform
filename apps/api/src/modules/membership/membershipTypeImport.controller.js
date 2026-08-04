// Membership Type import (Excel -> staging -> selective migration). See
// membershipTypeImport.service.js for the parsing/validation/migration rules.

const ExcelJS = require('exceljs');
const {
    getUserContext,
    getCallerPlacement,
} = require('../../platform/serviceContext');
const MembershipTypeImportBatch = require('./membershipTypeImportBatch.model');
const MembershipTypeImportRow = require('./membershipTypeImportRow.model');
const service = require('./membershipTypeImport.service');

function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

async function stampsOf(req) {
    const placement = await getCallerPlacement(req);
    const callerId = getUserContext(req).userId;
    return { createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId };
}

// GET /api/membership/type-imports/template - the blank one-sheet workbook.
exports.downloadTemplate = async (req, res) => {
    try {
        const buffer = await service.buildTemplate();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="membership-type-import-template.xlsx"');
        res.status(200).send(Buffer.from(buffer));
    } catch (error) {
        console.error('Error building type import template:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/membership/type-imports (multipart, field "file") - parse, stage,
// validate. Returns the staged batch in full so the review starts instantly.
exports.uploadBatch = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        if (!req.file) return res.status(400).json({ message: 'No file uploaded.' });

        const wb = new ExcelJS.Workbook();
        try {
            await wb.xlsx.load(req.file.buffer);
        } catch {
            return res.status(400).json({ message: 'The file could not be read as an .xlsx workbook.' });
        }

        const parsed = service.parseWorkbookRows(wb);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const { types } = parsed;
        if (types.length === 0) {
            return res.status(400).json({ message: "The 'Membership Types' sheet has no data rows." });
        }

        const lookups = await service.loadLookups(companyId);
        service.validateStagedRows(types, lookups);

        const stamps = await stampsOf(req);
        const batch = await MembershipTypeImportBatch.create({
            companyId,
            fileName: (req.file.originalname || 'import.xlsx').slice(0, 255),
            totalTypes: types.length,
            ...stamps,
        });
        await MembershipTypeImportRow.bulkCreate(types.map((r) => ({
            batchId: batch.id,
            companyId,
            rowNo: r.rowNo,
            category: (r.data.category || '').slice(0, 50) || null,
            data: r.data,
            issues: r.issues,
            isValid: r.isValid,
            ...stamps,
        })));

        const detail = await loadBatchDetail(companyId, batch.id);
        res.status(201).json({ message: `Staged ${types.length} membership type(s).`, batch: detail });
    } catch (error) {
        console.error('Error uploading membership type import:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

function toBatchDto(b) {
    return {
        id: b.id,
        fileName: b.fileName,
        totalTypes: b.totalTypes,
        createdAt: b.createdAt,
    };
}

function toRowDto(r) {
    return {
        id: r.id,
        rowNo: r.rowNo,
        category: r.category,
        data: r.data,
        issues: r.issues,
        isValid: r.isValid,
        migrateStatus: r.migrateStatus,
        migratedAt: r.migratedAt,
    };
}

async function loadBatchDetail(companyId, batchId) {
    const batch = await MembershipTypeImportBatch.findOne({ where: { id: batchId, companyId } });
    if (!batch) return null;
    const rows = await MembershipTypeImportRow.findAll({
        where: { batchId: batch.id },
        order: [['rowNo', 'ASC']],
    });
    return { ...toBatchDto(batch), rows: rows.map(toRowDto) };
}

// GET /api/membership/type-imports - the company's batches, newest first.
exports.listBatches = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const batches = await MembershipTypeImportBatch.findAll({ where: { companyId }, order: [['createdAt', 'DESC']] });

        // Per-batch progress counts (types migrated / valid / total).
        const rows = await MembershipTypeImportRow.findAll({
            where: { batchId: batches.map((b) => b.id) },
            attributes: ['batchId', 'isValid', 'migrateStatus'],
        });
        const stats = new Map();
        for (const r of rows) {
            const s = stats.get(r.batchId) || { valid: 0, migrated: 0 };
            if (r.isValid) s.valid += 1;
            if (r.migrateStatus === 'migrated') s.migrated += 1;
            stats.set(r.batchId, s);
        }
        res.status(200).json(batches.map((b) => ({
            ...toBatchDto(b),
            validTypes: (stats.get(b.id) || {}).valid || 0,
            migratedTypes: (stats.get(b.id) || {}).migrated || 0,
        })));
    } catch (error) {
        console.error('Error listing type import batches:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/membership/type-imports/:id - the full review payload.
exports.getBatch = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const detail = await loadBatchDetail(companyId, req.params.id);
        if (!detail) return res.status(404).json({ message: 'Import batch not found.' });
        res.status(200).json(detail);
    } catch (error) {
        console.error('Error loading type import batch:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/membership/type-imports/:id/migrate  Body: { rowIds: [] }
// Migrates each SELECTED staged type in its own transaction; one failure never
// rolls back the others. Nominee/conversion references are linked in a second
// pass once every selected row exists (they may point at other file rows).
exports.migrateBatch = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const batch = await MembershipTypeImportBatch.findOne({ where: { id: req.params.id, companyId } });
        if (!batch) return res.status(404).json({ message: 'Import batch not found.' });

        const ids = Array.isArray(req.body.rowIds) ? req.body.rowIds.filter((x) => typeof x === 'string') : [];
        if (!ids.length) return res.status(400).json({ message: 'Select at least one membership type to migrate.' });

        const selectedRows = await MembershipTypeImportRow.findAll({ where: { id: ids, batchId: batch.id } });
        const allRows = await MembershipTypeImportRow.findAll({ where: { batchId: batch.id } });

        const lookups = await service.loadLookups(companyId);
        const stamps = await stampsOf(req);
        const callerId = getUserContext(req).userId;

        const results = await service.migrateSelected(companyId, selectedRows, allRows, lookups, stamps, callerId);

        const okCount = results.filter((r) => r.ok).length;
        const detail = await loadBatchDetail(companyId, batch.id);
        res.status(200).json({
            message: `Migrated ${okCount} of ${results.length} selected type(s).`,
            results,
            batch: detail,
        });
    } catch (error) {
        console.error('Error migrating type import batch:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/membership/type-imports/:id - drop the staging batch (cascade
// rows). Real MembershipType rows are NEVER touched.
exports.deleteBatch = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const batch = await MembershipTypeImportBatch.findOne({ where: { id: req.params.id, companyId } });
        if (!batch) return res.status(404).json({ message: 'Import batch not found.' });
        await batch.destroy();
        res.status(200).json({ message: `Import batch '${batch.fileName}' deleted (staging only).` });
    } catch (error) {
        console.error('Error deleting type import batch:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
