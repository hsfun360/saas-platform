const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

// Join table: the set of currencies a subscriber (Account) has opted into. A
// company under that account may only pick its default currency from this set. The
// account's chosen default (Account.defaultCurrencyCode) must be one of these.
const AccountCurrency = sequelize.define('AccountCurrency', {
    accountId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // ISO 4217 alpha-3 code referencing Currency.code.
    currencyCode: {
        type: DataTypes.STRING(3),
        allowNull: false,
    },
}, {
    tableName: 'AccountCurrency',
    timestamps: true,
    indexes: [
        { name: 'IDX_AccountCurrency_Unique', fields: ['accountId', 'currencyCode'], unique: true },
    ],
});

module.exports = AccountCurrency;
