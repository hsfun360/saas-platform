const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// golf.NoShowCharge (approved 2026-10-06; Tropicana procedure "No-show charge
// RM80.00 + 5%" / "24 hours minimum notice") - ONE row per penalised
// BOOKING, whether the players failed to turn up (chargeReason 'no-show',
// raised by the front desk's no-show review) or the booking was cancelled
// inside the notice window (chargeReason 'late-cancel', raised by the
// booking cancel). The charge always goes to the BOOKER.
//
// Priced from the GolfSetting.noShowTransactionTypeId rate card (flat
// amount × quantity, quantity = no-show players or 1 per booking per
// noShowChargeBasis) with the type's tax scheme snapshotted like a BillItem
// - golf owns the tax accounting; the AR document is the plain receivable
// for the gross (the same split as bill settlement).
//
// Lifecycle (noShowCharge.constants NO_SHOW_CHARGE_STATUSES):
//   pending - raised but not on the booker's ledger yet (public booker with
//             no AR account, or the posting failed) - Post / Waive from the
//             No-show Charges listing
//   posted  - one AR invoice posted via arGateway.postCharge (arDocNo kept)
//   waived  - decided not to charge (reason required; the row stays as the
//             audit trail of the no-show itself)
const NoShowCharge = sequelize.define('GolfNoShowCharge', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The penalised booking (value ref) + listing snapshots.
    bookingProfileId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    bookingNo: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    playDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // 'no-show' | 'late-cancel'.
    chargeReason: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // Who is charged - always the booking maker's golf.Golfer identity.
    bookerGolferId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    bookerName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    bookerMemberNo: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    // The players who did not show / were cancelled late (display).
    playerNames: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // The golf no-show transaction type + its code/description snapshot.
    transactionTypeId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    description: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
    },
    unitAmount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
    // quantity × unitAmount (tax-exclusive).
    amount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
    // Tax snapshot (shape of BillItem).
    taxSchemeCode: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    taxAmount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
    taxBreakdown: {
        type: DataTypes.JSONB,
        allowNull: true,
    },
    // Gross payable (amount + tax when exclusive, the amount when inclusive).
    totalAmount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
    // 'pending' | 'posted' | 'waived'.
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
    },
    // The posted AR invoice + the ledger account charged (shape of
    // BillPayment's member-class line).
    arDocId: { type: DataTypes.UUID, allowNull: true },
    arDocNo: { type: DataTypes.STRING(50), allowNull: true },
    debtorType: { type: DataTypes.STRING(20), allowNull: true },
    debtorSourceId: { type: DataTypes.UUID, allowNull: true },
    postedAt: { type: DataTypes.DATE, allowNull: true },
    postedBy: { type: DataTypes.UUID, allowNull: true },
    waivedAt: { type: DataTypes.DATE, allowNull: true },
    waivedBy: { type: DataTypes.UUID, allowNull: true },
    waiveReason: { type: DataTypes.STRING, allowNull: true },
    // Why a raised charge is still pending (no AR account, posting error).
    remarks: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Ownership stamps (RBAC data scope + future workflow).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'NoShowCharge',
    timestamps: true,
    indexes: [
        { name: 'IX_GolfNoShowCharge_Company_Date', fields: ['companyId', 'playDate'] },
        { name: 'IX_GolfNoShowCharge_Booking', fields: ['bookingProfileId'] },
        { name: 'IX_GolfNoShowCharge_Company_Status', fields: ['companyId', 'status'] },
    ],
});

module.exports = NoShowCharge;
