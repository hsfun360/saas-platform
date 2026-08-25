const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { AR_SCHEMA } = require('../../platform/schemas');

// AnalysisCategory - a user-defined financial-analysis dimension (hybrid
// design locked in 2026-08-25: unlimited CATALOG of categories, bounded
// STAMPING through slots). A category the company wants stamped onto ledger
// documents is assigned a slot 1..6, which maps it to the Ledger's
// analysis<slotNo>Id column; slotless categories are catalog-only.
//
// THE SLOT-REPURPOSE LOCK: the slot is what is stored and indexed, not the
// meaning - so once any document references one of the category's options,
// its slotNo can no longer change (rename stays free). Enforced in the
// controller, same spirit as the account-currency lock.
const AnalysisCategory = sequelize.define('ArAnalysisCategory', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // The user's own vocabulary: 'Department', 'Project', 'Cost Centre', ...
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // 1..6 = stamped onto Ledger.analysis<slotNo>Id; NULL = catalog-only.
    slotNo: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: { min: 1, max: 6 },
    },
    // Manual document entry must carry a value for this dimension (system
    // producers are exempt - a fee run has no clerk to ask).
    isRequired: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    // Disabled categories show nowhere (pickers, setup detail stays reachable).
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    // Ownership stamps (RBAC data scope).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: AR_SCHEMA,
    tableName: 'AnalysisCategory',
    timestamps: true,
    indexes: [
        { name: 'IDX_ArAnalysisCategory_Company_Name', fields: ['companyId', 'name'], unique: true },
        // One category per slot per company (catalog-only rows exempt).
        {
            name: 'IDX_ArAnalysisCategory_Company_Slot',
            fields: ['companyId', 'slotNo'],
            unique: true,
            where: { slotNo: { [require('sequelize').Op.ne]: null } },
        },
    ],
});

module.exports = AnalysisCategory;
