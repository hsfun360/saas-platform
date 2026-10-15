const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { GOLF_SCHEMA } = require('../../platform/schemas');

// golf.RainCheck (approved 2026-10-15) - a credit owed to a GOLFER whose paid
// round was abandoned (rain, course closure), redeemable once as a tender on
// a later bill. Keys off the Golfer identity (member or visitor alike), is not
// transferable, is numbered from the 'golf-raincheck' series, expires after
// GolfSetting.rainCheckValidityDays, and is single-use: applied to one bill,
// any surplus is forfeited and recorded. No AR posting is involved - the
// source bill was already paid.
const RainCheck = sequelize.define('GolfRainCheck', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    rainCheckNo: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    // The person owed (golf.Golfer value ref) + display snapshots.
    golferId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    golferName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    memberNo: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    // The registered starting-nine record and the SETTLED source bill.
    playerId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    billId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    billNo: {
        type: DataTypes.STRING(50),
        allowNull: false,
    },
    // The abandoned round.
    playDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    courseId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // Proration inputs: holes registered (9 or 18) and holes actually played.
    holesRegistered: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    holesPlayed: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    // The amount the value was computed from (the bill's green-fee lines, or
    // the whole bill, per GolfSetting.rainCheckBasis) and the credit value.
    basisAmount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
        defaultValue: 0,
    },
    amount: {
        type: DataTypes.DECIMAL(21, 2),
        allowNull: false,
    },
    reason: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    remarks: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    issuedAt: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    expiryDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    // 'issued' | 'redeemed' | 'expired' | 'cancelled' (rainCheck.constants).
    status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'issued',
    },
    // The redemption: the bill it settled, how much it covered and the surplus
    // forfeited (single use).
    redeemedBillId: { type: DataTypes.UUID, allowNull: true },
    redeemedBillNo: { type: DataTypes.STRING(50), allowNull: true },
    redeemedAt: { type: DataTypes.DATE, allowNull: true },
    redeemedAmount: { type: DataTypes.DECIMAL(21, 2), allowNull: true },
    forfeitedAmount: { type: DataTypes.DECIMAL(21, 2), allowNull: true },
    cancelledAt: { type: DataTypes.DATE, allowNull: true },
    cancelledBy: { type: DataTypes.UUID, allowNull: true },
    cancelReason: { type: DataTypes.STRING, allowNull: true },
    // Ownership stamps (RBAC data scope).
    createdBy: { type: DataTypes.UUID, allowNull: true },
    createdByDepartmentId: { type: DataTypes.UUID, allowNull: true },
    updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
    schema: GOLF_SCHEMA,
    tableName: 'RainCheck',
    timestamps: true,
    indexes: [
        { name: 'UX_GolfRainCheck_Company_No', fields: ['companyId', 'rainCheckNo'], unique: true },
        { name: 'IX_GolfRainCheck_Company_Golfer_Status', fields: ['companyId', 'golferId', 'status'] },
        { name: 'IX_GolfRainCheck_Company_Expiry', fields: ['companyId', 'expiryDate'] },
        { name: 'IX_GolfRainCheck_Bill', fields: ['billId'] },
    ],
});

module.exports = RainCheck;
