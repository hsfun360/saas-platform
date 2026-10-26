const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// facility.ClassAttendance (slice 5, structure approved 2026-10-26) - ONE
// PATRON IN ONE SESSION. Created with the enrolment: one row in `session`
// mode, one per remaining session of the schedule in `term` mode (a later
// one-off session added to a schedule creates rows for its term enrolments).
// The session's capacity counts the live rows; the instructor or the desk
// marks each row attended / no-show / excused, and Hold session marks the
// unmarked rows no-show. Cascades with the enrolment and the session.
const FacilityClassAttendance = sequelize.define('FacilityClassAttendance', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    enrolmentId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    sessionId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Snapshot for the per-day indexes and the station.
    sessionDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // Denormalised for the roster.
    patronId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // 'enrolled' | 'attended' | 'no-show' | 'excused' | 'cancelled'.
    status: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'enrolled',
    },
    markedAt: { type: DataTypes.DATE, allowNull: true },
    markedBy: { type: DataTypes.UUID, allowNull: true },
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
    tableName: 'ClassAttendance',
    timestamps: true,
    indexes: [
        { name: 'UX_FacilityClassAttendance_Enrolment_Session', fields: ['enrolmentId', 'sessionId'], unique: true },
        { name: 'IX_FacilityClassAttendance_Session_Status', fields: ['sessionId', 'status'] },
        { name: 'IX_FacilityClassAttendance_Company_Date', fields: ['companyId', 'sessionDate'] },
    ],
});

module.exports = FacilityClassAttendance;
