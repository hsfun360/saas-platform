const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { MEMBERSHIP_SCHEMA } = require('../../platform/schemas');

// Membership - the contract/seat a company sells (SRS 2.3, 会籍).
// Class 'individual' or 'corporate' (mirrors the Membership Type's class):
//   individual -> exactly one Member (kind 'individual') is auto-created with it;
//   corporate  -> no auto member; Nominee Members are created under it, capped by
//                 the type's noOfNominee.
// Owns the commercial side (fee, credit, billing flags) and, for corporate, the
// company profile. People (names, IC, addresses) live on Member.
//
// Cross-references (type/status/fee) are plain UUIDs validated in the app, no DB
// FK, so a master row can be disabled without a hard constraint. `companyId` is a
// Control-Plane reference, no FK. Class-conditional fields are nulled server-side
// for the other class (same technique as MembershipType).
const Membership = sequelize.define('Membership', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The membership number - unique per company. Issued by Numbering Control
    // (auto mode) or keyed in by staff (manual mode / no scheme).
    membershipNo: {
        type: DataTypes.STRING(30),
        allowNull: false,
    },
    // 'individual' | 'corporate' - copied from the Membership Type at creation and
    // immutable (category conversion is a Phase 3 function).
    membershipClass: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    membershipTypeId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Current status of the contract - MembershipStatus id. For individual class
    // it is kept in sync with the individual Member's own status.
    membershipStatusId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Last status change.
    statusDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
    },
    membershipFeeId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    joinDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // When the contract ends (term memberships; NULL = lifetime / no expiry).
    // Defaulted on create from the type's termMonths as joinDate + termMonths
    // minus one day (runs THROUGH the day before the anniversary), editable.
    // Nothing flips the status automatically yet - the future expiry/renewal
    // cycle consumes this date.
    expiryDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
    },
    // Corporate: day of the billing cycle.
    billingDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
    },

    // --- Credit & billing ---
    // 'personal' | 'combined' (individual class only).
    creditFlag: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    creditLimit: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: true,
    },
    // Repayment terms, in days.
    terms: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    // 'individual' | 'combined'.
    statementMode: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    sendReminders: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    chargeInterest: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    monthlyFee: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    yearlyFee: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

    // --- Document references ---
    certificateNo: { type: DataTypes.STRING, allowNull: true },
    applicationNo: { type: DataTypes.STRING, allowNull: true },
    reference: { type: DataTypes.STRING, allowNull: true },
    proposer: { type: DataTypes.STRING, allowNull: true },
    // Free text until Sales Management (SRS 2.2) is built.
    salesCode: { type: DataTypes.STRING, allowNull: true },
    followupSalesCode: { type: DataTypes.STRING, allowNull: true },

    // --- Corporate profile (corporate class only) ---
    corporateName: { type: DataTypes.STRING, allowNull: true },
    registrationNo: { type: DataTypes.STRING, allowNull: true },
    taxNo: { type: DataTypes.STRING, allowNull: true },
    contactPerson: { type: DataTypes.STRING, allowNull: true },
    contactDesignation: { type: DataTypes.STRING, allowNull: true },
    phone: { type: DataTypes.STRING, allowNull: true },
    fax: { type: DataTypes.STRING, allowNull: true },
    mobile: { type: DataTypes.STRING, allowNull: true },
    email: { type: DataTypes.STRING, allowNull: true },
    // Subscriber IndustryType code - value reference.
    industryTypeCode: { type: DataTypes.STRING, allowNull: true },
    // Addresses live in the typed membership."Address" table ('company' +
    // 'mailing' rows for the contract) since 2026-07-17.

    // --- Workflow seam (memberships are effective immediately today) ---
    approvalStatus: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'approved',
    },
    approvedAt: { type: DataTypes.DATE, allowNull: true },
    approvedBy: { type: DataTypes.UUID, allowNull: true },

    remarks: { type: DataTypes.TEXT, allowNull: true },

    // Ownership stamps (RBAC data scope + future workflow) - plain UUID references
    // into the Control Plane.
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: MEMBERSHIP_SCHEMA,
    tableName: 'Membership',
    timestamps: true,
    indexes: [
        { name: 'IDX_Membership_Company_No', fields: ['companyId', 'membershipNo'], unique: true },
    ],
});

module.exports = Membership;
