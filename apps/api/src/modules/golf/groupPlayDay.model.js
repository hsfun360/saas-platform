const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// golf.GroupPlayDay (approved structure 2026-10-07, user's table name) - ONE
// PLAY DAY of a group / tournament booking: its own course, holes and START
// FORMAT. A booking that spans several days playing a different course each
// day is one BookingProfile with one row here per day.
//
// Start formats (groupBooking.constants START_FORMATS): 'traditional' and
// 'two-tee' reserve tee-time CELLS through golf.GroupFlight rows (the cells
// count at full capacity from reservation); 'shotgun' and 'modified-shotgun'
// HOLD the course's nines for the window startTime..blockUntil (ordinary
// bookings are refused inside it) and the flights carry a start hole instead.
const GroupPlayDay = sequelize.define('GolfGroupPlayDay', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    bookingProfileId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    playDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // The rotation course played on this day.
    courseId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    holes: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 18,
    },
    // START_FORMAT_KEYS.
    startFormat: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'traditional',
    },
    // First tee-off (traditional / two-tee) or the (first) wave time (shotgun
    // formats).
    startTime: {
        type: DataTypes.TIME,
        allowNull: false,
    },
    // Shotgun formats only: the course is held until this time.
    blockUntil: {
        type: DataTypes.TIME,
        allowNull: true,
    },
    // Modified shotgun only: the holes in use, e.g. [1,3,5,10,12]. NULL on
    // every other format (a full shotgun uses every hole).
    startHoles: {
        type: DataTypes.JSONB,
        allowNull: true,
    },
    // Shotgun formats: how many waves (each wave re-uses the start holes at
    // a later time). 1 for the other formats.
    waves: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
    },
    remarks: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // PLAY_DAY_STATUS_KEYS: planned | played | cancelled.
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'planned',
    },
    // Ownership stamps (RBAC data scope + future workflow).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'GroupPlayDay',
    timestamps: true,
    indexes: [
        { name: 'IX_GolfGroupPlayDay_Company_Date', fields: ['companyId', 'playDate'] },
        { name: 'IX_GolfGroupPlayDay_Booking', fields: ['bookingProfileId'] },
        { name: 'UX_GolfGroupPlayDay_Booking_Date', fields: ['bookingProfileId', 'playDate'], unique: true },
    ],
});

module.exports = GroupPlayDay;
