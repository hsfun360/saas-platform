const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { MEMBERSHIP_SCHEMA } = require('../../platform/schemas');

// membership.AffiliatedVisitFlight (structure approved 2026-11-14) - the golf
// flight a letter of introduction holds for ONE of its days. A letter may
// cover several days and what the visitor uses differs by day (golf on the
// first, a facility on the second, both on the third), so the flights hang
// off the letter one row per booking instead of the single
// AffiliatedVisit.bookingProfileId the first design carried.
// `bookingProfileId` is a plain value ref into golf (the flight booking made
// through platform/golfGateway.js); `playDate` falls inside the letter's
// dates. Golf asks through the membership seam whether a booking belongs to
// a letter, and registers its players only once the visitor has registered at
// the Registration Counter for that play date.
const AffiliatedVisitFlight = sequelize.define('AffiliatedVisitFlight', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    affiliatedVisitId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    playDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    bookingProfileId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Ownership stamps (RBAC data scope).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: MEMBERSHIP_SCHEMA,
    tableName: 'AffiliatedVisitFlight',
    timestamps: true,
    indexes: [
        { name: 'UX_AffiliatedVisitFlight_Booking', fields: ['bookingProfileId'], unique: true },
        { name: 'IX_AffiliatedVisitFlight_Company_Visit_Date', fields: ['companyId', 'affiliatedVisitId', 'playDate'] },
    ],
});

module.exports = AffiliatedVisitFlight;
