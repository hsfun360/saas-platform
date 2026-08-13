const express = require('express');
const multer = require('multer');
const router = express.Router();

// In-memory upload (Cloud Run is stateless) for the platform logo, 1 MB cap.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 } });
const adminController = require('./admin.controller');
const countryController = require('./country.controller');
const languageController = require('./language.controller');
const currencyController = require('./currency.controller');
const classificationCodeController = require('./classificationCode.controller');
const msicCodeController = require('./msicCode.controller');
const emailTemplateController = require('../notification/emailTemplate.controller');
const taxController = require('../tax/tax.controller');
const platformProfileController = require('./platformProfile.controller');

const { verifyToken } = require('../../platform/auth.middleware');
const { isPlatformUser } = require('./rbac.middleware');
const { requireMenuAction, requireAnyMenuAction } = require('../../platform/serviceContext');
const { validate, fields, z } = require('../../platform/validate');

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

// --- Catalogue maintenance, split per Module.audience -----------------------
// Two separately-grantable screens maintain the catalogue: Tenant Modules &
// Menus (/admin/modules-menus) and Platform Modules & Menus
// (/admin/platform-menus). Authorization must follow the TARGET's audience,
// not the caller's URL, so a role granted only one side can never reach the
// other through the API. Each resolver derives the audience from the request;
// an unresolvable target falls back to the tenant screen's grant and the
// controller 404s right after.
const Module = require('./module.model');
const Menu = require('./menu.model');
const CATALOGUE_ROUTE = { tenant: '/admin/modules-menus', platform: '/admin/platform-menus' };

const requireCatalogueAction = (resolveAudience) => async (req, res, next) => {
    try {
        if (req.user?.isSystemAdmin) return next(); // master bypass, same as requireMenuAction
        const audience = (await resolveAudience(req)) === 'platform' ? 'platform' : 'tenant';
        return requireMenuAction(CATALOGUE_ROUTE[audience])(req, res, next);
    } catch (err) {
        console.error('Catalogue permission check failed:', err);
        return res.status(500).json({ message: 'Permission check failed.' });
    }
};
const audienceOfBody = async (req) => req.body?.audience;
const audienceOfModuleParam = async (req) =>
    (await Module.findByPk(req.params.moduleId, { attributes: ['audience'] }))?.audience;
const audienceOfBodyModule = async (req) =>
    req.body?.moduleId ? (await Module.findByPk(req.body.moduleId, { attributes: ['audience'] }))?.audience : null;
const audienceOfMenuParam = async (req) => {
    const menu = await Menu.findByPk(req.params.menuId, { attributes: ['moduleId'] });
    if (!menu) return null;
    return (await Module.findByPk(menu.moduleId, { attributes: ['audience'] }))?.audience;
};

// Role Management (the Roles screen; GET /roles also feeds Assign Role)
router.post('/roles', requireMenuAction('/admin/system-roles'), adminController.createRole);
router.get('/roles', requireAnyMenuAction(['/admin/system-roles', '/admin/system-setup']), adminController.getRoles);
router.get('/roles/:id', requireMenuAction('/admin/system-roles'), adminController.getRoleDetail);
router.put('/roles/:id', requireMenuAction('/admin/system-roles'), adminController.updateRole);
router.delete('/roles/:id', requireMenuAction('/admin/system-roles'), adminController.deleteRole);
// The role builder's permission catalogue (platform-audience menus only).
router.get('/menus', requireMenuAction('/admin/system-roles'), adminController.listMenus);
// Module list feeds the Subscribers entitlement picker AND both catalogue screens.
router.get('/modules', requireAnyMenuAction(['/admin/subscribers', '/admin/modules-menus', '/admin/platform-menus']), adminController.listModules);

// Modules & Menus Maintenance (master–detail catalogue management) - gated by
// the screen matching the TARGET's audience (see requireCatalogueAction above).
router.post('/modules', requireCatalogueAction(audienceOfBody), adminController.createModule);
router.put('/modules/:moduleId', requireCatalogueAction(audienceOfModuleParam), adminController.updateModule);
router.delete('/modules/:moduleId', requireCatalogueAction(audienceOfModuleParam), adminController.deleteModule);
router.get('/modules/:moduleId/menus', requireCatalogueAction(audienceOfModuleParam), adminController.listModuleMenus);
router.put('/modules/:moduleId/menus/order', requireCatalogueAction(audienceOfModuleParam), adminController.reorderMenus); // sibling drag-reorder
router.post('/menus', requireCatalogueAction(audienceOfBodyModule), adminController.createMenu);
router.put('/menus/:menuId', requireCatalogueAction(audienceOfMenuParam), adminController.updateMenu);
router.delete('/menus/:menuId', requireCatalogueAction(audienceOfMenuParam), adminController.deleteMenu);

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

// e-Invoice classification codes - Malaysia LHDN MyInvois reference maintenance
// (sync from LHDN's published JSON with bundled fallback, list, add, edit/enable-disable, delete)
const classificationCodeKey = z.string('Code is required.').trim()
    .regex(/^\d{3}$/, 'Code must be a 3-digit LHDN code (e.g. 022).');
router.use('/classification-codes', requireMenuAction('/admin/classification-codes'));
router.post('/classification-codes/sync', classificationCodeController.syncClassificationCodes);
router.get('/classification-codes', classificationCodeController.listAllClassificationCodes);
router.post('/classification-codes',
    validate({ body: z.object({ code: classificationCodeKey, description: fields.requiredText(500) }) }),
    classificationCodeController.createClassificationCode);
router.patch('/classification-codes/:code',
    validate({
        params: z.object({ code: classificationCodeKey }),
        body: z.object({ description: fields.optionalText(500), isActive: z.boolean().optional() }),
    }),
    classificationCodeController.updateClassificationCode);
router.delete('/classification-codes/:code',
    validate({ params: z.object({ code: classificationCodeKey }) }),
    classificationCodeController.deleteClassificationCode);

// e-Invoice MSIC codes - Malaysia LHDN MyInvois business nature/activity reference
// (sync from LHDN's published JSON with bundled fallback, list, add, edit/enable-disable, delete).
// LHDN codes are 5-digit today; the key deliberately allows up to 20 alphanumerics
// to match the column's headroom.
const msicCodeKey = z.string('Code is required.').trim()
    .regex(/^[0-9A-Za-z-]{1,20}$/, 'Code must be 1-20 letters/digits (LHDN MSIC codes are 5 digits, e.g. 01111).');
router.use('/msic-codes', requireMenuAction('/admin/msic-codes'));
router.post('/msic-codes/sync', msicCodeController.syncMsicCodes);
router.get('/msic-codes', msicCodeController.listAllMsicCodes);
router.post('/msic-codes',
    validate({ body: z.object({ code: msicCodeKey, description: fields.requiredText(500), categoryReference: fields.optionalText(20) }) }),
    msicCodeController.createMsicCode);
router.patch('/msic-codes/:code',
    validate({
        params: z.object({ code: msicCodeKey }),
        body: z.object({ description: fields.optionalText(500), categoryReference: fields.optionalText(20), isActive: z.boolean().optional() }),
    }),
    msicCodeController.updateMsicCode);
router.delete('/msic-codes/:code',
    validate({ params: z.object({ code: msicCodeKey }) }),
    msicCodeController.deleteMsicCode);

module.exports = router;
