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

// The desk's damage assessment on a damaged return / swap (slice 2).
const damageRef = z.object({ reasonType: str(20), description: str(1000), playerId: str(64) }).nullable().optional();
const inspectionItem = z.object({
    buggyId: str(64),
    steeringOk: z.boolean().optional(), brakesOk: z.boolean().optional(), electricalOk: z.boolean().optional(), driveOk: z.boolean().optional(), bodyOk: z.boolean().optional(),
    findings: str(1000),
});
const damageBody = z.object({ buggyId: str(64), playDate: str(10), reasonType: str(20), description: str(1000), golferName: str(255), memberNo: str(50), remarks: str(255), openRepair: z.boolean().optional() });

module.exports = {
    // --- maintenance + damage (slice 2, 2026-10-18) ---
    maintenanceList: { query: z.object({ status: str(20), kind: str(20), dateFrom: str(10), dateTo: str(10), buggyId: str(64) }) },
    maintenanceOpen: { body: z.object({ buggyIds: z.array(z.string().max(64)).max(200).nullable().optional(), kind: str(20), findings: str(1000), remarks: str(255) }) },
    maintenanceInspect: { body: z.object({ items: z.array(inspectionItem).max(200).nullable().optional(), remarks: str(255) }) },
    maintenanceComplete: { ...idParam, body: z.object({ workDone: str(1000), cost: numberish }) },
    damageList: { query: z.object({ status: str(20), dateFrom: str(10), dateTo: str(10), buggyId: str(64) }) },
    damageCreate: { body: damageBody },
    damageUpdate: { ...idParam, body: damageBody },
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
            damage: damageRef,
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
            damage: damageRef,
        }),
    },
};
