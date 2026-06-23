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
router.get('/modules', adminController.listModules);

// Modules & Menus Maintenance (master–detail catalogue management)
router.post('/modules', adminController.createModule);
router.put('/modules/:moduleId', adminController.updateModule);
router.delete('/modules/:moduleId', adminController.deleteModule);
router.get('/modules/:moduleId/menus', adminController.listModuleMenus);
router.post('/menus', adminController.createMenu);
router.put('/menus/:menuId', adminController.updateMenu);
router.delete('/menus/:menuId', adminController.deleteMenu);

// User Management
router.get('/users', adminController.listUsers);
router.post('/users', adminController.createUser);
router.post('/users/assign-role', adminController.assignUserToRole);

// Subscription / Subscriber Management (System Admin Portal)
router.post('/subscriptions', adminController.createSubscription);
router.get('/subscriptions', adminController.listSubscriptions);

// Tenant Admin management (platform override for a specific company)
router.get('/companies/:companyId/users', adminController.listCompanyUsers);
router.post('/companies/:companyId/tenant-admin', adminController.setTenantAdmin);

module.exports = router;
