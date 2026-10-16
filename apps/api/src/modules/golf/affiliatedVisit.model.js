const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// golf.AffiliatedVisit (approved 2026-10-15; HOST side only) - an incoming
// Letter of Introduction from an affiliated or reciprocal club and the visit
// it authorises. The office records the letter, confirms (or declines) it,
// the confirmation books the golf part as an ordinary flight booking under
// the visitor's golfer identity, the desk ticks the letter and ID on arrival,
// and the visit completes when every bill is settled. Every reference is a
// plain UUID value ref (club, golfer, booking, workflow instance).
const GolfAffiliatedVisit = sequelize.define('GolfAffiliatedVisit', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // From the 'golf-visit' numbering series.
    visitNo: {
        type: DataTypes.STRING(50),
        allowNull: false,
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
    // The visiting member as the letter names them.
    visitorName: { type: DataTypes.STRING, allowNull: false },
    visitorMemberNo: { type: DataTypes.STRING(50), allowNull: false },
    visitorIdentityNo: { type: DataTypes.STRING(50), allowNull: true },
    visitorMobile: { type: DataTypes.STRING(30), allowNull: true },
    visitorEmail: { type: DataTypes.STRING, allowNull: true },
    // The OtherGolfer identity, found or created at confirmation.
    golferId: { type: DataTypes.UUID, allowNull: true },
    // The home club's letter: its reference and the uploaded document.
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
    // The flight booking the confirmation created (golf requested).
    bookingProfileId: { type: DataTypes.UUID, allowNull: true },
    workflowInstanceId: { type: DataTypes.UUID, allowNull: true },
    confirmedAt: { type: DataTypes.DATE, allowNull: true },
    confirmedBy: { type: DataTypes.UUID, allowNull: true },
    declinedAt: { type: DataTypes.DATE, allowNull: true },
    declineReason: { type: DataTypes.STRING, allowNull: true },
    cancelledAt: { type: DataTypes.DATE, allowNull: true },
    cancelReason: { type: DataTypes.STRING, allowNull: true },
    expiredAt: { type: DataTypes.DATE, allowNull: true },
    // The desk's arrival checks.
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
    schema: GOLF_SCHEMA,
    tableName: 'AffiliatedVisit',
    timestamps: true,
    indexes: [
        { name: 'UX_GolfAffiliatedVisit_Company_No', fields: ['companyId', 'visitNo'], unique: true },
        { name: 'IX_GolfAffiliatedVisit_Company_Date_Status', fields: ['companyId', 'visitDate', 'status'] },
        { name: 'IX_GolfAffiliatedVisit_Company_Club', fields: ['companyId', 'affiliatedClubId'] },
        { name: 'IX_GolfAffiliatedVisit_Booking', fields: ['bookingProfileId'] },
    ],
});

module.exports = GolfAffiliatedVisit;
