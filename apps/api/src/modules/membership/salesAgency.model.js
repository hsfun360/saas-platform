const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { MEMBERSHIP_SCHEMA } = require('../../platform/schemas');

// Sales Agency - an outsourced agency COMPANY a club engages to promote its
// memberships (commercial clubs; SRS 2.2). Each agency has staff who are
// SalesAgent rows of kind 'agency-staff'.
//
// Per-club master data: the same real-world agency serving several clubs is a
// row in EACH club (own code, own contacts) - clubs never share master data.
// The cross-club identity of the PEOPLE happens at the platform User level
// (SalesAgent.userId), never here.
const SalesAgency = sequelize.define('SalesAgency', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    agencyCode: {
        type: DataTypes.STRING(30),
        allowNull: false,
    },
    agencyName: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },
    registrationNo: { type: DataTypes.STRING(100), allowNull: true },
    contactPerson: { type: DataTypes.STRING(255), allowNull: true },
    phone: { type: DataTypes.STRING, allowNull: true },
    mobile: { type: DataTypes.STRING, allowNull: true },
    email: { type: DataTypes.STRING, allowNull: true },
    // Disable, never delete - agents may reference the agency.
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

    // Ownership stamps (RBAC data scope).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: MEMBERSHIP_SCHEMA,
    tableName: 'SalesAgency',
    timestamps: true,
    indexes: [
        { name: 'IDX_SalesAgency_Company_Code', fields: ['companyId', 'agencyCode'], unique: true },
    ],
});

module.exports = SalesAgency;
