const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// One settlement tender of a golf Bill (user vocabulary: BillPayment) -
// MULTIPLE tenders per bill are allowed until Σ amounts = the bill total.
// The payment type's CLASS decides behaviour: cash-like classes (cash /
// creditcard / voucher / staff / online / suspend) simply record the tender;
// 'member' posts the amount to the billed member's own AR account through
// arGateway.postCharge({ enforceCredit: true }) and snapshots the posted
// document here; 'debtor' (charge to an arbitrary AR account) arrives later.
const BillPayment = sequelize.define('GolfBillPayment', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    billId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    paymentTypeId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Class snapshot (paymentType.constants PAYMENT_CLASSES key).
    paymentClass: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    amount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
    },
    // Card approval no. / voucher no. / free-text reference.
    reference: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    // AR posting snapshot (member/debtor classes).
    arDocId: { type: DataTypes.UUID, allowNull: true },
    arDocNo: { type: DataTypes.STRING(50), allowNull: true },
    debtorType: { type: DataTypes.STRING(20), allowNull: true },
    debtorSourceId: { type: DataTypes.UUID, allowNull: true },
    // Ownership stamps (RBAC data scope + future workflow).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'BillPayment',
    timestamps: true,
    indexes: [
        { name: 'IX_GolfBillPayment_Bill', fields: ['billId'] },
    ],
});

module.exports = BillPayment;
