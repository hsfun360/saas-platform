// Request schemas for the Golf Front Desk routes (the Zod boundary seam,
// platform/validate.js - mounted 2026-10-12, the fifth standards sweep).
//
// The controller keeps every business check (tee-sheet slots, seat counts,
// member standing, numbering mode, tile eligibility, tender classes, the
// payments-equal-total rule); these schemas bound SHAPE and SIZE at the
// boundary and strip unknown keys, so every key the controller or its
// helpers (resolvePlayerIdentity / guestGolfer, registerBookedRecord) read
// is listed here - an unlisted key would be silently dropped.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
// Counts and amounts arrive as numbers or digit strings from the web forms.
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const id = fields.uuid;

// The guest identity prompt (OtherGolfer dedupe by identity no, then mobile).
const guest = z.object({
    name: str(255),
    identityNo: str(50),
    mobile: str(30),
    email: str(255),
}).nullable().optional();

// A walk-in is a new tee-off keyed at the desk.
const walkIn = z.object({
    playDate: str(10),
    courseId: str(64),
    teeTime: str(8),
    holes: numberish,
    playerType: str(20),
    memberNo: str(50),
    guest,
}).nullable().optional();

// One reviewed booking of the no-show confirm: charge (default) or waive
// with a reason. bookingProfileId stays optional here so the controller's
// own "Invalid no-show line." check still answers a malformed line.
const noShowLine = z.object({
    bookingProfileId: str(64),
    charge: z.boolean().optional(),
    waiveReason: str(255),
});

// One tender of a settlement.
const paymentLine = z.object({
    paymentTypeId: str(64),
    amount: numberish,
    reference: str(100),
    // 'raincheck' class only: the golfer's rain check the line redeems.
    rainCheckId: str(64),
    // 'debtor' class only (2026-10-18): the AR Other Debtor the line charges.
    otherDebtorId: str(64),
});

const idParam = { params: z.object({ id }) };
const billParam = { params: z.object({ billId: id }) };
const itemParam = { params: z.object({ billId: id, itemId: id }) };
const playDateQuery = { query: z.object({ playDate: str(10) }) };

module.exports = {
    day: playDateQuery,
    // Booked player ({ playerId, guest?, registrationNo? }) or walk-in
    // ({ walkIn: {...}, registrationNo? }) - the controller branches on playerId.
    register: { body: z.object({ playerId: str(64), guest, registrationNo: str(50), walkIn }) },
    registerFlight: { body: z.object({ playDate: str(10), courseId: str(64), teeTime: str(8), bookingProfileId: str(64) }) },
    registerGroup: { body: z.object({ bookingProfileId: str(64), playDate: str(10) }) },
    cancelRegistration: { ...idParam, body: z.object({ reason: str(255) }) },
    noShows: playDateQuery,
    confirmNoShows: { body: z.object({ playDate: str(10), bookings: z.array(noShowLine).max(200) }) },
    // --- billing ---
    openBill: { ...idParam, body: z.object({ billNo: str(50) }) },
    bill: billParam,
    addItem: { ...billParam, body: z.object({ transactionTypeId: str(64), quantity: numberish }) },
    item: itemParam,
    // Presence matters: an absent key means leave unchanged.
    updateItem: { ...itemParam, body: z.object({ quantity: numberish, unitAmount: numberish }) },
    settle: { ...billParam, body: z.object({ payments: z.array(paymentLine).max(20) }) },
    voidBill: { ...billParam, body: z.object({ reason: str(255) }) },
};
