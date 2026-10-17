const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// golf.BuggyType (approved 2026-10-17; spec 2.1.1 球车类型主文件) - the kinds
// of buggy a club runs (two-seater, four-seater, VIP, ...). `seats` caps the
// riders an issue of a unit of this type may carry; the fee is NOT here - it
// prices by the golfer category and usage type on the buggy-fee transaction
// types. `companyId` is a Control-Plane reference, no FK.
const GolfBuggyType = sequelize.define('GolfBuggyType', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Uppercase, unique per company.
    code: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // Riders a unit carries (1-6).
    seats: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 2,
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 100,
    },
    // Ownership stamps (RBAC data scope).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'BuggyType',
    timestamps: true,
    indexes: [
        { name: 'UX_GolfBuggyType_Company_Code', fields: ['companyId', 'code'], unique: true },
    ],
});

module.exports = GolfBuggyType;
