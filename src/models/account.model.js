const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Account = sequelize.define('Account', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    subscriptionPlan: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'BASIC', // e.g., BASIC, PRO, ENTERPRISE
    },
    status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'ACTIVE', // e.g., ACTIVE, SUSPENDED, CANCELLED
    }
}, {
    tableName: 'Account',
    timestamps: true,
});

module.exports = Account;