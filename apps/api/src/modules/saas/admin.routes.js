const express = require('express');
const multer = require('multer');
const router = express.Router();

// In-memory upload (Cloud Run is stateless) for the platform logo, 1 MB cap.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 } });
const adminController = require('./admin.controller');
const countryController = require('./country.controller');
const languageController = require('./language.controller');
const currencyController = require('./currency.controller');
const emailTemplateController = require('../notification/emailTemplate.controller');
const taxController = require('../tax/tax.controller');
const platformProfileController = require('./platformProfile.controller');

const { verifyToken } = require('../../platform/auth.middleware');
const { isPlatformUser } = require('./rbac.middleware');
const { requireMenuAction, requireAnyMenuAction } = require('../../platform/serviceContext');

// Authorization is two layers, mirroring the tenant side:
//   1. isPlatformUser - the caller holds an ACTIVE system-level membership
//      (CompanyUser with companyId NULL), whatever platform role.
//   2. requireMenuAction('<screen route>') per route - the caller's platform
//      role must be granted that SaaS Administration menu, with the action
//      implied by the HTTP method (view/create/edit/delete).
// The master "System Admin" role bypasses layer 2 via the JWT isSystemAdmin
// claim (implicit full access, like Tenant Admin on the tenant side).
router.use(verifyToken);
router.use(isPlatformUser);

// Flags tax handlers to operate on the PLATFORM-owned catalog (accountId NULL)
// instead of a subscriber account. Applied only to the /admin/tax routes below.
const asPlatformTax = (req, res, next) => { req.taxPlatform = true; next(); };

// Role Management (the Roles screen; GET /roles also feeds Assign Role)
router.post('/roles', requireMenuAction('/admin/system-roles'), adminController.createRole);
router.get('/roles', requireAnyMenuAction(['/admin/system-roles', '/admin/system-setup']), adminController.getRoles);
router.get('/roles/:id', requireMenuAction('/admin/system-roles'), adminController.getRoleDetail);
router.put('/roles/:id', requireMenuAction('/admin/system-roles'), adminController.updateRole);
router.delete('/roles/:id', requireMenuAction('/admin/system-roles'), adminController.deleteRole);
// The role builder's permission catalogue (platform-audience menus only).
router.get('/menus', requireMenuAction('/admin/system-roles'), adminController.listMenus);
// Module list feeds the Subscribers entitlement picker AND Modules & Menus.
router.get('/modules', requireAnyMenuAction(['/admin/subscribers', '/admin/modules-menus']), adminController.listModules);

// Modules & Menus Maintenance (master–detail catalogue management)
router.post('/modules', requireMenuAction('/admin/modules-menus'), adminController.createModule);
router.put('/modules/:moduleId', requireMenuAction('/admin/modules-menus'), adminController.updateModule);
router.delete('/modules/:moduleId', requireMenuAction('/admin/modules-menus'), adminController.deleteModule);
router.get('/modules/:moduleId/menus', requireMenuAction('/admin/modules-menus'), adminController.listModuleMenus);
router.put('/modules/:moduleId/menus/order', requireMenuAction('/admin/modules-menus'), adminController.reorderMenus); // sibling drag-reorder
router.post('/menus', requireMenuAction('/admin/modules-menus'), adminController.createMenu);
router.put('/menus/:menuId', requireMenuAction('/admin/modules-menus'), adminController.updateMenu);
router.delete('/menus/:menuId', requireMenuAction('/admin/modules-menus'), adminController.deleteMenu);

// User Management (list also feeds Assign Role)
router.get('/users', requireAnyMenuAction(['/admin/platform-users', '/admin/system-setup']), adminController.listUsers);
router.post('/users', requireMenuAction('/admin/platform-users'), adminController.createUser);
router.post('/users/assign-role', requireMenuAction('/admin/system-setup'), adminController.assignUserToRole);
// MFA recovery for a locked-out user (incl. Tenant Admins, whom no tenant-side
// admin can reset) - the platform-side arm of the recovery exception.
router.post('/users/:userId/mfa/reset', requireAnyMenuAction(['/admin/platform-users', '/admin/subscribers']), adminController.resetUserMfa);
// Read-only audit-trail viewer.
router.get('/audit-log', requireMenuAction('/admin/audit-log'), adminController.listAuditLog);
// Unverified-registrations cleanup utility (manual review page).
router.get('/unverified-users', requireMenuAction('/admin/unverified-users'), adminController.listUnverifiedUsers);
router.post('/unverified-users/delete', requireMenuAction('/admin/unverified-users'), adminController.deleteUnverifiedUsers);
router.patch('/users/:id/status', requireMenuAction('/admin/platform-users'), adminController.setUserStatus);
router.patch('/users/:id', requireMenuAction('/admin/platform-users'), adminController.updateUser);

// Subscription / Subscriber Management (System Admin Portal)
router.post('/subscriptions', requireMenuAction('/admin/subscribers'), adminController.createSubscription);
router.get('/subscriptions', requireMenuAction('/admin/subscribers'), adminController.listSubscriptions);
router.patch('/subscriptions/:id', requireMenuAction('/admin/subscribers'), adminController.updateSubscription);
// NOTE (role separation, 2026-07-14): the platform deliberately has NO endpoints
// to edit a subscriber's language/currency selection. Those are tenant
// self-service only (/auth/account/languages, /auth/account/currencies) - the
// control plane manages the contract, never tenant preference data. The one
// sanctioned exception is Tenant Admin recovery (assign-role below).

// Platform email templates (edit defaults, preview, reset, send test)
router.use('/email-templates', requireMenuAction('/admin/email-templates'));
router.get('/email-templates', emailTemplateController.listPlatformTemplates);
router.get('/email-templates/:key', emailTemplateController.getPlatformTemplate);
router.put('/email-templates/:key', emailTemplateController.updatePlatformTemplate);
router.post('/email-templates/:key/reset', emailTemplateController.resetPlatformTemplate);
router.post('/email-templates/:key/preview', emailTemplateController.previewTemplate);
router.post('/email-templates/:key/test', emailTemplateController.sendTestEmail);

// Platform tax schemes (accountId NULL) - the platform's own catalog, e.g. tax on
// Subscription Fee. Reuses the tax controller under platform scope. `/tax/quote`
// computes tax on an amount for testing before the billing entity exists.
router.use('/tax', requireMenuAction('/admin/platform-tax'));
router.get('/tax/meta', taxController.getMeta);
router.get('/tax/schemes', asPlatformTax, taxController.listSchemes);
router.post('/tax/schemes', asPlatformTax, taxController.createScheme);
router.patch('/tax/schemes/:id', asPlatformTax, taxController.updateScheme);
router.post('/tax/schemes/:id/rates', asPlatformTax, taxController.addRate);
router.patch('/tax/rates/:id', asPlatformTax, taxController.updateRate);
router.delete('/tax/rates/:id', asPlatformTax, taxController.deleteRate);
router.post('/tax/quote', asPlatformTax, taxController.platformQuote);

// Platform Profile (singleton) - the platform's own "company of record": invoice-issuer
// identity + the billing country/scheme that anchors the platform's own tax. `/quote`
// computes a charge's tax via the profile (proves MY charges resolve MY schemes).
router.use('/platform-profile', requireMenuAction('/admin/platform-profile'));
router.get('/platform-profile', platformProfileController.getProfile);
router.put('/platform-profile', platformProfileController.updateProfile);
router.post('/platform-profile/logo', upload.single('logo'), platformProfileController.uploadLogo);
router.post('/platform-profile/quote', platformProfileController.quoteCharge);

// Tenant Admin management (platform override for a specific company - part of
// the Subscriber Management screen)
router.get('/companies/:companyId/users', requireMenuAction('/admin/subscribers'), adminController.listCompanyUsers);
router.post('/companies/:companyId/tenant-admin', requireMenuAction('/admin/subscribers'), adminController.setTenantAdmin);

// Country reference maintenance (sync from world_countries, list, enable/disable)
router.use('/countries', requireMenuAction('/admin/countries'));
router.post('/countries/sync', countryController.syncCountries);
router.get('/countries', countryController.listAllCountries);
router.patch('/countries/:alpha2', countryController.updateCountry);

// Language reference maintenance (seed defaults, list, add, edit/enable-disable, delete)
router.use('/languages', requireMenuAction('/admin/languages'));
router.post('/languages/seed', languageController.seedLanguages);
router.get('/languages', languageController.listAllLanguages);
router.post('/languages', languageController.createLanguage);
router.patch('/languages/:languageCode', languageController.updateLanguage);
router.delete('/languages/:languageCode', languageController.deleteLanguage);

// Currency reference maintenance (seed ISO 4217 defaults, list, add, edit/enable-disable, delete)
router.use('/currencies', requireMenuAction('/admin/currencies'));
router.post('/currencies/seed', currencyController.seedCurrencies);
router.get('/currencies', currencyController.listAllCurrencies);
router.post('/currencies', currencyController.createCurrency);
router.patch('/currencies/:code', currencyController.updateCurrency);
router.delete('/currencies/:code', currencyController.deleteCurrency);

module.exports = router;
