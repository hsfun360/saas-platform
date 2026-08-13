const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

// e-Invoice Document Type reference table - the Malaysia LHDN (MyInvois)
// e-Invoice type code list identifying each document ('01' Invoice, '02' Credit
// Note, '03' Debit Note, '04' Refund Note, '11'-'14' the self-billed variants;
// https://sdk.myinvois.hasil.gov.my/codes/e-invoice-types/). LHDN's file calls
// them "e-Invoice Types"; DocumentType is the clearer name beside the other
// EInvoice* tables. Platform-level reference data like EInvoiceTaxType.
// Populated via "Sync now" (LHDN JSON, bundled fallback in
// eInvoiceDocumentType-defaults.js) and maintained on the e-Invoice Document
// Types screen.
const EInvoiceDocumentType = sequelize.define('EInvoiceDocumentType', {
    // LHDN 2-digit code as text (e.g. '01', '11'). Natural primary key; width
    // leaves headroom.
    code: {
        type: DataTypes.STRING(20),
        primaryKey: true,
    },
    // LHDN description (e.g. 'Invoice', 'Self-billed Credit Note').
    description: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    // Whether this document type is offered in the app's e-Invoice pickers.
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
    tableName: 'EInvoiceDocumentType',
    timestamps: true,
});

module.exports = EInvoiceDocumentType;
