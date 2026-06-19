const User = require('../identity/user.model');
const Role = require('./role.model');
const Account = require('./account.model');
const Company = require('./company.model');
const CompanyUser = require('./companyUser.model');
const Menu = require('./menu.model');
const Module = require('./module.model');
const RoleMenu = require('./roleMenu.model');
const CompanyModule = require('./companyModule.model');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sequelize } = require('../../platform/db');

// --- 1. ROLE MANAGEMENT ---

// POST /api/admin/roles
// Body: { name, description?, companyId?, menuIds?: string[] }
// Creates the role and (optionally) grants it the selected menu permissions,
// both in a single transaction.
exports.createRole = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { name, description, companyId, menuIds } = req.body;

        if (!name) {
            await transaction.rollback();
            return res.status(400).json({ message: "Role name is required." });
        }

        const targetCompanyId = companyId || null;

        const existingRole = await Role.findOne({
            where: { name: name, companyId: targetCompanyId },
            transaction,
        });

        if (existingRole) {
            await transaction.rollback();
            return res.status(409).json({ message: "Role already exists for this workspace." });
        }

        const newRole = await Role.create({
            name,
            description,
            companyId: targetCompanyId,
        }, { transaction });

        // Grant the selected menu permissions via the RoleMenu junction table.
        if (Array.isArray(menuIds) && menuIds.length > 0) {
            const roleMenuData = menuIds.map(menuId => ({ roleId: newRole.id, menuId }));
            await RoleMenu.bulkCreate(roleMenuData, { transaction });
        }

        await transaction.commit();
        res.status(201).json({ message: "Role created successfully", role: newRole });
    } catch (error) {
        if (transaction && !transaction.finished) {
            await transaction.rollback();
        }
        console.error("Error creating role:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// GET /api/admin/roles?companyId=XYZ
// Returns roles with their granted menus (PermittedMenus) for display.
exports.getRoles = async (req, res) => {
    try {
        const targetCompanyId = req.query.companyId || null;

        const roles = await Role.findAll({
            where: { companyId: targetCompanyId },
            include: [{
                model: Menu,
                as: 'PermittedMenus',
                attributes: ['id', 'name'],
                through: { attributes: [] },
            }],
            order: [['name', 'ASC']],
        });
        res.status(200).json(roles);
    } catch (error) {
        console.error("Error fetching roles:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// GET /api/admin/modules
// Returns every module so the admin can flag which ones a new subscriber gets.
exports.listModules = async (req, res) => {
    try {
        const modules = await Module.findAll({
            attributes: ['id', 'name', 'icon'],
            order: [['name', 'ASC']],
        });
        res.status(200).json(modules);
    } catch (error) {
        console.error("Error fetching modules:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// GET /api/admin/menus
// Returns every menu (grouped by module via the included Module) so the admin
// can pick permissions when creating a system role. Unlike the tenant endpoint,
// this is NOT filtered by company subscription.
exports.listMenus = async (req, res) => {
    try {
        const menus = await Menu.findAll({
            include: [{ model: Module, as: 'Module', attributes: ['name', 'icon'] }],
            order: [['moduleId', 'ASC'], ['name', 'ASC']],
        });
        res.status(200).json(menus);
    } catch (error) {
        console.error("Error fetching menus:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// --- 2. USER MANAGEMENT ---

// GET /api/admin/users
// Lightweight user list to populate the "assign user to role" picker.
exports.listUsers = async (req, res) => {
    try {
        const users = await User.findAll({
            attributes: ['id', 'email', 'full_name', 'authMethod', 'createdAt'],
            order: [['createdAt', 'DESC']],
        });
        res.status(200).json(users);
    } catch (error) {
        console.error("Error listing users:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// POST /api/users
exports.createUser = async (req, res) => {
    try {
        const { email, password, fullName, phone } = req.body;

        if (!email || !password || !fullName) {
            return res.status(400).json({ message: "Email, password, and full name are required." });
        }

        const existingUser = await User.findOne({ where: { email: email.toLowerCase() } });
        if (existingUser) {
            return res.status(409).json({ message: "User with this email already exists." });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = await User.create({
            email: email.toLowerCase(),
            password: hashedPassword,
            full_name: fullName,
            phone: phone || null
        });

        newUser.password = undefined;

        res.status(201).json({ message: "User created successfully", user: newUser });
    } catch (error) {
        console.error("Error creating user:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// --- 3. ASSIGN USER TO ROLE ---

// POST /api/users/assign-role
exports.assignUserToRole = async (req, res) => {
    try {
        const { userId, roleId, companyId } = req.body;

        if (!userId || !roleId) {
            return res.status(400).json({ message: "User ID and Role ID are required." });
        }

        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        const role = await Role.findByPk(roleId);
        if (!role) {
            return res.status(404).json({ message: "Role not found." });
        }

        const targetCompanyId = companyId || null;

        const existingAssignment = await CompanyUser.findOne({
            where: { userId, companyId: targetCompanyId }
        });

        if (existingAssignment) {
            existingAssignment.roleId = roleId;
            await existingAssignment.save();
            return res.status(200).json({ message: "User role updated successfully.", assignment: existingAssignment });
        }

        const newAssignment = await CompanyUser.create({
            userId,
            roleId,
            companyId: targetCompanyId
        });

        res.status(200).json({ message: "User assigned to role successfully.", assignment: newAssignment });
    } catch (error) {
        console.error("Error assigning role:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// --- 4. PROVISION A SUBSCRIBER (SYSTEM ADMIN PORTAL) ---

// POST /api/admin/subscriptions
exports.createSubscription = async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
        const { email, password, fullName, companyName, subscriptionPlan, registrationNumber, timezone, phone, moduleIds } = req.body;

        if (!email || !password || !fullName || !companyName) {
            await transaction.rollback();
            return res.status(400).json({ message: "Email, password, full name, and company name are required." });
        }

        const existingUser = await User.findOne({ where: { email: email.toLowerCase() } });
        if (existingUser) {
            await transaction.rollback();
            return res.status(409).json({ message: "A user with this email already exists." });
        }

        const account = await Account.create({
            // The request still sends `companyName` (the subscriber's name); the
            // Account column was renamed to `subscriberName` to avoid confusion.
            subscriberName: companyName,
            subscriptionPlan: subscriptionPlan || 'BASIC',
            status: 'ACTIVE'
        }, { transaction });

        const company = await Company.create({
            accountId: account.id,
            name: companyName,
            registrationNumber: registrationNumber || null,
            timezone: timezone || 'Asia/Kuala_Lumpur',
            isActive: true
        }, { transaction });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await User.create({
            email: email.toLowerCase(),
            password: hashedPassword,
            full_name: fullName,
            phone: phone || null,
            isVerified: true,
            authMethod: 'local'
        }, { transaction });

        // Record this user as the subscriber's SuperUser (account owner): they
        // administer every company under the account, not just this first one.
        account.ownerUserId = user.id;
        await account.save({ transaction });

        // The subscriber's first user is the workspace owner: default them to a
        // per-company "Tenant Admin" role (scoped to this new company).
        const tenantAdminRole = await Role.create({
            companyId: company.id,
            name: 'Tenant Admin',
            description: 'Full administrative access to the company workspace.'
        }, { transaction });

        // Subscribe the company to the SELECTED modules and grant the Tenant Admin
        // all of those modules' menus. The set of modules is chosen per-subscriber
        // (independent of plan); include "System Setup" to let the Tenant Admin
        // manage tenant users and roles.
        const selectedModuleIds = Array.isArray(moduleIds) ? moduleIds : [];
        if (selectedModuleIds.length > 0) {
            await CompanyModule.bulkCreate(
                selectedModuleIds.map(moduleId => ({ companyId: company.id, moduleId, isActive: true })),
                { transaction }
            );

            const subscribedMenus = await Menu.findAll({
                where: { moduleId: selectedModuleIds },
                attributes: ['id'],
                transaction,
            });
            if (subscribedMenus.length > 0) {
                await RoleMenu.bulkCreate(
                    subscribedMenus.map(menu => ({ roleId: tenantAdminRole.id, menuId: menu.id })),
                    { transaction }
                );
            }
        }

        await CompanyUser.create({
            userId: user.id,
            companyId: company.id,
            roleId: tenantAdminRole.id,
            isActive: true
        }, { transaction });

        await transaction.commit();

        user.password = undefined;

        res.status(201).json({
            message: "Subscriber account created successfully!",
            data: {
                accountId: account.id,
                companyId: company.id,
                userId: user.id,
                email: user.email,
                roleId: tenantAdminRole.id,
                roleName: tenantAdminRole.name
            }
        });
    } catch (error) {
        if (transaction && !transaction.finished) {
            await transaction.rollback();
        }
        console.error("Subscription Creation Error:", error);
        res.status(500).json({ message: "Failed to create subscriber account." });
    }
};

// GET /api/admin/subscriptions
exports.listSubscriptions = async (req, res) => {
    try {
        const accounts = await Account.findAll({
            include: [{
                model: Company,
                as: 'Companies'
            }],
            order: [['createdAt', 'DESC']]
        });

        // Map subscriberName back to companyName to keep the frontend interface unchanged
        const mapped = accounts.map(a => ({
            ...a.toJSON(),
            companyName: a.subscriberName,
        }));
        res.status(200).json(mapped);
    } catch (error) {
        console.error("List Subscriptions Error:", error);
        res.status(500).json({ message: "Failed to fetch subscribers." });
    }
};

// --- 5. TENANT ADMIN MANAGEMENT (platform override) ---

// GET /api/admin/companies/:companyId/users
// List a specific company's users + their role (System Admin can view any company).
exports.listCompanyUsers = async (req, res) => {
    try {
        const { companyId } = req.params;
        const memberships = await CompanyUser.findAll({
            where: { companyId },
            include: [{ model: Role, as: 'Role', attributes: ['id', 'name'] }],
        });

        const userIds = memberships.map(m => m.userId);
        const users = await User.findAll({
            where: { id: userIds },
            attributes: ['id', 'email', 'full_name', 'authMethod'],
        });
        const userById = new Map(users.map(u => [u.id, u]));

        const result = memberships.map(m => {
            const u = userById.get(m.userId);
            return {
                id: m.userId,
                email: u ? u.email : null,
                full_name: u ? u.full_name : null,
                authMethod: u ? u.authMethod : null,
                roleId: m.roleId,
                roleName: m.Role ? m.Role.name : null,
            };
        });

        res.status(200).json(result);
    } catch (error) {
        console.error("Error listing company users:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// POST /api/admin/companies/:companyId/tenant-admin   Body: { userId }
// Transfer the company's Tenant Admin to a chosen member: demote any existing
// Tenant Admin(s), then promote the chosen user. Always leaves exactly the
// chosen user as Tenant Admin (no lockout, since it ends with one admin).
exports.setTenantAdmin = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { companyId } = req.params;
        const { userId } = req.body;

        if (!userId) {
            await transaction.rollback();
            return res.status(400).json({ message: "User ID is required." });
        }

        // Find or create the company's Tenant Admin role (older companies may lack it).
        const [tenantAdminRole] = await Role.findOrCreate({
            where: { companyId, name: 'Tenant Admin' },
            defaults: {
                companyId,
                name: 'Tenant Admin',
                description: 'Full administrative access to the company workspace.',
            },
            transaction,
        });

        const membership = await CompanyUser.findOne({ where: { userId, companyId }, transaction });
        if (!membership) {
            await transaction.rollback();
            return res.status(404).json({ message: "User is not a member of this company." });
        }

        // True transfer: demote any current Tenant Admin(s) in this company...
        await CompanyUser.update(
            { roleId: null },
            { where: { companyId, roleId: tenantAdminRole.id }, transaction }
        );

        // ...then promote the chosen user.
        membership.roleId = tenantAdminRole.id;
        await membership.save({ transaction });

        await transaction.commit();
        res.status(200).json({ message: "Tenant Admin transferred successfully.", roleId: tenantAdminRole.id });
    } catch (error) {
        if (transaction && !transaction.finished) {
            await transaction.rollback();
        }
        console.error("Error setting tenant admin:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};


