const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// Golf front-desk BILL - PER PLAYER (user decisions 2026-09-26): one bill per
// registered golfer, hanging off their RegistrationPlayer row. Items in
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
    registrationPlayerId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    golferId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    billDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
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
        { name: 'IX_GolfBill_RegistrationPlayer', fields: ['registrationPlayerId'] },
    ],
});

module.exports = Bill;
