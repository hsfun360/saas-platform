const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

// e-Invoice State Code reference table - the Malaysia LHDN (MyInvois) state
// code list for e-Invoice addresses ('01' Johor .. '16' Putrajaya, '17' Not
// Applicable; https://sdk.myinvois.hasil.gov.my/codes/state-codes/).
// Platform-level reference data like EInvoiceTaxType. Populated via "Sync now"
// (LHDN JSON, bundled fallback in eInvoiceStateCode-defaults.js) and maintained
// on the e-Invoice State Codes screen.
const EInvoiceStateCode = sequelize.define('EInvoiceStateCode', {
    // LHDN 2-digit state code as text (e.g. '01'). Natural primary key; width
    // leaves headroom.
    code: {
        type: DataTypes.STRING(20),
        primaryKey: true,
    },
    // LHDN state name (the file's `State` field, e.g. 'Johor').
    description: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    // Whether this state is offered in the app's e-Invoice pickers.
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
    tableName: 'EInvoiceStateCode',
    timestamps: true,
});

module.exports = EInvoiceStateCode;
