const express = require('express');
const router = express.Router();
const adminController = require('./admin.controller');
const countryController = require('./country.controller');
const languageController = require('./language.controller');
const currencyController = require('./currency.controller');
const accountLanguageController = require('./accountLanguage.controller');
const accountCurrencyController = require('./accountCurrency.controller');

const { verifyToken } = require('../../platform/auth.middleware');
const { isSystemAdmin } = require('./rbac.middleware');

router.use(verifyToken);
router.use(isSystemAdmin);

// Role Management
router.post('/roles', adminController.createRole);
router.get('/roles', adminController.getRoles);
router.put('/roles/:id', adminController.updateRole);
router.delete('/roles/:id', adminController.deleteRole);
router.get('/menus', adminController.listMenus);
router.get('/modules', adminController.listModules);

// Modules & Menus Maintenance (master–detail catalogue management)
router.post('/modules', adminController.createModule);
router.put('/modules/:moduleId', adminController.updateModule);
router.delete('/modules/:moduleId', adminController.deleteModule);
router.get('/modules/:moduleId/menus', adminController.listModuleMenus);
router.put('/modules/:moduleId/menus/order', adminController.reorderMenus); // sibling drag-reorder
router.post('/menus', adminController.createMenu);
router.put('/menus/:menuId', adminController.updateMenu);
router.delete('/menus/:menuId', adminController.deleteMenu);

// User Management
router.get('/users', adminController.listUsers);
router.post('/users', adminController.createUser);
router.post('/users/assign-role', adminController.assignUserToRole);
router.patch('/users/:id/status', adminController.setUserStatus);
router.patch('/users/:id', adminController.updateUser);

// Subscription / Subscriber Management (System Admin Portal)
router.post('/subscriptions', adminController.createSubscription);
router.get('/subscriptions', adminController.listSubscriptions);
router.patch('/subscriptions/:id', adminController.updateSubscription);
// A subscriber's language selection (subset of active languages + default).
router.get('/subscriptions/:id/languages', accountLanguageController.getSubscriptionLanguages);
router.put('/subscriptions/:id/languages', accountLanguageController.updateSubscriptionLanguages);
// A subscriber's currency selection (subset of active currencies + default).
router.get('/subscriptions/:id/currencies', accountCurrencyController.getSubscriptionCurrencies);
router.put('/subscriptions/:id/currencies', accountCurrencyController.updateSubscriptionCurrencies);

// Tenant Admin management (platform override for a specific company)
router.get('/companies/:companyId/users', adminController.listCompanyUsers);
router.post('/companies/:companyId/tenant-admin', adminController.setTenantAdmin);

// Country reference maintenance (sync from world_countries, list, enable/disable)
router.post('/countries/sync', countryController.syncCountries);
router.get('/countries', countryController.listAllCountries);
router.patch('/countries/:alpha2', countryController.updateCountry);

// Language reference maintenance (seed defaults, list, add, edit/enable-disable, delete)
router.post('/languages/seed', languageController.seedLanguages);
router.get('/languages', languageController.listAllLanguages);
router.post('/languages', languageController.createLanguage);
router.patch('/languages/:languageCode', languageController.updateLanguage);
router.delete('/languages/:languageCode', languageController.deleteLanguage);

// Currency reference maintenance (seed ISO 4217 defaults, list, add, edit/enable-disable, delete)
router.post('/currencies/seed', currencyController.seedCurrencies);
router.get('/currencies', currencyController.listAllCurrencies);
router.post('/currencies', currencyController.createCurrency);
router.patch('/currencies/:code', currencyController.updateCurrency);
router.delete('/currencies/:code', currencyController.deleteCurrency);

module.exports = router;
