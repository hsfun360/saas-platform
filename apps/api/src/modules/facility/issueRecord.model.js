const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// Facility Issue Record (structure approved 2026-10-26, slice 3; re-pointed
// to the Utility Item master 2026-11-11, slice 6a) - one issue of a numbered
// unit (the locker), of a quantity (towels) or one recorded use (a shower)
// of a UTILITY ITEM to a member. A returnable item is due back at the end of
// its due day; returned good, damaged (the unit parks out of service) or
// lost (no automatic penalty - the loss is listed for a manual charge). A
// use-only item closes as 'used' at issue. The fee, when the item names one,
// bills on its own.
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
    // The member RESPONSIBLE for it (slice 6b): the holder when the two
    // holder columns are empty, else the host whose bill carries the fee
    // and to whom a loss is charged.
    patronId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The guest holding or using the item, as a snapshot; NULL = the member.
    holderName: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // The guest's day pass, membership.GuestRegistration.id (a value ref
    // across the seam, no FK); NULL for the member.
    guestRegistrationId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // The utility item (renamed from facilityTypeId, 2026-11-11).
    utilityItemId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The numbered unit issued (renamed from facilityId); NULL for a
    // quantity or a use.
    utilityUnitId: {
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
    // 'issued' | 'returned' | 'lost' | 'used' (a use-only item, closed at issue).
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
        { name: 'IX_FacilityIssueRecord_Company_Item_Status', fields: ['companyId', 'utilityItemId', 'status'] },
        { name: 'IX_FacilityIssueRecord_Company_Patron_Status', fields: ['companyId', 'patronId', 'status'] },
        { name: 'IX_FacilityIssueRecord_Unit', fields: ['utilityUnitId'] },
        // A guest's items, found by scanning the pass.
        { name: 'IX_FacilityIssueRecord_Company_Pass_Status', fields: ['companyId', 'guestRegistrationId', 'status'] },
    ],
});

module.exports = IssueRecord;
