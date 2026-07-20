const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { MEMBERSHIP_SCHEMA } = require('../../platform/schemas');

// Club Specification (SRS 2.1.1 - membership system master) - a per-company
// SINGLETON that declares what kind of club this is, so the entry screens show
// only the fields that apply. Like the legacy system master it is modify-only:
// the row is find-or-created with safe defaults on first read, never listed,
// never deleted, never deactivated (hence no isActive).
//
// Membership auto/manual numbering deliberately has NO column here - that fact
// is owned by Numbering Control (NumberingScheme.mode) and is read/written
// through platform/numberingGateway.js, keeping a single source of truth.
//
// The legacy 2.1.1 fields still planned (conversion default statuses, nominee
// expiration days, follow-principal statuses) become additional columns on
// this same singleton when Phase 3 lands.
const MembershipSetting = sequelize.define('MembershipSetting', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    // Owning company - one settings row each. UUID value reference, no FK.
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // 'golf' | 'leisure' | 'others' - one of CLUB_TYPE_KEYS.
    clubType: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'golf',
    },
    // Committee club (proposal -> interview -> provision track, Proposer/Seconder)
    // vs commercial pay-to-join. When true the three sales channels below are
    // forced false - committee clubs have no sales agents.
    isCommittee: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    // Which sales channels the club uses (commercial clubs only). They gate the
    // agent-kind choices and the salesperson pickers on membership entry.
    salesAgencyEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    salesExternalEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    salesInternalEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },

    // Ownership stamps (RBAC data scope). Nullable: the singleton may be
    // auto-created by the system on first read, before anyone edits it.
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: MEMBERSHIP_SCHEMA,
    tableName: 'MembershipSetting',
    timestamps: true,
    indexes: [
        { name: 'IDX_MembershipSetting_Company', fields: ['companyId'], unique: true },
    ],
});

module.exports = MembershipSetting;
