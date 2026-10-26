const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// Facility No-show Charge (structure approved 2026-10-26, slice 4) - ONE
// penalty per booking charged to the booker: a no-show marked at the station
// (or by the end-of-day sweep) or a late cancellation; golf's table shape with
// the booking in place of the flight. Priced from the no-show item's flat
// card with tax; pending until posted to the booker's AR account after the
// raising transaction commits, or waived by the office. A no-show row raised
// while the type's strike switch is ON counts toward the strike window.
const NoShowCharge = sequelize.define('FacilityNoShowCharge', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    bookingId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    bookingNo: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    facilityTypeId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    bookingDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // 'no-show' | 'late-cancel'.
    chargeReason: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    bookerPatronId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    bookerName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // NULL for a visitor booker (the row then cannot post).
    bookerMemberNo: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    // 'BC2 18:00 - 20:00 (2 slots)'.
    slotSummary: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // NULL when none was configured: raised unpriced.
    transactionTypeId: {
        type: DataTypes.UUID,
        allowNull: true,
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
    amount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
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
    // amount plus exclusive tax - what posts to AR.
    totalAmount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
    // TRUE on a no-show row raised while the type's strike switch was ON.
    strikeCounted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    // 'pending' | 'posted' | 'waived'.
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
    },
    arDocId: { type: DataTypes.UUID, allowNull: true },
    arDocNo: { type: DataTypes.STRING(50), allowNull: true },
    debtorType: { type: DataTypes.STRING(20), allowNull: true },
    debtorSourceId: { type: DataTypes.UUID, allowNull: true },
    postedAt: { type: DataTypes.DATE, allowNull: true },
    postedBy: { type: DataTypes.UUID, allowNull: true },
    waivedAt: { type: DataTypes.DATE, allowNull: true },
    waivedBy: { type: DataTypes.UUID, allowNull: true },
    waiveReason: { type: DataTypes.STRING, allowNull: true },
    // Why a pending row did not post.
    remarks: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: FACILITY_SCHEMA,
    tableName: 'NoShowCharge',
    timestamps: true,
    indexes: [
        { name: 'IX_FacilityNoShowCharge_Company_Status', fields: ['companyId', 'status'] },
        { name: 'IX_FacilityNoShowCharge_Company_Date', fields: ['companyId', 'bookingDate'] },
        { name: 'IX_FacilityNoShowCharge_Company_Booker_Date', fields: ['companyId', 'bookerPatronId', 'bookingDate'] },
        { name: 'IX_FacilityNoShowCharge_Booking', fields: ['bookingId'] },
    ],
});

module.exports = NoShowCharge;
