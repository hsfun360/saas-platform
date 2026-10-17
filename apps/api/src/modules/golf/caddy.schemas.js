// Request schemas for the caddy master routes - Caddy Grades, Caddy Groups,
// Caddies with their leave records and notes (the Zod boundary seam,
// platform/validate.js). The controllers keep every business check (grade /
// group ownership and caps, leave overlap, statuses); these schemas bound
// SHAPE and SIZE and strip unknown keys, so every key the handlers read is
// listed here. The photo upload is multipart (req.file only) and stays bare.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const id = fields.uuid;

const gradeBody = z.object({ code: str(20), name: str(255), playersPerCaddy: numberish, sortOrder: numberish });
const groupBody = z.object({ code: str(20), name: str(255), maxCaddies: numberish, rotationOrder: numberish });

const caddyBody = z.object({
    caddyNo: str(20),
    name: str(255),
    caddyGradeId: str(64),
    caddyGroupId: str(64),
    isLeader: z.boolean().optional(),
    staffNo: str(50),
    identityNo: str(50),
    gender: str(10),
    dateOfBirth: str(10),
    mobile: str(30),
    email: str(255),
    languages: str(255),
    nationalityCode: str(20),
    raceCode: str(20),
    photo: str(2048),
    joinedDate: str(10),
    leftDate: str(10),
    remarks: str(255),
});

const leaveBody = z.object({ leaveType: str(20), dateFrom: str(10), dateTo: str(10), remarks: str(255) });
const noteBody = z.object({ kind: str(20), noteDate: str(10), points: numberish, description: str(255), followUp: str(255) });

const idParam = { params: z.object({ id }) };
const leaveParam = { params: z.object({ id, leaveId: id }) };
const noteParam = { params: z.object({ id, noteId: id }) };
const activeBody = z.object({ isActive: z.boolean().optional() });

// A caddy reference from the station: its id, or a scanned / typed code (the
// badge token or the badge number).
const caddyRef = z.object({ id: str(64), code: str(512) }).nullable().optional();

module.exports = {
    // --- the Caddy Station (slice 2) ---
    stationDay: { query: z.object({ playDate: str(10), courseId: str(64) }) },
    stationResolve: { query: z.object({ code: str(512), playDate: str(10) }) },
    stationCheckIn: { body: z.object({ caddy: caddyRef, workDate: str(10), remarks: str(255) }) },
    stationCheckOut: { body: z.object({ caddy: caddyRef, attendanceId: str(64), workDate: str(10) }) },
    stationAssign: {
        body: z.object({
            caddy: caddyRef,
            next: z.boolean().optional(),
            playerIds: z.array(z.string().max(64)).max(4).nullable().optional(),
            requestedByName: z.boolean().optional(),
        }),
    },
    stationComplete: { body: z.object({ caddy: caddyRef, assignmentId: str(64), holesPlayed: numberish, note: str(255), checkOut: z.boolean().optional() }) },
    stationSwap: {
        body: z.object({
            caddy: caddyRef,
            assignmentId: str(64),
            newCaddy: caddyRef,
            next: z.boolean().optional(),
            swapReason: str(20),
            swapHole: numberish,
            requestedByName: z.boolean().optional(),
        }),
    },
    // --- grades ---
    gradeCreate: { body: gradeBody },
    gradeUpdate: { ...idParam, body: gradeBody },
    gradeSetActive: { ...idParam, body: activeBody },
    // --- groups ---
    groupCreate: { body: groupBody },
    groupUpdate: { ...idParam, body: groupBody },
    groupSetActive: { ...idParam, body: activeBody },
    // --- caddies ---
    id: idParam,
    list: { query: z.object({ date: str(10) }) },
    create: { body: caddyBody },
    update: { ...idParam, body: caddyBody },
    setStatus: { ...idParam, body: z.object({ status: str(20), reason: str(255) }) },
    badges: { query: z.object({ ids: str(4000) }) },
    leaveCreate: { ...idParam, body: leaveBody },
    leaveUpdate: { ...leaveParam, body: leaveBody },
    leaveId: leaveParam,
    noteCreate: { ...idParam, body: noteBody },
    noteUpdate: { ...noteParam, body: noteBody },
    noteId: noteParam,
};
