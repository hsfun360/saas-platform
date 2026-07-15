const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

// Department - SUBSCRIBER-OWNED reference data (Control Plane). One department
// list per Account, shared by every company in the subscription (same pattern
// as IndustryType). Assigned to users per company membership
// (CompanyUser.departmentId) and consumed by the RBAC data-scope rule
// ("a Staff record may be amended by their Supervisor/Manager from the same
// department" - Phase 3).
// Enable/disable via isActive rather than hard delete (assignments may exist).
const Department = sequelize.define('Department', {
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
    // Subscriber-defined short code, unique per account (e.g. 'FIN', 'GOLF').
    departmentCode: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
}, {
    tableName: 'Department',
    timestamps: true,
    indexes: [
        { name: 'IDX_Department_Account_Code', fields: ['accountId', 'departmentCode'], unique: true },
    ],
});

module.exports = Department;
