const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// golf.CaddyGrade (approved 2026-10-17; spec 2.1.1 球僮等级) - the club's caddy
// grades. `playersPerCaddy` is how many golfers one caddy of the grade serves
// at once (the cap on a caddy slot at the station). The spec's pay rates were
// dropped by user decision (the club pays caddies outside the system; the
// rounds served are tracked instead). `companyId` is a Control-Plane
// reference, no FK.
const GolfCaddyGrade = sequelize.define('GolfCaddyGrade', {
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
    // Golfers served at once (1-4).
    playersPerCaddy: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
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
    tableName: 'CaddyGrade',
    timestamps: true,
    indexes: [
        { name: 'UX_GolfCaddyGrade_Company_Code', fields: ['companyId', 'code'], unique: true },
    ],
});

module.exports = GolfCaddyGrade;
