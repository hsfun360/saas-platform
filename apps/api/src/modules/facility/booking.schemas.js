const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
const id = fields.uuid;
const idParam = { params: z.object({ id }) };

// A roster line: a member-standing type carries the member number, a visitor
// guest a name (+ optional contact details that find or create a Patron).
const participantLine = z.object({
    participantType: z.string().max(20),
    memberNo: str(50),
    name: str(255),
    identityNo: str(50),
    mobile: str(30),
    email: str(255),
});

module.exports = {
    context: { query: z.object({ memberNo: z.string().max(50), facilityTypeId: str(64), date: str(10) }) },
    availability: { query: z.object({ facilityTypeId: z.string().max(64), date: z.string().max(10) }) },
    claimLocks: {
        body: z.object({
            facilityId: z.string().max(64),
            bookingDate: z.string().max(10),
            startTimes: z.array(z.string().max(8)).min(1).max(50),
            groupId: str(64),
        }),
    },
    releaseLock: { params: z.object({ groupId: id }) },
    list: { query: z.object({ date: z.string().max(10), facilityTypeId: str(64) }) },
    search: { query: z.object({ q: z.string().max(100) }) },
    create: {
        body: z.object({
            lockGroupId: z.string().max(64),
            booker: z.object({
                kind: z.enum(['member', 'visitor']).optional(),
                memberNo: str(50),
                name: str(255),
                identityNo: str(50),
                mobile: str(30),
                email: str(255),
            }),
            participants: z.array(participantLine).max(50).optional(),
            hostMemberNo: str(50),
            contactMobile: str(30),
            contactEmail: str(255),
            remarks: str(255),
            bookingNo: str(50),
        }),
    },
    id: idParam,
    cancel: { ...idParam, body: z.object({ reason: str(255), waiveCharge: z.boolean().optional(), waiveReason: str(255) }) },
    participants: { ...idParam, body: z.object({ participants: z.array(participantLine).max(50), hostMemberNo: str(50) }) },
};
