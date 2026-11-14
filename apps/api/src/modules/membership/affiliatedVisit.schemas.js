// Request schemas for the Affiliated Visit routes (the Zod boundary seam,
// platform/validate.js). The service keeps every business check (the club's
// terms, the caps, the member's standing, the flight); these schemas bound
// SHAPE and SIZE and strip unknown keys, so every key the service reads is
// listed here.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const id = fields.uuid;

const golf = z.object({
    courseId: str(64),
    teeTime: str(8),
    holes: numberish,
    // The day of the letter the requested flight is played (default: its first).
    playDate: str(10),
}).nullable().optional();

const visitBody = z.object({
    direction: str(10),
    affiliatedClubId: str(64),
    visitNo: str(50),
    // Inbound: the letter's visitor. Outbound: our member's number.
    visitorName: str(255),
    visitorMemberNo: str(50),
    memberNo: str(50),
    visitorIdentityNo: str(50),
    visitorMobile: str(30),
    visitorEmail: str(255),
    loiReference: str(100),
    loiDocumentUrl: str(500),
    visitDate: str(10),
    // The letter's last day when it covers several (empty = one day).
    visitDateTo: str(10),
    alternateDate: str(10),
    facilities: z.object({
        golf,
        dining: str(255),
        accommodation: str(255),
        sports: str(255),
        other: str(255),
    }).nullable().optional(),
    playerCount: numberish,
    guestCount: numberish,
    remarks: str(255),
});

const idParam = { params: z.object({ id }) };

module.exports = {
    list: { query: z.object({ status: str(20), direction: str(10), dateFrom: str(10), dateTo: str(10), affiliatedClubId: str(64) }) },
    id: idParam,
    create: { body: visitBody },
    update: { ...idParam, body: visitBody },
    reason: { ...idParam, body: z.object({ reason: str(255) }) },
    // A flight for one day of the letter.
    flight: { ...idParam, body: z.object({ playDate: str(10), courseId: str(64), teeTime: str(8), holes: numberish }) },
    flightId: { params: z.object({ id, flightId: id }) },
};
