const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// Facility Issue Record (structure approved 2026-10-26, slice 3) - one issue
// of a unit (trackUnits ON: the locker) or of a quantity of a consumable
// (trackUnits OFF: towels) to a member, due back at the type's close time
// plus issueDueDays; returned good, damaged (the unit parks out of service)
// or lost (no automatic penalty in this slice - the loss is listed for a
// manual charge). The issue fee, when the type names one, bills on its own.
const IssueRecord = sequelize.define('FacilityIssueRecord', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The member holding it.
    patronId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    facilityTypeId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The unit issued, or the type's counter row for a consumable.
    facilityId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // The entry the issue belongs to; NULL when issued on its own.
    registrationId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
    },
    issuedAt: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    dueBack: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    returnedAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    // Consumables may come back short; the difference is lost.
    returnedQuantity: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    // 'good' | 'damaged' | 'lost'.
    returnCondition: {
        type: DataTypes.STRING(10),
        allowNull: true,
    },
    // 'issued' | 'returned' | 'lost'.
    status: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'issued',
    },
    // The bill the issue fee opened; NULL = free issue.
    feeBillId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    remarks: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: FACILITY_SCHEMA,
    tableName: 'IssueRecord',
    timestamps: true,
    indexes: [
        { name: 'IX_FacilityIssueRecord_Company_Type_Status', fields: ['companyId', 'facilityTypeId', 'status'] },
        { name: 'IX_FacilityIssueRecord_Company_Patron_Status', fields: ['companyId', 'patronId', 'status'] },
        { name: 'IX_FacilityIssueRecord_Facility', fields: ['facilityId'] },
    ],
});

module.exports = IssueRecord;
