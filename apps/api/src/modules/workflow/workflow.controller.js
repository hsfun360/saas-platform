// src/modules/workflow/workflow.controller.js
//
// HTTP surface of the Workflow service: definition designer CRUD (Workflow
// Setup screen), the My Approvals inbox, approve/reject actions, and the
// per-document approval history. Producers do NOT submit documents here - they
// go through platform/workflowGateway.js inside their own transactions.

const { Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const {
    getUserContext,
    getActiveAccountId,
    getCallerPlacement,
    listApproverOptions,
    listSubscriptionCompanies,
    resolveApprovers,
} = require('../../platform/serviceContext');
const WorkflowDefinition = require('./workflowDefinition.model');
const WorkflowStep = require('./workflowStep.model');
const WorkflowInstance = require('./workflowInstance.model');
const WorkflowTask = require('./workflowTask.model');
const engine = require('./workflowEngine');
const {
    PURPOSES,
    PURPOSE_KEYS,
    APPROVER_TYPES,
    APPROVAL_MODES,
    CONDITION_OPS,
} = require('./workflow.constants');

function stepDto(s) {
    return {
        id: s.id,
        stepNo: s.stepNo,
        name: s.name,
        approverType: s.approverType,
        approverRoleId: s.approverRoleId,
        approverDepartmentId: s.approverDepartmentId,
        approverPositionId: s.approverPositionId,
        approverUserId: s.approverUserId,
        approvalMode: s.approvalMode,
        requiredApprovals: s.requiredApprovals,
        condition: s.condition,
        slaHours: s.slaHours,
    };
}

function definitionDto(d, steps) {
    return {
        id: d.id,
        companyId: d.companyId,
        purpose: d.purpose,
        name: d.name,
        description: d.description,
        version: d.version,
        isActive: d.isActive,
        steps: (steps || d.Steps || []).map(stepDto),
    };
}

// Normalize + validate the steps array of a save. Returns { error } or
// { value: [clean rows] } with stepNo re-sequenced 1..n in array order.
function normalizeSteps(rawSteps) {
    if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
        return { error: 'At least one approval step is required.' };
    }
    const clean = [];
    for (let i = 0; i < rawSteps.length; i++) {
        const raw = rawSteps[i] || {};
        const name = String(raw.name || '').trim();
        if (!name) return { error: `Step ${i + 1}: a step name is required.` };

        const approverType = String(raw.approverType || '');
        if (!APPROVER_TYPES.includes(approverType)) {
            return { error: `Step ${i + 1}: invalid approver type.` };
        }
        const row = {
            stepNo: i + 1,
            name,
            approverType,
            approverRoleId: null,
            approverDepartmentId: null,
            approverPositionId: null,
            approverUserId: null,
            approvalMode: 'any',
            requiredApprovals: null,
            condition: null,
            slaHours: null,
        };
        if (approverType === 'role') {
            if (!raw.approverRoleId) return { error: `Step ${i + 1}: pick the approving role.` };
            row.approverRoleId = raw.approverRoleId;
        } else if (approverType === 'department-position') {
            if (!raw.approverDepartmentId) return { error: `Step ${i + 1}: pick the approving department.` };
            row.approverDepartmentId = raw.approverDepartmentId;
            row.approverPositionId = raw.approverPositionId || null;
        } else {
            if (!raw.approverUserId) return { error: `Step ${i + 1}: pick the approving user.` };
            row.approverUserId = raw.approverUserId;
        }

        const mode = String(raw.approvalMode || 'any');
        if (!APPROVAL_MODES.includes(mode)) return { error: `Step ${i + 1}: invalid approval mode.` };
        row.approvalMode = mode;
        if (mode === 'count') {
            const n = Number(raw.requiredApprovals);
            if (!Number.isInteger(n) || n < 1) {
                return { error: `Step ${i + 1}: "count" mode needs how many approvals are required.` };
            }
            row.requiredApprovals = n;
        }

        if (raw.condition) {
            const field = String(raw.condition.field || '').trim();
            const op = String(raw.condition.op || '');
            if (!field) return { error: `Step ${i + 1}: the condition needs a field.` };
            if (!CONDITION_OPS.includes(op)) return { error: `Step ${i + 1}: invalid condition operator.` };
            if (raw.condition.value === undefined || raw.condition.value === null || String(raw.condition.value).trim() === '') {
                return { error: `Step ${i + 1}: the condition needs a value.` };
            }
            row.condition = { field, op, value: raw.condition.value };
        }

        if (raw.slaHours !== undefined && raw.slaHours !== null && String(raw.slaHours).trim() !== '') {
            const sla = Number(raw.slaHours);
            if (!Number.isInteger(sla) || sla < 1) return { error: `Step ${i + 1}: reminder hours must be a whole number of hours.` };
            row.slaHours = sla;
        }
        clean.push(row);
    }
    return { value: clean };
}

// ---- Designer (Workflow Setup screen; gated by /admin/workflows menu) ------

// GET /api/workflow/meta - vocabularies + approver option lists for the screen.
exports.getMeta = async (req, res) => {
    try {
        const [options, companies] = await Promise.all([
            listApproverOptions(req),
            listSubscriptionCompanies(req),
        ]);
        res.status(200).json({
            purposes: PURPOSES,
            approverTypes: APPROVER_TYPES,
            approvalModes: APPROVAL_MODES,
            conditionOps: CONDITION_OPS,
            companies,
            ...options,
        });
    } catch (error) {
        console.error('Error loading workflow meta:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/workflow/definitions - every chain of the caller's account.
exports.listDefinitions = async (req, res) => {
    try {
        const accountId = await getActiveAccountId(req);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });
        const rows = await WorkflowDefinition.findAll({
            where: { accountId },
            include: [{ model: WorkflowStep, as: 'Steps' }],
            order: [['purpose', 'ASC'], ['name', 'ASC'], [{ model: WorkflowStep, as: 'Steps' }, 'stepNo', 'ASC']],
        });
        res.status(200).json(rows.map((d) => definitionDto(d)));
    } catch (error) {
        console.error('Error listing workflow definitions:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/workflow/definitions   Body: { purpose, name, description?, companyId?, isActive?, steps: [...] }
exports.createDefinition = async (req, res) => {
    try {
        const accountId = await getActiveAccountId(req);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });
        const { userId } = getUserContext(req);

        const purpose = String(req.body.purpose || '');
        if (!PURPOSE_KEYS.includes(purpose)) return res.status(400).json({ message: 'Invalid workflow purpose.' });
        const name = String(req.body.name || '').trim();
        if (!name) return res.status(400).json({ message: 'A workflow name is required.' });

        let companyId = req.body.companyId || null;
        if (companyId) {
            const companies = await listSubscriptionCompanies(req);
            if (!companies.some((c) => c.id === companyId)) {
                return res.status(400).json({ message: 'That company is not part of your subscription.' });
            }
        }

        const steps = normalizeSteps(req.body.steps);
        if (steps.error) return res.status(400).json({ message: steps.error });

        const clash = await WorkflowDefinition.findOne({ where: { accountId, purpose, companyId } });
        if (clash) {
            return res.status(409).json({ message: 'A workflow for this document type already exists for that scope. Edit it instead.' });
        }

        const placement = await getCallerPlacement(req);
        const created = await sequelize.transaction(async (transaction) => {
            const def = await WorkflowDefinition.create({
                accountId,
                companyId,
                purpose,
                name,
                description: String(req.body.description || '').trim() || null,
                isActive: req.body.isActive !== false,
                createdBy: userId,
                createdByDepartmentId: placement.departmentId,
                updatedBy: userId,
            }, { transaction });
            await WorkflowStep.bulkCreate(steps.value.map((s) => ({
                ...s,
                definitionId: def.id,
                createdBy: userId,
                createdByDepartmentId: placement.departmentId,
                updatedBy: userId,
            })), { transaction });
            return def;
        });

        const withSteps = await WorkflowStep.findAll({ where: { definitionId: created.id }, order: [['stepNo', 'ASC']] });
        res.status(201).json({ message: 'Workflow created.', definition: definitionDto(created, withSteps) });
    } catch (error) {
        console.error('Error creating workflow definition:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PATCH /api/workflow/definitions/:id - edit in place; running instances keep
// their snapshot. Any change (fields or steps) bumps `version`.
exports.updateDefinition = async (req, res) => {
    try {
        const accountId = await getActiveAccountId(req);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });
        const { userId } = getUserContext(req);

        const def = await WorkflowDefinition.findOne({ where: { id: req.params.id, accountId } });
        if (!def) return res.status(404).json({ message: 'Workflow not found.' });

        if (typeof req.body.name === 'string') {
            const name = req.body.name.trim();
            if (!name) return res.status(400).json({ message: 'A workflow name is required.' });
            def.name = name;
        }
        if (req.body.description !== undefined) {
            def.description = String(req.body.description || '').trim() || null;
        }
        if (typeof req.body.isActive === 'boolean') def.isActive = req.body.isActive;
        if (req.body.companyId !== undefined) {
            const companyId = req.body.companyId || null;
            if (companyId) {
                const companies = await listSubscriptionCompanies(req);
                if (!companies.some((c) => c.id === companyId)) {
                    return res.status(400).json({ message: 'That company is not part of your subscription.' });
                }
            }
            if (companyId !== def.companyId) {
                const clash = await WorkflowDefinition.findOne({
                    where: { accountId, purpose: def.purpose, companyId, id: { [Op.ne]: def.id } },
                });
                if (clash) return res.status(409).json({ message: 'A workflow for this document type already exists for that scope.' });
                def.companyId = companyId;
            }
        }

        let steps = null;
        if (req.body.steps !== undefined) {
            steps = normalizeSteps(req.body.steps);
            if (steps.error) return res.status(400).json({ message: steps.error });
        }

        const placement = await getCallerPlacement(req);
        await sequelize.transaction(async (transaction) => {
            def.version += 1;
            def.updatedBy = userId;
            await def.save({ transaction });
            if (steps) {
                await WorkflowStep.destroy({ where: { definitionId: def.id }, transaction });
                await WorkflowStep.bulkCreate(steps.value.map((s) => ({
                    ...s,
                    definitionId: def.id,
                    createdBy: userId,
                    createdByDepartmentId: placement.departmentId,
                    updatedBy: userId,
                })), { transaction });
            }
        });

        const withSteps = await WorkflowStep.findAll({ where: { definitionId: def.id }, order: [['stepNo', 'ASC']] });
        res.status(200).json({ message: 'Workflow updated.', definition: definitionDto(def, withSteps) });
    } catch (error) {
        console.error('Error updating workflow definition:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/workflow/definitions/:id/preview - the chain with approver rules
// resolved to today's people in the CALLER'S active company, so the designer
// shows exactly who would receive each step (show-expected-results).
exports.previewDefinition = async (req, res) => {
    try {
        const accountId = await getActiveAccountId(req);
        const { companyId } = getUserContext(req);
        if (!accountId) return res.status(404).json({ message: 'Your account could not be resolved.' });

        const def = await WorkflowDefinition.findOne({
            where: { id: req.params.id, accountId },
            include: [{ model: WorkflowStep, as: 'Steps' }],
            order: [[{ model: WorkflowStep, as: 'Steps' }, 'stepNo', 'ASC']],
        });
        if (!def) return res.status(404).json({ message: 'Workflow not found.' });

        const steps = [];
        for (const s of def.Steps) {
            const approvers = companyId ? await resolveApprovers(companyId, s) : [];
            steps.push({
                stepNo: s.stepNo,
                name: s.name,
                approvalMode: s.approvalMode,
                requiredApprovals: s.requiredApprovals,
                condition: s.condition,
                slaHours: s.slaHours,
                approvers: approvers.map((a) => a.name),
            });
        }
        res.status(200).json({ definitionName: def.name, version: def.version, steps });
    } catch (error) {
        console.error('Error previewing workflow definition:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---- My Approvals (any authenticated workspace user) -----------------------

// GET /api/workflow/my-tasks - the caller's pending tasks in the active company.
exports.listMyTasks = async (req, res) => {
    try {
        const { userId, companyId } = getUserContext(req);
        if (!companyId) return res.status(200).json([]);

        const tasks = await WorkflowTask.findAll({
            where: { assigneeUserId: userId, companyId, status: 'pending' },
            include: [{ model: WorkflowInstance, as: 'Instance' }],
            order: [['createdAt', 'ASC']],
        });

        // Submitter names in one batch (identity lookup, plain UUID reference).
        const User = require('../identity/user.model');
        const submitterIds = [...new Set(tasks.map((t) => t.Instance?.createdBy).filter(Boolean))];
        const submitters = submitterIds.length
            ? await User.findAll({ where: { id: submitterIds }, attributes: ['id', 'full_name', 'email'] })
            : [];
        const nameById = new Map(submitters.map((u) => [u.id, u.full_name || u.email]));

        const purposeName = new Map(PURPOSES.map((p) => [p.key, p.name]));
        res.status(200).json(tasks.map((t) => ({
            id: t.id,
            stepNo: t.stepNo,
            stepName: t.stepName,
            dueAt: t.dueAt,
            createdAt: t.createdAt,
            instanceId: t.instanceId,
            purpose: t.Instance?.purpose,
            purposeName: purposeName.get(t.Instance?.purpose) || t.Instance?.purpose,
            entityType: t.Instance?.entityType,
            entityId: t.Instance?.entityId,
            entityLabel: t.Instance?.entityLabel,
            context: t.Instance?.context || {},
            submittedBy: nameById.get(t.Instance?.createdBy) || null,
            submittedAt: t.Instance?.createdAt,
        })));
    } catch (error) {
        console.error('Error listing my workflow tasks:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/workflow/my-tasks/count - badge for My Dashboard.
exports.countMyTasks = async (req, res) => {
    try {
        const { userId, companyId } = getUserContext(req);
        if (!companyId) return res.status(200).json({ count: 0 });
        const count = await WorkflowTask.count({
            where: { assigneeUserId: userId, companyId, status: 'pending' },
        });
        res.status(200).json({ count });
    } catch (error) {
        console.error('Error counting my workflow tasks:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/workflow/tasks/:id/approve | /reject   Body: { comment? }
exports.actOnTask = (decision) => async (req, res) => {
    try {
        const { userId } = getUserContext(req);
        const result = await engine.actOnTask({
            taskId: req.params.id,
            userId,
            decision,
            comment: req.body.comment,
        });
        if (result.error) {
            const status = result.notFound ? 404 : result.forbidden ? 403 : result.stale ? 409 : 400;
            return res.status(status).json({ message: result.error });
        }
        res.status(200).json({
            message: decision === 'approved' ? 'Approved.' : 'Rejected.',
            instanceStatus: result.instance.status,
            currentStepNo: result.instance.currentStepNo,
        });
    } catch (error) {
        console.error('Error acting on workflow task:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ---- Document history (any authenticated workspace user) -------------------

// GET /api/workflow/instances?entityType=&entityId= - every approval run of a
// document (newest first) with its full task trail, for the document screen's
// approval-history panel.
exports.listEntityInstances = async (req, res) => {
    try {
        const accountId = await getActiveAccountId(req);
        if (!accountId) return res.status(200).json([]);
        const entityType = String(req.query.entityType || '');
        const entityId = String(req.query.entityId || '');
        if (!entityType || !entityId) return res.status(400).json({ message: 'entityType and entityId are required.' });

        const instances = await WorkflowInstance.findAll({
            where: { accountId, entityType, entityId },
            include: [{ model: WorkflowTask, as: 'Tasks' }],
            order: [['createdAt', 'DESC'], [{ model: WorkflowTask, as: 'Tasks' }, 'stepNo', 'ASC'], [{ model: WorkflowTask, as: 'Tasks' }, 'createdAt', 'ASC']],
        });

        const User = require('../identity/user.model');
        const userIds = new Set();
        for (const inst of instances) {
            if (inst.createdBy) userIds.add(inst.createdBy);
            for (const t of inst.Tasks) userIds.add(t.assigneeUserId);
        }
        const users = userIds.size
            ? await User.findAll({ where: { id: [...userIds] }, attributes: ['id', 'full_name', 'email'] })
            : [];
        const nameById = new Map(users.map((u) => [u.id, u.full_name || u.email]));

        res.status(200).json(instances.map((inst) => ({
            id: inst.id,
            status: inst.status,
            purpose: inst.purpose,
            entityLabel: inst.entityLabel,
            definitionVersion: inst.definitionVersion,
            currentStepNo: inst.currentStepNo,
            submittedBy: nameById.get(inst.createdBy) || null,
            submittedAt: inst.createdAt,
            completedAt: inst.completedAt,
            steps: inst.definitionSnapshot?.steps?.map((s) => ({ stepNo: s.stepNo, name: s.name })) || [],
            tasks: inst.Tasks.map((t) => ({
                id: t.id,
                stepNo: t.stepNo,
                stepName: t.stepName,
                assignee: nameById.get(t.assigneeUserId) || null,
                status: t.status,
                actedAt: t.actedAt,
                comment: t.comment,
            })),
        })));
    } catch (error) {
        console.error('Error listing workflow instances:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/workflow/instances/:id/cancel - the submitter recalls an in-flight
// approval.
exports.cancelInstance = async (req, res) => {
    try {
        const { userId } = getUserContext(req);
        const result = await engine.cancelInstance({ instanceId: req.params.id, userId });
        if (result.error) {
            const status = result.notFound ? 404 : result.forbidden ? 403 : result.stale ? 409 : 400;
            return res.status(status).json({ message: result.error });
        }
        res.status(200).json({ message: 'Approval recalled.', instanceStatus: result.instance.status });
    } catch (error) {
        console.error('Error cancelling workflow instance:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
