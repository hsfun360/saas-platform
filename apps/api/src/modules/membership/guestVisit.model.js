const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { MEMBERSHIP_SCHEMA } = require('../../platform/schemas');

// membership.GuestVisit (structure approved 2026-10-25) - the guest-usage
// LEDGER behind MembershipType.monthlyGuestAllowance: one row per guest a
// member brought, written by the PRODUCER modules through
// platform/membershipGateway.js (facility first, golf later), never directly.
// Membership owns it so the club-wide allowance counts across every module;
// the producer records the visit inside its own booking transaction (an
// exhausted allowance refuses the booking), voids it when the booking or the
// guest line is cancelled, and leaves it when the guest fails to show.
// `memberId` is the HOST whose allowance the visit draws on (intra-service
// value ref); `sourceRef` is the producer's line id (facility: the
// BookingParticipant id; membership: the GuestRegistration id), unique per
// module so a retry never double-counts.
// `guestId` (approved 2026-11-10) names the membership.Guest when the line
// knows who the guest is: a KNOWN guest counts ONCE per host per day however
// many lines the modules write for them; a line without it counts on its own.
const GuestVisit = sequelize.define('GuestVisit', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    memberId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The booking or visit date - the calendar month counted.
    visitDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // 'membership' (a front-desk Guest Registration) | 'facility' | 'golf'.
    sourceModule: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    sourceRef: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The membership.Guest, when the line knows the person (see above).
    guestId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    guestName: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    guestCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
    },
    // 'confirmed' | 'voided'.
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'confirmed',
    },
    voidedAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    // Ownership stamps (RBAC data scope + future workflow).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: MEMBERSHIP_SCHEMA,
    tableName: 'GuestVisit',
    timestamps: true,
    indexes: [
        { name: 'IX_GuestVisit_Company_Member_Date', fields: ['companyId', 'memberId', 'visitDate'] },
        { name: 'UX_GuestVisit_Source', fields: ['sourceModule', 'sourceRef'], unique: true },
        { name: 'IX_GuestVisit_Company_Guest_Date', fields: ['companyId', 'guestId', 'visitDate'] },
    ],
});

module.exports = GuestVisit;
