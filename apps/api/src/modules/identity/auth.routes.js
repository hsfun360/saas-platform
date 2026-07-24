// src/routes/auth.routes.js

const router = require('express').Router();
const authController = require('./auth.controller'); // We will create this next
const User = require('./user.model'); // Use your existing Sequelize model
const jwt = require('jsonwebtoken');
const OutboxMessage = require('../../platform/outboxMessage.model');
const { sequelize } = require('../../platform/db');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { getPublicKey } = require('../../platform/jwt.keys');

// Add the import at the top (adjust path based on where you saved the function)
const { updateProfileWithOutbox } = require('./user.service');
const { enqueueEmail } = require('../notification/emailOutbox');

// Tenant-scoped user management (Tenant Admin manages users within their company)
const tenantController = require('../saas/tenant.controller');
const invitationController = require('../saas/invitation.controller');
const accountLanguageController = require('../saas/accountLanguage.controller');
const accountCurrencyController = require('../saas/accountCurrency.controller');
const accountEmailTemplateController = require('../saas/accountEmailTemplate.controller');
const industryTypeController = require('../saas/industryType.controller');
const salutationController = require('../saas/salutation.controller');
const nationalityController = require('../saas/nationality.controller');
const raceController = require('../saas/race.controller');
const titleController = require('../saas/title.controller');
const departmentController = require('../saas/department.controller');
const positionController = require('../saas/position.controller');
const publicHolidayController = require('../saas/publicHoliday.controller');
const weekendDayController = require('../saas/companyWeekendDay.controller');
const numberingSchemeController = require('../saas/numberingScheme.controller');
const userFavoriteController = require('../saas/userFavorite.controller');
const { hasTenantAdminRole } = require('../saas/tenant');

// Test Route to verify that the auth routes are working
// GET: /api/auth/debug-test
router.get('/debug-test', (req, res) => {
    res.json({ message: "Auth Routes are working!" });
});

// --- Middleware to verify the JWT (Must be defined here to work in this file) ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ message: "No token provided" });

    jwt.verify(token, getPublicKey(), { algorithms: ['RS256'] }, (err, user) => {
        if (err) return res.status(403).json({ message: "Invalid or expired token" });
        // An onboarding-scoped token (verified user, no workspace yet) is only
        // valid on the /onboarding/* endpoints below - never on the normal API.
        if (user.purpose === 'onboarding') {
            return res.status(403).json({ message: "Please finish creating your organization first." });
        }
        req.user = user;
        next();
    });
};

// Accepts ONLY the onboarding-scoped token minted by the login limbo outcome.
const authenticateOnboarding = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ message: "No token provided" });

    jwt.verify(token, getPublicKey(), { algorithms: ['RS256'] }, (err, user) => {
        if (err) return res.status(403).json({ message: "Invalid or expired token" });
        if (user.purpose !== 'onboarding') {
            return res.status(403).json({ message: "Onboarding is only available before your first workspace exists." });
        }
        req.user = user;
        next();
    });
};

// 1. Configure Multer to hold the file in memory and restrict it to 1MB
const upload = multer({
    storage: multer.memoryStorage(), // Do not save to disk! Keep in RAM for Cloud Run.
    limits: { 
        fileSize: 1 * 1024 * 1024 // 1 MB limit (in bytes)
    },
    fileFilter: (req, file, cb) => {
        // Only accept image files
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

// Route to register a new user
// POST: /api/auth/register
router.post('/register-user', authController.registerUser);

// Route to log in a user and receive a JWT
// POST: /api/auth/login
router.post('/login', authController.login);

// Route to request a password reset link
// POST: /api/auth/forgot-password
router.post('/forgot-password', authController.forgotPassword);

// Route to save the new password using the secure token
// POST: /api/auth/reset-password
router.post('/reset-password', authController.resetPassword);

// Add this right below your register and login routes
router.get('/verify/:token', authController.verifyEmail);

// JSON email verification, called by the frontend /verify-email page (the
// activation link in the email points at the FRONTEND, not this API host).
router.post('/verify-email', authController.verifyEmailJson);

// --- SELF-SERVICE ONBOARDING (verified user, no workspace yet) ---
// Guarded by the onboarding-scoped token; closed once the first workspace exists.
router.get('/onboarding/modules', authenticateOnboarding, authController.getOnboardingModules);
router.post('/onboarding/provision', authenticateOnboarding, authController.provisionOnboarding);

// 👇 Add your new registration route here
router.post('/register-lead', authController.registerLead);

// 👇 Add the new activation route
router.post('/activate', authController.activateAccount);

// Route to handle Google SSO
router.post('/google', authController.googleLogin);

// Exchange a Google authorization code (in-app redirect flow) for an access token.
router.post('/google/exchange', authController.googleExchangeCode);

// Route to handle Microsoft SSO
router.post('/microsoft-login', authController.microsoftLogin);

// --- Updated Profile Route with Transactional Outbox ---
router.put('/profile', authenticateToken, async (req, res) => {
    const { fullName, phone, bio, profilePicture } = req.body;
    
    // 1. Clean the email to remove invisible spaces and normalize casing
    const userEmail = req.user.email.trim().toLowerCase(); 

    // ADD THIS LOG:
    console.log(`[DEBUG] Attempting update for exact email: "${userEmail}"`);

    // 1. Start a Database Transaction
    const transaction = await sequelize.transaction();

    try {
        // 2. Find the user FIRST 
        const user = await User.findOne({ 
            where: { email: userEmail },
            transaction 
        });

        if (!user) {
            await transaction.rollback();
            console.log(`[DEBUG] User NOT FOUND in database!`);
            // We return 400 instead of 404 here so you know it's a Data error, not a Routing error
            return res.status(400).json({ message: "User not found in database." });
        }

        console.log(`[DEBUG] User found! Updating properties...`);

        // 3. Update the properties
        // ⚠️ IMPORTANT: If your user.model.js uses "fullName", change "full_name" to "fullName" below!
        user.full_name = fullName; 
        user.phone = phone;
        user.bio = bio;
        if (profilePicture) user.profilePicture = profilePicture; // Save the new image
        
        // Save the changes to the User table
        await user.save({ transaction });

        // 4. Queue the security-alert email (rendered from template) atomically.
        await enqueueEmail({ templateKey: 'profile.updated', to: userEmail, data: { email: userEmail } }, transaction);

        // 5. Commit (Applies both changes permanently)
        await transaction.commit();
        console.log(`[DEBUG] Profile and Outbox saved successfully!`);
        res.json({ message: "Profile updated and Outbox event queued successfully!" });

    } catch (err) {
        // 5. Rollback if anything fails
        await transaction.rollback();
        console.error("Transaction Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// --- GET PROFILE ROUTE ---
// Path: /api/auth/profile
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        // Find the user using the email from the JWT token
        const user = await User.findOne({ 
            where: { email: req.user.email },
            // Only fetch the columns we need to show on the frontend
            attributes: ['email', 'full_name', 'phone', 'bio', 'profilePicture', 'authMethod'] 
        });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Send the user data back to Angular (wrapped to match ProfileResponse: { message, user })
        res.json({ message: "Profile fetched successfully", user });

    } catch (err) {
        console.error("[DEBUG] Fetch Profile Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// 2. The New Profile Picture Upload Route
// Notice we inject 'upload.single('avatar')' with authenticateToken before the controller runs
router.post('/upload-avatar', authenticateToken, upload.single('avatar'), authController.uploadAvatar);

// Route to handle password changes (Requires user to be logged in!)
router.post('/change-password', authenticateToken, authController.changePassword);

// Guard for standard SaaS features (Requires a Company)
const requireTenant = (req, res, next) => {
    if (!req.user || !req.user.companyId) {
        return res.status(403).json({ message: "Access denied: Workspace required." });
    }
    next();
};

// Guard for your internal Master Control Panel (Requires Admin flag)
const requireSystemAdmin = (req, res, next) => {
    if (!req.user || !req.user.isSystemAdmin) {
        return res.status(403).json({ message: "Access denied: System Administrators only." });
    }
    next();
};

// Guard for tenant administration (must hold the Tenant Admin role for this company)
const requireTenantAdmin = async (req, res, next) => {
    try {
        const isAdmin = await hasTenantAdminRole(req.user?.id, req.user?.companyId);
        if (!isAdmin) {
            return res.status(403).json({ message: "Access denied: Tenant Administrators only." });
        }
        next();
    } catch (error) {
        console.error("Tenant Admin Auth Error:", error);
        res.status(500).json({ message: "Internal server error during authorization check." });
    }
};

// --- SECURE SAAS ROUTES ---
// Notice how we stack the middleware:
// 1. authenticateToken checks if they are logged in at all.
// 2. requireTenant checks if they actually belong to a Company workspace.
router.get('/company/menus', authenticateToken, requireTenant, requireTenantAdmin, authController.getAvailableMenus);
router.post('/company/roles', authenticateToken, requireTenant, requireTenantAdmin, authController.createRole);

// --- NUMBERING CONTROL (Tenant Admin, active company) ---
// Per-company document numbering (Membership No. now). Consumed by products via
// platform/numberingGateway.js. mode auto|manual drives auto-generate vs manual.
router.get('/company/numbering-schemes/meta', authenticateToken, requireTenant, requireTenantAdmin, numberingSchemeController.getMeta);
router.get('/company/numbering-schemes', authenticateToken, requireTenant, requireTenantAdmin, numberingSchemeController.listSchemes);
router.post('/company/numbering-schemes', authenticateToken, requireTenant, requireTenantAdmin, numberingSchemeController.createScheme);
router.post('/company/numbering-schemes/preview', authenticateToken, requireTenant, requireTenantAdmin, numberingSchemeController.previewScheme);
router.patch('/company/numbering-schemes/:id', authenticateToken, requireTenant, requireTenantAdmin, numberingSchemeController.updateScheme);

// --- TENANT USER MANAGEMENT (Tenant Admin only) ---
router.get('/company/roles', authenticateToken, requireTenant, requireTenantAdmin, tenantController.listTenantRoles);
router.get('/company/roles/:roleId', authenticateToken, requireTenant, requireTenantAdmin, tenantController.getTenantRole);
router.put('/company/roles/:roleId', authenticateToken, requireTenant, requireTenantAdmin, tenantController.updateTenantRole);
router.delete('/company/roles/:roleId', authenticateToken, requireTenant, requireTenantAdmin, tenantController.deleteTenantRole);
router.get('/company/users', authenticateToken, requireTenant, requireTenantAdmin, tenantController.listTenantUsers);
router.post('/company/users', authenticateToken, requireTenant, requireTenantAdmin, tenantController.createTenantUser);
router.patch('/company/users/:userId', authenticateToken, requireTenant, requireTenantAdmin, tenantController.updateTenantUserProfile);
router.post('/company/users/assign-role', authenticateToken, requireTenant, requireTenantAdmin, tenantController.assignTenantUserRole);
router.post('/company/users/revoke', authenticateToken, requireTenant, requireTenantAdmin, tenantController.revokeTenantUser);
// Account-wide, person-centric view for the redesigned User Management screen.
router.get('/account/users', authenticateToken, requireTenant, requireTenantAdmin, tenantController.listAccountUsers);

// --- ACCOUNT-LEVEL ROLES & MENU CATALOGUE (RBAC; a Role is a named set of menu
// permissions, not tied to a company). ---
router.get('/account/menus', authenticateToken, requireTenant, requireTenantAdmin, tenantController.listAccountMenus);
router.get('/account/roles', authenticateToken, requireTenant, requireTenantAdmin, tenantController.listAccountRoles);
router.get('/account/roles/:roleId', authenticateToken, requireTenant, requireTenantAdmin, tenantController.getAccountRole);
router.post('/account/roles', authenticateToken, requireTenant, requireTenantAdmin, tenantController.createAccountRole);
router.put('/account/roles/:roleId', authenticateToken, requireTenant, requireTenantAdmin, tenantController.updateAccountRole);
router.delete('/account/roles/:roleId', authenticateToken, requireTenant, requireTenantAdmin, tenantController.deleteAccountRole);

// --- SUBSCRIBER LANGUAGE SELECTION (Tenant Admin self-service) ---
// The subscriber's chosen language subset + default, from their own account.
router.get('/account/languages', authenticateToken, requireTenant, requireTenantAdmin, accountLanguageController.getAccountLanguages);
router.put('/account/languages', authenticateToken, requireTenant, requireTenantAdmin, accountLanguageController.updateAccountLanguages);

// --- PER-USER PREFERRED LANGUAGE (any authenticated user) ---
// The languages the user may pick from (their active account's set) + their pick.
router.get('/me/language', authenticateToken, accountLanguageController.getMyLanguage);
router.patch('/me/language', authenticateToken, accountLanguageController.setMyLanguage);

// --- SUBSCRIBER CURRENCY SELECTION (Tenant Admin self-service) ---
// The subscriber's chosen currency subset + default, from their own account. Also
// read by the Companies screen to populate a company's default-currency picker.
router.get('/account/currencies', authenticateToken, requireTenant, requireTenantAdmin, accountCurrencyController.getAccountCurrencies);
router.put('/account/currencies', authenticateToken, requireTenant, requireTenantAdmin, accountCurrencyController.updateAccountCurrencies);

// --- SUBSCRIBER INDUSTRY TYPES (Tenant Admin self-service) ---
// Subscriber-owned industry taxonomy, shared by every company in the account and
// consumed across products (Membership / Golf) via /api/industry-types.
router.get('/account/industry-types', authenticateToken, requireTenant, requireTenantAdmin, industryTypeController.listIndustryTypes);
router.post('/account/industry-types', authenticateToken, requireTenant, requireTenantAdmin, industryTypeController.createIndustryType);
router.patch('/account/industry-types/:id', authenticateToken, requireTenant, requireTenantAdmin, industryTypeController.updateIndustryType);

// --- SUBSCRIBER SALUTATIONS (Tenant Admin self-service) ---
// Subscriber-owned salutation list (Mr/Mrs/Datuk/...), shared by every company in
// the account and consumed across products via /api/salutations.
router.get('/account/salutations', authenticateToken, requireTenant, requireTenantAdmin, salutationController.listSalutations);
router.post('/account/salutations', authenticateToken, requireTenant, requireTenantAdmin, salutationController.createSalutation);
router.patch('/account/salutations/:id', authenticateToken, requireTenant, requireTenantAdmin, salutationController.updateSalutation);

// --- SUBSCRIBER NATIONALITIES (Tenant Admin self-service) ---
// Subscriber-owned nationality list, each entry optionally anchored to a platform
// Country (alpha-2); shared account-wide and consumed via /api/nationalities.
// --- My Dashboard favorites (self-service; any authenticated workspace user) ---
router.get('/my/favorites', authenticateToken, userFavoriteController.listMyFavorites);
router.put('/my/favorites', authenticateToken, userFavoriteController.replaceMyFavorites);

router.get('/account/nationalities', authenticateToken, requireTenant, requireTenantAdmin, nationalityController.listNationalities);
router.post('/account/nationalities', authenticateToken, requireTenant, requireTenantAdmin, nationalityController.createNationality);
router.patch('/account/nationalities/:id', authenticateToken, requireTenant, requireTenantAdmin, nationalityController.updateNationality);

// --- SUBSCRIBER RACES (Tenant Admin self-service) ---
// Subscriber-owned race/ethnicity list, shared account-wide and consumed across
// products via /api/races. Pure demographic vocabulary - linked to nothing else.
router.get('/account/races', authenticateToken, requireTenant, requireTenantAdmin, raceController.listRaces);
router.post('/account/races', authenticateToken, requireTenant, requireTenantAdmin, raceController.createRace);
router.patch('/account/races/:id', authenticateToken, requireTenant, requireTenantAdmin, raceController.updateRace);

// --- SUBSCRIBER TITLES / HONORIFICS (Tenant Admin self-service) ---
// Subscriber-owned honorific list (Datuk/Tan Sri/Sir/...), each optionally
// country-bound (Country.alpha2; NULL = universal). Consumed via /api/titles.
router.get('/account/titles', authenticateToken, requireTenant, requireTenantAdmin, titleController.listTitles);
router.post('/account/titles', authenticateToken, requireTenant, requireTenantAdmin, titleController.createTitle);
router.patch('/account/titles/:id', authenticateToken, requireTenant, requireTenantAdmin, titleController.updateTitle);

// --- SUBSCRIBER DEPARTMENTS (Tenant Admin self-service) ---
// Subscriber-owned department list, shared account-wide, assigned to users per
// company (CompanyUser.departmentId) and consumed via /api/departments.
// Feeds the RBAC data-scope rule (Phase 3).
router.get('/account/departments', authenticateToken, requireTenant, requireTenantAdmin, departmentController.listDepartments);
router.post('/account/departments', authenticateToken, requireTenant, requireTenantAdmin, departmentController.createDepartment);
router.patch('/account/departments/:id', authenticateToken, requireTenant, requireTenantAdmin, departmentController.updateDepartment);

// --- SUBSCRIBER POSITIONS (Tenant Admin self-service) ---
// Subscriber-owned position ladder with a seniority `rank` (higher = more
// senior; drives the Phase-3 "senior may amend subordinate's record" rule).
// Assigned per company (CompanyUser.positionId), consumed via /api/positions.
router.get('/account/positions/defaults', authenticateToken, requireTenant, requireTenantAdmin, positionController.getDefaultPositions);
router.post('/account/positions/seed', authenticateToken, requireTenant, requireTenantAdmin, positionController.seedPositions);
router.get('/account/positions', authenticateToken, requireTenant, requireTenantAdmin, positionController.listPositions);
router.post('/account/positions', authenticateToken, requireTenant, requireTenantAdmin, positionController.createPosition);
router.patch('/account/positions/:id', authenticateToken, requireTenant, requireTenantAdmin, positionController.updatePosition);

// --- SUBSCRIBER PUBLIC HOLIDAYS (Tenant Admin self-service) ---
// Subscriber-owned holiday calendar, scoped by country (the countries the
// account's companies operate in); consumed via /api/public-holidays.
router.get('/account/public-holidays/countries', authenticateToken, requireTenant, requireTenantAdmin, publicHolidayController.listHolidayCountries);
router.get('/account/public-holidays', authenticateToken, requireTenant, requireTenantAdmin, publicHolidayController.listPublicHolidays);
router.post('/account/public-holidays', authenticateToken, requireTenant, requireTenantAdmin, publicHolidayController.createPublicHoliday);
router.patch('/account/public-holidays/:id', authenticateToken, requireTenant, requireTenantAdmin, publicHolidayController.updatePublicHoliday);

// --- SUBSCRIBER EMAIL TEMPLATES (Tenant Admin self-service) ---
// A subscriber's own versions of the platform templates flagged tenant-overridable.
router.get('/account/email-templates', authenticateToken, requireTenant, requireTenantAdmin, accountEmailTemplateController.listOverridable);
router.get('/account/email-templates/:key', authenticateToken, requireTenant, requireTenantAdmin, accountEmailTemplateController.getForAccount);
router.put('/account/email-templates/:key', authenticateToken, requireTenant, requireTenantAdmin, accountEmailTemplateController.upsertOverride);
router.delete('/account/email-templates/:key', authenticateToken, requireTenant, requireTenantAdmin, accountEmailTemplateController.removeOverride);
router.post('/account/email-templates/:key/preview', authenticateToken, requireTenant, requireTenantAdmin, accountEmailTemplateController.previewOverride);
router.post('/account/email-templates/:key/test', authenticateToken, requireTenant, requireTenantAdmin, accountEmailTemplateController.sendTest);

// Add an EXISTING same-account user as a collaborator on the caller's company.
router.post('/company/collaborators', authenticateToken, requireTenant, requireTenantAdmin, tenantController.addCollaborator);

// --- COLLABORATOR INVITATIONS (consent-based cross-tenant bridge) ---
// Admin side (Tenant Admin within their company):
router.post('/company/invitations', authenticateToken, requireTenant, requireTenantAdmin, invitationController.createInvitation);
router.get('/company/invitations', authenticateToken, requireTenant, requireTenantAdmin, invitationController.listCompanyInvitations);
router.post('/company/invitations/:id/revoke', authenticateToken, requireTenant, requireTenantAdmin, invitationController.revokeInvitation);
// Invitee side (any logged-in user, matched by their own email):
router.get('/invitations', authenticateToken, invitationController.listMyInvitations);
router.post('/invitations/:id/accept', authenticateToken, invitationController.acceptInvitation);
router.post('/invitations/:id/decline', authenticateToken, invitationController.declineInvitation);

// --- WORKSPACE SWITCHING (any logged-in collaborator) ---
// List the companies the user can access, and switch the active workspace
// (re-issues a JWT scoped to the chosen company) without re-login.
router.get('/workspaces', authenticateToken, authController.listWorkspaces);
router.post('/switch-workspace', authenticateToken, authController.switchWorkspace);

// --- COMPANY (BUSINESS ENTITY) MANAGEMENT (Tenant Admin only) ---
// A subscriber's Tenant Admin can create additional companies under their account
// and choose which modules each company needs.
router.get('/company/available-modules', authenticateToken, requireTenant, requireTenantAdmin, tenantController.listAvailableModules);
router.get('/companies', authenticateToken, requireTenant, requireTenantAdmin, tenantController.listCompanies);
router.post('/companies', authenticateToken, requireTenant, requireTenantAdmin, tenantController.createCompany);
router.post('/company/logo', authenticateToken, requireTenant, requireTenantAdmin, upload.single('logo'), authController.uploadCompanyLogo);
router.put('/companies/:companyId/modules', authenticateToken, requireTenant, requireTenantAdmin, tenantController.updateCompanyModules);
// Per-company outgoing SMTP (the specific /smtp/test route is before /:companyId catch-alls).
router.get('/companies/:companyId/smtp', authenticateToken, requireTenant, requireTenantAdmin, tenantController.getCompanySmtp);
router.put('/companies/:companyId/smtp', authenticateToken, requireTenant, requireTenantAdmin, tenantController.upsertCompanySmtp);
router.delete('/companies/:companyId/smtp', authenticateToken, requireTenant, requireTenantAdmin, tenantController.deleteCompanySmtp);
router.post('/companies/:companyId/smtp/test', authenticateToken, requireTenant, requireTenantAdmin, tenantController.testCompanySmtp);
// Per-company weekend/rest-day setup (drives weekday/weekend pricing, e.g. golf
// green fees); consumed via /api/weekend-days. Like SMTP, the controller
// re-checks admin rights against the TARGET company, not just the active one.
router.get('/companies/:companyId/weekend-days', authenticateToken, requireTenant, requireTenantAdmin, weekendDayController.getCompanyWeekendDays);
router.put('/companies/:companyId/weekend-days', authenticateToken, requireTenant, requireTenantAdmin, weekendDayController.setCompanyWeekendDays);
router.put('/companies/:companyId', authenticateToken, requireTenant, requireTenantAdmin, tenantController.updateCompany);

module.exports = router;
