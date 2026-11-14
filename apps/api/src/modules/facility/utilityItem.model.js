const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// facility.UtilityItem (slice 6a, structure approved 2026-11-11) - the master
// of what the Control Station hands out or lets a person use: LOCKER, TOWEL,
// SHOWER. A utility item is NOT a facility (a facility is a place a person
// books or enters); before this table they were Facility Types of usage mode
// "issue". Two switches describe the behaviour: `trackUnits` ON = numbered
// units issued and returned one by one (UtilityUnit rows); OFF with
// `returnRequired` ON = a quantity issued and counted back; OFF with
// `returnRequired` OFF = a use recorded and closed at once.
const UtilityItem = sequelize.define('FacilityUtilityItem', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Upper case, e.g. LOCKER, TOWEL, SHOWER.
    code: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    description: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    trackUnits: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    // Always true when trackUnits is ON.
    returnRequired: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    // Counted items: the pieces the club owns ("42 of 200 out"). Information
    // only, never a refusal; NULL = not shown.
    stockQuantity: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    // Units or pieces ONE person may hold at a time (0 = no limit); for a
    // use-only item, uses per person per day.
    maxPerPerson: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
    },
    // (`dueDays` was dropped 2026-11-14: nobody keeps an item overnight, so
    // every returnable item is due back the same day.)
    // The issue-fee billing item charged per unit, piece or use; NULL = free.
    feeTransactionTypeId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // OFF = members only. Enforced from slice 6c (a guest as the holder).
    guestsAllowed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    // OFF = not issued to a visiting affiliated or reciprocal member, nor to a
    // guest they brought (slice 7, structure approved 2026-11-14).
    visitingMembersAllowed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    // ON = only for a person inside a facility today. Enforced from slice 6c.
    requiresEntry: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    iconUrl: {
        type: DataTypes.STRING(1000),
        allowNull: true,
    },
    sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 100,
    },
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
    tableName: 'UtilityItem',
    timestamps: true,
    indexes: [
        { name: 'UX_FacilityUtilityItem_Company_Code', fields: ['companyId', 'code'], unique: true },
    ],
});

module.exports = UtilityItem;
