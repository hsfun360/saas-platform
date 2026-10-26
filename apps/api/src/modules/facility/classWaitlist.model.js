const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// facility.ClassWaitlist (slice 5, structure approved 2026-10-26) - the QUEUE
// for a full session or term, first come first served. When a seat frees the
// first `waiting` row becomes `offered` and holds the seat until
// offerExpiresAt (the Specification's classWaitlistOfferHours); the desk
// confirms it into an enrolment, the patron withdraws, or the worker lapses
// it and offers the next. Exactly one of sessionId / scheduleId is set, as
// the enrolment. Cascades with the class, the session and the schedule.
const FacilityClassWaitlist = sequelize.define('FacilityClassWaitlist', {
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
    sessionId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    scheduleId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
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
    // 'waiting' | 'offered' | 'enrolled' | 'withdrawn' | 'lapsed'.
    status: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'waiting',
    },
    offeredAt: { type: DataTypes.DATE, allowNull: true },
    // offeredAt + the offer hours; the worker lapses it and offers the next.
    offerExpiresAt: { type: DataTypes.DATE, allowNull: true },
    // The enrolment created on confirm.
    enrolmentId: { type: DataTypes.UUID, allowNull: true },
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
    tableName: 'ClassWaitlist',
    timestamps: true,
    indexes: [
        { name: 'UX_FacilityClassWaitlist_Patron_Session_Live', fields: ['patronId', 'sessionId'], unique: true, where: { status: { [Op.in]: ['waiting', 'offered'] }, sessionId: { [Op.ne]: null } } },
        { name: 'UX_FacilityClassWaitlist_Patron_Schedule_Live', fields: ['patronId', 'scheduleId'], unique: true, where: { status: { [Op.in]: ['waiting', 'offered'] }, scheduleId: { [Op.ne]: null } } },
        { name: 'IX_FacilityClassWaitlist_Session_Status', fields: ['sessionId', 'status', 'createdAt'] },
        { name: 'IX_FacilityClassWaitlist_Schedule_Status', fields: ['scheduleId', 'status', 'createdAt'] },
        { name: 'IX_FacilityClassWaitlist_Company_Offer', fields: ['companyId', 'status', 'offerExpiresAt'] },
    ],
});

module.exports = FacilityClassWaitlist;
