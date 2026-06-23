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

    // --- Company profile / billing details (used when generating invoices in the
    // Core system). All nullable so sequelize.sync({ alter: true }) adds them to
    // existing rows; editable over time by a Tenant Admin. ---
    taxRegistrationNumber: { type: DataTypes.STRING, allowNull: true },
    email: { type: DataTypes.STRING, allowNull: true },
    phone: { type: DataTypes.STRING, allowNull: true },
    website: { type: DataTypes.STRING, allowNull: true },
    addressLine1: { type: DataTypes.STRING, allowNull: true },
    addressLine2: { type: DataTypes.STRING, allowNull: true },
    city: { type: DataTypes.STRING, allowNull: true },
    state: { type: DataTypes.STRING, allowNull: true },
    postalCode: { type: DataTypes.STRING, allowNull: true },
    country: { type: DataTypes.STRING, allowNull: true },

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