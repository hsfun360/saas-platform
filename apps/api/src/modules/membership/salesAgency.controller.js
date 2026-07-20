// Sales Agency master (Membership Management → Sales Management, SRS 2.2).
// The outsourced agency companies a club engages; their staff are SalesAgent
// rows of kind 'agency-staff'.

const SalesAgency = require('./salesAgency.model');
const SalesAgent = require('./salesAgent.model');
const {
    getUserContext,
    getCallerPlacement,
    canModifyRecord,
    annotateCanModify,
} = require('../../platform/serviceContext');

function companyIdOf(req) {
    return getUserContext(req).companyId || null;
}

function str(v) {
    return typeof v === 'string' ? v.trim() : '';
}

function strOrNull(v) {
    const s = str(v);
    return s || null;
}

function toDto(a, extra = {}) {
    return {
        id: a.id,
        agencyCode: a.agencyCode,
        agencyName: a.agencyName,
        registrationNo: a.registrationNo,
        contactPerson: a.contactPerson,
        phone: a.phone,
        mobile: a.mobile,
        email: a.email,
        isActive: a.isActive,
        ...extra,
    };
}

function normalizeBody(body) {
    const agencyCode = str(body.agencyCode);
    if (!agencyCode) return { error: 'Agency code is required.' };
    if (agencyCode.length > 30) return { error: 'Agency code must be 30 characters or fewer.' };

    const agencyName = str(body.agencyName);
    if (!agencyName) return { error: 'Agency name is required.' };

    return {
        value: {
            agencyCode,
            agencyName,
            registrationNo: strOrNull(body.registrationNo),
            contactPerson: strOrNull(body.contactPerson),
            phone: strOrNull(body.phone),
            mobile: strOrNull(body.mobile),
            email: strOrNull(body.email),
        },
    };
}

// GET /api/membership/sales-agencies - every agency + its agent headcount.
exports.list = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const rows = await SalesAgency.findAll({ where: { companyId }, order: [['agencyCode', 'ASC']] });
        const counts = await SalesAgent.count({
            where: { companyId, salesAgencyId: rows.map((r) => r.id) },
            group: ['salesAgencyId'],
        });
        const countByAgency = new Map(counts.map((c) => [c.salesAgencyId, Number(c.count)]));
        const flags = await annotateCanModify(req, rows);
        res.status(200).json(rows.map((r, i) => toDto(r, {
            canModify: flags[i],
            agentCount: countByAgency.get(r.id) || 0,
        })));
    } catch (error) {
        console.error('Error listing sales agencies:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/membership/sales-agencies
exports.create = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const parsed = normalizeBody(req.body);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;

        const existing = await SalesAgency.findOne({ where: { companyId, agencyCode: v.agencyCode } });
        if (existing) return res.status(409).json({ message: `Agency '${v.agencyCode}' already exists.` });

        const placement = await getCallerPlacement(req);
        const callerId = getUserContext(req).userId;
        const row = await SalesAgency.create({
            companyId,
            ...v,
            createdBy: callerId,
            createdByDepartmentId: placement.departmentId,
            updatedBy: callerId,
        });
        res.status(201).json({ message: `Agency '${row.agencyCode}' created.`, agency: toDto(row, { canModify: true, agentCount: 0 }) });
    } catch (error) {
        console.error('Error creating sales agency:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/membership/sales-agencies/:id
exports.update = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const row = await SalesAgency.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Agency not found.' });
        if (!(await canModifyRecord(req, row))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }

        const parsed = normalizeBody(req.body);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;

        if (v.agencyCode !== row.agencyCode) {
            const clash = await SalesAgency.findOne({ where: { companyId, agencyCode: v.agencyCode } });
            if (clash) return res.status(409).json({ message: `Agency '${v.agencyCode}' already exists.` });
        }

        Object.assign(row, v);
        row.updatedBy = getUserContext(req).userId;
        await row.save();
        res.status(200).json({ message: `Agency '${row.agencyCode}' updated.`, agency: toDto(row, { canModify: true }) });
    } catch (error) {
        console.error('Error updating sales agency:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/membership/sales-agencies/:id - toggle isActive only.
exports.setActive = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const row = await SalesAgency.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Agency not found.' });
        if (!(await canModifyRecord(req, row))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }

        if (typeof req.body.isActive === 'boolean') {
            row.isActive = req.body.isActive;
            row.updatedBy = getUserContext(req).userId;
            await row.save();
        }
        res.status(200).json({ message: `Agency '${row.agencyCode}' updated.`, agency: toDto(row, { canModify: true }) });
    } catch (error) {
        console.error('Error updating sales agency:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
