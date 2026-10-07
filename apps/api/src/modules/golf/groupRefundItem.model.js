const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// golf.GroupRefundItem (approved structure 2026-10-07) - which deposit bills
// a refund request draws on, and how much of each. The request reserves
// the amounts on the deposit bills (depositRefundedAmount) so the same
// money cannot be applied to the final bill or requested twice; a decline
// releases them.
const GroupRefundItem = sequelize.define('GolfGroupRefundItem', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    groupRefundId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    depositBillId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    amount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
    },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'GroupRefundItem',
    timestamps: true,
    indexes: [
        { name: 'IX_GolfGroupRefundItem_Refund', fields: ['groupRefundId'] },
        { name: 'IX_GolfGroupRefundItem_Deposit', fields: ['depositBillId'] },
    ],
});

module.exports = GroupRefundItem;
