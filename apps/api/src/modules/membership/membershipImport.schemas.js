// Request schemas for the Membership Import routes (the Zod boundary seam,
// platform/validate.js - mounted 2026-10-12). The workbook itself travels as
// a multer upload (req.file, parsed in memory) and is validated by
// membershipImport.service.js; these schemas bound the request PARTS around
// it - ids are UUIDs (the batch and row primary keys) and the migrate
// selection is a bounded list - and strip unknown keys, so every key the
// controller reads is listed here. The upload body is validated empty on
// purpose: no text form field is read beside the file.

const { z, fields } = require('../../platform/validate');

const id = fields.uuid;
const idParam = { params: z.object({ id }) };

module.exports = {
    // Template download and batch listing read no request part.
    noInput: { query: z.object({}) },
    id: idParam,
    // Mounted AFTER multer so req.body is the parsed multipart text fields.
    upload: { body: z.object({}) },
    // The selected staged membership rows (their MembershipImportRow ids).
    migrate: { ...idParam, body: z.object({ membershipRowIds: z.array(id).max(10000).optional() }) },
};
