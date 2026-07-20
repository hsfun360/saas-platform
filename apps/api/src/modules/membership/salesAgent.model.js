const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { MEMBERSHIP_SCHEMA } = require('../../platform/schemas');

// Sales Agent - every salesperson who promotes the club's memberships, ONE
// table with three kinds (SRS 2.2, user's three-tier channel model):
//   agency-staff (belongs to a SalesAgency), external (freelancer),
//   internal (the club's own sales staff).
//
// `userId` is the login link (Identity seam, no FK): the agent registers via an
// invite email (same stateless-token pattern as the member portal) and the
// platform User is find-or-created by email. ONE User can be linked to agent
// rows in MANY clubs - across companies and even subscriber accounts - which is
// how an agency staffer or freelancer serving several clubs logs in once and
// sees all of their engagements on the /agent portal.
const SalesAgent = sequelize.define('SalesAgent', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    agentCode: {
        type: DataTypes.STRING(30),
        allowNull: false,
    },
    name: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    // 'agency-staff' | 'external' | 'internal' (AGENT_KINDS).
    agentKind: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // Required when agentKind = 'agency-staff', NULL otherwise (app-validated;
    // real intra-service FK wired in associations.js).
    salesAgencyId: { type: DataTypes.UUID, allowNull: true },
    identityNo: { type: DataTypes.STRING(100), allowNull: true },
    phone: { type: DataTypes.STRING, allowNull: true },
    mobile: { type: DataTypes.STRING, allowNull: true },
    // The login-invite target - required so every agent can be invited.
    email: { type: DataTypes.STRING, allowNull: false },
    joinedDate: { type: DataTypes.DATEONLY, allowNull: true },
    leftDate: { type: DataTypes.DATEONLY, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    // Identity link (no FK - identity seam); set when the agent registers.
    userId: { type: DataTypes.UUID, allowNull: true },
    remarks: { type: DataTypes.TEXT, allowNull: true },

    // Ownership stamps (RBAC data scope).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: MEMBERSHIP_SCHEMA,
    tableName: 'SalesAgent',
    timestamps: true,
    indexes: [
        { name: 'IDX_SalesAgent_Company_Code', fields: ['companyId', 'agentCode'], unique: true },
        // The /agent portal resolves every engagement of one login.
        { name: 'IDX_SalesAgent_User', fields: ['userId'] },
    ],
});

module.exports = SalesAgent;
