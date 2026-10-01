const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// Golf Session (user decision 2026-10-01, name is the user's - sessions serve
// the per-session BOOKING LIMIT today and session-based analysis later). The
// club's named day parts - e.g. Morning / Afternoon / Evening - each a time
// band (end exclusive). Maintained on Golf Specification, PUT-replaced; bands
// must not overlap. A tee time no band covers is simply outside the session
// system (the session booking limit then does not constrain it).
const GolfSession = sequelize.define('GolfSession', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The club's label for the session ('Morning', 'Afternoon', ...).
    name: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    startTime: {
        type: DataTypes.TIME,
        allowNull: false,
    },
    // End exclusive: a session 12:00-17:00 owns tee times 12:00..16:59.
    endTime: {
        type: DataTypes.TIME,
        allowNull: false,
    },
    // Display order on the editor (morning first).
    sequence: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
    },
    // Ownership stamps (RBAC data scope + future workflow).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'GolfSession',
    timestamps: true,
    indexes: [
        { name: 'UX_GolfSession_Company_Name', fields: ['companyId', 'name'], unique: true },
    ],
});

module.exports = GolfSession;
