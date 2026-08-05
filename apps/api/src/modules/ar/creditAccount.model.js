const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { AR_SCHEMA } = require('../../platform/schemas');

// CreditAccount - the debtor's shared credit pool (approved 2026-08-05). One
// row per Debtor, split out so the READ-MOSTLY Debtor row never contends with
// posting traffic: every posting/receipt/allocation transaction locks THIS row
// (SELECT FOR UPDATE) first - fixed lock order: pool row, then person rows by
// memberId - re-checks the limit, and bumps `outstanding` in the same tx.
// Balances are MATERIALIZED, never SUMmed at check time; a scheduled
// reconciliation job asserts outstanding == open items - unallocated credits.
//
// `creditLimit` is set manually by Finance (decision 2026-08-05: the security
// deposit is an operational prerequisite but NEVER derives the limit).
// `outstanding` can go negative: unallocated receipt credit reduces the pool
// immediately (auto-releases credit for uncapped persons).
const CreditAccount = sequelize.define('CreditAccount', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // 1:1 with ar.Debtor (intra-service; unique index enforces the cardinality,
    // reference validated in the service - consistent with the no-FK style).
    debtorId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    creditLimit: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
    outstanding: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
    // Ownership stamps. Null createdBy = system-provisioned with the Debtor.
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: AR_SCHEMA,
    tableName: 'CreditAccount',
    timestamps: true,
    indexes: [
        { name: 'IDX_CreditAccount_Debtor', fields: ['debtorId'], unique: true },
        { name: 'IDX_CreditAccount_Company', fields: ['companyId'] },
    ],
});

module.exports = CreditAccount;
