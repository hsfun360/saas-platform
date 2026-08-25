const { DataTypes, Op } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { DIMENSION_SCHEMA } = require('../../platform/schemas');

// DimensionCategory - a company-wide financial-analysis dimension (hybrid
// design locked in 2026-08-25; promoted to a SHARED CAPABILITY like Tax the
// same day: the same 'Department' list must mean the same thing on an AR
// invoice, an AP bill and a GL journal, so the catalog is owned by nobody's
// sub-module). Unlimited catalog; a category a company wants stamped onto
// documents is assigned a dimension number 1..6, which maps it to each
// consumer's analysis<dimensionNo>Id columns (ar.Ledger today; AP/GL/PO
// later). Numberless categories are catalog-only. Consumed through
// platform/dimensionGateway.js.
//
// THE REPURPOSE LOCK: the dimension number is what consumers store and index,
// not the meaning - so once any consumer's document references one of the
// category's options, its dimensionNo can no longer change (rename stays
// free). Enforced in the controller through the gateway's usage checks.
const DimensionCategory = sequelize.define('DimensionCategory', {
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
    // 1..6 = stamped onto consumers' analysis<dimensionNo>Id columns; NULL =
    // catalog-only. Company-GLOBAL: Dimension 3 means the same thing in every
    // consuming module, which is what makes cross-module reporting joinable.
    dimensionNo: {
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
    // Disabled categories show nowhere (pickers; setup detail stays reachable).
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
    schema: DIMENSION_SCHEMA,
    tableName: 'DimensionCategory',
    timestamps: true,
    indexes: [
        { name: 'IDX_DimensionCategory_Company_Name', fields: ['companyId', 'name'], unique: true },
        // One category per dimension number per company (catalog-only exempt).
        {
            name: 'IDX_DimensionCategory_Company_DimensionNo',
            fields: ['companyId', 'dimensionNo'],
            unique: true,
            where: { dimensionNo: { [Op.ne]: null } },
        },
    ],
});

module.exports = DimensionCategory;
