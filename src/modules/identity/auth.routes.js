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

// Tenant-scoped user management (Tenant Admin manages users within their company)
const tenantController = require('../saas/tenant.controller');
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

// 👇 Add your new registration route here
router.post('/register-lead', authController.registerLead);

// 👇 Add the new activation route
router.post('/activate', authController.activateAccount);

// Route to handle Google SSO
router.post('/google', authController.googleLogin);

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

        // 4. Create the Outbox Message in the same transaction
        await OutboxMessage.create({
            id: uuidv4(),
            type: 'UserProfileUpdated',
            payload: {
                email: userEmail,
                updatedFields: { fullName, phone, bio },
                timestamp: new Date().toISOString()
            }
        }, { transaction });

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
// 3. authController.getDashboardStats finally serves the data.
router.get('/company/dashboard-stats', authenticateToken, requireTenant, authController.getDashboardStats);

// 👇 ADD THESE TWO NEW ROUTES FOR ROLE MANAGEMENT 👇
router.get('/company/menus', authenticateToken, requireTenant, requireTenantAdmin, authController.getAvailableMenus);
router.post('/company/roles', authenticateToken, requireTenant, requireTenantAdmin, authController.createRole);

// --- TENANT USER MANAGEMENT (Tenant Admin only) ---
router.get('/company/roles', authenticateToken, requireTenant, requireTenantAdmin, tenantController.listTenantRoles);
router.get('/company/users', authenticateToken, requireTenant, requireTenantAdmin, tenantController.listTenantUsers);
router.post('/company/users', authenticateToken, requireTenant, requireTenantAdmin, tenantController.createTenantUser);
router.post('/company/users/assign-role', authenticateToken, requireTenant, requireTenantAdmin, tenantController.assignTenantUserRole);

// --- COMPANY (BUSINESS ENTITY) MANAGEMENT (Tenant Admin only) ---
// A subscriber's Tenant Admin can create additional companies under their account
// and choose which modules each company needs.
router.get('/company/available-modules', authenticateToken, requireTenant, requireTenantAdmin, tenantController.listAvailableModules);
router.get('/companies', authenticateToken, requireTenant, requireTenantAdmin, tenantController.listCompanies);
router.post('/companies', authenticateToken, requireTenant, requireTenantAdmin, tenantController.createCompany);

module.exports = router;
