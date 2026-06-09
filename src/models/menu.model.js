const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Menu = sequelize.define('Menu', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false // e.g., "Tee Time Setup"
    },
    parentId: { 
        type: DataTypes.UUID, 
        allowNull: true },
    route: {
        type: DataTypes.STRING,
        allowNull: false // e.g., "/golf/tee-times"
    },
    icon: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'folder' // Default icon just in case!
    },
    moduleId: {
        type: DataTypes.UUID,
        allowNull: false // Links to the Module table
    }
});

module.exports = Menu;