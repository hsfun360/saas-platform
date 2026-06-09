const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const CompanyModule = sequelize.define('CompanyModule', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false
    },
    moduleId: {
        type: DataTypes.UUID,
        allowNull: false
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
});

module.exports = CompanyModule;