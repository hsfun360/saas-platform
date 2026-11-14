const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { MEMBERSHIP_SCHEMA } = require('../../platform/schemas');

// membership.GuestRegistration (structure approved 2026-11-10; widened to
// every patron group 2026-11-14) - one person, one date = ONE DAY PASS,
// issued at the club's Registration Counter (Membership Management ->
// Registration Counter). `passToken` is the random key behind the public pass
// link and its QR code, valid on `visitDate` only (club clock).
//   patronGroup 'guest'      - a member's guest: `guestId` -> membership.Guest
//                              and `memberId` -> the host Member; the row
//                              writes the membership.GuestVisit ledger line
//                              that draws on the host's guest allowance.
//   patronGroup 'affiliate' /
//               'reciprocal' - a visiting member of an affiliated / reciprocal
//                              club: `affiliatedVisitId` -> the letter of
//                              introduction, `affiliatedClubId` -> the home
//                              club, no host member and no allowance. The
//                              visitor's own row carries no `guestId` (the
//                              person is the visitor named on the letter); a
//                              row WITH one is a guest the visitor brought.
//                              One row is one day at the club - the day that
//                              counts against the club's visit limits.
// Statuses: registered -> arrived; cancelled (guestRegistration.constants).
// "Expired" is derived from the date, never stored.
const GuestRegistration = sequelize.define('GuestRegistration', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // From the 'membership-guest' numbering series.
    registrationNo: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    // 'guest' | 'affiliate' | 'reciprocal' (guestRegistration.constants).
    patronGroup: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'guest',
    },
    // The membership.Guest person; NULL on the row of the visitor a letter names.
    guestId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // The HOST member whose allowance the visit draws on (a member's guest only).
    memberId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // The letter of introduction this pass was issued on, and the home club
    // (affiliate / reciprocal only).
    affiliatedVisitId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    affiliatedClubId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    visitDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // 'registered' | 'arrived' | 'cancelled'.
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'registered',
    },
    // Who registered it: 'desk' (the Registration Counter), or the producer
    // module whose own counter did ('facility', 'golf'); 'portal' later.
    channel: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'desk',
    },
    passToken: {
        type: DataTypes.STRING(64),
        allowNull: false,
    },
    // The last send: 'email' | 'whatsapp', and the address or number.
    passSentAt: { type: DataTypes.DATE, allowNull: true },
    passSentVia: { type: DataTypes.STRING(20), allowNull: true },
    passSentTo: { type: DataTypes.STRING, allowNull: true },
    arrivedAt: { type: DataTypes.DATE, allowNull: true },
    arrivedBy: { type: DataTypes.UUID, allowNull: true },
    cancelledAt: { type: DataTypes.DATE, allowNull: true },
    cancelReason: { type: DataTypes.STRING, allowNull: true },
    remarks: { type: DataTypes.STRING, allowNull: true },
    // Ownership stamps (RBAC data scope).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: MEMBERSHIP_SCHEMA,
    tableName: 'GuestRegistration',
    timestamps: true,
    indexes: [
        { name: 'UX_GuestRegistration_Company_No', fields: ['companyId', 'registrationNo'], unique: true },
        { name: 'UX_GuestRegistration_PassToken', fields: ['passToken'], unique: true },
        { name: 'IX_GuestRegistration_Company_Date_Status', fields: ['companyId', 'visitDate', 'status'] },
        { name: 'IX_GuestRegistration_Company_Member_Date', fields: ['companyId', 'memberId', 'visitDate'] },
        // One LIVE registration (one pass) per guest per host per day.
        {
            name: 'UX_GuestRegistration_Live_Member_Guest_Date',
            fields: ['companyId', 'memberId', 'guestId', 'visitDate'],
            unique: true,
            where: { status: { [Op.ne]: 'cancelled' } },
        },
        { name: 'IX_GuestRegistration_Company_Visit_Date', fields: ['companyId', 'affiliatedVisitId', 'visitDate'] },
        // One LIVE pass per letter per day for the visitor it names ...
        {
            name: 'UX_GuestRegistration_Live_Visit_Date',
            fields: ['companyId', 'affiliatedVisitId', 'visitDate'],
            unique: true,
            where: { status: { [Op.ne]: 'cancelled' }, affiliatedVisitId: { [Op.ne]: null }, guestId: null },
        },
        // ... and one per guest the visitor brought that day.
        {
            name: 'UX_GuestRegistration_Live_Visit_Guest_Date',
            fields: ['companyId', 'affiliatedVisitId', 'guestId', 'visitDate'],
            unique: true,
            where: { status: { [Op.ne]: 'cancelled' }, affiliatedVisitId: { [Op.ne]: null }, guestId: { [Op.ne]: null } },
        },
    ],
});

module.exports = GuestRegistration;
