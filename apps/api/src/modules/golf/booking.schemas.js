// Request schemas for the Golf Booking routes (the Zod boundary seam,
// platform/validate.js - mounted 2026-10-12, the fifth standards sweep).
//
// The controller keeps every business check (member standing, the advance
// window, holes/players ceilings, the lock ownership, guest control, the
// per-day/session limits); these schemas bound SHAPE and SIZE at the boundary
// and strip unknown keys, so every key the controller reads is listed here -
// an unlisted key would be silently dropped.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
// Counts arrive as numbers or digit strings from the web forms.
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const id = fields.uuid;

// The search inputs parseSearch reads (availability + lock share them).
const search = {
    memberNo: str(50),
    playDate: str(10),
    holes: numberish,
    players: numberish,
};

// One keyed player line of the final save: a guest carries a name, a member
// or member-as-guest carries the member number.
const playerLine = z.object({
    playerType: str(20),
    guestName: str(255),
    memberNo: str(50),
});

const idParam = { params: z.object({ id }) };

module.exports = {
    context: { query: z.object({ memberNo: str(50) }) },
    availability: { body: z.object({ ...search, time: str(8), courseId: str(64) }) },
    lock: { body: z.object({ ...search, teeTime: str(8), courseId: str(64) }) },
    // The lock group id is the FlightLock.groupId UUID minted at lock time.
    releaseLock: { params: z.object({ groupId: id }) },
    list: { query: z.object({ playDate: str(10) }) },
    create: {
        body: z.object({
            lockGroupId: str(64),
            memberNo: str(50),
            players: z.array(playerLine).max(20),
            contactMobile: str(30),
            remarks: str(255),
            bookingNo: str(50),
        }),
    },
    id: idParam,
    cancel: { ...idParam, body: z.object({ reason: str(255), waiveCharge: z.boolean().optional(), waiveReason: str(255) }) },
};
