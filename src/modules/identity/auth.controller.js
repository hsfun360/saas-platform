// src/controllers/auth.controller.js
const User = require('./user.model'); // <--- ADD THIS LINE
const OutboxMessage = require('../../platform/outboxMessage.model');
const RegistrationLead = require('../saas/registrationLead.model');
const Account = require('../saas/account.model');
const Company = require('../saas/company.model');
const CompanyUser = require('../saas/companyUser.model');
const Role = require('../saas/role.model');
const Menu = require('../saas/menu.model');

const Module = require('../saas/module.model');
const CompanyModule = require('../saas/companyModule.model');
const RoleMenu = require('../saas/roleMenu.model');
const { isUserSystemAdmin } = require('../saas/systemAdmin');

const crypto = require('crypto'); // Built into Node.js, no npm install needed

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

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

// Updated token generation to include email for better debugging and potential future use
const generateToken = (userId, email, companyId=null, companyName=null, isSystemAdmin=false) => {
    // We now include BOTH id and email in the payload
    return jwt.sign(
        { 
            id: userId, 
            email: email,
            companyId: companyId,
            companyName: companyName,
            isSystemAdmin: isSystemAdmin
         }, 
         getPrivateKey(),
         {
            algorithm: 'RS256',
            expiresIn: '24h', // Token expires in 24 hours for better security
         }
    );
};


const storage = new Storage(); // Use default credentials when on Cloud Run
const bucket = storage.bucket('membership-app-avatars-123');

// ----------------------------------------------------
// A. Register New User (Local Strategy)
// ----------------------------------------------------
exports.registerUser = async (req, res) => {
    const { email, password } = req.body;

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

        // 4. Generate a random, secure token (e.g., 'a1b2c3d4...')
        const verificationToken = crypto.randomBytes(32).toString('hex');

        // 5. Create the user as Unverified
        user = await User.create({
            email,
            password: hashedPassword,
            authMethod: 'local',
            isVerified: false,
            verificationToken: verificationToken
        }, { transaction });

        // 6. Create the Activation Link (Pointing to your Cloud Run API)
        const activationLink = `https://login-api-148523901156.asia-southeast1.run.app/api/auth/verify/${verificationToken}`;
        console.log(`[AUTH CONTROLLER] Activation link for ${email}: ${activationLink}`);

        // 7. Queue the Outbox Message
        await OutboxMessage.create({
            id: uuidv4(),
            type: 'UserRegistered',
            payload: { email, activationLink }
        }, { transaction });

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
        // 1. Extract credentials and optional workspace selection
        const { email, password, selectedCompanyId } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        // 🌟 PRO-TIP: Automatically remove accidental spaces and lowercase the email
        const cleanEmail = email.trim().toLowerCase();

        // 2. Find the user
        const user = await User.findOne({ where: { email: cleanEmail } });
        if (!user) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        // 🛡️ SAFETY CHECK: If they registered with Google, they don't have a password!
        if (!user.password) {
            return res.status(400).json({ message: "Please use 'Log in with Google' for this account." });
        }

        // 3. Verify Password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        // --- MASTER RBAC LOGIN LOGIC ---
        
        // Check if they are a Master Admin
        // DB-backed system-admin check (System Admin role), with ADMIN_EMAILS break-glass.
        const isSystemAdmin = await isUserSystemAdmin(user.id, user.email);

        // Find all workspaces this user belongs to
        let workspaces = await CompanyUser.findAll({ where: { userId: user.id } });

        // If they clicked a workspace on the UI, filter the array
        if (selectedCompanyId) {
            const targetId = selectedCompanyId === 'SYSTEM' ? null : selectedCompanyId;
            workspaces = workspaces.filter(ws => ws.companyId === targetId);
        }

        // SCENARIO A: NO WORKSPACE
        if (workspaces.length === 0) {
            return res.status(403).json({ message: "Account has no associated workspaces." });
        }

        // SCENARIO B: MULTIPLE WORKSPACES (They need to choose!)
        if (workspaces.length > 1) {
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
        let companyId = null;
        let companyName = 'SYSTEM ADMINISTRATION'; 
        
        if (workspace.companyId !== null) {
            const company = await Company.findByPk(workspace.companyId);
            companyId = company.id;
            companyName = company.name;
        }

        let allowedMenus = [];
        let assignedRoleName = 'User'; 

        if (workspace.roleId) {
            const userRole = await Role.findByPk(workspace.roleId, {
                include: [{ 
                    model: Menu, 
                    as: 'PermittedMenus',
                    include: [{ model: Module, as: 'Module' }] 
                }]
            });

            if (userRole) {
                assignedRoleName = userRole.name; 
                if (userRole.PermittedMenus) {
                    allowedMenus = userRole.PermittedMenus.map(m => ({
                        name: m.name,
                        route: m.route,
                        icon: m.icon,
                        moduleName: m.Module ? m.Module.name : 'Core Club Management',
                        moduleIcon: m.Module ? m.Module.icon : 'business'
                    }));
                }
            }
        }

        // Generate token and respond
        const loginToken = generateToken(user.id, user.email, companyId, companyName, isSystemAdmin);

        res.status(200).json({ 
            message: "Login successful", 
            token: loginToken,
            email: user.email,
            fullName: user.full_name || 'User',
            profilePicture: user.profilePicture || null,
            menus: allowedMenus,
            roleName: assignedRoleName 
        });

    } catch (error) {
        console.error("Standard Login error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

exports.verifyEmail = async (req, res) => {
    const { token } = req.params;

    try {
        const user = await User.findOne({ where: { verificationToken: token } });

        if (!user) {
            return res.status(400).send('<h1>Invalid or Expired Activation Link</h1>');
        }

        // Verify the user and clear the token
        user.isVerified = true;
        user.verificationToken = null;
        await user.save();

        // Redirect them back to your Angular login page with a success flag
        // (Change this to your actual deployed Angular URL later!)
        res.redirect('http://localhost:4200/login?verified=true'); 

    } catch (error) {
        console.error(error);
        res.status(500).send('<h1>Server Error</h1>');
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

        // 2. Find all workspaces this user belongs to
        let workspaces = await CompanyUser.findAll({ where: { userId: user.id } });

        // 3. If they clicked a workspace on the UI, filter the array down to JUST that one!
        if (selectedCompanyId) {
            const targetId = selectedCompanyId === 'SYSTEM' ? null : selectedCompanyId;
            workspaces = workspaces.filter(ws => ws.companyId === targetId);
        }

        // ==========================================
        // SCENARIO A: NO WORKSPACE
        // ==========================================
        if (workspaces.length === 0) {
            return res.status(403).json({ message: "Account has no associated workspaces." });
        }

        // ==========================================
        // SCENARIO B: MULTIPLE WORKSPACES (They need to choose!)
        // ==========================================
        if (workspaces.length > 1) {
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
        
        let companyId = null;
        let companyName = 'SYSTEM ADMINISTRATION'; 
        
        if (workspace.companyId !== null) {
            const company = await Company.findByPk(workspace.companyId);
            companyId = company.id;
            companyName = company.name;
        }

        let allowedMenus = [];
        let assignedRoleName = 'User'; 

        if (workspace.roleId) {
            const userRole = await Role.findByPk(workspace.roleId, {
                include: [{ 
                    model: Menu, 
                    as: 'PermittedMenus',
                    include: [{ model: Module, as: 'Module' }] 
                }]
            });

            if (userRole) {
                assignedRoleName = userRole.name; 
                if (userRole.PermittedMenus) {
                    allowedMenus = userRole.PermittedMenus.map(m => ({
                        name: m.name,
                        route: m.route,
                        icon: m.icon,
                        moduleName: m.Module ? m.Module.name : 'Core Club Management',
                        moduleIcon: m.Module ? m.Module.icon : 'business'
                    }));
                }
            }
        }

        const loginToken = generateToken(user.id, user.email, companyId, companyName, isSystemAdmin);

        // 5. Send the token and user info back to Angular
        res.json({
            message: 'Google login successful',
            token: loginToken,
            email: user.email,
            fullName: user.full_name, // Note: adjust to 'fullName' if your model uses camelCase
            menus: allowedMenus,
            roleName: assignedRoleName,
            profilePicture: user.profilePicture
        });

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

        // 3. Generate Token & Commit
        const isSystemAdmin = await isUserSystemAdmin(user.id, user.email);
        const token = generateToken(user.id, user.email, null, null, isSystemAdmin);
        await transaction.commit();

        // 4. Send back to Angular
        res.json({
            message: 'Microsoft login successful',
            token,
            email: user.email,
            fullName: user.full_name,
            profilePicture: user.profilePicture
        });

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

        // Optional: If they signed up with Google, they shouldn't reset their password here
        if (user.authMethod === 'google') {
            await transaction.rollback();
            return res.status(400).json({ message: 'This account uses Google Login. Please sign in with Google.' });
        } else if (user.authMethod === 'microsoft') {
            await transaction.rollback();
            return res.status(400).json({ message: 'This account uses Microsoft Login. Please sign in with Microsoft.' });
        }

        // 3. Generate a secure random token (using the crypto library you already imported)
        const resetToken = crypto.randomBytes(32).toString('hex');
        
        // 4. Set token to expire in 1 hour
        const tokenExpiry = new Date(Date.now() + 3600000); 

        // 5. Save the token to the user's database record
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = tokenExpiry;
        await user.save({ transaction });

        // 6. Generate the reset link (This points back to a new page we will build in Angular!)
        const resetLink = `http://localhost:4200/reset-password?token=${resetToken}`;

        // 7. Create the Outbox Message to trigger your email worker
        await OutboxMessage.create({
            id: uuidv4(),
            type: 'PasswordResetRequested',
            payload: { 
                email: user.email, 
                resetLink: resetLink 
            }
        }, { transaction });

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

    // 1. Start a transaction
    const transaction = await sequelize.transaction();

    try {
        // 2. Find the user (Notice we pass the transaction here!)
        const user = await User.findOne({ where: { resetPasswordToken: token }, transaction });

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

        // 👇 4. ADDED: Create the Success Email Event
        await OutboxMessage.create({
            id: uuidv4(),
            type: 'PasswordResetSuccess',
            payload: { email: user.email } // We only need the email for this one
        }, { transaction });

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

        // 3. Create a reference to the file in your bucket
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

// --- CHANGE PASSWORD ---
exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id; // securely grabbed from the JWT token

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

        // 5. Save the new hashed password to the database
        await User.update(
            { password: hashedNewPassword },
            { where: { id: userId } }
        );

        console.log(`[SECURITY] Password changed successfully for User ID: ${userId}`);

        // 6. Send success response back to Angular
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

    try {
        // 2. Check if this email already fully exists in the main system
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: 'An account with this email already exists.' });
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
        const activationLink = `http://localhost:4200/setup-password?token=${registrationToken}`;

        // 7. MOCK EMAIL SENDING (Replace this with SendGrid/Mailgun later)
        console.log('\n=============================================');
        console.log(`🚀 NEW LEAD CAPTURED: ${email} from ${country || 'Unknown'}`);
        console.log(`📧 SENDING EMAIL TO: ${email}`);
        console.log(`🔗 ACTIVATION LINK: ${activationLink}`);
        console.log('=============================================\n');

        // 7. DELEGATE EMAIL TO THE OUTBOX WORKER
        await OutboxMessage.create({
            type: 'AccountRegistered', // 👈 Distinct event type for SaaS Leads!
            payload: { 
                email: email, 
                companyName: companyName, // 👈 Pass the company name for a personalized email
                activationLink: activationLink 
            },
            status: 'PENDING'
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

        // A. Create the Billing Account
        const account = await Account.create({
            companyName: companyName,
            subscriptionPlan: subscriptionPlan || 'BASIC',
            status: 'ACTIVE'
        }, { transaction });

        // B. Create the Company / Tenant
        const company = await Company.create({
            accountId: account.id,
            name: companyName,
        }, { transaction });

        // C. Create the Global User
        const user = await User.create({
            email,
            password: hashedPassword,
            full_name: name,
            authMethod: 'local',
            isVerified: true, // They verified their email by clicking the link!
            verificationToken: null
        }, { transaction });

        // D. Link the User to the Company as the "owner"
        await CompanyUser.create({
            userId: user.id,
            companyId: company.id,
            role: 'owner' // This user is the top-level admin for this tenant
        }, { transaction });

        // E. Close the loop on the Lead Table (Analytics)
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

        // F. Fire an Event for other microservices (Optional but highly recommended)
        await OutboxMessage.create({
            id: uuidv4(),
            type: 'TenantProvisioned',
            payload: { accountId: account.id, companyId: company.id, ownerEmail: email }
        }, { transaction });

        // ==========================================
        // 4. COMMIT EVERYTHING
        // ==========================================
        await transaction.commit();

        // 5. Instantly log them in! 
        // We generate a standard JWT so Angular bypasses the login screen
        const loginToken = generateToken(user.id, user.email, company.id, company.name, false);

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

// --- SAAS DASHBOARD TEST ---
exports.getDashboardStats = async (req, res) => {
    try {
        // 1. Grab the exact company ID from the token!
        const companyId = req.user.companyId;

        // 2. Generate some dummy data that "belongs" to this company
        const stats = {
            companyId: companyId, // Echoing it back to prove the backend knows who they are!
            totalMembers: Math.floor(Math.random() * 100) + 10,
            activeProjects: Math.floor(Math.random() * 15) + 1,
            monthlyRevenue: "$" + (Math.floor(Math.random() * 5000) + 1000)
        };

        // 3. Send it back to Angular
        res.status(200).json(stats);
        
    } catch (error) {
        console.error("Dashboard Stats Error:", error);
        res.status(500).json({ message: "Failed to fetch stats" });
    }
};


// ==========================================
// TENANT ADMIN: ROLE MANAGEMENT
// ==========================================
// 1. Get all Menus this Company is allowed to see (based on their subscriptions)
exports.getAvailableMenus = async (req, res) => {
    try {
        const companyId = req.user.companyId;

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
    // We use a transaction because we are inserting into TWO tables (Role and RoleMenu)
    const transaction = await sequelize.transaction();
    try {
        const companyId = req.user.companyId;
        const { roleName, menuIds } = req.body; // menuIds is an array of UUIDs sent from Angular checkboxes

        if (!roleName || !menuIds || menuIds.length === 0) {
            return res.status(400).json({ message: "Role name and at least one menu are required." });
        }

        // A. Create the actual Role isolated to this specific company
        const newRole = await Role.create({ 
            companyId: companyId, 
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
