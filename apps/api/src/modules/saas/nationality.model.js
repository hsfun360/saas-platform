const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

// Nationality - SUBSCRIBER-OWNED reference data (Control Plane). One nationality
// list per Account (e.g. 'MAS - Malaysian'), shared by every company in the
// subscription and consumed across products (Membership member/prospect/nominee
// profiles, Golf) by VALUE reference (`nationalityCode`).
//
// Deliberately NOT linked to the Country table: Country is address data, and a
// person's residential country cannot be translated to their nationality (someone
// living in Malaysia may be Singaporean). Plain code + demonym, per MH SRS 2.1.10.
// Enable/disable via isActive.
const Nationality = sequelize.define('Nationality', {
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
    // Subscriber-defined short code, unique per account (e.g. 'MAS', 'SGP').
    nationalityCode: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // The demonym shown to users (e.g. 'Malaysian').
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
    tableName: 'Nationality',
    timestamps: true,
    indexes: [
        { name: 'IDX_Nationality_Account_Code', fields: ['accountId', 'nationalityCode'], unique: true },
    ],
});

module.exports = Nationality;
