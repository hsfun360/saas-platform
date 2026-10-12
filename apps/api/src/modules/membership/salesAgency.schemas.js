// Request schemas for the Sales Agency routes (the Zod boundary seam,
// platform/validate.js - mounted 2026-10-12). The controller keeps its
// business validation (required code and name, the 30-character code and
// 255-character street-line ceilings with their own messages, code clashes);
// these schemas bound SHAPE and SIZE and strip unknown keys, so every key the
// controller or its normalizers read is listed here - an unlisted key would
// be silently dropped.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
const id = fields.uuid;

// The agency's single office address (normalizeAddress): an empty street
// line means "no address", so the whole object may be absent or null.
const address = z.object({
    address: str(500),
    city: str(100),
    postcode: str(20),
    state: str(100),
    countryCode: str(10),
}).nullable().optional();

const body = z.object({
    agencyCode: str(50),
    agencyName: str(255),
    registrationNo: str(100),
    contactPerson: str(255),
    phone: str(50),
    mobile: str(50),
    email: str(255),
    address,
});

const idParam = { params: z.object({ id }) };

module.exports = {
    list: { query: z.object({}) },
    create: { body },
    update: { ...idParam, body },
    setActive: { ...idParam, body: z.object({ isActive: z.boolean().optional() }) },
};
