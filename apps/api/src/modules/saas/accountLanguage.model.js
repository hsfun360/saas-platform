const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

// Join table: the set of languages a subscriber (Account) has opted into. A user
// under that account may only pick a preferred language from this set. The
// account's chosen default (Account.defaultLanguageCode) must be one of these.
const AccountLanguage = sequelize.define('AccountLanguage', {
    accountId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // ISO 639 code referencing Language.languageCode.
    languageCode: {
        type: DataTypes.STRING(10),
        allowNull: false,
    },
}, {
    tableName: 'AccountLanguage',
    timestamps: true,
    indexes: [
        { name: 'IDX_AccountLanguage_Unique', fields: ['accountId', 'languageCode'], unique: true },
    ],
});

module.exports = AccountLanguage;
