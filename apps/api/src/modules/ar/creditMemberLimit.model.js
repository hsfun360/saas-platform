const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { AR_SCHEMA } = require('../../platform/schemas');

// CreditMemberLimit - per-person cap inside a debtor's credit pool (approved
// 2026-08-05). A row exists ONLY for persons who are individually capped; the
// two club modes are emergent, not an enum:
//   Combine Limit    - no rows: everyone shares the pool, checked on
//                      CreditAccount alone.
//   Individual Limit - a row per controlled person (e.g. pool 5000, dependents
//                      capped 500 each; the uncapped spouse shares the pool).
// `personalUsed` == the person's UNSETTLED charge portions, materialized: it
// rises when a charge stamped incurredByMemberId posts, and falls as
// allocations settle those items (TRUE OUTSTANDING cap - payments restore the
// cap). Updated in the same tx as the posting/allocation, after the pool row
// (fixed lock order); reconciliation asserts it equals the person's open items.
// Not applicable to 'other' debtors (pool only).
const CreditMemberLimit = sequelize.define('CreditMemberLimit', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Intra-service reference to ar.Debtor (validated in the service).
    debtorId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Membership-service Member id - cross-service value reference, no FK.
    memberId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    personalLimit: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
    },
    personalUsed: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
    // Ownership stamps.
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: AR_SCHEMA,
    tableName: 'CreditMemberLimit',
    timestamps: true,
    indexes: [
        { name: 'IDX_CreditMemberLimit_Debtor_Member', fields: ['debtorId', 'memberId'], unique: true },
        { name: 'IDX_CreditMemberLimit_Company', fields: ['companyId'] },
    ],
});

module.exports = CreditMemberLimit;
