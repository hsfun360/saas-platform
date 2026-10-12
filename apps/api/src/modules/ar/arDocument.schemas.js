// Request schemas for the AR DOCUMENT routes (the Zod boundary seam,
// platform/validate.js - mounted 2026-10-12). The controller keeps every
// business check (dates, catalog classes, funding, fx resolution, dimension
// selections through the gateway); these schemas bound SHAPE and SIZE and
// strip unknown keys, so every key the controller or its helpers read is
// listed here - an unlisted key would be silently dropped.

const { z, fields } = require('../../platform/validate');

const str = (max = 255) => z.string().max(max).nullable().optional();
// Amounts and rates arrive as numbers or digit strings from the web forms.
const numberish = z.union([z.number(), z.string().max(32)]).nullable().optional();
const id = fields.uuid;

// Fields every draft body shares: the two dates, the keyed exchange rate
// (foreign accounts), the manual document number, the narrative, and the
// analysis selections ({ "<dimensionNo>": optionId } for dimensionGateway).
const draftCommon = {
    docDate: str(10),
    trxDate: str(10),
    amount: numberish,
    docNo: str(50),
    description: str(500),
    exchangeRate: numberish,
    analysis: z.record(z.string().max(8), z.string().max(64).nullable()).nullable().optional(),
};

// Invoice / Debit Note / Credit Note (the ledger books).
const ledgerDraft = z.object({
    ...draftCommon,
    transactionTypeId: str(64),
    targetLedgerId: str(64), // a Credit Note's allocation intent
});
// Official Receipt.
const receiptDraft = z.object({
    ...draftCommon,
    transactionTypeId: str(64), // the Receipt-class payment method
    collectDepositId: str(64),
    paymentRef: str(100),
});
// Refund (deposit payout / excess payout / deposit-to-outstanding offset).
const refundDraft = z.object({
    ...draftCommon,
    refundMode: str(20),
    transactionTypeId: str(64),
    collectDepositId: str(64),
    paymentRef: str(100),
});
// Deposit demand.
const depositDraft = z.object({ ...draftCommon });

const withDebtor = (shape) => shape.extend({ debtorId: z.string().max(64) });

const idParam = { params: z.object({ id }) };
const listQuery = { query: z.object({ dateFrom: str(10), dateTo: str(10), month: str(7), status: str(20), q: str(200), offset: numberish }) };
const reasonBody = z.object({ reason: str(255) });

module.exports = {
    id: idParam,
    docParams: { params: z.object({ type: z.string().max(30), id }) },
    list: listQuery,
    // Account doors (the Debtor Account screen keys documents account-first).
    postLedger: { ...idParam, body: ledgerDraft.extend({ docType: z.string().max(30) }) },
    postReceipt: { ...idParam, body: receiptDraft },
    postDeposit: { ...idParam, body: depositDraft },
    voidLedger: { ...idParam, body: z.object({ docDate: str(10), trxDate: str(10), reason: str(255) }) },
    voidWithReason: { ...idParam, body: reasonBody },
    // Transaction screens (cross-debtor create carries the debtor).
    createLedger: { body: withDebtor(ledgerDraft) },
    updateLedger: { ...idParam, body: ledgerDraft },
    createReceipt: { body: withDebtor(receiptDraft) },
    updateReceipt: { ...idParam, body: receiptDraft },
    createRefund: { body: withDebtor(refundDraft) },
    updateRefund: { ...idParam, body: refundDraft },
    createDeposit: { body: withDebtor(depositDraft) },
    updateDeposit: { ...idParam, body: depositDraft },
};
