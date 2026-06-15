const express = require('express');
const router = express.Router();
const adminController = require('./admin.controller');

const { verifyToken } = require('../../platform/auth.middleware');
const { isSystemAdmin } = require('./rbac.middleware');

router.use(verifyToken);
router.use(isSystemAdmin);

// Role Management
router.post('/roles', adminController.createRole);
router.get('/roles', adminController.getRoles);
router.get('/menus', adminController.listMenus);

// User Management
router.get('/users', adminController.listUsers);
router.post('/users', adminController.createUser);
router.post('/users/assign-role', adminController.assignUserToRole);

// Subscription / Subscriber Management (System Admin Portal)
router.post('/subscriptions', adminController.createSubscription);
router.get('/subscriptions', adminController.listSubscriptions);

module.exports = router;
