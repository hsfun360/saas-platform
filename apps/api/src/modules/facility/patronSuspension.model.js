const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// Facility Patron Suspension (structure approved 2026-10-26, slice 4) - the
// strike outcome: N counted no-shows inside the window suspend the member's
// BOOKING for S days, club-wide (facilityTypeId NULL); the office may also
// key one by hand and lift one early. Entry and issue at the station are
// unaffected. At most one active row per patron.
const PatronSuspension = sequelize.define('FacilityPatronSuspension', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    patronId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    patronName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    memberNo: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    // NULL = every facility type.
    facilityTypeId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    reason: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    fromDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // Inclusive last day; booking resumes the day after.
    toDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // The NoShowCharge ids that made up the strike count.
    strikeChargeIds: {
        type: DataTypes.JSONB,
        allowNull: true,
    },
    // 'active' | 'lifted' | 'expired'.
    status: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'active',
    },
    liftedAt: { type: DataTypes.DATE, allowNull: true },
    liftedBy: { type: DataTypes.UUID, allowNull: true },
    liftReason: { type: DataTypes.STRING, allowNull: true },
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: FACILITY_SCHEMA,
    tableName: 'PatronSuspension',
    timestamps: true,
    indexes: [
        { name: 'IX_FacilityPatronSuspension_Company_Patron_Status', fields: ['companyId', 'patronId', 'status'] },
        { name: 'IX_FacilityPatronSuspension_Company_Status_To', fields: ['companyId', 'status', 'toDate'] },
    ],
});

module.exports = PatronSuspension;
