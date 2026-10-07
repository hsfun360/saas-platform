const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// golf.GroupFlight (approved structure 2026-10-07) - ONE RESERVED FLIGHT of a
// group play day. Reserved BEFORE any name is known, so the tee sheet holds
// the group's space:
//   traditional / two-tee - the flight IS a nine-cell (unitCourseId +
//     teeTime) and availability counts it at full `capacity` from the moment
//     it exists (an 18-hole flight's crossover cell is held the same way
//     through the DRAW's Player rows and, until drawn, by the day's hold -
//     see bookingAvailability.groupHolds).
//   shotgun / modified-shotgun - teeTime is the WAVE time, startHole names
//     the hole the flight tees off from (1-18 on the course), startSequence
//     distinguishes the A/B flights sharing one hole; the day's hold blocks
//     the nines, so the flight itself never competes for a cell.
// The DRAW places roster players (golf.GroupPlayer) into flights, writing
// ordinary golf.Player rows that reference the flight (Player.groupFlightId).
const GroupFlight = sequelize.define('GolfGroupFlight', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    groupPlayDayId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    bookingProfileId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The physical NINE the flight tees off from (the availability key).
    unitCourseId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    courseId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    playDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // Tee-off time (traditional / two-tee) or the wave time (shotgun formats).
    teeTime: {
        type: DataTypes.TIME,
        allowNull: false,
    },
    // Shotgun formats: the start hole 1-18 on the course (1-9 = first nine,
    // 10-18 = second nine). NULL on sequential formats.
    startHole: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    // 1 = the (A) flight on the hole, 2 = the (B) flight behind it.
    startSequence: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
    },
    // Display label: "F1", "1A", "10B"... generated, editable.
    flightLabel: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    capacity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 4,
    },
    sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    // Ownership stamps (RBAC data scope + future workflow).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'GroupFlight',
    timestamps: true,
    indexes: [
        // Availability: the day's reserved cells in one range scan.
        { name: 'IX_GolfGroupFlight_Company_Nine_Date_Time', fields: ['companyId', 'unitCourseId', 'playDate', 'teeTime'] },
        { name: 'IX_GolfGroupFlight_Company_Date', fields: ['companyId', 'playDate'] },
        { name: 'IX_GolfGroupFlight_PlayDay', fields: ['groupPlayDayId'] },
        { name: 'IX_GolfGroupFlight_Booking', fields: ['bookingProfileId'] },
    ],
});

module.exports = GroupFlight;
