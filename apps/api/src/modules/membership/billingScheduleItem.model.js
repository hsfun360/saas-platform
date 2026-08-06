const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { MEMBERSHIP_SCHEMA } = require('../../platform/schemas');

// BillingScheduleItem - one row per charge a fee run intends to post (approved
// 2026-08-06, user naming). Everything is RESOLVED AT GENERATION - the amount
// from the fee source, the billing item, and the debtor routing per the
// bear-flag rules - so the review screen shows exactly what will post, per
// person, before anything commits. Each POSTED item = one AR Invoice.
// Items are permanent audit rows; review unticks become 'skipped', posting
// failures carry `issue`.
const BillingScheduleItem = sequelize.define('BillingScheduleItem', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Intra-service parent (validated in the service).
    billingScheduleId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The contract this item belongs to.
    membershipId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The nominee this item bills; null = the contract itself.
    memberId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // Stamped onto the Invoice (statements itemize by person): nominee items =
    // the nominee, individual-membership items = the individual member,
    // corporate contract-level items = null.
    incurredByMemberId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // 'membership' | 'member' - resolved ONCE at generation by the bear-flag
    // routing; posting resolves the actual Debtor through the AR gateway.
    debtorTarget: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // The billing item (single tax source) - Transaction Type id.
    transactionTypeId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // NET, resolved from the fee source at generation.
    amount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
    },
    // 'pending' | 'posted' | 'skipped' | 'failed'.
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
    },
    // The AR Invoice this item became (+ display snapshot of its number).
    postedLedgerId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    postedDocNo: {
        type: DataTypes.STRING(30),
        allowNull: true,
    },
    // Why the item skipped/failed (no ledger account, tax unresolved, ...).
    issue: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Ownership stamps.
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: MEMBERSHIP_SCHEMA,
    tableName: 'BillingScheduleItem',
    timestamps: true,
    indexes: [
        { name: 'IDX_BillingScheduleItem_Schedule', fields: ['billingScheduleId'] },
        { name: 'IDX_BillingScheduleItem_Company', fields: ['companyId'] },
        { name: 'IDX_BillingScheduleItem_Membership', fields: ['membershipId'] },
    ],
});

module.exports = BillingScheduleItem;
