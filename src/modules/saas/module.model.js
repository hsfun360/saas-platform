const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

const Module = sequelize.define('Module', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true // e.g., "Golf Management"
    },
    icon: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'widgets' // Fallback icon
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true
    },
    landingRoute: {
        type: DataTypes.STRING,
        allowNull: true // the system's default dashboard route, e.g. '/golf'
    }
});

module.exports = Module;