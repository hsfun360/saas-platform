const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { MEMBERSHIP_SCHEMA } = require('../../platform/schemas');

// Address - the typed address book of a membership (contract) or a member
// (person). Replaces the four inline address blocks the two tables used to
// carry (member resident + mailing, membership company + mailing) with one
// value-object shape: at most ONE row per (owner, addressType).
//
// Mailing resolution rule (no flag, no duplicated copy): mail goes to the
// 'mailing' row when one exists, else falls back to 'residential' (member) /
// 'company' (contract). "Same as home" is simply the absence of a mailing row.
//
// Exactly one of membershipId / memberId is set (model-level validation; both
// are real intra-service FKs wired in associations.js, cascade with the owner).
const Address = sequelize.define('Address', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    membershipId: { type: DataTypes.UUID, allowNull: true },
    memberId: { type: DataTypes.UUID, allowNull: true },
    // 'residential' | 'mailing' | 'company' | 'other' (ADDRESS_TYPES).
    addressType: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    address: { type: DataTypes.STRING(255), allowNull: false },
    city: { type: DataTypes.STRING(100), allowNull: true },
    postcode: { type: DataTypes.STRING(20), allowNull: true },
    state: { type: DataTypes.STRING(100), allowNull: true },
    // Country.alpha2 value reference (Control Plane), no FK.
    countryCode: { type: DataTypes.STRING(2), allowNull: true },

    // Ownership stamps (RBAC data scope) - plain UUID references.
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: MEMBERSHIP_SCHEMA,
    tableName: 'Address',
    timestamps: true,
    validate: {
        exactlyOneOwner() {
            if (!!this.membershipId === !!this.memberId) {
                throw new Error('An address belongs to exactly one owner: a membership OR a member.');
            }
        },
    },
    indexes: [
        // One address per type per owner. Postgres treats NULLs as distinct, so
        // the two indexes never collide across owner kinds.
        { name: 'IDX_Address_Member_Type', fields: ['memberId', 'addressType'], unique: true },
        { name: 'IDX_Address_Membership_Type', fields: ['membershipId', 'addressType'], unique: true },
    ],
});

module.exports = Address;
