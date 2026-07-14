const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

// Industry Type - SUBSCRIBER-OWNED reference data (Control Plane). One industry
// taxonomy per Account, shared by every company in the subscription and consumed
// across products (Membership member/prospect profiles, Golf, future CRM) by
// VALUE reference (`industryTypeCode`), never a cross-service FK.
//
// Promoted from the legacy membership spec's per-system master (MH SRS 2.1.5) to
// subscriber level so the group keeps one classification for rollup reporting.
// Enable/disable via isActive rather than hard delete (codes may already be on
// member/prospect records).
const IndustryType = sequelize.define('IndustryType', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    // The owning subscriber (Account). UUID reference, no FK.
    accountId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Subscriber-defined short code, unique per account (e.g. 'IT', 'FNB').
    industryTypeCode: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
}, {
    tableName: 'IndustryType',
    timestamps: true,
    indexes: [
        { name: 'IDX_IndustryType_Account_Code', fields: ['accountId', 'industryTypeCode'], unique: true },
    ],
});

module.exports = IndustryType;
