const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// golf.GroupRefund (approved structure 2026-10-07) - a REFUND REQUEST from
// golf to Finance for deposit money a group booking no longer needs: the
// surplus after the final bill, or a cancelled booking's deposit (less any
// cancellation charge the folio billed). Plain request-and-settle lifecycle
// (user decision: no workflow for now): requested -> paid | declined.
// Golf never posts credit notes - Finance decides the AR treatment of an
// on-account deposit (credit-note the unpaid invoice, or pay out).
const GroupRefund = sequelize.define('GolfGroupRefund', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    bookingProfileId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Issued from the golf-refund series at request.
    refundNo: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    requestDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    amount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
    },
    reason: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // GROUP_REFUND_STATUS_KEYS: requested | paid | declined.
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'requested',
    },
    paidAt: { type: DataTypes.DATE, allowNull: true },
    paidBy: { type: DataTypes.UUID, allowNull: true },
    paidMethod: { type: DataTypes.STRING(100), allowNull: true },
    paidReference: { type: DataTypes.STRING(100), allowNull: true },
    declinedAt: { type: DataTypes.DATE, allowNull: true },
    declinedBy: { type: DataTypes.UUID, allowNull: true },
    declineReason: { type: DataTypes.STRING, allowNull: true },
    remarks: { type: DataTypes.STRING, allowNull: true },
    // Ownership stamps (RBAC data scope + future workflow).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'GroupRefund',
    timestamps: true,
    indexes: [
        { name: 'UX_GolfGroupRefund_Company_No', fields: ['companyId', 'refundNo'], unique: true },
        { name: 'IX_GolfGroupRefund_Company_Status', fields: ['companyId', 'status'] },
        { name: 'IX_GolfGroupRefund_Booking', fields: ['bookingProfileId'] },
    ],
});

module.exports = GroupRefund;
