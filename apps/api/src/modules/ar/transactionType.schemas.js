// Request schemas for the AR Transaction Type master routes (the Zod boundary
// seam, platform/validate.js - mounted 2026-10-12). The controller keeps every
// business check (class vocabulary, the 50-character code rule, single-module
// usability against entitlements, tax scheme class, LHDN classification,
// copy-source access); these schemas bound SHAPE and SIZE and strip unknown
// keys, so every key the controller or its helpers read is listed here - an
// unlisted key would be silently dropped.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
const id = fields.uuid;

// One catalog entry as the dialog posts it (create and the full PUT share it).
const entry = z.object({
    transactionType: str(100),
    trxClass: str(30),
    description: str(500),
    taxSchemeCode: str(50),
    isInterestChargeable: z.boolean().optional(),
    usableInModules: z.array(z.string().max(30)).max(10).nullable().optional(),
    isEInvoice: z.boolean().optional(),
    eInvoiceClassificationCode: str(20),
});

const idParam = { params: z.object({ id }) };

module.exports = {
    id: idParam,
    create: { body: entry },
    update: { ...idParam, body: entry },
    setActive: { ...idParam, body: z.object({ isActive: z.boolean().optional() }) },
    // Copy from another company: the source is a Company (UUID key); the ids
    // are the selected source entries (the controller re-reads them scoped to
    // that company, so they stay plain bounded strings here).
    copyCandidates: { params: z.object({ companyId: id }) },
    copyFrom: { body: z.object({ sourceCompanyId: str(64), ids: z.array(z.string().max(64)).max(500).nullable().optional() }) },
};
