const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

const RoleMenu = sequelize.define('RoleMenu', {
    roleId: {
        type: DataTypes.UUID,
        allowNull: false,
        primaryKey: true
    },
    menuId: {
        type: DataTypes.UUID,
        allowNull: false,
        primaryKey: true
    }
}, {
    timestamps: false // No need for createdAt/updatedAt on a simple mapping table
});

module.exports = RoleMenu;