const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// Facility Bill Payment (structure approved 2026-10-25) - one tender of a
// settlement; several until the total is met. The member and debtor classes
// post the amount to AR and snapshot the document here. Cascades with the bill.
const BillPayment = sequelize.define('FacilityBillPayment', {
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
    // Class snapshot.
    paymentClass: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    amount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
    },
    // Card approval, voucher number.
    reference: {
        type: DataTypes.STRING(100),
        allowNull: true,
    },
    // AR posting snapshot (account classes).
    arDocId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    arDocNo: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    debtorType: {
        type: DataTypes.STRING(20),
        allowNull: true,
    },
    debtorSourceId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: FACILITY_SCHEMA,
    tableName: 'BillPayment',
    timestamps: true,
    indexes: [
        { name: 'IX_FacilityBillPayment_Bill', fields: ['billId'] },
    ],
});

module.exports = BillPayment;
