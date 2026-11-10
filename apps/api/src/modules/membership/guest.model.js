const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { MEMBERSHIP_SCHEMA } = require('../../platform/schemas');

// membership.Guest (structure approved 2026-11-10) - the guest PERSON a member
// brings to the club. One row per person per company, recognised again on a
// later visit so the club can answer "how often did this guest come" and
// count a known guest once per host per day across every module (the
// membership.GuestVisit ledger carries `guestId`).
// `name` is mandatory; `mobile` or `email` is mandatory (the day pass is sent
// by email or shared over WhatsApp) - enforced in guestRegistration.service.
// Neither contact is unique: a family may share one email address.
const Guest = sequelize.define('Guest', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // Combined dialling code + number, e.g. +60123456789 (the phone-input standard).
    mobile: {
        type: DataTypes.STRING(30),
        allowNull: true,
    },
    email: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // IC or passport, optional.
    identityNo: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    remarks: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Ownership stamps (RBAC data scope).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: MEMBERSHIP_SCHEMA,
    tableName: 'Guest',
    timestamps: true,
    indexes: [
        { name: 'IX_Guest_Company_Mobile', fields: ['companyId', 'mobile'] },
        { name: 'IX_Guest_Company_Email', fields: ['companyId', 'email'] },
    ],
});

module.exports = Guest;
