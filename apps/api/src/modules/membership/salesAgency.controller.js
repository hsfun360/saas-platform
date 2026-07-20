// Sales Agency master (Membership Management → Sales Management, SRS 2.2).
// The outsourced agency companies a club engages; their staff are SalesAgent
// rows of kind 'agency-staff'.

const SalesAgency = require('./salesAgency.model');
const SalesAgent = require('./salesAgent.model');
const Address = require('./address.model');
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

function addressToDto(row) {
    if (!row) return null;
    return { address: row.address, city: row.city, postcode: row.postcode, state: row.state, countryCode: row.countryCode };
}

// The agency's single office address (a 'company' row in the typed address
// book). An empty street line means "no address" - the row is removed.
function normalizeAddress(raw) {
    if (!raw || typeof raw !== 'object') return { value: null };
    const line = str(raw.address);
    if (!line) return { value: null };
    if (line.length > 255) return { error: 'Address must be 255 characters or fewer.' };
    return {
        value: {
            address: line,
            city: strOrNull(raw.city),
            postcode: strOrNull(raw.postcode),
            state: strOrNull(raw.state),
            countryCode: (strOrNull(raw.countryCode) || '').toLowerCase() || null,
        },
    };
}

async function replaceAgencyAddress(agency, value, stamps) {
    await Address.destroy({ where: { salesAgencyId: agency.id } });
    if (value) {
        await Address.create({
            ...value,
            addressType: 'company',
            salesAgencyId: agency.id,
            companyId: agency.companyId,
            ...stamps,
        });
    }
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
        const [counts, addresses] = await Promise.all([
            SalesAgent.count({
                where: { companyId, salesAgencyId: rows.map((r) => r.id) },
                group: ['salesAgencyId'],
            }),
            Address.findAll({ where: { salesAgencyId: rows.map((r) => r.id) } }),
        ]);
        const countByAgency = new Map(counts.map((c) => [c.salesAgencyId, Number(c.count)]));
        const addressByAgency = new Map(addresses.map((a) => [a.salesAgencyId, a]));
        const flags = await annotateCanModify(req, rows);
        res.status(200).json(rows.map((r, i) => toDto(r, {
            canModify: flags[i],
            agentCount: countByAgency.get(r.id) || 0,
            address: addressToDto(addressByAgency.get(r.id)),
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
        const parsedAddr = normalizeAddress(req.body.address);
        if (parsedAddr.error) return res.status(400).json({ message: parsedAddr.error });

        const existing = await SalesAgency.findOne({ where: { companyId, agencyCode: v.agencyCode } });
        if (existing) return res.status(409).json({ message: `Agency '${v.agencyCode}' already exists.` });

        const placement = await getCallerPlacement(req);
        const callerId = getUserContext(req).userId;
        const stamps = { createdBy: callerId, createdByDepartmentId: placement.departmentId, updatedBy: callerId };
        const row = await SalesAgency.create({ companyId, ...v, ...stamps });
        await replaceAgencyAddress(row, parsedAddr.value, stamps);
        res.status(201).json({ message: `Agency '${row.agencyCode}' created.`, agency: toDto(row, { canModify: true, agentCount: 0, address: parsedAddr.value }) });
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
        const parsedAddr = normalizeAddress(req.body.address);
        if (parsedAddr.error) return res.status(400).json({ message: parsedAddr.error });

        if (v.agencyCode !== row.agencyCode) {
            const clash = await SalesAgency.findOne({ where: { companyId, agencyCode: v.agencyCode } });
            if (clash) return res.status(409).json({ message: `Agency '${v.agencyCode}' already exists.` });
        }

        const placement = await getCallerPlacement(req);
        const callerId = getUserContext(req).userId;
        Object.assign(row, v);
        row.updatedBy = callerId;
        await row.save();
        await replaceAgencyAddress(row, parsedAddr.value, {
            createdBy: callerId,
            createdByDepartmentId: placement.departmentId,
            updatedBy: callerId,
        });
        res.status(200).json({ message: `Agency '${row.agencyCode}' updated.`, agency: toDto(row, { canModify: true, address: parsedAddr.value }) });
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
