const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { FACILITY_SCHEMA } = require('../../platform/schemas');

// facility.TransactionType (structure approved 2026-10-25) - the billing-
// item catalog of Facility Management, golf's shape: code unique per
// company + a fixed charge type + THE tax scheme by code via the tax seam
// (single source - bill lines snapshot it, never store their own) +
// allowPriceOverride + icon. Facility-specific: `feeBasis` (how many bill
// lines the item produces - per slot for court hire, per participant for a
// guest fee, per booking later), `facilityTypeId` (the type the fee belongs
// to; NULL = usable on any type) and `participantType` (the category the
// fee is the auto-charged DEFAULT for; at most one active default per type
// and category). Packages and deposits keep their charge-type keys but are
// not built in slice 2 (refused at create). `companyId` is a Control-Plane
// reference, no FK. Model name is prefixed (global Sequelize registry);
// the table is facility."TransactionType".
const TransactionType = sequelize.define('FacilityTransactionType', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The code ('BADM', 'GUEST', 'LOCKER') - unique per company.
    transactionType: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    // facility.constants CHARGE_TYPE_KEYS.
    chargeType: {
        type: DataTypes.STRING(20),
        allowNull: false,
    },
    // facility.constants FEE_BASIS_KEYS: per-slot | per-participant | per-booking.
    feeBasis: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'per-slot',
    },
    // The Facility Type this fee belongs to; NULL = any type. Intra-service
    // value ref (no FK: a deleted type's fees stay as history).
    facilityTypeId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // The ParticipantType CODE this item is the auto-charged default for
    // (facility-fee / guest-fee only); NULL = a manual item.
    participantType: {
        type: DataTypes.STRING(20),
        allowNull: true,
    },
    // Tax scheme by code via the tax seam; NULL = no tax.
    taxSchemeCode: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    allowPriceOverride: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    // Public GCS URL of the billing-tile icon.
    iconUrl: {
        type: DataTypes.STRING,
        allowNull: true,
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
    tableName: 'TransactionType',
    timestamps: true,
    indexes: [
        { name: 'UX_FacilityTransactionType_Company_Code', fields: ['companyId', 'transactionType'], unique: true },
        { name: 'IX_FacilityTransactionType_Company_Type', fields: ['companyId', 'facilityTypeId'] },
    ],
});

module.exports = TransactionType;
