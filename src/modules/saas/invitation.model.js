const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

// An invitation for a (global) user to become a collaborator on a company.
//
// This is the consent-based bridge for the Global Identity paradigm: a Tenant
// Admin invites an email, and the invited identity ACCEPTS to gain access. The
// CompanyUser (collaborator) row is only created on acceptance, so one admin can
// never staple an outsider — e.g. a freelancer already working for another
// subscriber — into their tenant without that person's consent.
const Invitation = sequelize.define('Invitation', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    accountId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    roleId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    invitedByUserId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    token: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
    },
    // pending | accepted | declined | revoked | expired
    // Kept as STRING (not ENUM) so `sequelize.sync({ alter: true })` stays simple.
    status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'pending',
    },
    expiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
}, {
    tableName: 'Invitation',
    timestamps: true,
    indexes: [
        // Fast lookups for the admin list (per company) and the invitee list (by email).
        { fields: ['companyId', 'status'] },
        { fields: ['email', 'status'] },
    ],
});

module.exports = Invitation;
