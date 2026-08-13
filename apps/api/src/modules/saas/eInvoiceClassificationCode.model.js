const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

// e-Invoice Classification Code reference table - the Malaysia LHDN (MyInvois)
// code list that categorises the products/services on an e-Invoice line
// (https://sdk.myinvois.hasil.gov.my/codes/e-invoice-classification-codes/). Platform-level
// reference data like Country: maintained by System Admins on the Classification
// Codes screen and consumed read-only by every Malaysian subscriber company.
// Populated via "Sync now", which fetches LHDN's published JSON and falls back
// to a bundled snapshot (eInvoiceClassificationCode-defaults.js) when unreachable.
const EInvoiceClassificationCode = sequelize.define('EInvoiceClassificationCode', {
    // LHDN 3-digit code, zero-padded text (e.g. '022', '045'). Natural primary key.
    code: {
        type: DataTypes.STRING(3),
        primaryKey: true,
    },
    // LHDN description (e.g. 'Others'). TEXT, not STRING: code 038 runs past 255 chars.
    description: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    // Whether this code is offered in the app's classification-code pickers.
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    // When this row last came from LHDN's published list (null = manually added).
    syncedAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
}, {
    tableName: 'EInvoiceClassificationCode',
    timestamps: true,
});

module.exports = EInvoiceClassificationCode;
