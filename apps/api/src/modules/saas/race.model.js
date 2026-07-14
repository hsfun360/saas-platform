const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

// Race - SUBSCRIBER-OWNED reference data (Control Plane). One race/ethnicity
// list per Account (e.g. 'MAL - Malay'), shared by every company in the
// subscription and consumed across products (Membership member/prospect/nominee
// profiles) by VALUE reference (`raceCode`).
//
// Pure demographic vocabulary per MH SRS 2.1.12 (code + description) - linked to
// nothing else, same promotion decision as IndustryType/Salutation/Nationality.
// Enable/disable via isActive rather than hard delete.
const Race = sequelize.define('Race', {
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
    // Subscriber-defined short code, unique per account (e.g. 'MAL', 'CHN').
    raceCode: {
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
    tableName: 'Race',
    timestamps: true,
    indexes: [
        { name: 'IDX_Race_Account_Code', fields: ['accountId', 'raceCode'], unique: true },
    ],
});

module.exports = Race;
