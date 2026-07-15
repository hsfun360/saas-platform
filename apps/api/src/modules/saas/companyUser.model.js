const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

const CompanyUser = sequelize.define('CompanyUser', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    userId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: true,    // Internal users might not be tied to a specific company, so we allow this to be null for now. We can always add a separate "SystemUser" model later if needed.
    },
    // 👇 CHANGED: Replaced the hardcoded 'role' string with a dynamic roleId
    roleId: {
        type: DataTypes.UUID,
        allowNull: true, // We set this to true temporarily so it doesn't break your existing test user!
    },
    // Org placement within THIS company (a person can differ per company).
    // Plain UUID references to the subscriber's Department / Position masters
    // (validated in the controller, like roleId). Null = unassigned; the
    // Phase-3 data-scope rule treats unassigned as "own records only".
    departmentId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    positionId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    isActive: { 
        type: DataTypes.BOOLEAN, 
        defaultValue: true }
}, {
    tableName: 'CompanyUser',
    timestamps: true,
    indexes: [
        {
            // A user can still only have one primary role per company
            unique: true,
            fields: ['userId', 'companyId']
        }
    ]
});

module.exports = CompanyUser;