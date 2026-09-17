const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// Advance-booking privilege line (user decisions 2026-09-17): certain
// membership types may book EARLIER than the general GolfSetting days - most
// clubs use one number, so these lines exist only where the club grants the
// privilege, and they apply only while GolfSetting.allowMembershipTypeOverride
// is ON. `membershipTypeId` is a plain UUID value ref into the membership
// service (validated via platform/membershipGateway.js, no FK). Lines are
// PUT-replaced atomically from the Golf Specification screen; keyed by
// companyId directly (like CompanyWeekendDay), not by the setting row.
const AdvanceBookingOverride = sequelize.define('AdvanceBookingOverride', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    membershipTypeId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // This type's privileged window in days (replaces the general days).
    advanceBookingDays: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    // Ownership stamps (RBAC data scope + future workflow).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'AdvanceBookingOverride',
    timestamps: true,
    indexes: [
        { name: 'UX_AdvanceBookingOverride_Company_Type', fields: ['companyId', 'membershipTypeId'], unique: true },
    ],
});

module.exports = AdvanceBookingOverride;
