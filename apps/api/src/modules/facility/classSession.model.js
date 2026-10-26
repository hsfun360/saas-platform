const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// facility.ClassSession (slice 5, structure approved 2026-10-26) - ONE
// MEETING of a class, generated from a schedule or added as a one-off (a
// make-up session, a workshop). Carries its resolved venue, instructor and
// capacity (session > schedule > class > venue), each editable per session
// (a moved session, a substitute). `facilityId` snapshots the venue's linked
// unit at generation: the booking grid reads the day's sessions by it to
// render `class` cells on a slot-type unit, and the conflict checks escalate
// to the whole unit. Cascades with the class; a one-off keeps no schedule.
const FacilityClassSession = sequelize.define('FacilityClassSession', {
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
    // NULL on a one-off session.
    scheduleId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    sessionDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    startTime: {
        type: DataTypes.TIME,
        allowNull: false,
    },
    endTime: {
        type: DataTypes.TIME,
        allowNull: false,
    },
    venueId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Snapshot of the venue's linked unit; NULL on an unlinked venue.
    facilityId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    instructorId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    capacity: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    // 'scheduled' | 'held' | 'cancelled'.
    status: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'scheduled',
    },
    heldAt: { type: DataTypes.DATE, allowNull: true },
    heldBy: { type: DataTypes.UUID, allowNull: true },
    cancelledAt: { type: DataTypes.DATE, allowNull: true },
    cancelledBy: { type: DataTypes.UUID, allowNull: true },
    cancelReason: { type: DataTypes.STRING, allowNull: true },
    // 'Bring a mat'.
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
    tableName: 'ClassSession',
    timestamps: true,
    indexes: [
        // One generated session per schedule per date (one-offs carry no schedule).
        { name: 'UX_FacilityClassSession_Schedule_Date', fields: ['scheduleId', 'sessionDate'], unique: true, where: { scheduleId: { [Op.ne]: null } } },
        { name: 'IX_FacilityClassSession_Company_Date', fields: ['companyId', 'sessionDate'] },
        { name: 'IX_FacilityClassSession_Class_Date', fields: ['classId', 'sessionDate'] },
        { name: 'IX_FacilityClassSession_Venue_Date', fields: ['venueId', 'sessionDate'] },
        { name: 'IX_FacilityClassSession_Facility_Date', fields: ['facilityId', 'sessionDate'] },
        { name: 'IX_FacilityClassSession_Instructor_Date', fields: ['instructorId', 'sessionDate'] },
    ],
});

module.exports = FacilityClassSession;
