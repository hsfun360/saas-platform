// src/modules/notification/notification.routes.js
//
// In-app notifications for the signed-in user (the header bell). Personal
// data scoped strictly to the JWT's userId - no menu RBAC (like /auth/my/*):
// every user may read and settle their own notifications, nobody else's.

const express = require('express');
const router = express.Router();
const { verifyToken, getUserContext } = require('../../platform/serviceContext');
const Notification = require('./notification.model');

router.use(verifyToken);

// GET /api/notifications/my - latest notifications + unread count.
router.get('/my', async (req, res) => {
    try {
        const { userId } = getUserContext(req);
        const [rows, unread] = await Promise.all([
            Notification.findAll({
                where: { userId, dismissedAt: null },
                order: [['createdAt', 'DESC']],
                limit: 30,
            }),
            Notification.count({ where: { userId, readAt: null, dismissedAt: null } }),
        ]);
        res.status(200).json({
            unread,
            notifications: rows.map((n) => ({
                id: n.id,
                type: n.type,
                title: n.title,
                body: n.body,
                linkRoute: n.linkRoute,
                readAt: n.readAt,
                createdAt: n.createdAt,
            })),
        });
    } catch (err) {
        console.error('Error listing notifications:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// PATCH /api/notifications/:id/read - settle one.
router.patch('/:id/read', async (req, res) => {
    try {
        const { userId } = getUserContext(req);
        const row = await Notification.findOne({ where: { id: req.params.id, userId } });
        if (!row) return res.status(404).json({ message: 'Notification not found.' });
        if (!row.readAt) {
            row.readAt = new Date();
            await row.save();
        }
        res.status(200).json({ message: 'Marked as read.' });
    } catch (err) {
        console.error('Error marking notification read:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// POST /api/notifications/read-all - settle everything unread.
router.post('/read-all', async (req, res) => {
    try {
        const { userId } = getUserContext(req);
        await Notification.update({ readAt: new Date() }, { where: { userId, readAt: null } });
        res.status(200).json({ message: 'All notifications marked as read.' });
    } catch (err) {
        console.error('Error marking notifications read:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// PATCH /api/notifications/:id/dismiss - remove one from the bell (soft-delete;
// an unread one settles at the same time so the badge never counts a hidden row).
router.patch('/:id/dismiss', async (req, res) => {
    try {
        const { userId } = getUserContext(req);
        const row = await Notification.findOne({ where: { id: req.params.id, userId } });
        if (!row) return res.status(404).json({ message: 'Notification not found.' });
        if (!row.dismissedAt) {
            row.dismissedAt = new Date();
            if (!row.readAt) row.readAt = row.dismissedAt;
            await row.save();
        }
        res.status(200).json({ message: 'Notification dismissed.' });
    } catch (err) {
        console.error('Error dismissing notification:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// POST /api/notifications/dismiss-all - clear the whole bell list.
router.post('/dismiss-all', async (req, res) => {
    try {
        const { userId } = getUserContext(req);
        const now = new Date();
        await Notification.update({ readAt: now }, { where: { userId, readAt: null } });
        await Notification.update({ dismissedAt: now }, { where: { userId, dismissedAt: null } });
        res.status(200).json({ message: 'All notifications cleared.' });
    } catch (err) {
        console.error('Error dismissing notifications:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;
