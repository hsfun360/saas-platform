const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

// e-Invoice Payment Method reference table - the Malaysia LHDN (MyInvois)
// payment-method code list for e-Invoice documents ('01' Cash .. '08' Others;
// https://sdk.myinvois.hasil.gov.my/codes/payment-methods/). Platform-level
// reference data like EInvoiceTaxType. Deliberately EInvoice-prefixed: this is
// LHDN's DOCUMENT code list, distinct from any future POS/product payment-method
// setup. Populated via "Sync now" (LHDN JSON, bundled fallback in
// eInvoicePaymentMethod-defaults.js) and maintained on the e-Invoice Payment
// Methods screen.
const EInvoicePaymentMethod = sequelize.define('EInvoicePaymentMethod', {
    // LHDN 2-digit payment-method code as text (e.g. '01'). Natural primary
    // key; width leaves headroom.
    code: {
        type: DataTypes.STRING(20),
        primaryKey: true,
    },
    // LHDN name (the file's `Payment Method` field, e.g. 'Cash', 'Cheque').
    description: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    // Whether this payment method is offered in the app's e-Invoice pickers.
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
    tableName: 'EInvoicePaymentMethod',
    timestamps: true,
});

module.exports = EInvoicePaymentMethod;
