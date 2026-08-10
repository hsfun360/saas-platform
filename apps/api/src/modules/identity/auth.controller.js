// src/controllers/auth.controller.js
const User = require('./user.model'); // <--- ADD THIS LINE
const OutboxMessage = require('../../platform/outboxMessage.model');
const { enqueueEmail } = require('../notification/emailOutbox');
const { resolveIdentityScope } = require('../../platform/identityScope');
const RegistrationLead = require('../saas/registrationLead.model');

// Base URL for links in outgoing emails (reset, etc.). Falls back to local dev.
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'http://localhost:4200';
const Account = require('../saas/account.model');
const Company = require('../saas/company.model');
const CompanyUser = require('../saas/companyUser.model');
const Role = require('../saas/role.model');
const Menu = require('../saas/menu.model');

const Module = require('../saas/module.model');
const CompanyModule = require('../saas/companyModule.model');
const RoleMenu = require('../saas/roleMenu.model');
const { isUserSystemAdmin } = require('../saas/systemAdmin');
const { getOwnedAccountIds, isAccountAdminForCompany } = require('../saas/account');
const { hasTenantAdminRole } = require('../saas/tenant');
const { provisionTenant, listEntitlableModules } = require('../saas/provisioning.service');
const { isPasswordBreached, BREACHED_PASSWORD_MESSAGE } = require('../../platform/passwordBreach');
const { isDisposableEmail, DISPOSABLE_EMAIL_MESSAGE } = require('../../platform/disposableEmail');

const crypto = require('crypto'); // Built into Node.js, no npm install needed

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');

const { getPrivateKey, getPublicKey } = require('../../platform/jwt.keys');
const { sequelize } = require('../../platform/db');
const { v4: uuidv4 } = require('uuid');
const { Storage } = require('@google-cloud/storage');

const axios = require('axios'); // 👈 ADD THIS LINE for Google 
// Add geoip-lite at the very top of your file with your other imports
const geoip = require('geoip-lite');

// --- DUMMY USER DATA (REPLACE WITH REAL DB LOGIC LATER) ---
const users = []; 
// Function to find user (will be DB query in a real app)
const findUserByEmail = (email) => users.find(u => u.email === email);
// --- DUMMY USER DATA END ---

// ACCESS tokens are deliberately SHORT (1h): staying signed in is the refresh
// cookie's job (session.service.js - 24h normally, 30d with "Keep me signed
// in"), which is server-side and revocable. rememberMe rides in the claim only
// so re-issues (switch-workspace, refresh) know which horizon the user chose.
const generateToken = (userId, email, companyId=null, companyName=null, isSystemAdmin=false, rememberMe=false) => {
    // We now include BOTH id and email in the payload
    return jwt.sign(
        {
            id: userId,
            email: email,
            companyId: companyId,
            companyName: companyName,
            isSystemAdmin: isSystemAdmin,
            rememberMe: !!rememberMe
         },
         getPrivateKey(),
         {
            algorithm: 'RS256',
            expiresIn: '1h',
         }
    );
};

// Capped exponential backoff for consecutive FAILED local-login attempts
// (index = failures so far). The first three attempts are free (humans typo),
// then delays grow to a 15-minute ceiling - never a permanent lockout, which
// would hand attackers a denial-of-service lever against legitimate users.
const FAILED_LOGIN_DELAYS_SECONDS = [0, 0, 0, 1, 5, 30, 60, 300, 900];
const failedLoginDelaySeconds = (count) =>
    FAILED_LOGIN_DELAYS_SECONDS[Math.min(count, FAILED_LOGIN_DELAYS_SECONDS.length - 1)];

// One-time email tokens (password reset, address verification) are stored as
// SHA-256 HASHES: the raw value exists only in the email link, so a DB
// snapshot/backup leak cannot be replayed into working reset links. Redemption
// hashes the presented value and looks the hash up.
const hashToken = (raw) => crypto.createHash('sha256').update(String(raw)).digest('hex');

// Reset links live 30 minutes (OWASP range); the anti-flood cooldown re-derives
// "recently issued" from the expiry, so the two constants travel together.
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const RESET_COOLDOWN_MS = 5 * 60 * 1000;


// Limbo state: a VERIFIED user with zero CompanyUser rows is not an error but a
// pending onboarding. This token proves who they are while carrying no workspace;
// it is accepted ONLY by the /api/auth/onboarding/* endpoints (authenticateToken
// and platform/auth.middleware.js both reject purpose 'onboarding'), so it can
// never enter the app shell or any data API.
const generateOnboardingToken = (userId, email) => {
    return jwt.sign(
        { id: userId, email, purpose: 'onboarding' },
        getPrivateKey(),
        { algorithm: 'RS256', expiresIn: '1h' },
    );
};

// The shared 200 payload for the limbo outcome. `onboarding: true` is what the
// frontend branches on (route to the Create-your-organization wizard).
const buildOnboardingResponse = (user) => ({
    message: 'No workspace yet - continue to onboarding.',
    onboarding: true,
    token: generateOnboardingToken(user.id, user.email),
    email: user.email,
    fullName: user.full_name || null,
    profilePicture: user.profilePicture || null,
});

// ---------------------------------------------------------------------------
// MFA step-up + refresh sessions (design approved 2026-07-27)
// ---------------------------------------------------------------------------
const mfa = require('./mfa.service');
const sessions = require('./session.service');
const trustedDevices = require('./trustedDevice.service');

// Short-lived, purpose-scoped token that carries the login context ACROSS the
// MFA step ('mfa' = enter your code; 'mfa-enroll' = admin role must enroll
// first). Rejected everywhere else, like the onboarding token.
const generateMfaToken = (user, purpose, ctx) => jwt.sign(
    {
        id: user.id,
        email: user.email,
        purpose,
        companyId: ctx.companyId ?? null,
        companyName: ctx.companyName ?? null,
        isSystemAdmin: !!ctx.isSystemAdmin,
        rememberMe: !!ctx.rememberMe,
    },
    getPrivateKey(),
    { algorithm: 'RS256', expiresIn: '10m' },
);

// The ONE place a real session is granted. Applies the MFA gates, and on pass
// mints the 1h access token + the refresh cookie, returning the login payload.
//   - user has MFA on and this call isn't post-verification -> mfa challenge
//   - admin role (System Admin / Tenant Admin) without MFA -> forced enrollment
//     (skipped when MFA_ENCRYPTION_KEY isn't configured, so a missing key can
//     never lock every admin out)
async function completeLogin(req, res, user, context, { isSystemAdmin = false, rememberMe = false, mfaVerified = false, skipMfaGates = false } = {}) {
    const ctx = { companyId: context.companyId ?? null, companyName: context.companyName ?? null, isSystemAdmin, rememberMe };

    if (!skipMfaGates && mfa.isMfaConfigured()) {
        // A live trusted-device cookie ("don't ask again on this device")
        // stands in for the code - the password/SSO step above already ran.
        if (user.mfaEnabled && !mfaVerified && !(await trustedDevices.hasValidTrust(req, user.id))) {
            return {
                message: 'Enter the 6-digit code from your authenticator app.',
                mfaRequired: true,
                mfaToken: generateMfaToken(user, 'mfa', ctx),
                email: user.email,
            };
        }
        if (!user.mfaEnabled && (isSystemAdmin || context.roleName === 'Tenant Admin')) {
            return {
                message: 'Administrator accounts require two-factor authentication. Please set it up to continue.',
                mfaEnrollRequired: true,
                mfaToken: generateMfaToken(user, 'mfa-enroll', ctx),
                email: user.email,
            };
        }
    }

    const token = generateToken(user.id, user.email, ctx.companyId, ctx.companyName, isSystemAdmin, rememberMe);
    await sessions.issueSession(res, { userId: user.id, companyId: ctx.companyId, rememberMe, req });
    await rememberLastWorkspace(user.id, ctx.companyId);

    return {
        token,
        email: user.email,
        fullName: user.full_name || 'User',
        profilePicture: user.profilePicture || null,
        menus: context.menus || [],
        roleName: context.roleName || 'User',
        companyName: ctx.companyName,
    };
}

const storage = new Storage(); // Use default credentials when on Cloud Run
// Public image uploads (user avatars, company logos) go to the per-environment
// bucket named by ASSETS_BUCKET (12-factor: config from env, never hardcoded -
// the old hardcoded avatars bucket died with the old GCP project). Resolved
// lazily so a missing var fails the one upload request with a clear message
// instead of crashing the whole API at boot.
function assetsBucket() {
    const name = process.env.ASSETS_BUCKET;
    if (!name) throw new Error('ASSETS_BUCKET env var is not set - cannot store uploads.');
    return storage.bucket(name);
}

// ----------------------------------------------------
// A. Register New User (Local Strategy)
// ----------------------------------------------------
exports.registerUser = async (req, res) => {
    const { email, password } = req.body;

    // Password floor unified app-wide at 8 characters (NIST minimum; matches
    // the lead-activation setup-password screen).
    if (!email || !password || String(password).length < 8) {
        return res.status(400).json({ message: 'A valid email and a password of at least 8 characters are required.' });
    }

    // Low-effort bot signups: refuse disposable/temporary email providers
    // (bundled blocklist, no network call).
    if (isDisposableEmail(email)) {
        return res.status(400).json({ message: DISPOSABLE_EMAIL_MESSAGE });
    }

    // Block passwords known from public breaches (HIBP k-anonymity; fail-open).
    if (await isPasswordBreached(password)) {
        return res.status(400).json({ message: BREACHED_PASSWORD_MESSAGE });
    }

    // 1. Start Transaction
    const transaction = await sequelize.transaction();

    try {
        // 2. Check if user already exists
        let user = await User.findOne({ where: { email } });
        if (user) {
            await transaction.rollback();
            return res.status(400).json({ message: 'User already exists.' });
        }

        // 3. Hash the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 4. Generate a random, secure token (e.g., 'a1b2c3d4...'); only its
        // HASH is stored (the raw value exists solely inside the emailed link).
        const verificationToken = crypto.randomBytes(32).toString('hex');

        // 5. Create the user as Unverified
        user = await User.create({
            email,
            password: hashedPassword,
            authMethod: 'local',
            isVerified: false,
            verificationToken: hashToken(verificationToken)
        }, { transaction });

        // 6. Create the Activation Link. It points at the FRONTEND (like every
        // other email link - reset, setup-password, portal invites), which then
        // calls POST /api/auth/verify-email. Never link the raw API host in an
        // email: it reads as a phishing pattern and got the API domain flagged
        // by Chrome Safe Browsing ("Dangerous site").
        const activationLink = `${FRONTEND_BASE_URL}/verify-email?token=${verificationToken}`;
        console.log(`[AUTH CONTROLLER] Activation link for ${email}: ${activationLink}`);

        // 7. Queue the Outbox Message
        // Render the activation email from its template and queue it atomically.
        await enqueueEmail({ templateKey: 'user.activation', to: email, data: { email, activationLink } }, transaction);

        // 8. Commit the transaction safely!
        await transaction.commit();

        // 9. Generate Token for immediate login
        const token = generateToken(user.id, user.email); // Pass email to token generator for better debugging and potential future use

        // 5. IMPORTANT: Tell Sequelize to create the table if it hasn't yet
        //await User.sync();

        // Notice we do NOT send a JWT token back anymore!
        res.status(201).json({ 
            //token, 
            message: 'Registration successful! Please check your email to activate your account.'
        });

    } catch (error) {
        await transaction.rollback();
        console.error("Registration Error:", error);
        res.status(500).json({ message: 'Server error during registration.' });
    }
};

// ----------------------------------------------------
// B. Login User (Local Strategy)
// ----------------------------------------------------
// --- LOGIN ROUTE ---
// --- STANDARD EMAIL/PASSWORD LOGIN ---
exports.login = async (req, res) => {
    try {
        // 1. Extract credentials, optional workspace selection, and the
        // "Keep me signed in" choice (24h session vs 7d, see generateToken).
        const { email, password, selectedCompanyId } = req.body;
        const rememberMe = req.body.rememberMe === true;

        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        // 🌟 PRO-TIP: Automatically remove accidental spaces and lowercase the email
        const cleanEmail = email.trim().toLowerCase();

        // 2. Find the user
        const user = await User.findOne({ where: { email: cleanEmail } });
        if (!user) {
            return res.status(401).json({ message: "Invalid email or password." });
        }

        // 🛡️ SAFETY CHECK: SSO accounts can't password-login. Google/Microsoft users
        // are given a random dummy password at signup (so `user.password` is set, not
        // null) and the app forbids them from ever setting a local one - so gate on
        // authMethod, not on password presence.
        if (user.authMethod === 'google') {
            return res.status(400).json({ message: "Please use 'Log in with Google' for this account." });
        }
        if (user.authMethod === 'microsoft') {
            return res.status(400).json({ message: "Please use 'Log in with Microsoft' for this account." });
        }
        // Fallback: any other passwordless account.
        if (!user.password) {
            return res.status(400).json({ message: "Please use social login for this account." });
        }

        // Capped exponential backoff (see failedLoginDelaySeconds): after a few
        // consecutive failures the account must cool down before the NEXT
        // attempt is even checked. Runs before bcrypt so throttled attempts
        // cost us nothing. Never a permanent lockout.
        const requiredDelayMs = failedLoginDelaySeconds(user.failedLoginCount || 0) * 1000;
        if (requiredDelayMs > 0 && user.lastFailedLoginAt) {
            const waitMs = new Date(user.lastFailedLoginAt).getTime() + requiredDelayMs - Date.now();
            if (waitMs > 0) {
                return res.status(429).json({
                    message: `Too many failed attempts. Please try again in ${Math.ceil(waitMs / 1000)} second(s).`,
                });
            }
        }

        // 3. Verify Password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            // Count the failure (DB-backed so it holds across instances); the
            // error message stays generic - no hint which half was wrong.
            await user.update({
                failedLoginCount: (user.failedLoginCount || 0) + 1,
                lastFailedLoginAt: new Date(),
            });
            return res.status(401).json({ message: "Invalid email or password." });
        }

        // Success clears the backoff counter.
        if (user.failedLoginCount) {
            await user.update({ failedLoginCount: 0, lastFailedLoginAt: null });
        }

        // --- MASTER RBAC LOGIN LOGIC ---
        
        // Check if they are a Master Admin
        // DB-backed system-admin check (System Admin role), with ADMIN_EMAILS break-glass.
        const isSystemAdmin = await isUserSystemAdmin(user.id, user.email);

        // Load ALL memberships (active + inactive) so a DEACTIVATED account (has
        // memberships, but every one is inactive) is told apart from one that
        // simply has no workspace. This branch is only reachable after the password
        // check, so the "deactivated" hint never leaks to an anonymous caller.
        const allMemberships = await CompanyUser.findAll({ where: { userId: user.id } });
        if (allMemberships.length > 0 && !allMemberships.some(m => m.isActive)) {
            return res.status(403).json({ message: "Your account has been deactivated. Please contact your administrator." });
        }

        // Active memberships only (a deactivated one can no longer be entered).
        let workspaces = allMemberships.filter(m => m.isActive);

        // LIMBO: a verified user with NO membership rows at all is not an error -
        // they are a self-registered user who has not created (or joined) an
        // organization yet. Hand them an onboarding-scoped token so the frontend
        // can run the Create-your-organization wizard. Unverified users still
        // must complete email activation first.
        if (allMemberships.length === 0) {
            if (!user.isVerified) {
                return res.status(403).json({ message: "Please verify your email first - check your inbox for the activation link." });
            }
            return res.status(200).json(buildOnboardingResponse(user));
        }

        // If they clicked a workspace on the UI, filter the array
        if (selectedCompanyId) {
            const targetId = selectedCompanyId === 'SYSTEM' ? null : selectedCompanyId;
            workspaces = workspaces.filter(ws => ws.companyId === targetId);
        }

        // SCENARIO A: NO WORKSPACE (memberships exist, but none match the
        // selection / none survive the active filter).
        if (workspaces.length === 0) {
            return res.status(403).json({ message: "Account has no associated workspaces." });
        }

        // SCENARIO B: MULTIPLE WORKSPACES (They need to choose!)
        if (workspaces.length > 1) {
            // First, try to skip the picker by resuming the last-used workspace.
            if (!selectedCompanyId) {
                const resumeCtx = await buildResumeContext(user, workspaces);
                if (resumeCtx) {
                    const out = await completeLogin(req, res, user, resumeCtx, { isSystemAdmin, rememberMe });
                    return res.status(200).json({ message: "Login successful", ...out });
                }
            }

            const availableClubs = [];
            for (let ws of workspaces) {
                if (ws.companyId === null) {
                    availableClubs.push({ companyId: 'SYSTEM', companyName: '🛡️ System Administration' });
                } else {
                    const comp = await Company.findByPk(ws.companyId);
                    if (comp) availableClubs.push({ companyId: comp.id, companyName: comp.name });
                }
            }
            return res.status(206).json({
                message: "Multiple workspaces found. Please select one.",
                clubs: availableClubs
            });
        }

        // SCENARIO C: EXACTLY ONE WORKSPACE
        const workspace = workspaces[0];
        const context = await resolveWorkspaceContext(user.id, workspace.companyId);
        if (!context) {
            return res.status(403).json({ message: "Account has no associated workspaces." });
        }

        // MFA gate + 1h access token + refresh cookie, all in one place.
        const out = await completeLogin(req, res, user, context, { isSystemAdmin, rememberMe });
        res.status(200).json({ message: "Login successful", ...out });

    } catch (error) {
        console.error("Standard Login error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Map a Menu (with its Module eager-loaded) to the frontend MenuItem shape.
// `actions` = what the role may DO on the screen beyond viewing it, so the UI
// can hide Create/Edit/Delete controls. A granted menu loaded through the
// RoleMenu join carries its flags on m.RoleMenu; `fullAccess` covers the
// Tenant-Admin / all-entitled paths where no join row exists. Ancestor group
// sections (present only for the sidebar tree) get all-false.
function mapMenuItem(m, fullAccess = false) {
    const grant = m.RoleMenu || null;
    return {
        id: m.id,
        name: m.name,
        names: m.names || {},                                   // localized menu names
        description: m.description || null,                     // screen one-liner (header subtitle)
        descriptions: m.descriptions || {},                     // localized descriptions
        route: m.route,
        icon: m.icon,
        moduleName: m.Module ? m.Module.name : 'Core Club Management',
        moduleNames: m.Module ? (m.Module.names || {}) : {},    // localized module names
        moduleIcon: m.Module ? m.Module.icon : 'business',
        moduleLanding: m.Module ? m.Module.landingRoute : null,
        // Adjacency-list nesting: parentId null = top level; a menu with children
        // renders as a collapsible sidebar section. `sequence` orders siblings.
        parentId: m.parentId || null,
        sequence: m.sequence || 0,
        actions: {
            create: fullAccess || (grant ? grant.canCreate !== false : false),
            edit: fullAccess || (grant ? grant.canEdit !== false : false),
            delete: fullAccess || (grant ? grant.canDelete !== false : false),
        },
    };
}

// Add the ancestor chain of each visible menu, using a lookup of every menu in
// the relevant modules, so a parent/section stays present even when the role was
// only granted its children (otherwise the sidebar tree would have orphans).
function withAncestors(visible, allById) {
    const result = new Map();
    for (const m of visible) {
        result.set(m.id, m);
        const seen = new Set();
        let pid = m.parentId;
        while (pid && allById.has(pid) && !result.has(pid) && !seen.has(pid)) {
            seen.add(pid);
            const parent = allById.get(pid);
            result.set(parent.id, parent);
            pid = parent.parentId;
        }
    }
    return [...result.values()];
}

// Effective menus for a user in one workspace, under the account-level RBAC model:
//   - Roles are account-wide menu-permission sets (not company-scoped).
//   - A user's effective menus = their role's menus ∩ the active company's
//     entitled menus (the company's subscribed-module menus).
//   - The "Tenant Admin" role gets IMPLICIT full access (all entitled menus), so
//     it never needs stored menu grants and auto-includes new modules.
//   - The System workspace (companyId null) has no entitlement gate.
// Returns { roleName, menus }.
async function buildWorkspaceMenus(roleId, companyId) {
    let roleName = 'User';
    let permitted = [];
    if (roleId) {
        const role = await Role.findByPk(roleId, {
            include: [{ model: Menu, as: 'PermittedMenus', include: [{ model: Module, as: 'Module' }] }],
        });
        if (role) {
            roleName = role.name;
            permitted = role.PermittedMenus || [];
        }
    }

    if (!companyId) {
        // System workspace: no entitlement gate - the catalogue is the
        // platform-audience modules (SaaS Administration). The seeded
        // "System Admin" role gets IMPLICIT full access to every platform menu
        // (mirrors the Tenant Admin rule), so new platform screens appear
        // without stored grants; other platform roles use their RoleMenu
        // grants, restricted to platform-audience menus.
        if (roleName === 'System Admin') {
            const all = await Menu.findAll({
                include: [{ model: Module, as: 'Module', where: { audience: 'platform' } }],
            });
            return { roleName, menus: all.map(m => mapMenuItem(m, true)) };
        }

        const platformPermitted = permitted.filter(m => m.Module && m.Module.audience === 'platform');
        const moduleIds = [...new Set(platformPermitted.map(m => m.moduleId))];
        const all = moduleIds.length
            ? await Menu.findAll({ where: { moduleId: moduleIds }, include: [{ model: Module, as: 'Module' }] })
            : [];
        const allById = new Map(all.map(m => [m.id, m]));
        return { roleName, menus: withAncestors(platformPermitted, allById).map(m => mapMenuItem(m)) };
    }

    const subs = await CompanyModule.findAll({ where: { companyId }, attributes: ['moduleId'] });
    const moduleIds = subs.map(s => s.moduleId);
    const entitled = moduleIds.length
        ? await Menu.findAll({ where: { moduleId: moduleIds }, include: [{ model: Module, as: 'Module' }] })
        : [];

    if (roleName === 'Tenant Admin') {
        // All entitled menus with implicit full access — parent sections are
        // already part of the set.
        return { roleName, menus: entitled.map(m => mapMenuItem(m, true)) };
    }

    // A normal role: its granted menus ∩ the company's entitled menus, plus the
    // ancestor sections of those grants (resolved from the entitled set).
    const entitledById = new Map(entitled.map(m => [m.id, m]));
    const granted = permitted.filter(m => entitledById.has(m.id));
    return { roleName, menus: withAncestors(granted, entitledById).map(m => mapMenuItem(m)) };
}

// Resolve the role name + effective menus for a user within one workspace.
// companyId is null for the System Administration workspace.
async function resolveWorkspaceContext(userId, companyId) {
    let companyName = 'SYSTEM ADMINISTRATION';
    let resolvedCompanyId = null;
    let accountId = null;

    if (companyId !== null) {
        const company = await Company.findByPk(companyId, { attributes: ['id', 'name', 'accountId'] });
        if (!company) return null;
        resolvedCompanyId = company.id;
        companyName = company.name;
        accountId = company.accountId;
    }

    const membership = await CompanyUser.findOne({ where: { userId, companyId, isActive: true } });

    let roleId = membership ? membership.roleId : null;
    if (!membership) {
        // The System workspace always requires an explicit membership.
        if (companyId === null) return null;
        // Subscriber SuperUser: the account owner may enter any company in their
        // account without a membership row, taking the account's Tenant Admin role.
        const isOwner = await isAccountAdminForCompany(userId, companyId);
        if (!isOwner) return null;
        // Account-level Tenant Admin role.
        const adminRole = accountId
            ? await Role.findOne({ where: { accountId, name: 'Tenant Admin' } })
            : null;
        roleId = adminRole ? adminRole.id : null;
    }

    const { roleName, menus } = await buildWorkspaceMenus(roleId, resolvedCompanyId);
    return { companyId: resolvedCompanyId, companyName, roleName, menus };
}

// Persist the workspace a user just entered, so the NEXT login can skip the
// selection page (see the Scenario B auto-resume below). Stores the companyId,
// or the 'SYSTEM' sentinel for the System Administration workspace. Remembering
// is a convenience only — never block or fail a login on it.
async function rememberLastWorkspace(userId, companyId) {
    try {
        await User.update(
            { lastWorkspaceId: companyId === null ? 'SYSTEM' : companyId },
            { where: { id: userId } },
        );
    } catch (e) {
        console.warn('Could not persist last workspace:', e.message);
    }
}

// For a multi-workspace user, try to auto-resume the workspace they last used so
// they skip the picker. Returns the shared login payload (token + menus + role)
// when the remembered workspace is STILL a valid membership, or null when there's
// nothing valid to resume (caller then returns the 206 picker). The membership
// re-check is what makes a revoked workspace fall back to the picker for free.
async function buildResumeContext(user, workspaces) {
    const remembered = user.lastWorkspaceId; // 'SYSTEM', a companyId, or null
    if (!remembered) return null;

    const rememberedCompanyId = remembered === 'SYSTEM' ? null : remembered;
    const stillMember = workspaces.some(ws => ws.companyId === rememberedCompanyId);
    if (!stillMember) return null;

    // The caller feeds this context into completeLogin (MFA gate + session).
    return resolveWorkspaceContext(user.id, rememberedCompanyId);
}

// GET /api/auth/workspaces  -> every company the logged-in user can access,
// with the role they hold in each. Used to populate the workspace switcher.
exports.listWorkspaces = async (req, res) => {
    try {
        const memberships = await CompanyUser.findAll({ where: { userId: req.user.id, isActive: true } });

        // Keyed by companyId (or 'SYSTEM') so owned-account companies don't duplicate
        // a membership the user already holds.
        const byKey = new Map();
        for (const m of memberships) {
            if (m.companyId === null) {
                let roleName = 'User';
                if (m.roleId) {
                    const role = await Role.findByPk(m.roleId);
                    if (role) roleName = role.name;
                }
                byKey.set('SYSTEM', { companyId: 'SYSTEM', companyName: '🛡️ System Administration', roleName, logo: null });
                continue;
            }
            const company = await Company.findByPk(m.companyId);
            if (!company) continue;
            let roleName = 'User';
            if (m.roleId) {
                const role = await Role.findByPk(m.roleId);
                if (role) roleName = role.name;
            }
            byKey.set(company.id, { companyId: company.id, companyName: company.name, roleName, logo: company.logo || null });
        }

        // Subscriber SuperUser: include EVERY company under accounts this user owns,
        // even those without an explicit membership row.
        const ownedAccountIds = await getOwnedAccountIds(req.user.id);
        if (ownedAccountIds.length > 0) {
            const owned = await Company.findAll({ where: { accountId: ownedAccountIds } });
            for (const c of owned) {
                if (!byKey.has(c.id)) {
                    byKey.set(c.id, { companyId: c.id, companyName: c.name, roleName: 'Tenant Admin', logo: c.logo || null });
                }
            }
        }

        res.status(200).json([...byKey.values()]);
    } catch (error) {
        console.error("List workspaces error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// POST /api/auth/switch-workspace  -> re-issue a JWT scoped to another company
// the user already belongs to. Body: { companyId }  ('SYSTEM' for system admin).
// Lets a multi-company user move between their companies without re-entering
// their password, picking up the correct role + menus for the target company.
exports.switchWorkspace = async (req, res) => {
    try {
        const { companyId } = req.body;
        if (companyId === undefined || companyId === null) {
            return res.status(400).json({ message: "companyId is required." });
        }

        const targetId = companyId === 'SYSTEM' ? null : companyId;

        // The membership check IS the security gate: a user can only switch into a
        // workspace they already belong to.
        const context = await resolveWorkspaceContext(req.user.id, targetId);
        if (!context) {
            return res.status(403).json({ message: "You do not have access to that workspace." });
        }

        const user = await User.findByPk(req.user.id, {
            attributes: ['id', 'email', 'full_name', 'profilePicture'],
        });
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        const isSystemAdmin = await isUserSystemAdmin(user.id, user.email);
        const rememberMe = req.user.rememberMe === true;

        // Already authenticated (and MFA-verified if applicable) this session -
        // switching company must not re-challenge, so the gates are skipped.
        // The refresh session is re-issued scoped to the NEW workspace (the old
        // family is revoked) with the same rememberMe horizon.
        await sessions.revokeSession(req, res);
        const out = await completeLogin(req, res, user, context, { isSystemAdmin, rememberMe, skipMfaGates: true });
        res.status(200).json({ message: "Workspace switched successfully", ...out });
    } catch (error) {
        console.error("Switch workspace error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.verifyEmail = async (req, res) => {
    const { token } = req.params;

    try {
        // Hash lookup (tokens are stored hashed); plain fallback redeems links
        // issued before the hashing change.
        let user = await User.findOne({ where: { verificationToken: hashToken(token) } });
        if (!user) {
            user = await User.findOne({ where: { verificationToken: token } });
        }

        if (!user) {
            return res.status(400).send('<h1>Invalid or Expired Activation Link</h1>');
        }

        // Verify the user and clear the token
        user.isVerified = true;
        user.verificationToken = null;
        await user.save();

        // Redirect them back to the Angular login page with a success flag.
        // (Legacy GET path - old emails still link here; new emails go to the
        // frontend /verify-email page, which calls verifyEmailJson below.)
        res.redirect(`${FRONTEND_BASE_URL}/login?verified=true`);

    } catch (error) {
        console.error(error);
        res.status(500).send('<h1>Server Error</h1>');
    }
};

// POST /api/auth/verify-email  { token } -> JSON, called by the frontend
// /verify-email page (the activation link in the email points there).
exports.verifyEmailJson = async (req, res) => {
    const { token } = req.body || {};
    if (!token) {
        return res.status(400).json({ message: 'Activation token is required.' });
    }

    try {
        // Hash lookup (tokens are stored hashed); plain fallback redeems links
        // issued before the hashing change.
        let user = await User.findOne({ where: { verificationToken: hashToken(token) } });
        if (!user) {
            user = await User.findOne({ where: { verificationToken: token } });
        }
        if (!user) {
            // Unknown token: either invalid, or already used (double-click).
            return res.status(400).json({ message: 'This activation link is invalid or was already used. If you have activated before, just log in.' });
        }

        user.isVerified = true;
        user.verificationToken = null;
        await user.save();

        res.status(200).json({ message: 'Email verified successfully! You can now log in.' });
    } catch (error) {
        console.error('Verify email error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ----------------------------------------------------
// C. Google Login (OAuth 2.0 Token Verification)
// ----------------------------------------------------
exports.googleLogin = async (req, res) => {
    // const { accessToken } = req.body;

    // if (!accessToken) {
    //     return res.status(400).json({ message: 'Access token is required' });
    // }

    // 1. Start the Transaction for safe Outbox inserting
    const transaction = await sequelize.transaction();

    try {
        const { accessToken, selectedCompanyId } = req.body;

        if (!accessToken) return res.status(400).json({ message: "No token provided" });

        // 1. Ask Google for the user's profile using the access token
        const googleResponse = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        // UPDATED: Extract 'sub' (which is Google's unique ID) and rename it to 'googleId'
        const { email, name, picture, sub: googleId } = googleResponse.data;

        // 2. STEP ONE: Try to find the user by their permanent Google ID first!
        let user = await User.findOne({ where: { googleId }, transaction });

        if (!user) {
            // STEP TWO: Not found by Google ID. Check if they exist by Email (Local signup).
            user = await User.findOne({ where: { email }, transaction });

            if (user) {
                // ACCOUNT LINKING: They signed up locally before, but are now using Google.
                // We securely link their new Google ID to their existing local account!
                user.googleId = googleId;
                user.full_name = name; 
                user.profilePicture = picture;
                
                // If they never verified their local email, Google just did it for us
                if (!user.isVerified) {
                    user.isVerified = true;
                    user.verificationToken = null;
                }
                
                await user.save({ transaction });

            } else {
                // STEP THREE: Brand new user! Register them automatically.
                
                // Generate a random, secure dummy password since they use Google
                const randomPassword = crypto.randomBytes(16).toString('hex');
                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash(randomPassword, salt);

                // Create the user. Notice we set isVerified: true because Google already verified their email!
                user = await User.create({
                    email,
                    password: hashedPassword,
                    full_name: name, // Note: adjust to 'fullName' if your model uses camelCase
                    profilePicture: picture,
                    authMethod: 'google',
                    googleId: googleId, // <-- Saving the permanent Google ID here!
                    isVerified: true, 
                    verificationToken: null
                }, { transaction });

                // Create the Outbox Message for Google Signups!
                await OutboxMessage.create({
                    id: uuidv4(),
                    type: 'UserRegistered',
                    payload: { 
                        email: email, 
                        authMethod: 'google',
                        verified: true 
                        // Notice we DO NOT send an activationLink because they don't need one!
                    }
                }, { transaction });
            }
        } else {
            // EXISTING GOOGLE USER: They logged in with Google before.
            // Just update their profile picture and name to stay synced with Google
            user.full_name = name; // Note: adjust to 'fullName' if your model uses camelCase
            user.profilePicture = picture;
            await user.save({ transaction });
        }
            
        // 3. Generate your app's standard JWT token
        const token = generateToken(user.id, user.email);

        // 4. Commit the transaction so User and Outbox save together
        await transaction.commit();


        // --- MASTER RBAC LOGIN LOGIC ---
        // 1. Check if they are a Master Admin
        // DB-backed system-admin check (System Admin role), with ADMIN_EMAILS break-glass.
        const isSystemAdmin = await isUserSystemAdmin(user.id, user.email);

        // 2. Load ALL memberships so a DEACTIVATED account is told apart from one
        // with no workspace (mirrors the standard-login path above). Reachable only
        // after SSO has verified identity, so the hint doesn't leak anonymously.
        const allMemberships = await CompanyUser.findAll({ where: { userId: user.id } });
        if (allMemberships.length > 0 && !allMemberships.some(m => m.isActive)) {
            return res.status(403).json({ message: "Your account has been deactivated. Please contact your administrator." });
        }

        // Active memberships only (a deactivated one can no longer be entered).
        let workspaces = allMemberships.filter(m => m.isActive);

        // LIMBO: brand-new (or workspaceless) SSO user - Google already verified
        // their email, so route them to onboarding instead of a dead-end 403.
        if (allMemberships.length === 0) {
            return res.status(200).json(buildOnboardingResponse(user));
        }

        // 3. If they clicked a workspace on the UI, filter the array down to JUST that one!
        if (selectedCompanyId) {
            const targetId = selectedCompanyId === 'SYSTEM' ? null : selectedCompanyId;
            workspaces = workspaces.filter(ws => ws.companyId === targetId);
        }

        // ==========================================
        // SCENARIO A: NO WORKSPACE (none match the selection)
        // ==========================================
        if (workspaces.length === 0) {
            return res.status(403).json({ message: "Account has no associated workspaces." });
        }

        // ==========================================
        // SCENARIO B: MULTIPLE WORKSPACES (They need to choose!)
        // ==========================================
        if (workspaces.length > 1) {
            // First, try to skip the picker by resuming the last-used workspace.
            if (!selectedCompanyId) {
                const resumeCtx = await buildResumeContext(user, workspaces);
                if (resumeCtx) {
                    const out = await completeLogin(req, res, user, resumeCtx, { isSystemAdmin });
                    return res.status(200).json({ message: 'Google login successful', ...out });
                }
            }

            const availableClubs = [];
            for (let ws of workspaces) {
                if (ws.companyId === null) {
                    availableClubs.push({ companyId: 'SYSTEM', companyName: '🛡️ System Administration' });
                } else {
                    const comp = await Company.findByPk(ws.companyId);
                    if (comp) availableClubs.push({ companyId: comp.id, companyName: comp.name });
                }
            }
            return res.status(206).json({
                message: "Multiple workspaces found. Please select one.",
                clubs: availableClubs
            });
        }

        // ==========================================
        // SCENARIO C: EXACTLY ONE WORKSPACE (Or they just selected one!)
        // ==========================================
        const workspace = workspaces[0];
        const context = await resolveWorkspaceContext(user.id, workspace.companyId);
        if (!context) {
            return res.status(403).json({ message: "Account has no associated workspaces." });
        }

        // MFA gate + 1h access token + refresh cookie, all in one place.
        const out = await completeLogin(req, res, user, context, { isSystemAdmin });
        res.json({ message: 'Google login successful', ...out });

    } catch (error) {
        // SAFETY CHECK: Only try to rollback if the transaction hasn't been finished yet!
        if (!transaction.finished) {
            await transaction.rollback();
        }
        // Log the ACTUAL error so you can see it in Cloud Run logs (instead of just a generic message) 
        console.error('Google Auth Error:', error.response?.data || error.message);
        res.status(500).json({ message: 'Failed to authenticate with Google' });
    }
};

// POST /api/auth/google/exchange   Body: { code, redirectUri }
// Exchanges a Google authorization code (from the in-app redirect flow —
// google.accounts.oauth2.initCodeClient with ux_mode:'redirect') for an access
// token, which the frontend then uses with /api/auth/google exactly like the old
// popup token flow. This keeps the Google sign-in logic (incl. the 206
// multi-workspace resume) unchanged; only the UX becomes a same-tab redirect.
exports.googleExchangeCode = async (req, res) => {
    const { code, redirectUri } = req.body;
    if (!code || !redirectUri) {
        return res.status(400).json({ message: "Authorization code and redirect URI are required." });
    }
    try {
        const params = new URLSearchParams({
            code,
            client_id: process.env.GOOGLE_CLIENT_ID || '148523901156-uc6a3f7q2le2fsqbm5idc0ai27vebe69.apps.googleusercontent.com',
            client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
        });
        const tokenRes = await axios.post('https://oauth2.googleapis.com/token', params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        const accessToken = tokenRes.data && tokenRes.data.access_token;
        if (!accessToken) {
            return res.status(401).json({ message: "Failed to obtain a Google access token." });
        }
        res.status(200).json({ accessToken });
    } catch (error) {
        console.error('Google code exchange error:', error.response?.data || error.message);
        res.status(401).json({ message: "Google sign-in failed during code exchange." });
    }
};

// GET /api/auth/sso-config   Public, read-only.
// Per-environment SSO wiring for the login screen: the Google OAuth client the
// SPA must start the redirect flow with (it has to match the client whose
// secret THIS api uses in the code exchange above), and whether the Microsoft
// button is offered at all. Keeps client ids out of the web bundle so ONE web
// image serves every environment; the hardcoded id is the legacy prod client,
// kept as the fallback so environments without the env vars behave as before.
exports.ssoConfig = (req, res) => {
    res.status(200).json({
        googleClientId: process.env.GOOGLE_CLIENT_ID || '148523901156-uc6a3f7q2le2fsqbm5idc0ai27vebe69.apps.googleusercontent.com',
        microsoftEnabled: process.env.MICROSOFT_SSO_ENABLED !== 'false',
    });
};

exports.microsoftLogin = async (req, res) => {
    const { accessToken } = req.body;

    if (!accessToken) {
        return res.status(400).json({ message: 'Access token is required' });
    }

    // Initialize transaction as null so the catch block can see it
    let transaction = null;

    try {
        // ==========================================
        // 1. EXTERNAL API CALLS (No database locks yet!)
        // ==========================================
        
        // Ask Microsoft for the basic profile (with a 10s timeout safety net)
        const microsoftResponse = await axios.get('https://graph.microsoft.com/v1.0/me', {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 10000 
        });

        const { id: microsoftId, displayName: name, mail, userPrincipalName } = microsoftResponse.data;
        const email = mail || userPrincipalName;

        // Ask Microsoft for the Photo (Strict 5s timeout!)
        let picture = null;
        try {
            const photoResponse = await axios.get('https://graph.microsoft.com/v1.0/me/photo/$value', {
                headers: { Authorization: `Bearer ${accessToken}` },
                responseType: 'arraybuffer',
                timeout: 5000 // 👇 If Microsoft hangs for 5 seconds, it aborts and drops to the catch block!
            });
            const base64Image = Buffer.from(photoResponse.data, 'binary').toString('base64');
            picture = `data:image/jpeg;base64,${base64Image}`;
        } catch (photoError) {
            console.log(`[INFO] No photo found or Microsoft timed out for ${email}`);
        }


        // ==========================================
        // 2. DATABASE OPERATIONS (Fast and Safe)
        // ==========================================
        
        // NOW we start the transaction because we have all the data we need!
        transaction = await sequelize.transaction();

        let user = await User.findOne({ where: { microsoftId }, transaction });

        if (!user) {
            user = await User.findOne({ where: { email }, transaction });

            if (user) {
                // ACCOUNT LINKING
                user.microsoftId = microsoftId;
                if (!user.full_name) user.full_name = name; 
                
                // Only update picture if we actually got one from Microsoft
                if (!user.profilePicture && picture) user.profilePicture = picture;
                
                if (!user.isVerified) {
                    user.isVerified = true;
                    user.verificationToken = null;
                }
                await user.save({ transaction });

            } else {
                // BRAND NEW USER
                const randomPassword = crypto.randomBytes(16).toString('hex');
                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash(randomPassword, salt);

                user = await User.create({
                    email,
                    password: hashedPassword,
                    full_name: name,
                    profilePicture: picture, 
                    authMethod: 'microsoft',
                    microsoftId: microsoftId, 
                    isVerified: true, 
                    verificationToken: null
                }, { transaction });

                await OutboxMessage.create({
                    id: uuidv4(),
                    type: 'UserRegistered',
                    payload: { email: email, authMethod: 'microsoft', verified: true }
                }, { transaction });
            }
        } else {
            // EXISTING MICROSOFT USER
            user.full_name = name; 
            if (picture) user.profilePicture = picture; // Only update if Microsoft didn't timeout
            await user.save({ transaction });
        }

        // Block a deactivated account (has memberships, but all inactive) - mirrors
        // the email + Google paths. A brand-new SSO user has no memberships yet, so
        // this check passes and they proceed.
        const allMemberships = await CompanyUser.findAll({ where: { userId: user.id }, transaction });
        if (allMemberships.length > 0 && !allMemberships.some(m => m.isActive)) {
            await transaction.rollback();
            return res.status(403).json({ message: "Your account has been deactivated. Please contact your administrator." });
        }

        // LIMBO: brand-new (or workspaceless) SSO user - Microsoft already
        // verified their email, so route them to onboarding instead of minting
        // a workspace-less shell token.
        if (allMemberships.length === 0) {
            await transaction.commit();
            return res.status(200).json(buildOnboardingResponse(user));
        }

        // 3. Resolve the workspace like the other login paths (last-used when
        // multiple, the single one otherwise) & commit the user updates first.
        const isSystemAdmin = await isUserSystemAdmin(user.id, user.email);
        await transaction.commit();

        const activeWorkspaces = allMemberships.filter(m => m.isActive);
        let context = null;
        if (activeWorkspaces.length > 1) {
            context = await buildResumeContext(user, activeWorkspaces);
        }
        if (!context) {
            context = await resolveWorkspaceContext(user.id, activeWorkspaces[0].companyId);
        }
        if (!context) {
            return res.status(403).json({ message: "Account has no associated workspaces." });
        }

        // MFA gate + 1h access token + refresh cookie, all in one place.
        const out = await completeLogin(req, res, user, context, { isSystemAdmin });
        res.json({ message: 'Microsoft login successful', ...out });

    } catch (error) {
        // Safe Rollback: Only rollback if the transaction was actually started and not finished
        if (transaction && !transaction.finished) {
            await transaction.rollback(); 
        }
        console.error('Microsoft Auth Error:', error.message);
        res.status(500).json({ message: 'Failed to authenticate with Microsoft' });
    }
};

// ----------------------------------------------------
// E. Forgot Password (Generate Link)
// ----------------------------------------------------
exports.forgotPassword = async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ message: 'Email is required.' });
    }

    const transaction = await sequelize.transaction();

    try {
        // 1. Clean the email input
        const userEmail = email.trim().toLowerCase();

        // 2. Find the user
        const user = await User.findOne({ where: { email: userEmail }, transaction });

        // SECURITY BEST PRACTICE: Even if the user doesn't exist, we send back a success message.
        // This prevents hackers from using the forgot password form to guess which emails are registered.
        if (!user) {
            await transaction.rollback();
            return res.json({ message: 'If an account exists, a reset link has been sent.' });
        }

        // Per-email cooldown (anti email-bombing): if a reset OR SSO-notice email
        // was already issued in the last 5 minutes, answer the same generic
        // success WITHOUT queueing another one - the earlier email still stands,
        // and the caller learns nothing. Derived from the expiry timestamp
        // ("issued < COOLDOWN ago" == "expiry more than TTL-COOLDOWN away"), so
        // no extra column is needed. Checked BEFORE the SSO branch so SSO
        // accounts can't be flooded either.
        if (user.resetPasswordExpires
            && new Date(user.resetPasswordExpires).getTime() > Date.now() + (RESET_TOKEN_TTL_MS - RESET_COOLDOWN_MS)) {
            await transaction.rollback();
            return res.json({ message: 'If an account exists, a reset link has been sent.' });
        }

        // SSO accounts have no password to reset. Answer the SAME generic
        // success (a 400 here would confirm the account exists AND name its
        // IdP - an enumeration gift) and put the guidance in the inbox, where
        // only the owner reads it. The expiry timestamp is still armed so the
        // cooldown above throttles repeat notices.
        if (user.authMethod === 'google' || user.authMethod === 'microsoft') {
            const provider = user.authMethod === 'google' ? 'Google' : 'Microsoft';
            user.resetPasswordToken = null;
            user.resetPasswordExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
            await user.save({ transaction });

            const ssoScope = await resolveIdentityScope(user);
            await enqueueEmail({
                templateKey: 'password.reset.sso',
                accountId: ssoScope.accountId,
                companyId: ssoScope.companyId,
                to: user.email,
                data: { email: user.email, provider, loginLink: `${FRONTEND_BASE_URL}/login` },
                forcePlatformSender: true,
            }, transaction);

            await transaction.commit();
            return res.json({ message: 'If an account exists, a reset link has been sent.' });
        }

        // 3. Generate a secure random token; only its HASH is stored (the raw
        // value exists solely inside the emailed link - see hashToken).
        const resetToken = crypto.randomBytes(32).toString('hex');

        // 4. Set token to expire in 30 minutes
        const tokenExpiry = new Date(Date.now() + RESET_TOKEN_TTL_MS);

        // 5. Save the token HASH to the user's database record
        user.resetPasswordToken = hashToken(resetToken);
        user.resetPasswordExpires = tokenExpiry;
        await user.save({ transaction });

        // 6. Generate the reset link (uses the deployed frontend URL, not localhost).
        const resetLink = `${FRONTEND_BASE_URL}/reset-password?token=${resetToken}`;

        // 7. Queue the reset email, BRANDED for the user's resolved scope (their club
        // when unambiguous, else the subscriber-wide or platform default) but always
        // DELIVERED via the platform mailer - a password reset must not depend on a
        // tenant SMTP being healthy.
        const scope = await resolveIdentityScope(user);
        await enqueueEmail({
            templateKey: 'password.reset',
            accountId: scope.accountId,
            companyId: scope.companyId,
            to: user.email,
            data: { email: user.email, resetLink },
            forcePlatformSender: true,
        }, transaction);

        // 8. Commit the transaction
        await transaction.commit();

        res.json({ message: 'If an account exists, a reset link has been sent.' });

    } catch (error) {
        await transaction.rollback();
        console.error("Forgot Password Error:", error);
        res.status(500).json({ message: 'Server error processing request.' });
    }
};

// ----------------------------------------------------
// F. Reset Password (Save New Password)
// ----------------------------------------------------
exports.resetPassword = async (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        return res.status(400).json({ message: 'Token and new password are required.' });
    }
    if (String(newPassword).length < 8) {
        return res.status(400).json({ message: 'The new password must be at least 8 characters.' });
    }

    // Block passwords known from public breaches (HIBP k-anonymity; fail-open).
    if (await isPasswordBreached(newPassword)) {
        return res.status(400).json({ message: BREACHED_PASSWORD_MESSAGE });
    }

    // 1. Start a transaction
    const transaction = await sequelize.transaction();

    try {
        // 2. Find the user by the token's HASH (tokens are stored hashed - see
        // hashToken). The plain-value fallback redeems links issued before the
        // hashing change; remove it once those have all expired.
        let user = await User.findOne({ where: { resetPasswordToken: hashToken(token) }, transaction });
        if (!user) {
            user = await User.findOne({ where: { resetPasswordToken: token }, transaction });
        }

        if (!user) {
            await transaction.rollback();
            return res.status(400).json({ message: 'Invalid or expired password reset link.' });
        }

        if (new Date() > user.resetPasswordExpires) {
            await transaction.rollback();
            return res.status(400).json({ message: 'This password reset link has expired. Please request a new one.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // 3. Update the user
        user.password = hashedPassword;
        user.resetPasswordToken = null;
        user.resetPasswordExpires = null;
        await user.save({ transaction });

        // A password reset invalidates every existing session ("sign out
        // everywhere") - the whole point when the old password was compromised.
        // Device trust goes too: a trusted browser + the (possibly stolen)
        // password must not skip the MFA step after a reset.
        await sessions.revokeAllSessions(user.id);
        await trustedDevices.revokeAllTrust(user.id);

        // 4. Queue the success-confirmation email, branded for the user's resolved
        //    scope but sent via the platform mailer (a security notice).
        const scope = await resolveIdentityScope(user);
        await enqueueEmail({
            templateKey: 'password.reset.success',
            accountId: scope.accountId,
            companyId: scope.companyId,
            to: user.email,
            data: { email: user.email },
            forcePlatformSender: true,
        }, transaction);

        // 5. Commit both the password change and the email trigger
        await transaction.commit();

        res.json({ message: 'Password has been successfully reset.' });

    } catch (error) {
        await transaction.rollback(); // Rollback if anything fails
        console.error("Reset Password Error:", error);
        res.status(500).json({ message: 'Server error processing request.' });
    }
};

exports.uploadAvatar = async (req, res) => {
    try {
        // 1. Ensure a file was actually caught by Multer
        if (!req.file) {
            return res.status(400).json({ message: 'No image file uploaded.' });
        }

        const userId = req.user.id; 

        // 2. Create a unique, safe filename
        const fileExtension = req.file.originalname.split('.').pop();
        const gcsFileName = `avatar-${userId}-${Date.now()}.${fileExtension}`;

        // 3. Create a reference to the file in the per-environment assets bucket
        const bucket = assetsBucket();
        const blob = bucket.file(gcsFileName);

        // 4. Upload to Google Cloud Storage using async/await! (NO MORE STREAMS)
        await blob.save(req.file.buffer, {
            resumable: false,
            contentType: req.file.mimetype,
        });

        // 5. Generate the public URL
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;

        // 6. Update the database and track how many rows were affected
        const [updatedRows] = await User.update(
            { profilePicture: publicUrl }, 
            { where: { id: userId } }
        );

        // Diagnostic Check: Did it actually find your user in the DB?
        if (updatedRows === 0) {
            console.warn(`[DB WARNING] Image uploaded, but no user found in DB with ID: ${userId}`);
        } else {
            console.log(`[DB SUCCESS] Profile picture updated for User ID: ${userId}`);
        }

        // 7. Send the success response back to Angular!
        return res.status(200).json({ 
            message: 'Profile picture updated successfully!',
            profilePicture: publicUrl 
        });

    } catch (error) {
        console.error('Avatar Upload Exception:', error);
        return res.status(500).json({ message: error.message || 'An error occurred during upload.' });
    }
};

// Upload a company logo to GCS and return its public URL. Not tied to a company
// row (the "New company" flow has no company yet) - the caller stores the returned
// URL on the company via create/update. Guarded to Tenant Admins in the routes.
exports.uploadCompanyLogo = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No image file uploaded.' });
        }
        const fileExtension = req.file.originalname.split('.').pop();
        const gcsFileName = `company-logo-${req.user.id}-${Date.now()}.${fileExtension}`;
        const bucket = assetsBucket();
        const blob = bucket.file(gcsFileName);
        await blob.save(req.file.buffer, { resumable: false, contentType: req.file.mimetype });
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
        return res.status(200).json({ message: 'Logo uploaded.', url: publicUrl });
    } catch (error) {
        console.error('Company logo upload error:', error);
        return res.status(500).json({ message: error.message || 'Failed to upload logo.' });
    }
};

// --- CHANGE PASSWORD ---
exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id; // securely grabbed from the JWT token

        if (!newPassword || String(newPassword).length < 8) {
            return res.status(400).json({ message: 'The new password must be at least 8 characters.' });
        }

        // Block passwords known from public breaches (HIBP k-anonymity; fail-open).
        if (await isPasswordBreached(newPassword)) {
            return res.status(400).json({ message: BREACHED_PASSWORD_MESSAGE });
        }

        // 1. Find the user in the database
        const user = await User.findOne({ where: { id: userId } });
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // 2. Extra Security: Ensure they are a 'local' user
        if (user.authMethod !== 'local') {
            return res.status(400).json({ message: 'SSO users cannot change passwords here.' });
        }

        // 3. Verify the current password matches what is in the database
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Incorrect current password.' });
        }

        // 4. Hash the NEW password securely
        const salt = await bcrypt.genSalt(10);
        const hashedNewPassword = await bcrypt.hash(newPassword, salt);

        // 5. Save the new hashed password. Instance save (not a bulk update) so
        // the change lands in the audit trail - bulk updates bypass per-row
        // hooks, and a password change is exactly the kind of event the trail
        // must show (value is redacted there, of course).
        user.password = hashedNewPassword;
        await user.save();

        console.log(`[SECURITY] Password changed successfully for User ID: ${userId}`);

        // 6. A password change signs out every OTHER session; the caller's own
        // cookie was just superseded too, but their access token stays valid up
        // to an hour, after which the interceptor sends them to re-login.
        // Trusted devices are revoked for the same reason as sessions.
        await sessions.revokeAllSessions(userId);
        await trustedDevices.revokeAllTrust(userId);

        // 7. Send success response back to Angular
        res.status(200).json({ message: 'Password updated successfully!' });

    } catch (error) {
        console.error('Change Password Error:', error);
        res.status(500).json({ message: 'An error occurred while changing the password.' });
    }
};

exports.registerLead = async (req, res) => {
    const { email, name, companyName, subscriptionPlan, timezone, source } = req.body;

    // 1. Basic Validation
    if (!email || !name || !companyName) {
        return res.status(400).json({ message: 'Email, Name, and Company Name are required.' });
    }

    // Low-effort bot signups: refuse disposable/temporary email providers
    // (bundled blocklist, no network call).
    if (isDisposableEmail(email)) {
        return res.status(400).json({ message: DISPOSABLE_EMAIL_MESSAGE });
    }

    try {
        // 2. Check if this email already fully exists in the main system
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: 'An account with this email already exists.' });
        }

        // Per-email cooldown (anti email-bombing): if this address already got
        // an activation email in the last 5 minutes, answer the same success
        // WITHOUT queueing another one. The link in the earlier email still works.
        const recentLead = await RegistrationLead.findOne({
            where: { email, createdAt: { [Op.gt]: new Date(Date.now() - 5 * 60 * 1000) } },
        });
        if (recentLead) {
            return res.status(200).json({
                message: 'Registration successful! Please check your email to activate your account.'
            });
        }

        // 3. SILENT CAPTURE: Extract IP and Geo-location from Cloud Run headers
        // Cloud Run passes the real user IP in the 'x-forwarded-for' header
        let ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;
        if (ipAddress && ipAddress.includes(',')) {
            ipAddress = ipAddress.split(',')[0].trim(); // Get the first IP if there are multiple
        }

        let country = null;
        if (ipAddress) {
            const geo = geoip.lookup(ipAddress);
            if (geo) country = geo.country; // Returns a 2-letter code like 'MY', 'US', 'SG'
        }

        // 4. Save the "Lead" to the database for analytics
        await RegistrationLead.create({
            email,
            name,
            company: companyName,
            ipAddress,
            country,
            timezone: timezone || 'Unknown', // Fallback if Angular fails to send it
            source: source || 'Organic',
            status: 'PENDING'
        });

        // 5. Pack the vital data into a secure JWT (Expires in 24 hours)
        const registrationToken = jwt.sign(
            { 
                email, 
                name, 
                companyName, 
                subscriptionPlan: subscriptionPlan || 'BASIC' 
            }, 
            getPrivateKey(),
            { algorithm: 'RS256', expiresIn: '24h' }
        );

        // 6. Generate the Activation Link
        // In production, replace localhost with your actual Angular domain!
        const activationLink = `${FRONTEND_BASE_URL}/setup-password?token=${registrationToken}`;

        // 7. MOCK EMAIL SENDING (Replace this with SendGrid/Mailgun later)
        console.log('\n=============================================');
        console.log(`🚀 NEW LEAD CAPTURED: ${email} from ${country || 'Unknown'}`);
        console.log(`📧 SENDING EMAIL TO: ${email}`);
        console.log(`🔗 ACTIVATION LINK: ${activationLink}`);
        console.log('=============================================\n');

        // 7. DELEGATE EMAIL TO THE OUTBOX WORKER (rendered from the template now)
        await enqueueEmail({
            templateKey: 'account.activation',
            to: email,
            data: { email, companyName, activationLink },
        });

        // 8. Respond to Angular so it can show the "Check your email!" success screen
        res.status(200).json({ 
            message: 'Registration successful! Please check your email to activate your account.' 
        });

    } catch (error) {
        console.error('Registration Lead Error:', error);
        res.status(500).json({ message: 'Failed to process registration.' });
    }
};

exports.activateAccount = async (req, res) => {
    // Angular will send the token from the URL and the password they typed
    const { token, password } = req.body;

    if (!token || !password) {
        return res.status(400).json({ message: 'Activation token and password are required.' });
    }
    if (String(password).length < 8) {
        return res.status(400).json({ message: 'The password must be at least 8 characters.' });
    }

    // Block passwords known from public breaches (HIBP k-anonymity; fail-open).
    if (await isPasswordBreached(password)) {
        return res.status(400).json({ message: BREACHED_PASSWORD_MESSAGE });
    }

    let transaction = null;

    try {
        // 1. Verify the JWT and extract the lead's data
        let decoded;
        try {
            decoded = jwt.verify(token, getPublicKey(), { algorithms: ['RS256'] });
        } catch (err) {
            return res.status(400).json({ message: 'Invalid or expired activation link. Please register again.' });
        }

        const { email, name, companyName, subscriptionPlan } = decoded;

        // 2. Safety Check: Did they double-click the link? 
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: 'This account is already activated. Please log in.' });
        }

        // ==========================================
        // 3. START THE SAAS PROVISIONING TRANSACTION
        // ==========================================
        transaction = await sequelize.transaction();

        // Hash their brand new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // A. Create the Global User
        const user = await User.create({
            email,
            password: hashedPassword,
            full_name: name,
            authMethod: 'local',
            isVerified: true, // They verified their email by clicking the link!
            verificationToken: null
        }, { transaction });

        // B. Provision the tenant through the ONE shared path (Account with
        // ownerUserId, Company, Tenant Admin role, entitlements, CompanyUser,
        // TenantProvisioned outbox event). Self-service subscribers start
        // entitled to every product module; they can trim it later.
        const allModules = await listEntitlableModules(transaction);
        const { company } = await provisionTenant({
            userId: user.id,
            ownerEmail: email,
            subscriberName: companyName,
            companyName,
            subscriptionPlan,
            moduleIds: allModules.map(m => m.id),
        }, transaction);

        // C. Close the loop on the Lead Table (Analytics)
        await RegistrationLead.update(
            {
                status: 'PROCESSED',
                processedDate: new Date()
            },
            {
                where: { email: email, status: 'PENDING' },
                transaction
            }
        );

        // ==========================================
        // 4. COMMIT EVERYTHING
        // ==========================================
        await transaction.commit();

        // 5. Instantly log them in!
        // We generate a standard JWT so Angular bypasses the login screen
        const loginToken = generateToken(user.id, user.email, company.id, company.name, false);

        // Remember the new workspace so their first real login resumes into it.
        await rememberLastWorkspace(user.id, company.id);

        res.status(200).json({ 
            message: 'Account activated successfully!',
            token: loginToken,
            email: user.email,
            fullName: user.full_name
        });

    } catch (error) {
        // If literally ANYTHING fails above, it completely rolls back the database!
        if (transaction && !transaction.finished) {
            await transaction.rollback();
        }
        console.error('Account Activation Error:', error);
        res.status(500).json({ message: 'Failed to provision the account.' });
    }
};

// ==========================================
// SELF-SERVICE ONBOARDING (limbo -> tenant)
// ==========================================
// Both endpoints accept ONLY the onboarding-scoped token (purpose 'onboarding',
// enforced by authenticateOnboarding in auth.routes.js).

// GET /api/auth/onboarding/modules - the product modules the wizard offers.
exports.getOnboardingModules = async (req, res) => {
    try {
        const modules = await listEntitlableModules();
        res.status(200).json(modules);
    } catch (error) {
        console.error('Onboarding modules error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/auth/onboarding/provision - create the caller's subscriber + first
// company, then log them straight into the new workspace (full login payload).
exports.provisionOnboarding = async (req, res) => {
    const { subscriberName, companyName, moduleIds } = req.body || {};
    const cleanSubscriber = String(subscriberName || '').trim();
    const cleanCompany = String(companyName || '').trim() || cleanSubscriber;

    if (!cleanSubscriber) {
        return res.status(400).json({ message: 'Organization name is required.' });
    }

    let transaction = null;
    try {
        transaction = await sequelize.transaction();

        // Lock the user row so a double-submit cannot provision two tenants.
        const user = await User.findByPk(req.user.id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!user || !user.isVerified) {
            await transaction.rollback();
            return res.status(403).json({ message: 'Please verify your email first.' });
        }

        // Only a user with NO workspace at all may self-provision. (Once they
        // have one - including via an accepted invitation - this endpoint is
        // closed; new companies are created inside the app instead.)
        const existingMemberships = await CompanyUser.count({ where: { userId: user.id }, transaction });
        if (existingMemberships > 0) {
            await transaction.rollback();
            return res.status(409).json({ message: 'You already have a workspace. Please log in again.' });
        }

        const { company, role } = await provisionTenant({
            userId: user.id,
            ownerEmail: user.email,
            subscriberName: cleanSubscriber,
            companyName: cleanCompany,
            moduleIds,
        }, transaction);

        await transaction.commit();

        // Full login payload (mirrors login Scenario C) so the frontend swaps
        // the onboarding token for a real workspace session in one step. The
        // new owner is a Tenant Admin, so the MFA enrollment gate applies here
        // too - the wizard forwards them to /mfa-setup when it fires.
        const { roleName, menus } = await buildWorkspaceMenus(role.id, company.id);
        const out = await completeLogin(req, res, user, {
            companyId: company.id, companyName: company.name, roleName, menus,
        }, { isSystemAdmin: false, rememberMe: false });

        res.status(201).json({ message: 'Workspace created successfully!', ...out });
    } catch (error) {
        if (transaction && !transaction.finished) {
            await transaction.rollback();
        }
        console.error('Onboarding provision error:', error);
        res.status(500).json({ message: 'Failed to create your workspace.' });
    }
};

// ==========================================
// MFA (TOTP) + SESSIONS
// ==========================================

// POST /api/auth/mfa/verify  { mfaToken, code, rememberDevice? } - the login
// step-up. `code` is a 6-digit TOTP or an XXXX-XXXX recovery code. On success:
// full login payload; with rememberDevice, this browser also gets a 30-day
// trusted-device cookie so later logins skip the code step.
exports.mfaVerify = async (req, res) => {
    try {
        const { mfaToken, code, rememberDevice } = req.body || {};
        if (!mfaToken || !code) {
            return res.status(400).json({ message: 'Code is required.' });
        }

        let claims;
        try {
            claims = jwt.verify(mfaToken, getPublicKey(), { algorithms: ['RS256'] });
        } catch (e) {
            return res.status(401).json({ message: 'Your sign-in expired. Please log in again.' });
        }
        if (claims.purpose !== 'mfa') {
            return res.status(401).json({ message: 'Your sign-in expired. Please log in again.' });
        }

        const user = await User.findByPk(claims.id);
        if (!user || !user.mfaEnabled) {
            return res.status(401).json({ message: 'Your sign-in expired. Please log in again.' });
        }

        // TOTP first; recovery code as the fallback (single-use).
        let ok = mfa.verifyTotp(code, user.mfaSecret);
        if (!ok) {
            const rec = mfa.consumeRecoveryCode(code, user.mfaRecoveryCodes);
            if (rec.ok) {
                ok = true;
                user.mfaRecoveryCodes = rec.remaining;
                await user.save();
            }
        }
        if (!ok) {
            return res.status(401).json({ message: 'That code is not valid. Please try again.' });
        }

        const context = await resolveWorkspaceContext(user.id, claims.companyId ?? null);
        if (!context) {
            return res.status(403).json({ message: 'You no longer have access to that workspace.' });
        }

        if (rememberDevice === true) {
            await trustedDevices.issueTrust(res, { userId: user.id, req });
        }

        const out = await completeLogin(req, res, user, context, {
            isSystemAdmin: claims.isSystemAdmin === true,
            rememberMe: claims.rememberMe === true,
            mfaVerified: true,
        });
        res.status(200).json({ message: 'Login successful', ...out });
    } catch (error) {
        console.error('MFA verify error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// GET /api/auth/mfa/status - drives the Profile Security card.
exports.mfaStatus = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id, {
            attributes: ['mfaEnabled', 'mfaEnrolledAt', 'mfaRecoveryCodes', 'authMethod'],
        });
        if (!user) return res.status(404).json({ message: 'User not found.' });
        res.status(200).json({
            available: mfa.isMfaConfigured(),
            enabled: user.mfaEnabled === true,
            enrolledAt: user.mfaEnrolledAt,
            recoveryCodesLeft: Array.isArray(user.mfaRecoveryCodes) ? user.mfaRecoveryCodes.length : 0,
        });
    } catch (error) {
        console.error('MFA status error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/auth/mfa/setup - generate a secret + QR. Accepts a full session OR
// the 'mfa-enroll' token (forced admin enrollment). Nothing is enabled until
// the user proves possession via /mfa/enable.
exports.mfaSetup = async (req, res) => {
    try {
        if (!mfa.isMfaConfigured()) {
            return res.status(503).json({ message: 'Two-factor authentication is not configured on this server.' });
        }
        const user = await User.findByPk(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found.' });
        if (user.mfaEnabled) {
            return res.status(409).json({ message: 'Two-factor authentication is already enabled.' });
        }

        const secret = mfa.generateSecret();
        user.mfaSecret = mfa.encryptSecret(secret);
        await user.save();

        const { otpauthUrl, qrDataUrl } = await mfa.buildEnrollment(user.email, secret);
        res.status(200).json({ otpauthUrl, qrDataUrl });
    } catch (error) {
        console.error('MFA setup error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/auth/mfa/enable  { code } - confirm the code, switch MFA on, hand
// out the recovery codes ONCE. When called with the 'mfa-enroll' token, the
// response also completes the login so the user lands straight in the app.
exports.mfaEnable = async (req, res) => {
    try {
        const { code } = req.body || {};
        const user = await User.findByPk(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found.' });
        if (user.mfaEnabled) {
            return res.status(409).json({ message: 'Two-factor authentication is already enabled.' });
        }
        if (!user.mfaSecret) {
            return res.status(400).json({ message: 'Run setup first.' });
        }
        if (!mfa.verifyTotp(code, user.mfaSecret)) {
            return res.status(400).json({ message: 'That code is not valid. Check your authenticator app and try again.' });
        }

        const recoveryCodes = mfa.generateRecoveryCodes();
        user.mfaEnabled = true;
        user.mfaEnrolledAt = new Date();
        user.mfaRecoveryCodes = recoveryCodes.map(mfa.hashRecoveryCode);
        await user.save();

        const payload = { message: 'Two-factor authentication enabled.', recoveryCodes };

        // Forced-enrollment path: swap the enroll token for a real session.
        if (req.user.purpose === 'mfa-enroll') {
            const context = await resolveWorkspaceContext(user.id, req.user.companyId ?? null);
            if (context) {
                const out = await completeLogin(req, res, user, context, {
                    isSystemAdmin: req.user.isSystemAdmin === true,
                    rememberMe: req.user.rememberMe === true,
                    mfaVerified: true,
                });
                return res.status(200).json({ ...payload, ...out });
            }
        }
        res.status(200).json(payload);
    } catch (error) {
        console.error('MFA enable error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/auth/mfa/disable  { code } - requires a current TOTP or recovery
// code (a stolen session alone must not be able to strip MFA). Admin-role
// users cannot disable their own MFA - it is mandatory for them.
exports.mfaDisable = async (req, res) => {
    try {
        const { code } = req.body || {};
        const user = await User.findByPk(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found.' });
        if (!user.mfaEnabled) {
            return res.status(409).json({ message: 'Two-factor authentication is not enabled.' });
        }

        const isSystemAdmin = await isUserSystemAdmin(user.id, user.email);
        const adminRole = isSystemAdmin || (req.user.companyId
            ? await hasTenantAdminRole(user.id, req.user.companyId)
            : false);
        if (adminRole) {
            return res.status(403).json({ message: 'Two-factor authentication is mandatory for administrator accounts and cannot be disabled.' });
        }

        let ok = mfa.verifyTotp(code, user.mfaSecret);
        if (!ok) ok = mfa.consumeRecoveryCode(code, user.mfaRecoveryCodes).ok;
        if (!ok) {
            return res.status(400).json({ message: 'That code is not valid.' });
        }

        user.mfaEnabled = false;
        user.mfaSecret = null;
        user.mfaEnrolledAt = null;
        user.mfaRecoveryCodes = null;
        await user.save();
        // No factor left to have proven - device trust falls with it.
        await trustedDevices.revokeAllTrust(user.id);
        res.status(200).json({ message: 'Two-factor authentication disabled.' });
    } catch (error) {
        console.error('MFA disable error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/auth/refresh - rotate the httpOnly cookie, mint a fresh 1h access
// token for the SAME workspace. The frontend interceptor calls this on 401.
exports.refreshSession = async (req, res) => {
    try {
        const row = await sessions.rotateSession(req, res);
        if (!row) {
            return res.status(401).json({ message: 'Session expired. Please log in again.' });
        }

        const user = await User.findByPk(row.userId, { attributes: ['id', 'email'] });
        if (!user) return res.status(401).json({ message: 'Session expired. Please log in again.' });

        let companyName = 'SYSTEM ADMINISTRATION';
        if (row.companyId) {
            const company = await Company.findByPk(row.companyId, { attributes: ['name'] });
            if (!company) return res.status(401).json({ message: 'Session expired. Please log in again.' });
            companyName = company.name;
        }

        const isSystemAdmin = await isUserSystemAdmin(user.id, user.email);
        const token = generateToken(user.id, user.email, row.companyId, companyName, isSystemAdmin, sessions.isRemembered(row));
        res.status(200).json({ token });
    } catch (error) {
        console.error('Refresh error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/auth/logout - revoke the session family + clear the cookie.
exports.logout = async (req, res) => {
    try {
        await sessions.revokeSession(req, res);
        res.status(200).json({ message: 'Signed out.' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ==========================================
// TENANT ADMIN: ROLE MANAGEMENT
// ==========================================
// 1. Get all Menus this Company is allowed to see (based on their subscriptions)
exports.getAvailableMenus = async (req, res) => {
    try {
        // Menus depend on the company's subscribed modules. companyId may be given
        // explicitly (Role Management picker) or default to the active company.
        const companyId = req.query.companyId || req.user.companyId;
        if (!companyId || !(await hasTenantAdminRole(req.user.id, companyId))) {
            return res.status(403).json({ message: "You don't have admin rights for that company." });
        }

        // Find which modules this club is subscribed to
        const subscriptions = await CompanyModule.findAll({ where: { companyId, isActive: true } });
        const moduleIds = subscriptions.map(sub => sub.moduleId);

        // Fetch the menus that belong to those specific modules
        const menus = await Menu.findAll({ 
            where: { moduleId: moduleIds },
            include: [{ model: Module, as: 'Module', attributes: ['name', 'icon'] }] // Include the module info for grouping in the UI
        });

        res.status(200).json(menus);
    } catch (error) {
        console.error("Error fetching available menus:", error);
        res.status(500).json({ message: "Failed to load menus" });
    }
};

// 2. Create a brand new Custom Role
exports.createRole = async (req, res) => {
    // A role is account-level. The caller names a company (explicitly, or their active
    // one) they can administer; the role is created under THAT company's account.
    const companyId = req.body.companyId || req.user.companyId;
    if (!companyId || !(await hasTenantAdminRole(req.user.id, companyId))) {
        return res.status(403).json({ message: "You don't have admin rights for that company." });
    }

    // We use a transaction because we are inserting into TWO tables (Role and RoleMenu)
    const transaction = await sequelize.transaction();
    try {
        const { roleName, menuIds } = req.body; // menuIds is an array of UUIDs sent from Angular checkboxes

        if (!roleName || !menuIds || menuIds.length === 0) {
            await transaction.rollback();
            return res.status(400).json({ message: "Role name and at least one menu are required." });
        }

        const company = await Company.findByPk(companyId, { attributes: ['accountId'], transaction });
        const accountId = company ? company.accountId : null;
        if (!accountId) {
            await transaction.rollback();
            return res.status(400).json({ message: "Could not resolve the account for that company." });
        }

        // A. Create the account-level Role.
        const newRole = await Role.create({
            accountId,
            name: roleName
        }, { transaction });

        // B. Map all the checked menus to this new role in the junction table
        const roleMenuData = menuIds.map(menuId => ({
            roleId: newRole.id,
            menuId: menuId
        }));
        await RoleMenu.bulkCreate(roleMenuData, { transaction });

        await transaction.commit();
        res.status(201).json({ message: "Role created successfully!", role: newRole });

    } catch (error) {
        await transaction.rollback();
        console.error("Error creating role:", error);
        res.status(500).json({ message: "Failed to create role" });
    }
};
