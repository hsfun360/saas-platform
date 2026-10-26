const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// facility.ClassEnrolment (slice 5, structure approved 2026-10-26) - the SEAT
// CONTRACT: one row per patron per thing enrolled in, a session (`session`
// mode) or a schedule (`term` mode); exactly one of sessionId / scheduleId
// is set. The fee is billed on this row's bill (a facility bill keyed by
// classEnrolmentId); the ClassAttendance rows carry the per-session status
// and count toward the capacity. One live enrolment per patron per session
// or term (partial uniques). Cascades with the class; the session and the
// schedule are RESTRICT references.
const FacilityClassEnrolment = sequelize.define('FacilityClassEnrolment', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    classId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // `session` mode.
    sessionId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // `term` mode.
    scheduleId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // Member or visitor Patron (visitor only when the class allows).
    patronId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    patronName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    memberNo: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    // 'desk' | 'station' (walk-in) | 'portal' (later).
    channel: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'desk',
    },
    // The facility bill carrying the fee line; NULL on a free class.
    billId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // The fee billed (snapshot of the bill line total, 0 on a free class).
    feeAmount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
    // 'enrolled' | 'completed' (every attendance row final) | 'cancelled'.
    status: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'enrolled',
    },
    enrolledAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
    cancelledAt: { type: DataTypes.DATE, allowNull: true },
    cancelledBy: { type: DataTypes.UUID, allowNull: true },
    cancelReason: { type: DataTypes.STRING, allowNull: true },
    // Cancelled inside the class notice (the fee stood).
    isLateCancel: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    remarks: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Ownership stamps (RBAC data scope + future workflow).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: FACILITY_SCHEMA,
    tableName: 'ClassEnrolment',
    timestamps: true,
    indexes: [
        { name: 'UX_FacilityClassEnrolment_Patron_Session_Live', fields: ['patronId', 'sessionId'], unique: true, where: { status: { [Op.ne]: 'cancelled' }, sessionId: { [Op.ne]: null } } },
        { name: 'UX_FacilityClassEnrolment_Patron_Schedule_Live', fields: ['patronId', 'scheduleId'], unique: true, where: { status: { [Op.ne]: 'cancelled' }, scheduleId: { [Op.ne]: null } } },
        { name: 'IX_FacilityClassEnrolment_Company_Enrolled', fields: ['companyId', 'enrolledAt'] },
        { name: 'IX_FacilityClassEnrolment_Patron', fields: ['patronId'] },
        { name: 'IX_FacilityClassEnrolment_Bill', fields: ['billId'] },
        { name: 'IX_FacilityClassEnrolment_Class', fields: ['classId'] },
    ],
});

module.exports = FacilityClassEnrolment;
