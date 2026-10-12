// Request schemas for the Group Booking routes (the Zod boundary seam,
// platform/validate.js - mounted 2026-10-12, the fifth standards sweep).
//
// The controllers keep their business validation (dates, course ownership,
// vocabularies, money rounding); these schemas bound SHAPE and SIZE at the
// boundary and strip unknown keys, so every key a controller reads is listed
// here - an unlisted key would be silently dropped.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
// Numbers arrive as numbers or digit strings from the web forms.
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const id = fields.uuid;

const dayLine = z.object({
    playDate: z.string().max(10),
    courseId: z.string().max(64),
    holes: numberish,
    startFormat: str(30),
    startTime: str(8),
    blockUntil: str(8),
    startHoles: z.array(numberish).max(18).nullable().optional(),
    waves: numberish,
    remarks: str(255),
});

const header = {
    bookingType: str(20),
    groupName: str(150),
    organiserKind: str(20),
    otherDebtorId: str(64),
    memberNo: str(50),
    organiserName: str(150),
    contactPerson: str(100),
    contactMobile: str(30),
    contactEmail: str(255),
    expectedPlayers: numberish,
    remarks: str(255),
    bookingNo: str(50),
    isClubEvent: z.boolean().optional(),
};

const rosterLine = z.object({
    playerType: str(20),
    memberNo: str(50),
    playerName: str(255),
    handicap: numberish,
    teamName: str(100),
    contactMobile: str(30),
    remarks: str(255),
    status: str(20),
});

const idParam = { params: z.object({ id }) };
const dayParam = { params: z.object({ id, dayId: id }) };
const reason = z.object({ reason: str(255) });

module.exports = {
    list: { query: z.object({ dateFrom: str(10), dateTo: str(10), status: str(20) }) },
    id: idParam,
    create: { body: z.object({ ...header, days: z.array(dayLine).max(14) }) },
    update: { ...idParam, body: z.object(header) },
    cancel: { ...idParam, body: reason },
    submit: idParam,
    extendDeposit: { ...idParam, body: z.object({ depositDueDate: str(10), reason: str(255) }) },
    addDay: { ...idParam, body: dayLine },
    day: dayParam,
    updateDay: { ...dayParam, body: dayLine },
    generateFlights: {
        ...dayParam,
        body: z.object({ count: numberish, capacity: numberish, doubleHoles: z.array(numberish).max(36).optional(), waveGapMinutes: numberish }),
    },
    flight: { params: z.object({ id, dayId: id, flightId: id }) },
    draw: {
        ...dayParam,
        body: z.object({
            assignments: z.array(z.object({ groupPlayerId: z.string().max(64), groupFlightId: z.string().max(64).nullable().optional() })).max(400),
            auto: z.boolean().optional(),
        }),
    },
    addPlayers: { ...idParam, body: z.object({ players: z.array(rosterLine).max(400) }) },
    player: { params: z.object({ id, playerId: id }) },
    updatePlayer: { params: z.object({ id, playerId: id }), body: rosterLine },
    // --- the folio ---
    addItem: { ...idParam, body: z.object({ transactionTypeId: z.string().max(64), quantity: numberish, unitAmount: numberish }) },
    item: { params: z.object({ id, itemId: id }) },
    updateItem: { params: z.object({ id, itemId: id }), body: z.object({ quantity: numberish, unitAmount: numberish }) },
    proformaTerms: { ...idParam, body: z.object({ depositRequired: numberish, depositDueDate: str(10) }) },
    issueProforma: { ...idParam, body: z.object({ proformaNo: str(50) }) },
    settle: {
        ...idParam,
        body: z.object({
            payments: z.array(z.object({
                paymentTypeId: z.string().max(64), amount: numberish, reference: str(100), depositBillId: str(64),
            })).max(20),
        }),
    },
    voidBill: { ...idParam, body: reason },
    requestRefund: { ...idParam, body: z.object({ amount: numberish, reason: str(255), remarks: str(255), refundNo: str(50) }) },
    refund: { params: z.object({ id, refundId: id }) },
    payRefund: { params: z.object({ id, refundId: id }), body: z.object({ paidMethod: str(100), paidReference: str(100) }) },
    declineRefund: { params: z.object({ id, refundId: id }), body: reason },
    recordDeposit: {
        ...idParam,
        body: z.object({ amount: numberish, paymentTypeId: z.string().max(64), reference: str(100), remarks: str(255), billDate: str(10), billNo: str(50) }),
    },
    bill: { params: z.object({ id, billId: id }) },
    voidDeposit: { params: z.object({ id, billId: id }), body: reason },
};
