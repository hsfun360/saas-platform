const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// facility.Class (slice 5, structure approved 2026-10-26) - the PROGRAMME the
// club offers ('Morning Yoga', 'Badminton coaching'); the timetable comes
// from its schedules (ClassSchedule -> generated ClassSession rows). ONE
// enrolment mode per class: `session` (one seat in one session) or `term`
// (one seat in every session of a schedule), and ONE fee item per audience
// (the member item, and optionally a dearer visitor item), each a
// `class-fee` transaction type priced by its flat card per session or per
// term by the mode. The default venue and instructor may be left to the
// schedule. `code` is frozen once an enrolment exists (slice 5b).
const FacilityClass = sequelize.define('FacilityClass', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    code: {
        type: DataTypes.STRING(30),
        allowNull: false,
    },
    // The display name ('Morning Yoga').
    description: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // What the class is, what to bring; shown on the roster and the email.
    details: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    // The default venue; NULL = chosen per schedule.
    venueId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // The default instructor; NULL = chosen per schedule.
    instructorId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // Default seats per session; NULL = the venue's capacity, else at most
    // the venue's. A schedule or a session may lower it further.
    capacity: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    // 'session' | 'term'.
    enrolmentMode: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'session',
    },
    // The member fee item (class-fee, flat card); NULL = free.
    feeTransactionTypeId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // The item a visitor pays when it differs; NULL = the member item.
    visitorFeeTransactionTypeId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // Whether a non-member may enrol (with a visitor profile).
    visitorsAllowed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    // Whether the station may enrol a patron into a session on the day.
    walkInAllowed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    // Overrides the Specification's class notice; NULL = the Specification's.
    cancellationNoticeHours: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 100,
    },
    // An inactive class takes no new schedules or enrolments; scheduled
    // sessions run out.
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    // Ownership stamps (RBAC data scope + future workflow).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: FACILITY_SCHEMA,
    tableName: 'Class',
    timestamps: true,
    indexes: [
        { name: 'UX_FacilityClass_Company_Code', fields: ['companyId', 'code'], unique: true },
        { name: 'IX_FacilityClass_Company_Active', fields: ['companyId', 'isActive'] },
        { name: 'IX_FacilityClass_Company_Venue', fields: ['companyId', 'venueId'] },
    ],
});

module.exports = FacilityClass;
