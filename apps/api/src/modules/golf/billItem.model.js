const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// One billing line of a golf Bill (user vocabulary: BillItem). Unit price
// resolves from the transaction type's rate card (4-cell matrix by the
// registration's holes + day type, or flatAmount); a manual change is only
// allowed while the type's allowPriceOverride is ON and is audited via
// `priceOverridden`.
//
// PACKAGE EXPLOSION (approved spec): adding a package type generates its
// element lines (stored qty × unit amount) PLUS one automatic balance line to
// the package's autoTransactionTypeId (amount = package price − Σ element
// lines). All lines of the group share `packageGroupId` and remove together;
// the PACKAGE's tax scheme applies to every generated line, and the LAST
// group line's tax is adjusted so the group's tax equals the tax computed
// directly on the package amount.
//
// Tax snapshots per line: scheme code, the (possibly rounding-adjusted)
// amount, and the full component breakdown for audit.
const BillItem = sequelize.define('GolfBillItem', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    billId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    transactionTypeId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Display snapshot of the type's code + description at billing time.
    description: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
    },
    unitAmount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
    // quantity × unitAmount (after any permitted override).
    amount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
    priceOverridden: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    // Package explosion group (all NULL on ordinary lines).
    packageGroupId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // 'element' | 'auto' (registration.constants PACKAGE_ROLES).
    packageRole: {
        type: DataTypes.STRING(10),
        allowNull: true,
    },
    packageTransactionTypeId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // Tax snapshot.
    taxSchemeCode: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    taxAmount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
    taxBreakdown: {
        type: DataTypes.JSONB,
        allowNull: true,
    },
    // Ownership stamps (RBAC data scope + future workflow).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'BillItem',
    timestamps: true,
    indexes: [
        { name: 'IX_GolfBillItem_Bill', fields: ['billId'] },
    ],
});

module.exports = BillItem;
