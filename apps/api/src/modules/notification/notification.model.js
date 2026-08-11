const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

// Notification - in-app notifications (bell icon in the shell header), owned
// by the Notification service (approved 2026-08-08). Generic platform-tier
// capability: any long-running job (statement runs today; fee runs, imports,
// interest later) notifies its initiator through this table. userId/companyId
// are plain UUID value references (no cross-service FK).
const Notification = sequelize.define('Notification', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    // Recipient.
    userId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    // Workspace context the notification belongs to (null = platform-wide).
    companyId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    // e.g. 'statement-run-completed' - lets screens group/filter by source.
    type: {
        type: DataTypes.STRING(40),
        allowNull: false,
    },
    title: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    body: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    // In-app route to open when clicked (e.g. '/ar/statements').
    linkRoute: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    // Unread = NULL; drives the bell badge count.
    readAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    // Soft-delete: the user dismissed it from the bell (✕ / Clear all).
    // Dismissed rows never list again but stay for audit; NULL = visible.
    dismissedAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
}, {
    tableName: 'Notification',
    timestamps: true,
    indexes: [
        { name: 'IDX_Notification_User_Created', fields: ['userId', 'createdAt'] },
        { name: 'IDX_Notification_User_Unread', fields: ['userId'], where: { readAt: null } },
    ],
});

module.exports = Notification;
