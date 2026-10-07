const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// Golf front-desk BILL - PER PLAYER (user decisions 2026-09-26): one bill per
// registered golfer, hanging off their golf.Player STARTING-NINE record
// (revamp 2026-09-29 - the crossover record never carries a bill). Items in
// golf.BillItem, tenders in golf.BillPayment (multiple tenders allowed;
// member/debtor classes post to AR via arGateway.postCharge with
// enforceCredit). Bill No. issues from the 'golf-bill' series at creation.
// Status: open (items being keyed / unsettled) -> settled (Σ payments =
// total) | voided. A suspend-class payment line counts toward settlement and
// flags the bill for later suspense clearing.
const Bill = sequelize.define('GolfBill', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    billNo: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    // 'player' (the per-player desk bill) | 'group' (a group booking's ONE
    // folio bill: packages and charges keyed at booking time, printed as the
    // proforma, settled as the final bill) | 'deposit' (a deposit received
    // on a group booking: ONE Deposit item for the amount, settled on
    // creation by the tender used). Approved 2026-10-07 (user's column name).
    billType: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'player',
    },
    // Group / deposit bills: the group booking they belong to.
    bookingProfileId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // Per-player bills: the starting-nine Player record and its golfer. NULL
    // on group and deposit bills.
    playerId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    golferId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    billDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // ---- group bill: the proforma (2026-10-07) ----
    // Issued from the golf-proforma series the first time the proforma is
    // printed; later prints after changes bump the revision.
    proformaNo: { type: DataTypes.STRING(50), allowNull: true },
    proformaRevision: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    proformaIssuedAt: { type: DataTypes.DATE, allowNull: true },
    // The deposit the proforma demands and the date it is due by.
    depositRequired: { type: DataTypes.DECIMAL(21, 2), allowNull: true },
    depositDueDate: { type: DataTypes.DATEONLY, allowNull: true },
    // ---- deposit bill: how much of it has been used (2026-10-07) ----
    // Maintained by the engine: applied = Deposit-class tender lines on the
    // final bill drawing on this deposit; refunded = paid refund requests.
    // Unapplied balance = totalAmount - applied - refunded.
    depositAppliedAmount: { type: DataTypes.DECIMAL(21, 2), allowNull: false, defaultValue: 0 },
    depositRefundedAmount: { type: DataTypes.DECIMAL(21, 2), allowNull: false, defaultValue: 0 },
    // Denormalized totals, maintained by the billing engine on every item
    // change: totalAmount = Σ item amounts (+ their exclusive tax), taxTotal
    // = Σ item tax.
    totalAmount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
    taxTotal: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
    // 'open' | 'settled' | 'voided' (registration.constants BILL_STATUSES).
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'open',
    },
    remarks: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    settledAt: { type: DataTypes.DATE, allowNull: true },
    voidedAt: { type: DataTypes.DATE, allowNull: true },
    voidedBy: { type: DataTypes.UUID, allowNull: true },
    voidReason: { type: DataTypes.STRING, allowNull: true },
    // Ownership stamps (RBAC data scope + future workflow).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'Bill',
    timestamps: true,
    indexes: [
        { name: 'UX_GolfBill_Company_No', fields: ['companyId', 'billNo'], unique: true },
        { name: 'IX_GolfBill_Company_Date', fields: ['companyId', 'billDate'] },
        { name: 'IX_GolfBill_Player', fields: ['playerId'] },
        { name: 'IX_GolfBill_Booking', fields: ['bookingProfileId'] },
    ],
});

module.exports = Bill;
