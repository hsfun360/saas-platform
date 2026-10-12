// Request schemas for the AR periodic-processing routes - the interest run,
// the AR Specification singleton, statement runs and the statement listing
// (the Zod boundary seam, platform/validate.js - mounted 2026-10-12). The
// controller and arStatement.service keep every business check (month and
// date formats, rate and grace ranges, aging contiguity, column keys,
// designated-type classes, the dimension selections through the gateway);
// these schemas bound SHAPE and SIZE and strip unknown keys, so every key
// they read is listed here - an unlisted key would be silently dropped.
//
// saveSetting distinguishes absent (leave unchanged) from null (clear) for
// the designated types and the two integration toggles; Zod preserves both.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
// Days, rates and counts arrive as numbers or digit strings from the web forms.
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const id = fields.uuid;

// Run-level analysis selections ({ "<dimensionNo>": optionId }) read by
// dimensionGateway.readSelections - same shape as the document drafts.
const analysis = z.record(z.string().max(8), z.string().max(64).nullable()).nullable().optional();

const idParam = { params: z.object({ id }) };
const month = str(7); // 'YYYY-MM'
const date = str(10); // 'YYYY-MM-DD'

// The shared statement-run parameters (preview and create).
const runParams = z.object({
    month,
    periodStart: date,
    periodEnd: date,
    categories: z.array(z.string().max(20)).max(10).nullable().optional(),
});

module.exports = {
    id: idParam,
    // --- Interest run ---
    generate: { body: z.object({ month, cutoffDate: date, ratePercent: numberish, graceDays: numberish, analysis }) },
    list: { query: z.object({ month }) },
    detail: { params: z.object({ id, detailId: id }) },
    setDetailExcluded: { params: z.object({ id, detailId: id }), body: z.object({ excluded: z.boolean().optional() }) },
    confirm: { body: z.object({ ids: z.array(z.string().max(64)).max(500).nullable().optional() }) },
    // --- AR Specification (arStatement.service saveSetting reads the body) ---
    saveSetting: {
        body: z.object({
            statementCutoffDay: numberish,
            aging1: numberish,
            aging2: numberish,
            aging3: numberish,
            aging4: numberish,
            aging5: numberish,
            aging6: numberish,
            statementShowLogo: z.boolean().optional(),
            statementBrandColor: str(20),
            statementShowAging: z.boolean().optional(),
            statementShowDeposit: z.boolean().optional(),
            statementShowIncurredBy: z.boolean().optional(),
            statementShowGeneratedNote: z.boolean().optional(),
            statementFooterText: str(4000),
            statementColumns: z.array(z.object({ key: str(20), label: str(60) })).max(12).nullable().optional(),
            membershipIntegration: z.boolean().optional(),
            interestTransactionTypeId: str(64),
            depositConversionTransactionTypeId: str(64),
            multiCurrencyEnabled: z.boolean().optional(),
            fxTransactionTypeId: str(64),
        }),
    },
    // --- Statement runs + listing ---
    statementRun: { body: runParams },
    listStatements: { query: z.object({ month, category: str(20) }) },
};
