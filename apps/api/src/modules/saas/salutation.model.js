const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

// Salutation - SUBSCRIBER-OWNED reference data (Control Plane). One salutation
// list per Account (e.g. Mr, Mrs, Ms, Dr, Datuk - locale/culture aware), shared
// by every company in the subscription and consumed across products (Membership
// member/prospect/nominee profiles, Golf) by VALUE reference (`salutationCode`).
//
// Promoted from the legacy membership spec (salutation appears in MH SRS name
// format 2.1.17 / member profiles) to subscriber level, same as IndustryType.
// Enable/disable via isActive rather than hard delete.
const Salutation = sequelize.define('Salutation', {
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
    // Subscriber-defined short code, unique per account (e.g. 'MR', 'DATUK').
    salutationCode: {
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
    tableName: 'Salutation',
    timestamps: true,
    indexes: [
        { name: 'IDX_Salutation_Account_Code', fields: ['accountId', 'salutationCode'], unique: true },
    ],
});

module.exports = Salutation;
