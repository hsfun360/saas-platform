const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { AR_SCHEMA } = require('../../platform/schemas');

// TaxLedger - the per-component tax breakdown behind a Ledger document's tax
// snapshot (structure approved by the user 2026-08-24). One row per rate line
// of the scheme, in `lineNo` computation order, FROZEN from the tax quote the
// moment the document's tax amounts are written - at Save for manual drafts
// (re-written on every draft edit), at posting-time creation for system
// documents (DN door, interest run, producer charges), copied onto void
// reversals. Never re-derived afterwards: SUM(taxAmount) always equals the
// parent Ledger row's taxAmount.
//
// The priority semantics come from the Tax calculator (pinned rules): lines
// sharing a taxPriority tax the SAME base entering their tier; a later tier's
// taxableAmount = net + all earlier tiers' tax (tax-on-tax, e.g. SST at
// priority 2 taxing net + a priority-1 service charge).
//
// Documents from before this table exist without breakdown rows - the header
// tax snapshot stays authoritative; no backfill (the quotes are history).
const TaxLedger = sequelize.define('ArTaxLedger', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Mirrors ar.Ledger.docKind ('invoice' | 'debit-note' | 'credit-note') -
    // user decision 2026-08-24; Deposit joins later if deposit billing
    // becomes taxable.
    docType: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // Parent-row mirrors (user request 2026-08-24) so tax reporting filters
    // and signs lines WITHOUT joining ar.Ledger: `mode` ('debit' | 'credit')
    // is immutable with its document; `status` follows the parent through
    // every lifecycle transition (draft | pending-approval | open | settled |
    // void), kept in step by taxLedger.service.syncStatus at each flip.
    mode: {
        type: DataTypes.STRING(10),
        allowNull: false,
    },
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // The ar.Ledger row this line explains (intra-service value reference).
    docId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // 1..n in computation order (= the quote's line order).
    lineNo: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    taxSchemeCode: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // Component snapshots from the resolved TaxRate line.
    taxCode: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // 'Tax' | 'Service Charge' - descriptive, for reporting/GL.
    taxType: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    taxPriority: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    taxRate: {
        type: DataTypes.DECIMAL(7, 4),
        allowNull: false,
    },
    // Document-currency amounts (the parent row's currency).
    taxableAmount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
    },
    taxAmount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
    },
    // Input-tax credit snapshot (0 when the component is not claimable).
    claimablePercentage: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
    },
    claimableAmount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
    // Base-currency equivalents at the parent document's frozen exchange rate
    // (SST / MyInvois report tax in base).
    baseTaxableAmount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
    },
    baseTaxAmount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
    },
    baseClaimableAmount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
    // Ownership stamps (RBAC data scope; rows follow their document).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: AR_SCHEMA,
    tableName: 'TaxLedger',
    timestamps: true,
    indexes: [
        { name: 'IDX_ArTaxLedger_Doc_Line', fields: ['docType', 'docId', 'lineNo'], unique: true },
        { name: 'IDX_ArTaxLedger_Doc', fields: ['docType', 'docId'] },
        // Tax reporting sweeps (per company, per component code).
        { name: 'IDX_ArTaxLedger_Company_Code', fields: ['companyId', 'taxCode'] },
    ],
});

module.exports = TaxLedger;
