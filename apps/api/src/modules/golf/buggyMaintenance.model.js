const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// golf.BuggyMaintenance (approved 2026-10-18; spec 2.1.6 球车保养、安检与维修
// trimmed to the user's decisions: no engineers, parts or depots) - ONE JOB
// on ONE unit: a routine `service`, a `repair` (a fault or damage) or the
// safety `inspection` with the five-system checklist. An open service or
// repair parks the unit (Buggy.location 'maintenance') so the station cannot
// issue it; completing it returns the unit to the depot. An inspection is
// done on the spot - all clear, or a fault that opens a repair. A fault or
// damaged return at the station opens a repair by itself (source
// 'station-return'). At most ONE open service/repair per unit.
const GolfBuggyMaintenance = sequelize.define('GolfBuggyMaintenance', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // golf.Buggy (intra-service FK, restrict) + the asset tag snapshot.
    buggyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    buggyNo: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // 'service' | 'repair' | 'inspection' (MAINTENANCE_KIND_KEYS).
    kind: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // 'open' | 'done'.
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'open',
    },
    openedAt: { type: DataTypes.DATE, allowNull: false },
    openedBy: { type: DataTypes.UUID, allowNull: true },
    // 'manual' | 'station-return' | 'inspection' (MAINTENANCE_SOURCE_KEYS).
    source: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'manual',
    },
    // The return that raised it and the damage record it repairs (id refs).
    buggyIssueId: { type: DataTypes.UUID, allowNull: true },
    buggyDamageId: { type: DataTypes.UUID, allowNull: true },
    findings: { type: DataTypes.STRING(1000), allowNull: true },
    workDone: { type: DataTypes.STRING(1000), allowNull: true },
    // Money column (numeric(21,2)); the club's own cost note, optional.
    cost: { type: DataTypes.DECIMAL(21, 2), allowNull: true },
    // The inspection checklist (NULL on a service / repair).
    steeringOk: { type: DataTypes.BOOLEAN, allowNull: true },
    brakesOk: { type: DataTypes.BOOLEAN, allowNull: true },
    electricalOk: { type: DataTypes.BOOLEAN, allowNull: true },
    driveOk: { type: DataTypes.BOOLEAN, allowNull: true },
    bodyOk: { type: DataTypes.BOOLEAN, allowNull: true },
    completedAt: { type: DataTypes.DATE, allowNull: true },
    completedBy: { type: DataTypes.UUID, allowNull: true },
    remarks: { type: DataTypes.STRING, allowNull: true },
    // Ownership stamps (RBAC data scope).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'BuggyMaintenance',
    timestamps: true,
    indexes: [
        { name: 'IX_GolfBuggyMaintenance_Company_Status_Opened', fields: ['companyId', 'status', 'openedAt'] },
        { name: 'IX_GolfBuggyMaintenance_Buggy_Opened', fields: ['buggyId', 'openedAt'] },
        // One open service / repair per unit.
        {
            name: 'UX_GolfBuggyMaintenance_Buggy_Open',
            fields: ['buggyId'],
            unique: true,
            where: { status: 'open', kind: { [Op.in]: ['service', 'repair'] } },
        },
    ],
});

module.exports = GolfBuggyMaintenance;
