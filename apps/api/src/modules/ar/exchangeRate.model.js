const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { AR_SCHEMA } = require('../../platform/schemas');

// ExchangeRate - the company's effective-dated rate table for foreign-currency
// AR (step 1 of the multicurrency design, approved 2026-08-21). AR-owned like
// ar.NumberingScheme: a rate is a finance/accounting fact of the company, not
// Control-Plane reference data (Currency stays the ISO catalogue).
//
// Convention: `rate` = how many units of the company BASE currency
// (Company.defaultCurrencyCode) ONE unit of `currencyCode` buys, e.g. USD row
// with rate 4.7100000000 for an MYR-based company means 1 USD = 4.71 MYR.
// Base amount = foreign amount x rate.
//
// Lookup = the row with the latest effectiveDate <= the document date for
// that currency. Documents SNAPSHOT the rate they used (Ledger/Receipt/
// Deposit exchangeRate columns, later steps), so editing or deleting a rate
// here never rewrites history - it only changes what future documents default
// to. A rate is NOT money: DECIMAL(21,10), per the schema convention that
// rates keep their own precision.
const ExchangeRate = sequelize.define('ArExchangeRate', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // ISO 4217 alpha-3 of the FOREIGN currency (value reference to
    // Currency.code, no FK). Never the base currency itself.
    currencyCode: {
        type: DataTypes.STRING(3),
        allowNull: false,
    },
    // First day this rate applies (inclusive).
    effectiveDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    rate: {
        type: DataTypes.DECIMAL(21, 10),
        allowNull: false,
    },
    // Ownership stamps (RBAC data scope).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: AR_SCHEMA,
    tableName: 'ExchangeRate',
    timestamps: true,
    indexes: [
        // One rate per currency per effective day; also the lookup index
        // (latest effectiveDate <= docDate for a currency).
        { name: 'IDX_ArExchangeRate_Company_Currency_Date', fields: ['companyId', 'currencyCode', 'effectiveDate'], unique: true },
    ],
});

module.exports = ExchangeRate;
