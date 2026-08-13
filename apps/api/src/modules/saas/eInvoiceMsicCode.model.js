const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

// e-Invoice MSIC Code reference table - the Malaysia LHDN (MyInvois) MSIC 2008
// sub-category list (5-digit codes) describing a taxpayer's business nature and
// activity (https://sdk.myinvois.hasil.gov.my/codes/e-invoice-msic-codes/). Platform-level
// reference data like EInvoiceClassificationCode: maintained by System Admins on the
// e-Invoice MSIC Codes screen and consumed read-only by every Malaysian subscriber company.
// Populated via "Sync now", which fetches LHDN's published JSON and falls back
// to a bundled snapshot (eInvoiceMsicCode-defaults.js) when unreachable.
const EInvoiceMsicCode = sequelize.define('EInvoiceMsicCode', {
    // LHDN 5-digit MSIC 2008 code as text (e.g. '01111'), incl. the special
    // '00000' NOT APPLICABLE row. Natural primary key; width leaves headroom.
    code: {
        type: DataTypes.STRING(20),
        primaryKey: true,
    },
    // LHDN description (e.g. 'Growing of maize').
    description: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    // LHDN "MSIC Category Reference" - the MSIC 2008 section letter (A-U).
    // Null where LHDN sends none (only '00000').
    categoryReference: {
        type: DataTypes.STRING(20),
        allowNull: true,
    },
    // Whether this code is offered in the app's MSIC pickers.
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
    tableName: 'EInvoiceMsicCode',
    timestamps: true,
});

module.exports = EInvoiceMsicCode;
