// server.js

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// --- 1. Database Imports (Sequelize) ---
// Import the connection function and the Sequelize instance
const { connectDB, sequelize } = require('./src/config/db'); 

const User = require('./src/models/user.model'); 
const OutboxMessage = require('./src/models/outboxMessage.model'); // 👈 Add this line
const Account = require('./src/models/account.model');
const Company = require('./src/models/company.model');
const CompanyUser = require('./src/models/companyUser.model');
const Module = require('./src/models/module.model');
const Menu = require('./src/models/menu.model');
const CompanyModule = require('./src/models/companyModule.model');
const Role = require('./src/models/role.model');
const RoleMenu = require('./src/models/roleMenu.model');

const RegistrationLead = require('./src/models/registrationLead.model');

// --- DEFINE SAAS RELATIONSHIPS ---

// 1. Account -> Companies (One-to-Many)
Account.hasMany(Company, { foreignKey: 'accountId', as: 'Companies' });
Company.belongsTo(Account, { foreignKey: 'accountId', as: 'Account' });

// 2. User <-> Companies (Many-to-Many through CompanyUser)
User.belongsToMany(Company, { through: CompanyUser, foreignKey: 'userId', as: 'Companies' });
Company.belongsToMany(User, { through: CompanyUser, foreignKey: 'companyId', as: 'Users' });

// 3. Modules & Menus (System Level)
Module.hasMany(Menu, { foreignKey: 'moduleId', as: 'Menus' });
Menu.belongsTo(Module, { foreignKey: 'moduleId', as: 'Module' });

// 4. Company Subscriptions (Paywall)
Company.belongsToMany(Module, { through: CompanyModule, foreignKey: 'companyId', as: 'SubscribedModules' });
Module.belongsToMany(Company, { through: CompanyModule, foreignKey: 'moduleId', as: 'SubscribedCompanies' });

// 5. Tenant Roles (Workspace Level)
Company.hasMany(Role, { foreignKey: 'companyId', as: 'Roles' });
Role.belongsTo(Company, { foreignKey: 'companyId', as: 'Company' });

// 6. Role Permissions (Menu Access)
Role.belongsToMany(Menu, { through: RoleMenu, foreignKey: 'roleId', as: 'PermittedMenus' });
Menu.belongsToMany(Role, { through: RoleMenu, foreignKey: 'menuId', as: 'Roles' });

// 7. Assigning Roles to Users
Role.hasMany(CompanyUser, { foreignKey: 'roleId', as: 'AssignedUsers' });
CompanyUser.belongsTo(Role, { foreignKey: 'roleId', as: 'Role' });

const authRoutes = require('./src/routes/auth.routes');
const adminRoutes = require('./src/routes/admin.routes');
const { all } = require('axios');

// Load environment variables from .env file (used locally, ignored in Docker)
dotenv.config();

const app = express();

// --- 2. Middleware ---
// CORS Configuration: Allows requests from your Angular frontend
// Note: In a deployed environment, you should replace 'http://localhost:4200' 
// with the actual URL of your deployed Angular app.
const corsOptions = {
    origin: '*', // For development, allow all origins
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    //credentials: true,
};

app.use(cors(corsOptions));

// Express JSON: Parses incoming JSON payloads
app.use(express.json());

// ADD THIS LINE: Respond with "204 No Content" for favicon requests
app.get('/favicon.ico', (req, res) => res.status(204).end());

// --- 3. API Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

// Simple Health Check Route
app.get('/', (req, res) => {
    res.send('Login API is running!');
});

// --- 4. Server Startup (Non-Blocking) ---
// Start the Express server immediately to satisfy Cloud Run's port requirement.
const PORT = process.env.PORT || 8080; 

// IMPORTANT: Binding to '0.0.0.0' tells Node to listen on all network interfaces, 
// which is required for Docker and Cloud Run to route traffic properly.
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
    
    // Once the server is listening, attempt the DB connection in the background.
    initializeDB();
});

// --- 5. Database Initialization with Advisory Locks ---
async function initializeDB() {
    let lockAcquired = false;
    
    try {
        // 1. Establish the connection
        await sequelize.authenticate();
        console.log('PostgreSQL connection established successfully.');

        // 2. Grab the PostgreSQL Advisory Lock (ID: 999999)
        // Only one Cloud Run container can hold this at a time!
        console.log('Waiting for Database Sync Lock...');
        await sequelize.query('SELECT pg_advisory_lock(999999)');
        lockAcquired = true;
        console.log('Lock acquired. Syncing database schema...');

        // 3. Automatically sync the schema (safe because we hold the lock!)
        await sequelize.sync({ alter: true });
        console.log('Database schema synced successfully.');

        // 👇 ADD THIS EXACT LINE HERE to trigger the seeder! 👇
        await seedDatabase();

    } catch (error) {
        // Log the error but DO NOT crash the process
        console.error('Database initialization failed:', error);
    } finally {
        // 4. ALWAYS release the lock so other instances can boot up safely,
        // even if an error occurred during the sync process!
        if (lockAcquired) {
            try {
                await sequelize.query('SELECT pg_advisory_unlock(999999)');
                console.log('Database Sync Lock released.');
            } catch (unlockError) {
                console.error('Failed to release database lock:', unlockError);
            }
        }
    }
}

// --- DATABASE SEEDER ---
async function seedDatabase() {
    try {
        // 👇 TEMPORARY WIPE BLOCK
        console.log('🧹 Wiping old seed data...');
        await CompanyUser.update({ roleId: null }, { where: {} });
        await RoleMenu.destroy({ where: {} });
        await Menu.destroy({ where: {} });
        await CompanyModule.destroy({ where: {} });
        await Role.destroy({ where: {} });
        await Module.destroy({ where: {} });
        console.log('✨ Wipe complete!');
        // 👆 END WIPE BLOCK

        const moduleCount = await Module.count();
        if (moduleCount > 0) return;

        console.log('🌱 Starting Database Seeder...');

        // 1. Create Modules (Including the new SYSTEM module!)
        const coreModule = await Module.create({ name: 'Core Club Management', icon: 'business' });
        const golfModule = await Module.create({ name: 'Golf Management', icon: 'sports_golf' });
        const systemModule = await Module.create({ name: 'System Setup', icon: 'admin_panel_settings' });

        // 2. Create Menus
        const coreMenus = await Menu.bulkCreate([
            { name: 'Dashboard', route: '/dashboard', icon: 'dashboard', moduleId: coreModule.id },
            { name: 'Facilities Setup', route: '/facilities', icon: 'domain', moduleId: coreModule.id },
            { name: 'Booking Rule Setup', route: '/booking-rules', icon: 'rule', moduleId: coreModule.id },
            { name: 'Staff Management', route: '/staff', icon: 'people', moduleId: coreModule.id }
        ]);
        const golfMenus = await Menu.bulkCreate([
            { name: 'Tee Time Setup', route: '/golf/tee-times', icon: 'sports_golf', moduleId: golfModule.id }
        ]);
        const systemMenus = await Menu.bulkCreate([
            { name: 'Role Management', route: '/dashboard/roles', icon: 'badge', moduleId: systemModule.id },
            { name: 'User Management', route: '/dashboard/users', icon: 'manage_accounts', moduleId: systemModule.id }
        ]);

        // 3. Create SYSTEM Roles (companyId is NULL)
        const sysAdminRole = await Role.create({ companyId: null, name: 'System Admin' });
        const sysAccountRole = await Role.create({ companyId: null, name: 'Account Dept' });
        
        // Give System Admin access to System Menus
        await RoleMenu.bulkCreate(systemMenus.map(menu => ({ roleId: sysAdminRole.id, menuId: menu.id })));

        // 4. Setup the Test Tenant
        const testCompany = await Company.findOne(); 
        if (testCompany) {
            await CompanyModule.bulkCreate([
                { companyId: testCompany.id, moduleId: coreModule.id },
                { companyId: testCompany.id, moduleId: golfModule.id }
            ]);

            const tenantAdminRole = await Role.create({ companyId: testCompany.id, name: 'Tenant Admin' });
            const allTenantMenus = [...coreMenus, ...golfMenus];
            await RoleMenu.bulkCreate(allTenantMenus.map(m => ({ roleId: tenantAdminRole.id, menuId: m.id })));

            // Assign the test user to the Tenant Admin role
            const companyUser = await CompanyUser.findOne({ where: { companyId: testCompany.id } });
            if (companyUser) {
                companyUser.roleId = tenantAdminRole.id;
                await companyUser.save();
            }
        }

        // 5. Assign your Master Admin to the System Admin Role!
        const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim().toLowerCase()) || [];
        if (adminEmails.length > 0) {
            const masterUser = await User.findOne({ where: { email: adminEmails[0] } });
            if (masterUser) {
                // Notice companyId is null! This is a System User.
                await CompanyUser.findOrCreate({
                    where: { userId: masterUser.id, companyId: null },
                    defaults: { roleId: sysAdminRole.id }
                });
            }
        }

        console.log('🌳 Database Seeding Completed Successfully!');
    } catch (error) {
        console.error('❌ Seeding failed:', error);
    }
}