// Request schemas for the ACCOUNT EMAIL TEMPLATE routes (the Zod boundary
// seam, platform/validate.js - mounted 2026-10-12, the sixth standards sweep):
// a subscriber's own versions of the overridable platform templates, scoped
// per company or subscriber-wide. The controller keeps the catalogue and
// overridability checks, the scope ownership check (resolveScope), the
// Handlebars syntax check and the recipient rule; these schemas bound SHAPE
// and SIZE at the boundary and strip unknown keys, so every key the controller
// reads is listed here - an unlisted key would be silently dropped. The
// template key is the catalogue's dotted string (EmailTemplate.templateKey,
// 100 chars); the scope companyId is a Company UUID, omitted or null for the
// subscriber-wide row. bodyHtml is bounded above the 100kb JSON body limit so
// the body parser's own ceiling stays the real one.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
const bool = z.boolean().optional();
const id = fields.uuid;

const keyParam = { params: z.object({ key: z.string().max(100) }) };
const scopeQuery = { query: z.object({ companyId: id.optional() }) };

// What the editor sends on every write: the scope, the Handlebars content and
// the brand settings (reflected unsaved in previews).
const content = {
    companyId: id.nullable().optional(),
    subject: str(2000),
    bodyHtml: str(200000),
    brandColor: str(32),
    includeLogo: bool,
};
// Sample variables merged over the catalogue's sample for a preview / test
// send; values are whatever the template renders (strings, numbers, nested).
const sampleData = z.record(z.string().max(100), z.unknown()).nullable().optional();

module.exports = {
    get: { ...keyParam, ...scopeQuery },
    upsert: { ...keyParam, body: z.object({ ...content, fromName: str(255), isActive: bool }) },
    remove: { ...keyParam, ...scopeQuery },
    preview: { ...keyParam, body: z.object({ ...content, data: sampleData }) },
    sendTest: { ...keyParam, body: z.object({ ...content, data: sampleData, fromName: str(255), to: str(254) }) },
};
