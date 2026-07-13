const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');
const { MEMBERSHIP_SCHEMA } = require('../../platform/schemas');

// Membership Fee Scheme (detail) - the installment breakdown of a MembershipFee.
// The fee's amount is split into `noOfInstallment` stage rows; each stage carries
// its amount and an `isPosted` flag (set later by billing, not in setup).
//
// Owned by the SAME service as MembershipFee, so a real parent-child association
// (FK + cascade) is used - the golden "no cross-service FK" rule is about crossing
// SERVICE boundaries, and both tables live in the membership service/schema.
const MembershipFeeScheme = sequelize.define('MembershipFeeScheme', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    // Parent fee. Association defined in wiring/associations.js.
    membershipFeeId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // 1-based stage number, unique within the fee.
    stageNo: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    // The portion of the fee due at this stage. Stages sum to the fee amount.
    amount: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
    },
    // Whether this stage has been posted (billed). Managed by billing later;
    // preserved across edits of the schedule.
    isPosted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
}, {
    schema: MEMBERSHIP_SCHEMA,
    tableName: 'MembershipFeeScheme',
    timestamps: true,
    indexes: [
        { name: 'IDX_MembershipFeeScheme_Fee_Stage', fields: ['membershipFeeId', 'stageNo'], unique: true },
    ],
});

module.exports = MembershipFeeScheme;
