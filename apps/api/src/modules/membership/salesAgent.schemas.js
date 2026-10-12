// Request schemas for the Sales Agent routes (the Zod boundary seam,
// platform/validate.js - mounted 2026-10-12). The controller keeps its
// business validation (required code, name, kind and email, the agency rule
// for agency staff, the YYYY-MM-DD dates and their ordering, code clashes);
// these schemas bound SHAPE and SIZE and strip unknown keys, so every key the
// controller or its normalizer reads is listed here - an unlisted key would
// be silently dropped.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
const id = fields.uuid;

const body = z.object({
    agentCode: str(50),
    name: str(255),
    agentKind: str(20),
    salesAgencyId: str(64),
    identityNo: str(100),
    phone: str(50),
    mobile: str(50),
    email: str(255),
    joinedDate: str(10),
    leftDate: str(10),
    remarks: str(2000),
});

const idParam = { params: z.object({ id }) };

module.exports = {
    meta: { query: z.object({}) },
    list: { query: z.object({ kind: str(20) }) },
    create: { body },
    update: { ...idParam, body },
    setActive: { ...idParam, body: z.object({ isActive: z.boolean().optional() }) },
    invite: idParam,
};
