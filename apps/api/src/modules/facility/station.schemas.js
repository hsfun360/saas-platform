const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const idParam = { params: z.object({ id: fields.uuid }) };

// A guest at the door: a guest-like participant type with a member number
// (member as guest) or a name and optional contact details (visitor).
const guestLine = z.object({
    participantType: z.string().max(20),
    memberNo: str(50),
    name: str(255),
    identityNo: str(50),
    mobile: str(30),
    email: str(255),
});

module.exports = {
    today: { query: z.object({ date: str(10) }) },
    checkIn: { body: z.object({ bookingSlotId: z.string().max(64), droppedParticipantIds: z.array(z.string().max(64)).max(50).optional() }) },
    register: {
        body: z.object({
            facilityTypeId: z.string().max(64),
            facilityId: str(64),
            memberNo: z.string().max(50),
            guests: z.array(guestLine).max(50).optional(),
            remarks: str(255),
        }),
    },
    id: idParam,
    guests: { ...idParam, body: z.object({ guests: z.array(guestLine).max(50) }) },
    issue: {
        body: z.object({
            facilityTypeId: z.string().max(64),
            facilityId: str(64),
            quantity: numberish,
            memberNo: z.string().max(50),
            registrationId: str(64),
            remarks: str(255),
        }),
    },
    returnIssue: { ...idParam, body: z.object({ condition: z.string().max(10), returnedQuantity: numberish, remarks: str(255) }) },
    endOfDay: { body: z.object({ facilityTypeId: str(64), date: str(10) }) },
};
