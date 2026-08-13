const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

// e-Invoice Unit Type reference table - the Malaysia LHDN (MyInvois) unit-of-
// measure code list for e-Invoice line quantities (UN/ECE Recommendation 20
// codes, e.g. 'KGM' kilogram, 'H87' piece, 'XZZ' mutually defined;
// https://sdk.myinvois.hasil.gov.my/codes/unit-types/). Platform-level
// reference data like EInvoiceTaxType. Populated via "Sync now" (LHDN JSON,
// bundled fallback in eInvoiceUnitType-defaults.js) and maintained on the
// e-Invoice Unit Types screen.
const EInvoiceUnitType = sequelize.define('EInvoiceUnitType', {
    // UN/ECE Rec 20 code as text, uppercase alphanumeric up to 3 chars today
    // (e.g. '10', 'KGM', 'XZZ'). Natural primary key; width leaves headroom.
    code: {
        type: DataTypes.STRING(20),
        primaryKey: true,
    },
    // LHDN name for the unit (the file's `Name` field, e.g. 'kilogram').
    description: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    // Whether this unit is offered in the app's e-Invoice pickers.
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
    tableName: 'EInvoiceUnitType',
    timestamps: true,
});

module.exports = EInvoiceUnitType;
