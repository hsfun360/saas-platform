const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// One element line of a PACKAGE transaction type (chargeType 'package'), e.g.
// Weekday Twin Package = 1 × share buggy (100.00) + 2 × caddy (50.00 each).
// `unitAmount` is the per-unit allocation of the package price across its
// elements - the revenue/tax breakdown at billing (each element portion is
// taxed by the ELEMENT's own scheme; the package itself carries no tax
// scheme). The package's own SELLING price stays in TransactionTypeRate
// (flat cards, effective-dated) - the element sum is shown against it in the
// editor but not enforced.
//
// `transactionTypeId` is the owning PACKAGE - the same-service parent (real
// FK + cascade, association in wiring/associations.js), named to match
// TransactionTypeRate's parent column. `elementTransactionTypeId` points at a
// PEER master row - kept a plain validated UUID like a course's nine
// references (same company, must NOT itself be a package - no nesting).
const GolfTransactionTypeElement = sequelize.define('GolfTransactionTypeElement', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    transactionTypeId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    elementTransactionTypeId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
    },
    // Per-unit allocation within the package (entered when composing).
    unitAmount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
    // Display order in the editor / billing breakdown.
    sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    // Ownership stamps (RBAC data scope + future workflow).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'TransactionTypeElement',
    timestamps: true,
    indexes: [
        { name: 'UX_GolfTransactionTypeElement_Type_Element', fields: ['transactionTypeId', 'elementTransactionTypeId'], unique: true },
    ],
});

module.exports = GolfTransactionTypeElement;
