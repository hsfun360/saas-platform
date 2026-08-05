const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { AR_SCHEMA } = require('../../platform/schemas');

// Statement - the monthly cutoff document (approved 2026-08-05). THIS is where
// the party snapshot lands: the run looks the debtor's name/address up ONCE
// (through the seams) and freezes it here - reprints and audits never
// re-resolve, and the thin-Debtor rule (no party data on the ledger account)
// stays intact.
const Statement = sequelize.define('Statement', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    debtorId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    statementNo: {
        type: DataTypes.STRING(30),
        allowNull: false,
    },
    // The cutoff date.
    statementDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    periodStart: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    periodEnd: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    openingBalance: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
    },
    closingBalance: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
    },
    // Party snapshot, frozen at generation.
    billName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // { line1, line2, line3, city, state, postcode, countryCode } - whatever
    // the party master held at generation time.
    billAddress: {
        type: DataTypes.JSONB,
        allowNull: true,
    },
    // 'generated' | 'sent' | 'void'.
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'generated',
    },
    // Ownership stamps. Null createdBy = a scheduled run.
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: AR_SCHEMA,
    tableName: 'Statement',
    timestamps: true,
    indexes: [
        { name: 'IDX_Statement_Company_No', fields: ['companyId', 'statementNo'], unique: true },
        { name: 'IDX_Statement_Debtor_Date', fields: ['debtorId', 'statementDate'] },
        { name: 'IDX_Statement_Company_Date', fields: ['companyId', 'statementDate'] },
    ],
});

module.exports = Statement;
