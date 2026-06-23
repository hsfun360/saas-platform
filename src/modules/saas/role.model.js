const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

const Role = sequelize.define('Role', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: true // Some roles might be global (e.g., System Admin), so this can be nullable
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