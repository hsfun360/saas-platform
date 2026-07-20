// Sales Agent master (Membership Management → Sales Management, SRS 2.2).
// Every salesperson - agency staff, external freelancer or internal sales
// staff - with an invite-to-login flow onto the /agent portal.

const SalesAgent = require('./salesAgent.model');
const SalesAgency = require('./salesAgency.model');
const {
    getUserContext,
    getCallerPlacement,
    getActiveCompany,
    canModifyRecord,
    annotateCanModify,
} = require('../../platform/serviceContext');
const { enqueueEmail } = require('../notification/emailOutbox');
const { AGENT_KINDS, AGENT_KIND_KEYS } = require('./salesAgent.constants');
const { signAgentRegistrationToken } = require('./agentPortal.controller');
const { getSettings, enabledAgentKinds } = require('./membershipSetting.service');

const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'http://localhost:4200';

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

function dateOrNull(v) {
    const s = str(v);
    if (!s) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
    return s;
}

function toDto(a, extra = {}) {
    return {
        id: a.id,
        agentCode: a.agentCode,
        name: a.name,
        agentKind: a.agentKind,
        salesAgencyId: a.salesAgencyId,
        identityNo: a.identityNo,
        phone: a.phone,
        mobile: a.mobile,
        email: a.email,
        joinedDate: a.joinedDate,
        leftDate: a.leftDate,
        isActive: a.isActive,
        // The portal link state, never the raw id: the screen shows
        // "portal linked" and offers Invite / Re-invite off this.
        portalLinked: !!a.userId,
        remarks: a.remarks,
        ...extra,
    };
}

async function normalizeBody(req, body, companyId) {
    const agentCode = str(body.agentCode);
    if (!agentCode) return { error: 'Agent code is required.' };
    if (agentCode.length > 30) return { error: 'Agent code must be 30 characters or fewer.' };

    const name = str(body.name);
    if (!name) return { error: 'Name is required.' };

    const agentKind = str(body.agentKind);
    if (!AGENT_KIND_KEYS.includes(agentKind)) return { error: 'Select a valid agent kind.' };

    const email = str(body.email);
    if (!email) return { error: 'Email is required (it receives the login invitation).' };

    let salesAgencyId = strOrNull(body.salesAgencyId);
    if (agentKind === 'agency-staff') {
        if (!salesAgencyId) return { error: 'Select the agency this staff member belongs to.' };
        const agency = await SalesAgency.findOne({ where: { id: salesAgencyId, companyId } });
        if (!agency) return { error: 'Agency not found.' };
        if (!agency.isActive) return { error: `Agency '${agency.agencyCode}' is disabled.` };
    } else {
        salesAgencyId = null; // only agency staff carry an agency
    }

    const joinedDate = dateOrNull(body.joinedDate);
    if (joinedDate === undefined) return { error: 'Joined date must be a valid date (YYYY-MM-DD).' };
    const leftDate = dateOrNull(body.leftDate);
    if (leftDate === undefined) return { error: 'Left date must be a valid date (YYYY-MM-DD).' };
    if (joinedDate && leftDate && leftDate < joinedDate) return { error: 'Left date must be after the joined date.' };

    return {
        value: {
            agentCode,
            name,
            agentKind,
            salesAgencyId,
            identityNo: strOrNull(body.identityNo),
            phone: strOrNull(body.phone),
            mobile: strOrNull(body.mobile),
            email,
            joinedDate,
            leftDate,
            remarks: strOrNull(body.remarks),
        },
    };
}

// GET /api/membership/sales-agents/meta - kinds + the agency picker.
exports.getMeta = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const [agencies, settings] = await Promise.all([
            SalesAgency.findAll({
                where: { companyId },
                attributes: ['id', 'agencyCode', 'agencyName', 'isActive'],
                order: [['agencyCode', 'ASC']],
            }),
            getSettings(companyId),
        ]);
        // Club Specification narrows the offered kinds; existing rows of a
        // now-disabled kind still list/edit fine - only NEW picks are limited.
        const kindKeys = enabledAgentKinds(settings);
        res.status(200).json({
            agentKinds: AGENT_KINDS.filter((k) => kindKeys.includes(k.key)),
            agencies: agencies.map((a) => ({ id: a.id, agencyCode: a.agencyCode, agencyName: a.agencyName, isActive: a.isActive })),
            settings,
        });
    } catch (error) {
        console.error('Error loading sales agent meta:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/membership/sales-agents?kind= - every agent (optionally one kind).
exports.list = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const where = { companyId };
        const kind = str(req.query.kind);
        if (kind && AGENT_KIND_KEYS.includes(kind)) where.agentKind = kind;

        const rows = await SalesAgent.findAll({ where, order: [['agentCode', 'ASC']] });
        const flags = await annotateCanModify(req, rows);
        res.status(200).json(rows.map((r, i) => toDto(r, { canModify: flags[i] })));
    } catch (error) {
        console.error('Error listing sales agents:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/membership/sales-agents
exports.create = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const parsed = await normalizeBody(req, req.body, companyId);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;

        const existing = await SalesAgent.findOne({ where: { companyId, agentCode: v.agentCode } });
        if (existing) return res.status(409).json({ message: `Agent '${v.agentCode}' already exists.` });

        const placement = await getCallerPlacement(req);
        const callerId = getUserContext(req).userId;
        const row = await SalesAgent.create({
            companyId,
            ...v,
            createdBy: callerId,
            createdByDepartmentId: placement.departmentId,
            updatedBy: callerId,
        });
        res.status(201).json({ message: `Agent '${row.agentCode}' created.`, agent: toDto(row, { canModify: true }) });
    } catch (error) {
        console.error('Error creating sales agent:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/membership/sales-agents/:id
exports.update = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const row = await SalesAgent.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Agent not found.' });
        if (!(await canModifyRecord(req, row))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }

        const parsed = await normalizeBody(req, req.body, companyId);
        if (parsed.error) return res.status(400).json({ message: parsed.error });
        const v = parsed.value;

        if (v.agentCode !== row.agentCode) {
            const clash = await SalesAgent.findOne({ where: { companyId, agentCode: v.agentCode } });
            if (clash) return res.status(409).json({ message: `Agent '${v.agentCode}' already exists.` });
        }

        Object.assign(row, v);
        row.updatedBy = getUserContext(req).userId;
        await row.save();
        res.status(200).json({ message: `Agent '${row.agentCode}' updated.`, agent: toDto(row, { canModify: true }) });
    } catch (error) {
        console.error('Error updating sales agent:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/membership/sales-agents/:id - toggle isActive only.
exports.setActive = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const row = await SalesAgent.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Agent not found.' });
        if (!(await canModifyRecord(req, row))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }

        if (typeof req.body.isActive === 'boolean') {
            row.isActive = req.body.isActive;
            row.updatedBy = getUserContext(req).userId;
            await row.save();
        }
        res.status(200).json({ message: `Agent '${row.agentCode}' updated.`, agent: toDto(row, { canModify: true }) });
    } catch (error) {
        console.error('Error updating sales agent:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/membership/sales-agents/:id/invite - send (or re-send) the login
// invitation email carrying the signed registration link.
exports.invite = async (req, res) => {
    try {
        const companyId = companyIdOf(req);
        if (!companyId) return res.status(400).json({ message: 'Select a workspace first.' });

        const row = await SalesAgent.findOne({ where: { id: req.params.id, companyId } });
        if (!row) return res.status(404).json({ message: 'Agent not found.' });
        if (!(await canModifyRecord(req, row))) {
            return res.status(403).json({ message: "Your role's data scope does not allow amending this record." });
        }
        if (row.userId) return res.status(400).json({ message: 'This agent is already registered for the portal.' });
        if (!row.isActive) return res.status(400).json({ message: 'Enable the agent before inviting them.' });

        const company = await getActiveCompany(req);
        const agency = row.salesAgencyId
            ? await SalesAgency.findByPk(row.salesAgencyId, { attributes: ['agencyName'] })
            : null;
        const link = `${FRONTEND_BASE_URL}/agent/register?token=${signAgentRegistrationToken(row)}`;
        const queued = await enqueueEmail({
            templateKey: 'sales-agent.invite',
            accountId: company ? company.accountId : null,
            companyId,
            to: row.email,
            data: {
                email: row.email,
                agentName: row.name,
                agentCode: row.agentCode,
                companyName: company ? company.name : null,
                agencyName: agency ? agency.agencyName : null,
                portalRegisterLink: link,
            },
        });
        if (!queued) return res.status(400).json({ message: 'The invitation email template is disabled.' });
        res.status(200).json({ message: `Invitation sent to ${row.email}.` });
    } catch (error) {
        console.error('Error inviting sales agent:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
