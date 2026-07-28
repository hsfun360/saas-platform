// Membership import (Excel -> staging -> selective migration). See
// membershipImport.service.js for the parsing/validation/migration rules.

const ExcelJS = require('exceljs');
const numberingGateway = require('../../platform/numberingGateway');
const {
    getUserContext,
    getCallerPlacement,
} = require('../../platform/serviceContext');
const MembershipImportBatch = require('./membershipImportBatch.model');
const MembershipImportRow = require('./membershipImportRow.model');
const service = require('./membershipImport.service');

function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

async function stampsOf(req) {
    const placement = await getCallerPlacement(req);
    const callerId = getUserContext(req).userId;
    return { createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId };
}

// GET /api/membership/imports/template - the blank two-sheet workbook.
exports.downloadTemplate = async (req, res) => {
    try {
        const buffer = await service.buildTemplate();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="membership-import-template.xlsx"');
        res.status(200).send(Buffer.from(buffer));
    } catch (error) {
        console.error('Error building import template:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/membership/imports (multipart, field "file") - parse, stage,
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
        const { memberships, members } = parsed;
        if (memberships.length === 0) {
            return res.status(400).json({ message: 'The Memberships sheet has no data rows.' });
        }

        const lookups = await service.loadLookups(companyId);
        const numberingMode = await numberingGateway.getMode(req, 'membership');
        await service.validateStagedRows(companyId, memberships, members, lookups, numberingMode);

        const stamps = await stampsOf(req);
        const batch = await MembershipImportBatch.create({
            companyId,
            fileName: (req.file.originalname || 'import.xlsx').slice(0, 255),
            totalMemberships: memberships.length,
            totalMembers: members.length,
            ...stamps,
        });
        const toRow = (r, rowKind) => ({
            batchId: batch.id,
            companyId,
            rowKind,
            rowNo: r.rowNo,
            membershipNo: (r.data.membershipNo || '').slice(0, 30) || null,
            memberNo: (r.data.memberNo || '').slice(0, 30) || null,
            parentMemberNo: (r.data.parentMemberNo || '').slice(0, 30) || null,
            data: r.data,
            issues: r.issues,
            isValid: r.isValid,
            ...stamps,
        });
        await MembershipImportRow.bulkCreate([
            ...memberships.map((r) => toRow(r, 'membership')),
            ...members.map((r) => toRow(r, 'member')),
        ]);

        const detail = await loadBatchDetail(companyId, batch.id);
        res.status(201).json({ message: `Staged ${memberships.length} membership(s) and ${members.length} member(s).`, batch: detail });
    } catch (error) {
        console.error('Error uploading membership import:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

function toBatchDto(b) {
    return {
        id: b.id,
        fileName: b.fileName,
        totalMemberships: b.totalMemberships,
        totalMembers: b.totalMembers,
        createdAt: b.createdAt,
    };
}

function toRowDto(r) {
    return {
        id: r.id,
        rowKind: r.rowKind,
        rowNo: r.rowNo,
        membershipNo: r.membershipNo,
        memberNo: r.memberNo,
        parentMemberNo: r.parentMemberNo,
        data: r.data,
        issues: r.issues,
        isValid: r.isValid,
        migrateStatus: r.migrateStatus,
        migratedAt: r.migratedAt,
    };
}

async function loadBatchDetail(companyId, batchId) {
    const batch = await MembershipImportBatch.findOne({ where: { id: batchId, companyId } });
    if (!batch) return null;
    const rows = await MembershipImportRow.findAll({
        where: { batchId: batch.id },
        order: [['rowKind', 'DESC'], ['rowNo', 'ASC']], // memberships first
    });
    // Group per membership: the contract row + its member rows.
    const groups = [];
    const byNo = new Map();
    for (const r of rows.filter((x) => x.rowKind === 'membership')) {
        const g = { membership: toRowDto(r), members: [] };
        groups.push(g);
        if (r.membershipNo) byNo.set(r.membershipNo.toLowerCase(), g);
    }
    const orphans = [];
    for (const r of rows.filter((x) => x.rowKind === 'member')) {
        const g = r.membershipNo ? byNo.get(r.membershipNo.toLowerCase()) : null;
        if (g) g.members.push(toRowDto(r));
        else orphans.push(toRowDto(r));
    }
    return { ...toBatchDto(batch), groups, orphans };
}

// GET /api/membership/imports - the company's batches, newest first.
exports.listBatches = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const batches = await MembershipImportBatch.findAll({ where: { companyId }, order: [['createdAt', 'DESC']] });

        // Per-batch progress counts (memberships migrated / valid / total).
        const rows = await MembershipImportRow.findAll({
            where: { batchId: batches.map((b) => b.id), rowKind: 'membership' },
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
            validMemberships: (stats.get(b.id) || {}).valid || 0,
            migratedMemberships: (stats.get(b.id) || {}).migrated || 0,
        })));
    } catch (error) {
        console.error('Error listing import batches:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/membership/imports/:id - the full grouped review payload.
exports.getBatch = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const detail = await loadBatchDetail(companyId, req.params.id);
        if (!detail) return res.status(404).json({ message: 'Import batch not found.' });
        res.status(200).json(detail);
    } catch (error) {
        console.error('Error loading import batch:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/membership/imports/:id/migrate  Body: { membershipRowIds: [] }
// Migrates each SELECTED staged membership (with its member rows) in its own
// transaction; one failure never rolls back the others. NO emails are sent.
exports.migrateBatch = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const batch = await MembershipImportBatch.findOne({ where: { id: req.params.id, companyId } });
        if (!batch) return res.status(404).json({ message: 'Import batch not found.' });

        const ids = Array.isArray(req.body.membershipRowIds) ? req.body.membershipRowIds.filter((x) => typeof x === 'string') : [];
        if (!ids.length) return res.status(400).json({ message: 'Select at least one membership to migrate.' });

        const msRows = await MembershipImportRow.findAll({
            where: { id: ids, batchId: batch.id, rowKind: 'membership' },
        });
        const allMembers = await MembershipImportRow.findAll({
            where: { batchId: batch.id, rowKind: 'member' },
        });

        const lookups = await service.loadLookups(companyId);
        const numberingMode = await numberingGateway.getMode(req, 'membership');
        const stamps = await stampsOf(req);
        const callerId = getUserContext(req).userId;

        const results = [];
        for (const msRow of msRows) {
            const label = msRow.membershipNo || `row ${msRow.rowNo}`;
            if (!msRow.isValid) {
                results.push({ membershipNo: label, ok: false, message: 'Row has validation errors.' });
                continue;
            }
            if (msRow.migrateStatus === 'migrated') {
                results.push({ membershipNo: label, ok: false, message: 'Already migrated.' });
                continue;
            }
            const memberRows = msRow.membershipNo
                ? allMembers.filter((m) => (m.membershipNo || '').toLowerCase() === msRow.membershipNo.toLowerCase())
                : [];
            try {
                const out = await service.migrateOne(req, companyId, msRow, memberRows, lookups, numberingMode, stamps, callerId);
                results.push({ membershipNo: out.membershipNo, ok: true, membersCreated: out.membersCreated });
            } catch (err) {
                if (err && err.isMigrationError) {
                    results.push({ membershipNo: label, ok: false, message: err.message });
                } else {
                    console.error(`Import migration failed for ${label}:`, err);
                    results.push({ membershipNo: label, ok: false, message: 'Unexpected error - see server logs.' });
                }
            }
        }

        const okCount = results.filter((r) => r.ok).length;
        const detail = await loadBatchDetail(companyId, batch.id);
        res.status(200).json({
            message: `Migrated ${okCount} of ${results.length} selected membership(s).`,
            results,
            batch: detail,
        });
    } catch (error) {
        console.error('Error migrating import batch:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/membership/imports/:id - drop the staging batch (cascade rows).
// Real Membership/Member rows are NEVER touched.
exports.deleteBatch = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });
        const batch = await MembershipImportBatch.findOne({ where: { id: req.params.id, companyId } });
        if (!batch) return res.status(404).json({ message: 'Import batch not found.' });
        await batch.destroy();
        res.status(200).json({ message: `Import batch '${batch.fileName}' deleted (staging only).` });
    } catch (error) {
        console.error('Error deleting import batch:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
