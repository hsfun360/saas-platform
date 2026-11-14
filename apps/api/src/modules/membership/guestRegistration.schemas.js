// Request schemas for the Guest Registration and Guest Visits routes (the Zod
// boundary seam, platform/validate.js). The service keeps every business
// check (the host's standing, the allowance, the contact rule); these schemas
// bound SHAPE and SIZE and strip unknown keys, so every key the service reads
// is listed here.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
const bool = z.boolean().optional();
const id = fields.uuid;

const guest = z.object({
    name: str(255),
    mobile: str(30),
    email: str(255),
    identityNo: str(50),
    guestRemarks: str(255),
});

const idParam = { params: z.object({ id }) };

module.exports = {
    list: { query: z.object({ status: str(20), group: str(20), dateFrom: str(10), dateTo: str(10) }) },
    // A visiting member registers for today on their letter (:id = the visit).
    receive: { ...idParam, body: z.object({ letterSighted: bool, idSighted: bool, registrationNo: str(50), remarks: str(255) }) },
    // A walk-up: the letter is keyed at the counter (no golf - flights are
    // added on the confirmed letter).
    walkUp: {
        body: z.object({
            affiliatedClubId: str(64),
            visitNo: str(50),
            registrationNo: str(50),
            visitorName: str(255),
            visitorMemberNo: str(50),
            visitorIdentityNo: str(50),
            visitorMobile: str(30),
            visitorEmail: str(255),
            loiReference: str(100),
            loiDocumentUrl: str(500),
            visitDateTo: str(10),
            dining: str(255),
            accommodation: str(255),
            sports: str(255),
            other: str(255),
            remarks: str(255),
            letterSighted: bool,
            idSighted: bool,
        }),
    },
    // A guest the visitor brought (:id = the visitor's registration of today).
    visitorGuest: { ...idParam, body: z.object({ guestId: str(64), guest, registrationNo: str(50), remarks: str(255), sendEmail: bool }) },
    host: { query: z.object({ memberNo: str(50), visitDate: str(10) }) },
    guests: { query: z.object({ q: str(100) }) },
    id: idParam,
    create: {
        body: z.object({
            memberNo: str(50),
            visitDate: str(10),
            registrationNo: str(50),
            guestId: str(64),
            guest,
            remarks: str(255),
            sendEmail: z.boolean().optional(),
        }),
    },
    update: { ...idParam, body: z.object({ guest, remarks: str(255) }) },
    reason: { ...idParam, body: z.object({ reason: str(255) }) },
    send: { ...idParam, body: z.object({ via: str(20) }) },
    scan: { body: z.object({ code: str(500) }) },
    // The public pass page: the token is checked for its exact shape here.
    publicPass: { params: z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }) },
    visits: { query: z.object({ dateFrom: str(10), dateTo: str(10), memberNo: str(50) }) },
};
