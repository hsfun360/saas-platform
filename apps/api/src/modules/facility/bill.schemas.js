const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const billParam = { params: z.object({ billId: fields.uuid }) };
const itemParam = { params: z.object({ billId: fields.uuid, itemId: fields.uuid }) };

// One tender of a settlement; a debtor-class line names the Other Debtor.
const paymentLine = z.object({
    paymentTypeId: str(64),
    amount: numberish,
    reference: str(100),
    otherDebtorId: str(64),
});

module.exports = {
    openBill: { params: z.object({ id: fields.uuid }), body: z.object({ billNo: str(50) }) },
    bill: billParam,
    addItem: { ...billParam, body: z.object({ transactionTypeId: str(64), quantity: numberish }) },
    item: itemParam,
    // Presence matters: an absent key means leave unchanged.
    updateItem: { ...itemParam, body: z.object({ quantity: numberish, unitAmount: numberish }) },
    settle: { ...billParam, body: z.object({ payments: z.array(paymentLine).max(20) }) },
    voidBill: { ...billParam, body: z.object({ reason: str(255) }) },
};
