const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { MEMBERSHIP_SCHEMA } = require('../../platform/schemas');

// Member - a person under a Membership (SRS 2.3, 会员). One table, three kinds:
//   individual - THE member of an individual-class membership (auto-created);
//   nominee    - a corporate seat holder (created under a corporate membership);
//   dependent  - spouse/son/daughter/ward of an individual member OR a nominee
//                (principalMemberId points at that principal).
// Owns the person profile. The commercial contract lives on Membership.
//
// membershipId / principalMemberId are intra-service, so they are REAL FKs
// (wired in associations.js). Reference-data codes (salutation/title/nationality/
// race/industry) and memberStatusId are value references validated in the app,
// no DB FK. `userId` is the future member-portal identity link (no FK - identity
// seam; one User may map to many Member rows across companies).
const Member = sequelize.define('Member', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    membershipId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The member number - unique per company across all kinds. Individual members
    // carry the membership number itself; nominees/dependents default to the
    // parent number + a letter suffix (editable).
    memberNo: {
        type: DataTypes.STRING(30),
        allowNull: false,
    },
    // 'individual' | 'nominee' | 'dependent'.
    memberKind: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // 'spouse' | 'son' | 'daughter' | 'ward' - required iff kind = dependent.
    dependentType: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // The individual member or nominee a dependent hangs off - required iff
    // kind = dependent.
    principalMemberId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // Each person carries their OWN status (the Phase 3 cascade rules depend on
    // it) - MembershipStatus id, value reference.
    memberStatusId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    statusDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
    },

    // --- Person profile ---
    // Subscriber reference-data value references.
    salutationCode: { type: DataTypes.STRING, allowNull: true },
    titleCode: { type: DataTypes.STRING, allowNull: true },
    firstName: { type: DataTypes.STRING, allowNull: true },
    middleName: { type: DataTypes.STRING, allowNull: true },
    lastName: { type: DataTypes.STRING, allowNull: false },
    nameOnCard: { type: DataTypes.STRING, allowNull: true },
    // Native-script full name (generalized from the legacy Chinese-name block).
    localName: { type: DataTypes.STRING, allowNull: true },
    // 'male' | 'female'.
    gender: { type: DataTypes.STRING, allowNull: true },
    birthDate: { type: DataTypes.DATEONLY, allowNull: true },
    // Passport / national ID.
    identityNo: { type: DataTypes.STRING, allowNull: true },
    nationalityCode: { type: DataTypes.STRING, allowNull: true },
    raceCode: { type: DataTypes.STRING, allowNull: true },
    // 'single' | 'married' | 'divorced' | 'widowed'.
    maritalStatus: { type: DataTypes.STRING, allowNull: true },
    maritalDate: { type: DataTypes.DATEONLY, allowNull: true },

    // --- Contact ---
    phone: { type: DataTypes.STRING, allowNull: true },
    mobile: { type: DataTypes.STRING, allowNull: true },
    fax: { type: DataTypes.STRING, allowNull: true },
    email: { type: DataTypes.STRING, allowNull: true },

    // --- Employment ---
    employerName: { type: DataTypes.STRING, allowNull: true },
    designation: { type: DataTypes.STRING, allowNull: true },
    industryTypeCode: { type: DataTypes.STRING, allowNull: true },

    // --- Addresses ---
    residentAddress: { type: DataTypes.STRING, allowNull: true },
    residentPostcode: { type: DataTypes.STRING, allowNull: true },
    residentState: { type: DataTypes.STRING, allowNull: true },
    residentCountryCode: { type: DataTypes.STRING(2), allowNull: true },
    // 'resident' | 'employer' | 'other'.
    mailingSource: { type: DataTypes.STRING, allowNull: true },
    mailingAddress: { type: DataTypes.STRING, allowNull: true },
    mailingPostcode: { type: DataTypes.STRING, allowNull: true },
    mailingState: { type: DataTypes.STRING, allowNull: true },
    mailingCountryCode: { type: DataTypes.STRING(2), allowNull: true },

    // --- Membership dates & credit ---
    joinDate: { type: DataTypes.DATEONLY, allowNull: true },
    // Dependent children/ward only - feeds the child-expiry cycle (SRS 2.4) later.
    expiryDate: { type: DataTypes.DATEONLY, allowNull: true },
    creditLimit: { type: DataTypes.DECIMAL(21, 2), allowNull: true },

    // Future member-portal identity link (Identity seam, no FK).
    userId: { type: DataTypes.UUID, allowNull: true },

    remarks: { type: DataTypes.TEXT, allowNull: true },

    // Ownership stamps (RBAC data scope + future workflow).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: MEMBERSHIP_SCHEMA,
    tableName: 'Member',
    timestamps: true,
    indexes: [
        { name: 'IDX_Member_Company_No', fields: ['companyId', 'memberNo'], unique: true },
        { name: 'IDX_Member_Membership', fields: ['membershipId'] },
        { name: 'IDX_Member_Principal', fields: ['principalMemberId'] },
    ],
});

module.exports = Member;
