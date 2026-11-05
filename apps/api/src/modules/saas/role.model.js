const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

// A Role is an ACCOUNT-level named set of menu permissions (RBAC). Ownership is the
// single discriminator, mirroring TaxScheme:
//   - accountId = <subscriber account>  -> a tenant role.
//   - accountId = NULL                  -> a PLATFORM (system) role, e.g. System Admin.
// `accountId` is a plain value reference (no cross-service FK).
//
// The legacy per-company `companyId` column was retired 2026-07-10: roles are
// account-level, backfilled to accountId, and the column is dropped from the DB.
const Role = sequelize.define('Role', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    accountId: {
        type: DataTypes.UUID,
        allowNull: true, // NULL = platform-owned (system) role
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false // e.g., "Pro Shop Cashier"
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true // optional human-readable description, shown in Role Management
    },
    // WHOSE records the role may Edit/Delete (row-level data scope; viewing is
    // untouched). Kept as STRING (not ENUM) so sync({ alter }) stays simple:
    //   'own'        - only records the user created
    //   'department' - own + records stamped with the user's department whose
    //                  owner's rank is strictly LOWER (senior-only; peers no)
    //   'all'        - every record (the pre-Phase-3 behaviour, so the default)
    dataScope: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'all',
        validate: { isIn: [['own', 'department', 'all']] }
    },
    // Registered-workstation lock (approved 2026-11-01): holders of this role
    // sign in ONLY from a browser the organisation registered as a workstation
    // (identity's RegisteredWorkstation). Enforced by the login gate on every
    // session grant, including a workspace switch; never applies to the
    // Tenant Admin role or a System Admin, so an organisation cannot lock
    // itself out. Platform roles (accountId NULL) ignore it.
    signInLockedToWorkstations: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    // Session-limit exemption (approved 2026-11-05): holders of this role are
    // neither counted against nor ended by the account's concurrent-session
    // limit (Account.sessionLimitEnabled / maxConcurrentSessions) - for roles
    // whose people legitimately run a phone and a computer together. The
    // Tenant Admin role cannot carry it (its edit is refused), so the policy
    // always governs the organisation's administrators. Platform roles
    // (accountId NULL) ignore it.
    sessionLimitExempt: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
}, {
    indexes: [
        // One role name per account (tenant roles). accountId leads, so this index also
        // serves the hot `WHERE accountId = ?` / `WHERE accountId = ? AND name = ?`
        // lookups (incl. the per-login Tenant Admin resolve).
        { name: 'UX_Role_account_name', unique: true, fields: ['accountId', 'name'] },
        // Exactly one PLATFORM role per name. A partial index over just the platform
        // rows - needed because NULL accountId compares distinct in the composite unique
        // above, so it would not constrain platform rows. Also the index the platform
        // role screens (`WHERE accountId IS NULL`) scan.
        { name: 'UX_Role_platform_name', unique: true, fields: ['name'], where: { accountId: null } },
    ],
});

module.exports = Role;
