// Request schemas for the Workflow routes (the Zod boundary seam,
// platform/validate.js - mounted 2026-10-12). The controller and the engine
// keep every business check (purpose vocabulary, approver types and their
// required pickers, approval modes, condition operators, SLA + escalation
// pairing, task ownership, instance state); these schemas bound SHAPE and
// SIZE and strip unknown keys, so every key the controller or normalizeSteps
// reads is listed here - an unlisted key would be silently dropped.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
// Counts and hours arrive as numbers or digit strings from the designer form.
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const bool = z.boolean().optional();
const id = fields.uuid;

// A step's optional routing condition ({ field, op, value } against the
// producer's context; the value's type follows the field).
const condition = z.object({
    field: str(100),
    op: str(10),
    value: z.union([z.string().max(255), z.number(), z.boolean()]).nullable().optional(),
}).nullable().optional();

// One approval step as the designer posts it (stepNo is re-numbered by the
// controller from array order, so it is not read).
const step = z.object({
    name: str(255),
    approverType: str(30),
    approverRoleId: str(64),
    approverDepartmentId: str(64),
    approverPositionId: str(64),
    approverUserId: str(64),
    approvalMode: str(20),
    requiredApprovals: numberish,
    condition,
    slaHours: numberish,
    escalateOnSla: bool,
});

// The designer's definition header; steps stay optional at the boundary so
// the controller's own "At least one approval step is required." fires.
const definition = {
    name: str(255),
    description: str(1000),
    companyId: str(64),
    isActive: bool,
    steps: z.array(step).max(50).nullable().optional(),
};

const idParam = { params: z.object({ id }) };

module.exports = {
    id: idParam,
    createDefinition: { body: z.object({ ...definition, purpose: str(64) }) },
    updateDefinition: { ...idParam, body: z.object(definition) },
    // Approve / reject carry the assignee's optional comment.
    act: { ...idParam, body: z.object({ comment: str(1000) }) },
    // The per-document history panel keys instances by the producer's entity.
    entityInstances: { query: z.object({ entityType: str(64), entityId: str(64) }) },
};
