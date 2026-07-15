const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { MEMBERSHIP_SCHEMA } = require('../../platform/schemas');

// Membership Status master file - per company (club). Each club defines its own
// set of member statuses: a short code, the lifecycle class it maps to, a
// description, what the system does to a member in this status (system control),
// and a display colour. Member records reference a status later.
//
// Product-tier data: `companyId` is a plain UUID reference into the Control Plane
// (no DB-level FK), per the cross-service golden rules in docs/systems/README.md.
// Enable/disable via `isActive` rather than hard delete, since a status may
// already be assigned to members.
const MembershipStatus = sequelize.define('MembershipStatus', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    // The club this status belongs to (active workspace). UUID reference, no FK.
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The membership status value, unique per company (e.g. 'Active', 'OA').
    // (Named `membershipStatus` - the legacy code-base "status code" column; the
    // PK is the UUID `id`, so this is a plain unique business value, not a key.)
    membershipStatus: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // Lifecycle class - one of membershipStatus.constants STATUS_CLASS_KEYS.
    statusClass: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // Free-text summary of the status.
    description: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // System behaviour - one of membershipStatus.constants SYSTEM_CONTROL_KEYS.
    systemControl: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // Display colour as a hex string, e.g. '#22c55e'. Convenience for the UI.
    statusColor: {
        type: DataTypes.STRING(9),
        allowNull: true,
    },
    // Whether this status is offered when assigning/filtering members.
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    // Ownership stamps (RBAC data scope + future workflow): the creator, their
    // department at creation time, and the last editor. Plain UUID references
    // into the Control Plane. Null on pre-Phase-3 rows = modifiable only by
    // 'all'-scope roles.
    createdBy: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    createdByDepartmentId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    updatedBy: {
        type: DataTypes.UUID,
        allowNull: true,
    },
}, {
    // Owned by the Membership service -> its own Postgres schema, so the whole
    // service extracts as `pg_dump --schema=membership`. See platform/schemas.js.
    schema: MEMBERSHIP_SCHEMA,
    tableName: 'MembershipStatus',
    timestamps: true,
    indexes: [
        { name: 'IDX_MembershipStatus_Company_Code', fields: ['companyId', 'membershipStatus'], unique: true },
    ],
});

module.exports = MembershipStatus;
