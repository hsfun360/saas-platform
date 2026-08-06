const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { AR_SCHEMA } = require('../../platform/schemas');

// Setting - per-company AR options singleton (approved 2026-08-06). Maintained
// on the Statement Generation screen.
//
// statementCutoffDay: the statement period rule. Day D means Statement Month
// M defaults to (prev month's day D + 1) .. (month M's day D), clamped to
// short months; NULL = calendar month (1st..last). Users can still override
// the dates per run.
//
// aging1..aging6: upper DAY boundaries of the statement aging buckets, filled
// left-to-right with no gaps, strictly ascending (e.g. 30,60,90,120,null,null
// prints <=30, 31-60, 61-90, 91-120, >120). Not every company practices
// 30/60/90, so the boundaries are user-defined, not a fixed interval.
const Setting = sequelize.define('ArSetting', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
    },
    statementCutoffDay: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    aging1: { type: DataTypes.INTEGER, allowNull: true },
    aging2: { type: DataTypes.INTEGER, allowNull: true },
    aging3: { type: DataTypes.INTEGER, allowNull: true },
    aging4: { type: DataTypes.INTEGER, allowNull: true },
    aging5: { type: DataTypes.INTEGER, allowNull: true },
    aging6: { type: DataTypes.INTEGER, allowNull: true },
    // Ownership stamps.
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: AR_SCHEMA,
    tableName: 'Setting',
    timestamps: true,
});

module.exports = Setting;
