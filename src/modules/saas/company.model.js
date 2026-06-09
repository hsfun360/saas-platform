const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

const Company = sequelize.define('Company', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    accountId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // 👇 Added to capture the legal registration you mentioned!
    registrationNumber: {
        type: DataTypes.STRING,
        allowNull: true, 
    },
    timezone: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'Asia/Kuala_Lumpur', 
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
    }
}, {
    tableName: 'Company',
    timestamps: true,
});

module.exports = Company;