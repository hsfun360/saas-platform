// Request schemas for the platform Email Template routes (the Zod boundary
// seam, platform/validate.js - mounted 2026-10-12, the sixth standards sweep).
// The controller keeps every business check (the catalogue key lookup, the
// subject/body presence rule, Handlebars compilation, the recipient format);
// these schemas bound SHAPE and SIZE and strip unknown keys, so every key the
// controller and its helper previewBrand read is listed here - an unlisted key
// would be silently dropped.
//
// `'fromName' in req.body` / `'brandColor' in req.body` clear the column when
// the key is present and empty, so both stay nullable and optional. bodyHtml is
// the TinyMCE output; the JSON body limit (100kb) is the real ceiling, the
// bound here only keeps it finite.

const { z } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
const bool = z.boolean().optional();

// The catalogue key ('collaborator.invite' and friends; EmailTemplate.templateKey
// is STRING(100)). An unknown key 404s in the controller.
const keyParam = { params: z.object({ key: z.string().max(100) }) };

// The editor's current content + brand settings, shared by save, preview and test.
const content = {
    subject: str(2000),
    bodyHtml: str(200000),
    brandColor: str(9), // '#rrggbb' or '#rrggbbaa' (the column is STRING(9))
    includeLogo: bool,
};
// Extra sample variables merged over the catalogue sample for rendering.
const data = z.record(z.string().max(100), z.any()).nullable().optional();

module.exports = {
    key: keyParam,
    update: {
        ...keyParam,
        body: z.object({
            ...content,
            name: str(200),
            description: str(1000),
            fromName: str(200),
            tenantOverridable: bool,
            isActive: bool,
        }),
    },
    preview: { ...keyParam, body: z.object({ ...content, data }) },
    test: { ...keyParam, body: z.object({ ...content, data, to: str(254), fromName: str(200) }) },
};
