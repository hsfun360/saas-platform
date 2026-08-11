const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { AR_SCHEMA } = require('../../platform/schemas');

// Debtor - the AR-owned ledger account (design approved 2026-08-05). One row per
// account that can owe the club money. Deliberately THIN and read-mostly:
//   - It is NOT a replica of party data. Names/addresses stay with the party
//     master (Membership/Member, or ar.OtherDebtor for city-ledger debtors);
//     documents snapshot them at generation time.
//   - Hot balances live in CreditAccount / CreditMemberLimit, not here, so
//     posting traffic never contends with this row.
// The pointer direction is one-way BY DESIGN: Debtor -> (debtorType, sourceId).
// Membership/Member never carry a debtorId - that would invert the upstream
// dependency and cap cardinality. UNIQUE(companyId, debtorType, sourceId) makes
// find-or-create race-safe (concurrent provisioning events both land on the
// same row).
const Debtor = sequelize.define('Debtor', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // 'membership' | 'member' | 'other' - ar.constants DEBTOR_TYPE_KEYS.
    debtorType: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // The Membership id / Member id (cross-service value references) or the
    // ar.OtherDebtor id. Polymorphic, so no FK even for the ar-internal case.
    sourceId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // SORT-KEY SNAPSHOTS of the party's number + display name (columns approved
    // 2026-08-11). The listing still DISPLAYS live values resolved through the
    // membership seam - these exist so ORDER BY can see them; a stale snapshot
    // can only mis-order a row, never mis-display it. Kept fresh by: the
    // provisioning event payload (event-carried state), Other Debtor saves
    // (same tx), the listing's read-repair, and reconciliation (repairs drift
    // in fix mode).
    // NOT NULL since phase B (backfill verified zero NULLs 2026-08-11): a
    // ledger account must never exist without its number and name - a
    // provisioning payload missing them fails and retries via the outbox.
    debtorAccount: {
        type: DataTypes.STRING(64),
        allowNull: false,
    },
    name: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    // Repayment terms in days (drives Invoice/DN dueDate); null = due immediately.
    terms: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    // Statement/dunning preferences (seeded from the Membership credit card at
    // provisioning; maintained HERE afterwards - the single source, per the
    // credit-terms migration decision).
    sendReminders: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    // Late-payment interest opt-in - the interest run only considers debtors
    // with this on.
    chargeInterest: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    // 'active' | 'suspended' | 'closed' - ar.constants DEBTOR_STATUS_KEYS.
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'active',
    },
    // Ownership stamps (RBAC data scope). Null createdBy = system-provisioned
    // (outbox event), not a staff entry.
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: AR_SCHEMA,
    tableName: 'Debtor',
    timestamps: true,
    indexes: [
        { name: 'IDX_Debtor_Company_Type_Source', fields: ['companyId', 'debtorType', 'sourceId'], unique: true },
        { name: 'IDX_Debtor_Company_Status', fields: ['companyId', 'status'] },
        // Sort-key indexes for the listing's ?sort=debtorAccount|name.
        { name: 'IDX_Debtor_Company_Account', fields: ['companyId', 'debtorAccount'] },
        { name: 'IDX_Debtor_Company_Name', fields: ['companyId', 'name'] },
    ],
});

module.exports = Debtor;
