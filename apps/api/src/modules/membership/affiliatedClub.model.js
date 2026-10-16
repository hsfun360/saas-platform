const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { MEMBERSHIP_SCHEMA } = require('../../platform/schemas');

// membership.AffiliatedClub (approved 2026-10-15; re-homed from golf to the
// Membership Department 2026-10-16 - the arrangements are club-to-club
// contracts the membership office governs, estate-wide, not a golf matter).
// The other clubs and associations whose members this club admits under an
// arrangement: an AFFILIATED association (their members hold a card) or a
// RECIPROCAL club (mutual visiting rights). One table, `kind` is the flag.
// The row carries the arrangement's terms the visit document and the desks
// enforce: validity, whether charges may be signed back to the home club,
// the guests a visitor may bring, the per-member visit cap, the club-wide
// annual inbound quota, the visit fee the host collects, and the approval
// flag. `playerTypeId` (value ref to golf.PlayerType, affiliate base) is how
// golf bills its visitors; `visitFeeTransactionTypeId` (value ref to
// golf.TransactionType) is the fee item golf auto-charges on the visitor's
// bill. `companyId` is a Control-Plane reference.
const AffiliatedClub = sequelize.define('AffiliatedClub', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Uppercase, unique per company.
    code: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // 'affiliate' | 'reciprocal' (affiliatedClub.constants).
    kind: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // The affiliate-base golf player type its visitors are billed as.
    playerTypeId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Validity of the arrangement; outside it the club's members are refused.
    agreementFrom: { type: DataTypes.DATEONLY, allowNull: true },
    agreementTo: { type: DataTypes.DATEONLY, allowNull: true },
    // Whether a visitor's bill may be settled with the member / debtor
    // classes (signed back to the home club); default: settle before leaving.
    allowChargeToHomeClub: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    // Guests a visiting member may bring on one visit (NULL = no cap).
    maxGuestsPerVisit: { type: DataTypes.INTEGER, allowNull: true },
    // The common reciprocal term "each visiting member may play N times a
    // year": visits per member per calendar period (NULL = no cap). Applies
    // in both directions (their members here, our members there).
    maxVisitsPerPlayer: { type: DataTypes.INTEGER, allowNull: true },
    maxVisitsPeriod: { type: DataTypes.STRING(10), allowNull: true },
    // The club-wide annual INBOUND quota: visits this club admits from the
    // partner per calendar year (NULL = no cap).
    maxVisitsPerYear: { type: DataTypes.INTEGER, allowNull: true },
    // The visit fee the host collects per visiting member (a golf
    // transaction type, flat priced; NULL = no fee).
    visitFeeTransactionTypeId: { type: DataTypes.UUID, allowNull: true },
    // Visits from this club need approval (the visit approval lifecycle).
    requiresApproval: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    // The club's office contact (letters, confirmations and declines go here).
    contactName: { type: DataTypes.STRING, allowNull: true },
    contactEmail: { type: DataTypes.STRING, allowNull: true },
    contactPhone: { type: DataTypes.STRING(30), allowNull: true },
    // Postal address (platform address standard).
    addressLine1: { type: DataTypes.STRING, allowNull: true },
    addressLine2: { type: DataTypes.STRING, allowNull: true },
    city: { type: DataTypes.STRING(100), allowNull: true },
    state: { type: DataTypes.STRING(100), allowNull: true },
    postalCode: { type: DataTypes.STRING(20), allowNull: true },
    countryCode: { type: DataTypes.STRING(2), allowNull: true },
    remarks: { type: DataTypes.STRING, allowNull: true },
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 100,
    },
    // Ownership stamps (RBAC data scope).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: MEMBERSHIP_SCHEMA,
    tableName: 'AffiliatedClub',
    timestamps: true,
    indexes: [
        { name: 'UX_AffiliatedClub_Company_Code', fields: ['companyId', 'code'], unique: true },
        { name: 'IX_AffiliatedClub_Company_Kind', fields: ['companyId', 'kind'] },
    ],
});

module.exports = AffiliatedClub;
