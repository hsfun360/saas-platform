const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// facility.ClassSchedule (slice 5, structure approved 2026-10-26) - the
// RECURRENCE HEADER of a class: over a date range, on the ISO weekdays given,
// at one time band, with the resolved venue, instructor and capacity. It
// generates ClassSession rows through a preview the user reviews (golf's
// slot-set / closure-plan pattern: header, preview, generated rows saved).
// In `term` mode the schedule is also the thing a patron enrols in (slice
// 5b). Cascades with the class.
const FacilityClassSchedule = sequelize.define('FacilityClassSchedule', {
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
    // 'Term 1 2027', 'Weekday mornings'.
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    dateFrom: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // Inclusive; at most 366 days after dateFrom.
    dateTo: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // The ISO weekdays that run (1 = Monday .. 7 = Sunday), at least one.
    weekdays: {
        type: DataTypes.JSONB,
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
    // Venue for this schedule's sessions; NULL = the class default.
    venueId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // NULL = the class default.
    instructorId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // NULL = the class default, else the venue's.
    capacity: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    // Generation skips a day the venue's linked facility (or its type) is
    // closed; no effect on an unlinked venue.
    skipClosures: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    // Generation skips public holidays (calendar seam).
    skipPublicHolidays: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    // Free text shown with a term enrolment ('10 sessions').
    termFeeNote: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // 'active' | 'closed' (no new enrolments; sessions run out) |
    // 'cancelled' (every future session cancelled).
    status: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'active',
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
    tableName: 'ClassSchedule',
    timestamps: true,
    indexes: [
        { name: 'IX_FacilityClassSchedule_Company_From', fields: ['companyId', 'dateFrom'] },
        { name: 'IX_FacilityClassSchedule_Class', fields: ['classId'] },
    ],
});

module.exports = FacilityClassSchedule;
