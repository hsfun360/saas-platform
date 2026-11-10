const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { MEMBERSHIP_SCHEMA } = require('../../platform/schemas');

// membership.GuestRegistration (structure approved 2026-11-10) - one guest,
// one host member, one date = ONE DAY PASS. The front desk registers the
// guest (Membership Management -> Guest Registration); the registration
// writes the membership.GuestVisit ledger row that draws on the host's
// monthly guest allowance, and carries the pass: `passToken` is the random
// key behind the public pass link and its QR code, valid on `visitDate` only
// (club clock). `guestId` -> membership.Guest and `memberId` -> the host
// Member, both inside the Membership service.
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
    guestId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The HOST member whose allowance the visit draws on.
    memberId: {
        type: DataTypes.UUID,
        allowNull: false,
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
    // 'desk' now; 'portal' | 'facility' | 'golf' later.
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
    ],
});

module.exports = GuestRegistration;
