const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// Facility Bill (structure approved 2026-10-25, sub-slice 2c) - ONE bill per
// booking, payable by the booker, opened by the desk from the booking (or at
// check-in, slice 3); golf's bill engine with the per-player and group
// variants removed. Opening auto-charges the Facility Type's default fees
// (the facility fee per slot, the guest fee per guest participant) priced
// from the rate cards; settlement takes several tenders, the account classes
// posting to AR with credit enforcement. One open or settled bill per
// booking; a voided bill may be re-opened.
const Bill = sequelize.define('FacilityBill', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // From the facility-bill series at creation.
    billNo: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    // Slice 3: a bill hangs off a booking, a registration (walk-in entry) or
    // an issue record - exactly one of the three (service rule).
    bookingId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    registrationId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    issueRecordId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // The payer, the booker's Patron.
    patronId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    billDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // Maintained by the engine: items plus exclusive tax.
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
    // 'open' | 'settled' | 'voided'.
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'open',
    },
    remarks: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    settledAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    voidedAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    voidedBy: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    voidReason: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: FACILITY_SCHEMA,
    tableName: 'Bill',
    timestamps: true,
    indexes: [
        { name: 'UX_FacilityBill_Company_No', fields: ['companyId', 'billNo'], unique: true },
        { name: 'IX_FacilityBill_Company_Date', fields: ['companyId', 'billDate'] },
        { name: 'IX_FacilityBill_Booking', fields: ['bookingId'] },
        { name: 'IX_FacilityBill_Registration', fields: ['registrationId'] },
        { name: 'IX_FacilityBill_Issue', fields: ['issueRecordId'] },
    ],
});

module.exports = Bill;
