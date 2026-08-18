const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { AR_SCHEMA } = require('../../platform/schemas');

// Transaction Type master - AR-OWNED (promoted out of Membership 2026-08-15,
// user decision: AR is the ledger, so the billing/receipting catalog lives
// here and every producer maps into it). Classified by trxClass = which
// DOCUMENT BOOK may use the entry (each entry screen filters its own class);
// module usability is explicit (`usableInModules`), never inferred - debtor
// ROUTING knowledge stays with the producers, not the catalog.
//
// Rows migrated from membership.TransactionType KEEP THEIR IDS, so posted
// documents, fee masters and standing charges reference them untouched.
//
// `taxSchemeCode` is a value reference into the Tax service BY CODE (stable
// across effective-dated rate versions), resolved through platform/taxGateway.
// `eInvoiceClassificationCode` is a value reference into the Control-Plane
// LHDN classification list (validated through serviceContext).
const TransactionType = sequelize.define('TransactionType', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The code (e.g. 'MEM', 'STAN', 'CASH') - unique per company.
    transactionType: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    // Which document book the entry belongs to - ar.constants TRX_CLASSES:
    // 'invoice' | 'debit-note' | 'credit-note' | 'interest' | 'deposit'
    // (deposit BILLING) | 'receipt' (debtor payments; refunds share this
    // vocabulary - money movement in the other direction) | 'forex'
    // (future: exchange gain/loss on foreign-currency receipts).
    trxClass: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Tax Scheme by code via the tax seam; null = no tax.
    taxSchemeCode: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Do overdue open items of this billing item attract late-payment
    // interest? Snapshotted onto ar.Ledger at posting (never retro-changes
    // history). The Interest type itself stays false - no compounding.
    isInterestChargeable: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    // Which PRODUCER modules may post with this entry (module keys, e.g.
    // ["membership"]; golf/facility/pos join as their charge-to-account flows
    // wire in). Empty = AR-only. Enforced at the arGateway posting seam, not
    // just in pickers; the UI offers only modules the company is entitled to.
    usableInModules: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
    },
    // LHDN MyInvois: is this item e-Invoice relevant, and under which
    // classification code (required when the flag is on)? Snapshotted onto
    // document lines when the submission flow lands.
    isEInvoice: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    eInvoiceClassificationCode: {
        type: DataTypes.STRING(20),
        allowNull: true,
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    // Ownership stamps (RBAC data scope + workflow).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: AR_SCHEMA,
    tableName: 'TransactionType',
    timestamps: true,
    indexes: [
        { name: 'IDX_ArTransactionType_Company_Code', fields: ['companyId', 'transactionType'], unique: true },
        { name: 'IDX_ArTransactionType_Company_Class', fields: ['companyId', 'trxClass'] },
    ],
});

module.exports = TransactionType;
