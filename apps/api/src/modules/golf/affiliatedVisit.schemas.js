// Request schemas for the Affiliated Visit routes (the Zod boundary seam,
// platform/validate.js). The service keeps every business check (the club's
// terms, the cap, the flight); these schemas bound SHAPE and SIZE and strip
// unknown keys, so every key the service reads is listed here.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const bool = z.boolean().optional();
const id = fields.uuid;

const golf = z.object({
    courseId: str(64),
    teeTime: str(8),
    holes: numberish,
}).nullable().optional();

const visitBody = z.object({
    affiliatedClubId: str(64),
    visitNo: str(50),
    visitorName: str(255),
    visitorMemberNo: str(50),
    visitorIdentityNo: str(50),
    visitorMobile: str(30),
    visitorEmail: str(255),
    loiReference: str(100),
    loiDocumentUrl: str(500),
    visitDate: str(10),
    alternateDate: str(10),
    facilities: z.object({
        golf,
        dining: str(255),
        accommodation: str(255),
        other: str(255),
    }).nullable().optional(),
    playerCount: numberish,
    guestCount: numberish,
    remarks: str(255),
});

const idParam = { params: z.object({ id }) };

module.exports = {
    list: { query: z.object({ status: str(20), dateFrom: str(10), dateTo: str(10), affiliatedClubId: str(64) }) },
    id: idParam,
    create: { body: visitBody },
    update: { ...idParam, body: visitBody },
    reason: { ...idParam, body: z.object({ reason: str(255) }) },
    arrive: { ...idParam, body: z.object({ letterSighted: bool, idSighted: bool }) },
};
