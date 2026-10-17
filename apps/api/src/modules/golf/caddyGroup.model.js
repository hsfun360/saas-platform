const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// golf.CaddyGroup (approved 2026-10-17; spec 2.1.2 球僮分组, the area dropped)
// - an OPTIONAL grouping of caddies (a team under a leader) with a size cap
// and the order the groups rotate in. `companyId` is a Control-Plane
// reference, no FK.
const GolfCaddyGroup = sequelize.define('GolfCaddyGroup', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    code: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // NULL = no cap.
    maxCaddies: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    rotationOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 100,
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    // Ownership stamps (RBAC data scope).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'CaddyGroup',
    timestamps: true,
    indexes: [
        { name: 'UX_GolfCaddyGroup_Company_Code', fields: ['companyId', 'code'], unique: true },
    ],
});

module.exports = GolfCaddyGroup;
