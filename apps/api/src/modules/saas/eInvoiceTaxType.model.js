const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

// e-Invoice Tax Type reference table - the Malaysia LHDN (MyInvois) tax-type
// code list stamped on e-Invoice documents/lines ('01' Sales Tax .. '06' Not
// Applicable, 'E' Tax exemption; https://sdk.myinvois.hasil.gov.my/codes/tax-types/).
// Platform-level reference data like EInvoiceClassificationCode. Deliberately
// named EInvoiceTaxType, NOT TaxType: the Tax capability's rates carry their own
// `taxType` vocabulary (tax schema) - this is LHDN's DOCUMENT code list, not the
// tax engine. Populated via "Sync now" (LHDN JSON, bundled fallback in
// eInvoiceTaxType-defaults.js) and maintained on the e-Invoice Tax Types screen.
const EInvoiceTaxType = sequelize.define('EInvoiceTaxType', {
    // LHDN code as text - '01'..'06' plus the alphabetic 'E' (tax exemption).
    // Natural primary key; width leaves headroom.
    code: {
        type: DataTypes.STRING(20),
        primaryKey: true,
    },
    // LHDN description (e.g. 'Sales Tax', 'High-Value Goods Tax').
    description: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    // Whether this tax type is offered in the app's e-Invoice pickers.
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
    tableName: 'EInvoiceTaxType',
    timestamps: true,
});

module.exports = EInvoiceTaxType;
