const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

// Currency reference table - ISO 4217. The set of currencies the platform can use
// (amounts, pricing, reports). Deliberately follows the standard: an alpha-3 code,
// the ISO numeric code, the English name, the number of minor-unit decimals, plus
// a display symbol (a practical convenience - symbols are NOT part of ISO 4217)
// and an active flag controlling whether it's offered in the app's pickers.
// Populated from a bundled ISO 4217 default set (currency-defaults.js) via the
// "Load defaults" action and maintained by System Admins on the Currencies screen.
const Currency = sequelize.define('Currency', {
    // ISO 4217 alpha-3 code, uppercase (e.g. 'MYR', 'USD'). Natural primary key.
    code: {
        type: DataTypes.STRING(3),
        primaryKey: true,
    },
    // ISO 4217 numeric code (e.g. 458 for MYR, 840 for USD).
    numericCode: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    // English display name (e.g. 'Malaysian Ringgit').
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // Display symbol (e.g. 'RM', '$', '€'). Not part of ISO 4217 - convenience only.
    symbol: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Number of decimal places (ISO 4217 minor unit): 2 for most, 0 for JPY/KRW,
    // 3 for BHD/KWD/OMR, etc.
    minorUnit: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 2,
    },
    // Whether this currency is offered in the app's currency pickers.
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
}, {
    tableName: 'Currency',
    timestamps: true,
});

module.exports = Currency;
