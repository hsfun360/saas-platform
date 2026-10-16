const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { MEMBERSHIP_SCHEMA } = require('../../platform/schemas');

// membership.AffiliatedVisit (approved 2026-10-15; re-homed to the Membership
// Department 2026-10-16) - the Letter of Introduction document, in BOTH
// directions:
//   inbound  - a partner club's member visits us: the office records the
//              incoming letter, confirms (or declines) it, the confirmation
//              books the golf part through the golf seam as an ordinary
//              flight booking under the visitor's golfer identity, the desk
//              ticks the letter and ID on arrival, the visit completes when
//              every bill is settled.
//   outbound - our member visits the partner: the office checks the member's
//              standing, ISSUES the letter (numbered from the same series),
//              emails it to the partner and the member, and counts it
//              against the partnership.
// Every reference is a plain UUID value ref (club, member, golfer, booking,
// workflow instance).
const AffiliatedVisit = sequelize.define('AffiliatedVisit', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // From the 'membership-visit' numbering series; outbound: our letter's number.
    visitNo: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    // 'inbound' | 'outbound' (affiliatedVisit.constants).
    direction: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'inbound',
    },
    affiliatedClubId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // affiliatedVisit.constants VISIT_STATUSES.
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'requested',
    },
    // INBOUND: the visiting member as the letter names them.
    visitorName: { type: DataTypes.STRING, allowNull: false },
    visitorMemberNo: { type: DataTypes.STRING(50), allowNull: false },
    visitorIdentityNo: { type: DataTypes.STRING(50), allowNull: true },
    visitorMobile: { type: DataTypes.STRING(30), allowNull: true },
    visitorEmail: { type: DataTypes.STRING, allowNull: true },
    // INBOUND: the golfer identity (golf.Golfer value ref), set at confirmation.
    golferId: { type: DataTypes.UUID, allowNull: true },
    // OUTBOUND: our member (membership Member value ref + snapshots).
    memberId: { type: DataTypes.UUID, allowNull: true },
    // The home club's letter (inbound): its reference and the uploaded document.
    loiReference: { type: DataTypes.STRING(100), allowNull: true },
    loiDocumentUrl: { type: DataTypes.STRING, allowNull: true },
    visitDate: { type: DataTypes.DATEONLY, allowNull: false },
    alternateDate: { type: DataTypes.DATEONLY, allowNull: true },
    // { golf: { courseId, teeTime, holes } | null, dining, accommodation,
    // other: free text or null } - what the letter asks for.
    facilities: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    // The golf party (the visitor included) and the guests among them.
    playerCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    guestCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    // INBOUND: the flight booking the confirmation created (golf value ref).
    bookingProfileId: { type: DataTypes.UUID, allowNull: true },
    workflowInstanceId: { type: DataTypes.UUID, allowNull: true },
    confirmedAt: { type: DataTypes.DATE, allowNull: true },
    confirmedBy: { type: DataTypes.UUID, allowNull: true },
    // OUTBOUND: when our letter was issued and sent.
    issuedAt: { type: DataTypes.DATE, allowNull: true },
    issuedBy: { type: DataTypes.UUID, allowNull: true },
    sentTo: { type: DataTypes.STRING, allowNull: true },
    declinedAt: { type: DataTypes.DATE, allowNull: true },
    declineReason: { type: DataTypes.STRING, allowNull: true },
    cancelledAt: { type: DataTypes.DATE, allowNull: true },
    cancelReason: { type: DataTypes.STRING, allowNull: true },
    expiredAt: { type: DataTypes.DATE, allowNull: true },
    // INBOUND: the desk's arrival checks.
    arrivedAt: { type: DataTypes.DATE, allowNull: true },
    letterSightedBy: { type: DataTypes.UUID, allowNull: true },
    idSightedBy: { type: DataTypes.UUID, allowNull: true },
    completedAt: { type: DataTypes.DATE, allowNull: true },
    remarks: { type: DataTypes.STRING, allowNull: true },
    // Ownership stamps (RBAC data scope).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: MEMBERSHIP_SCHEMA,
    tableName: 'AffiliatedVisit',
    timestamps: true,
    indexes: [
        { name: 'UX_AffiliatedVisit_Company_No', fields: ['companyId', 'visitNo'], unique: true },
        { name: 'IX_AffiliatedVisit_Company_Date_Status', fields: ['companyId', 'visitDate', 'status'] },
        { name: 'IX_AffiliatedVisit_Company_Club', fields: ['companyId', 'affiliatedClubId'] },
        { name: 'IX_AffiliatedVisit_Booking', fields: ['bookingProfileId'] },
    ],
});

module.exports = AffiliatedVisit;
