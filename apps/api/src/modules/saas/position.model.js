const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

// Position - SUBSCRIBER-OWNED reference data (Control Plane). One position
// ladder per Account (same pattern as IndustryType), assigned to users per
// company membership (CompanyUser.positionId).
//
// `rank` is what the RBAC data-scope rule compares (Phase 3): HIGHER = MORE
// SENIOR, so "a Supervisor/Manager may amend a Staff-keyed record in the same
// department" is simply modifier.rank > owner.rank. Defaults ship gapped
// (10/20/30) so levels can be inserted between later; equal ranks are peers.
// Enable/disable via isActive rather than hard delete (assignments may exist).
const Position = sequelize.define('Position', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    // The owning subscriber (Account). UUID reference, no FK.
    accountId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Subscriber-defined short code, unique per account (e.g. 'MGR', 'STF').
    positionCode: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Seniority for the data-scope rule: higher = more senior; ties = peers.
    rank: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
}, {
    tableName: 'Position',
    timestamps: true,
    indexes: [
        { name: 'IDX_Position_Account_Code', fields: ['accountId', 'positionCode'], unique: true },
    ],
});

module.exports = Position;
