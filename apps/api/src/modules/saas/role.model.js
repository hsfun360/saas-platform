const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

const Role = sequelize.define('Role', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    // Roles are account-level (a named set of menu permissions, not tied to a
    // company). `accountId` is the owning subscriber account. `companyId` is
    // legacy (kept during the transition; dropped by migrate-account-roles.js
    // once data is backfilled + merged).
    accountId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: true // legacy — superseded by accountId
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false // e.g., "Pro Shop Cashier"
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true // optional human-readable description, shown in Role Management
    }
});

module.exports = Role;