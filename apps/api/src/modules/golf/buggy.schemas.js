// Request schemas for the golf Buggies (fleet register) and Buggy Station
// routes (the Zod boundary seam, platform/validate.js). The controller and
// the station service keep every business check (type ownership, the open
// outing, slot derivation, seats); these schemas bound SHAPE and SIZE and
// strip unknown keys, so every key the handlers read is listed here.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const id = fields.uuid;

const buggyBody = z.object({
    buggyNo: str(20),
    buggyTypeId: str(64),
    model: str(100),
    serialNo: str(100),
    purchaseDate: str(10),
    remarks: str(255),
});

// A unit reference from the station: its id, or a scanned / typed code (the
// QR token, the station URL carrying it, or the buggy number).
const buggyRef = z.object({ id: str(64), code: str(512) }).nullable().optional();

const idParam = { params: z.object({ id }) };

module.exports = {
    // --- fleet register ---
    create: { body: buggyBody },
    update: { ...idParam, body: buggyBody },
    retire: { ...idParam, body: z.object({ reason: str(255) }) },
    id: idParam,
    labels: { query: z.object({ ids: str(4000) }) },
    // --- station ---
    day: { query: z.object({ playDate: str(10), courseId: str(64) }) },
    resolve: { query: z.object({ code: str(512) }) },
    issue: {
        body: z.object({
            buggy: buggyRef,
            playerIds: z.array(z.string().max(64)).max(6).nullable().optional(),
            conditionOut: str(20),
            remarksOut: str(255),
        }),
    },
    return: {
        body: z.object({
            buggy: buggyRef,
            issueId: str(64),
            conditionIn: str(20),
            remarksIn: str(255),
        }),
    },
    swap: {
        body: z.object({
            buggy: buggyRef,
            issueId: str(64),
            newBuggy: buggyRef,
            swapReason: str(255),
            swapHole: numberish,
            conditionIn: str(20),
            remarksIn: str(255),
        }),
    },
};
