const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

const Account = sequelize.define('Account', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    subscriberName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // The subscriber's SuperUser: this user administers EVERY company under the
    // account (account-level authority), not just companies they're a member of.
    // Nullable so sequelize.sync({ alter: true }) can add it to existing rows;
    // backfilled by scripts/backfill-account-owner.js.
    ownerUserId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    subscriptionPlan: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'BASIC', // e.g., BASIC, PRO, ENTERPRISE
    },
    status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'ACTIVE', // e.g., ACTIVE, SUSPENDED, CANCELLED
    }
}, {
    tableName: 'Account',
    timestamps: true,
});

module.exports = Account;
