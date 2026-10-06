const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// golf.TransactionTypeEligibility (approved 2026-10-06; Tropicana gap 6b) -
// ONE row = one way a golfer QUALIFIES for a billing item (packages today:
// "Junior ≤18 Mon-Fri excl. holidays", "Ladies Mon-Fri 07:05-09:05", "Sat
// all day OR Sun morning"). Rows of one item are OR-ed: the golfer qualifies
// when ANY row matches in full; an item with no rows is for everyone, any
// time. Every column is a condition that is NULL/false = not required.
//
// Evaluated at the FRONT DESK against the play (play date -> day of week +
// public holiday via the calendar seam, tee-off time, holes) and the golfer
// (date of birth, gender, nationality - a member's through the membership
// seam, a visitor's from OtherGolfer). Missing golfer data FAILS the
// condition with a message naming what is missing - never a silent pass.
// Tiles the player does not qualify for stay visible but disabled with the
// reason; adding one is refused server-side with the same reason
// (eligibility.service.js).
//
// Same-service parent-child, so a real FK + cascade is used (association in
// wiring/associations.js), like TransactionTypeElement.
const GolfTransactionTypeEligibility = sequelize.define('GolfTransactionTypeEligibility', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    // The owning item (package).
    transactionTypeId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    sequence: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
    },
    // JSON array of 'monday'..'sunday'; NULL = any day.
    daysOfWeek: {
        type: DataTypes.JSONB,
        allowNull: true,
    },
    // "excl. public holidays" (classified via platform/calendarGateway.js).
    excludePublicHolidays: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    // Tee-off must fall within [startTime, endTime]; both or neither.
    startTime: {
        type: DataTypes.TIME,
        allowNull: true,
    },
    endTime: {
        type: DataTypes.TIME,
        allowNull: true,
    },
    // 9 or 18; NULL = either.
    holes: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    // Age on the play date (from the golfer's date of birth); NULL = any.
    minAge: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    maxAge: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    // 'male' | 'female'; NULL = any.
    gender: {
        type: DataTypes.STRING(10),
        allowNull: true,
    },
    // Golfer's nationality must be this subscriber Nationality code ("local
    // golfers only" = the club's own nationality, e.g. 'MAS'); NULL = any.
    // A value reference into the Control-Plane Nationality list - that list
    // is subscriber-defined and deliberately NOT country-linked, so the club
    // names the nationality rather than the system guessing from its country.
    nationalityCode: {
        type: DataTypes.STRING(20),
        allowNull: true,
    },
    // Ownership stamps (RBAC data scope + future workflow).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'TransactionTypeEligibility',
    timestamps: true,
    indexes: [
        { name: 'IX_GolfTransactionTypeEligibility_Type_Seq', fields: ['transactionTypeId', 'sequence'] },
    ],
});

module.exports = GolfTransactionTypeEligibility;
