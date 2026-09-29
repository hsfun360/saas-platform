const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// Short-lived WHOLE-FLIGHT claim while a user keys the player list (user
// decisions 2026-09-20; re-keyed to the NINE in the 2026-09-29 revamp). One
// row per occupied NINE-cell (unitCourseId + teeTime) of the virtual tee
// sheet - an 18-hole lock is TWO rows (start + crossover nines) sharing a
// groupId - so the unique index below is the DB-level double-lock guard,
// now spanning courses that share a physical nine. Rows expire after
// GolfSetting.bookingLockMinutes (`expiresAt`); expired rows are ignored by
// availability and swept inside the lock/save transactions, which all run
// under a Postgres advisory lock on (company, playDate) - the same
// serialization point the final booking save uses, so two users clicking the
// same flight in the same instant cannot both win. The portal's self-booking
// later uses this exact path (lockedBy = the member's user).
const FlightLock = sequelize.define('FlightLock', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Ties the start and crossover rows of one lock together.
    groupId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The rotation course being booked (informational; the CELL is the nine).
    courseId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The physical NINE claimed - the cell key.
    unitCourseId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    playDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    teeTime: {
        type: DataTypes.TIME,
        allowNull: false,
    },
    expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    // The user holding the lock.
    lockedBy: {
        type: DataTypes.UUID,
        allowNull: false,
    },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'FlightLock',
    timestamps: true,
    indexes: [
        { name: 'UX_FlightLock_Cell', fields: ['companyId', 'unitCourseId', 'playDate', 'teeTime'], unique: true },
        { name: 'IX_FlightLock_Group', fields: ['groupId'] },
    ],
});

module.exports = FlightLock;
