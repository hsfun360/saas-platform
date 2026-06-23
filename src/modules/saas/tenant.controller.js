// src/modules/saas/tenant.controller.js
//
// Tenant-scoped user & role management, performed BY a Tenant Admin WITHIN their
// own company. Every query is scoped to req.user.companyId (taken from the JWT),
// so a Tenant Admin can never see or touch another company's data.

const User = require('../identity/user.model');
const CompanyUser = require('./companyUser.model');
const Role = require('./role.model');
const Company = require('./company.model');
const Module = require('./module.model');
const CompanyModule = require('./companyModule.model');
const Menu = require('./menu.model');
const RoleMenu = require('./roleMenu.model');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../../platform/db');
const { hasTenantAdminRole } = require('./tenant');

// Resolve the Account a Tenant Admin belongs to. The JWT only carries the
// caller's active companyId, so we derive the accountId from that company.
// Returns null if the company can't be found.
async function resolveAccountId(companyId, transaction) {
    if (!companyId) return null;
    const company = await Company.findByPk(companyId, {
        attributes: ['id', 'accountId'],
        transaction,
    });
    return company ? company.accountId : null;
}

// Pick the company an operation targets: an explicit companyId the caller is
// allowed to administer (the account owner, or that company's Tenant Admin), or
// the caller's active company when none is given. This is what lets an account
// SuperUser manage users in ANY company of their subscriber from one screen,
// while a per-company Tenant Admin stays confined to their own company.
// Returns { companyId } on success, or { status, message } to return as an error.
async function resolveTargetCompany(req, explicitCompanyId) {
    const companyId = explicitCompanyId || req.user.companyId;
    if (!companyId) {
        return { status: 400, message: "No company specified." };
    }
    const allowed = await hasTenantAdminRole(req.user.id, companyId);
    if (!allowed) {
        return { status: 403, message: "You don't have admin rights for that company." };
    }
    return { companyId };
}

// GET /api/auth/company/roles[?companyId=]  -> roles defined for a company
exports.listTenantRoles = async (req, res) => {
    try {
        const target = await resolveTargetCompany(req, req.query.companyId);
        if (target.status) return res.status(target.status).json({ message: target.message });
        const companyId = target.companyId;

        const roles = await Role.findAll({
            where: { companyId },
            attributes: ['id', 'name', 'description'],
            order: [['name', 'ASC']],
        });
        res.status(200).json(roles);
    } catch (error) {
        console.error("Error listing tenant roles:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// GET /api/auth/company/users[?companyId=]  -> users in a company, with their role
exports.listTenantUsers = async (req, res) => {
    try {
        const target = await resolveTargetCompany(req, req.query.companyId);
        if (target.status) return res.status(target.status).json({ message: target.message });
        const companyId = target.companyId;

        const memberships = await CompanyUser.findAll({
            where: { companyId },
            include: [
                { model: Role, as: 'Role', attributes: ['id', 'name'] },
            ],
        });

        // Fetch the user records for these memberships.
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
        console.error("Error listing tenant users:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// POST /api/auth/company/users  -> create a user and place them in a company
// Body: { email, password, fullName, phone?, roleId?, companyId? }
exports.createTenantUser = async (req, res) => {
    const { email, password, fullName, phone, roleId, companyId: bodyCompanyId } = req.body;

    const target = await resolveTargetCompany(req, bodyCompanyId);
    if (target.status) return res.status(target.status).json({ message: target.message });
    const companyId = target.companyId;

    const transaction = await sequelize.transaction();
    try {
        if (!email || !password || !fullName) {
            await transaction.rollback();
            return res.status(400).json({ message: "Email, password, and full name are required." });
        }

        // If a role was chosen, it must belong to THIS company.
        if (roleId) {
            const role = await Role.findOne({ where: { id: roleId, companyId }, transaction });
            if (!role) {
                await transaction.rollback();
                return res.status(400).json({ message: "Selected role does not belong to your workspace." });
            }
        }

        const existingUser = await User.findOne({ where: { email: email.toLowerCase() }, transaction });
        if (existingUser) {
            await transaction.rollback();
            return res.status(409).json({ message: "A user with this email already exists." });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await User.create({
            email: email.toLowerCase(),
            password: hashedPassword,
            full_name: fullName,
            phone: phone || null,
            isVerified: true,
            authMethod: 'local',
        }, { transaction });

        await CompanyUser.create({
            userId: user.id,
            companyId,
            roleId: roleId || null,
            isActive: true,
        }, { transaction });

        await transaction.commit();

        res.status(201).json({
            message: "User created successfully",
            user: { id: user.id, email: user.email, full_name: user.full_name },
        });
    } catch (error) {
        if (transaction && !transaction.finished) {
            await transaction.rollback();
        }
        console.error("Error creating tenant user:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// POST /api/auth/company/users/assign-role  -> set a user's role within a company
// Body: { userId, roleId, companyId? }
exports.assignTenantUserRole = async (req, res) => {
    try {
        const { userId, roleId, companyId: bodyCompanyId } = req.body;

        if (!userId || !roleId) {
            return res.status(400).json({ message: "User ID and Role ID are required." });
        }

        const target = await resolveTargetCompany(req, bodyCompanyId);
        if (target.status) return res.status(target.status).json({ message: target.message });
        const companyId = target.companyId;

        // The role must belong to this company.
        const role = await Role.findOne({ where: { id: roleId, companyId } });
        if (!role) {
            return res.status(400).json({ message: "Selected role does not belong to your workspace." });
        }

        // The user must already be a member of this company.
        const membership = await CompanyUser.findOne({ where: { userId, companyId } });
        if (!membership) {
            return res.status(404).json({ message: "User is not a member of your workspace." });
        }

        // Last-admin lockout protection: don't allow demoting the company's only
        // Tenant Admin (that would leave the workspace with no one who can manage it).
        const tenantAdminRole = await Role.findOne({ where: { companyId, name: 'Tenant Admin' } });
        if (tenantAdminRole && membership.roleId === tenantAdminRole.id && roleId !== tenantAdminRole.id) {
            const adminCount = await CompanyUser.count({ where: { companyId, roleId: tenantAdminRole.id } });
            if (adminCount <= 1) {
                return res.status(409).json({
                    message: "Cannot remove the last Tenant Admin. Assign another Tenant Admin first.",
                });
            }
        }

        membership.roleId = roleId;
        await membership.save();

        res.status(200).json({ message: "User role updated successfully." });
    } catch (error) {
        console.error("Error assigning tenant user role:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// POST /api/auth/company/users/revoke  -> remove a user from a company
// Body: { userId, companyId? }  (deletes the CompanyUser link; global identity
// and the user's access to OTHER companies are untouched.)
exports.revokeTenantUser = async (req, res) => {
    try {
        const { userId, companyId: bodyCompanyId } = req.body;
        if (!userId) {
            return res.status(400).json({ message: "User ID is required." });
        }

        const target = await resolveTargetCompany(req, bodyCompanyId);
        if (target.status) return res.status(target.status).json({ message: target.message });
        const companyId = target.companyId;

        const membership = await CompanyUser.findOne({ where: { userId, companyId } });
        if (!membership) {
            return res.status(404).json({ message: "User is not a member of that company." });
        }

        // Last-admin lockout protection: don't remove the company's only Tenant
        // Admin, or the workspace would be left with no one who can manage it.
        const tenantAdminRole = await Role.findOne({ where: { companyId, name: 'Tenant Admin' } });
        if (tenantAdminRole && membership.roleId === tenantAdminRole.id) {
            const adminCount = await CompanyUser.count({ where: { companyId, roleId: tenantAdminRole.id } });
            if (adminCount <= 1) {
                return res.status(409).json({
                    message: "Cannot remove the last Tenant Admin. Assign another Tenant Admin first.",
                });
            }
        }

        await membership.destroy();
        res.status(200).json({ message: "User removed from this company." });
    } catch (error) {
        console.error("Error revoking tenant user:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// --- COMPANY (BUSINESS ENTITY) MANAGEMENT (Tenant Admin only) ---
//
// A subscriber's Tenant Admin can create additional companies (physical business
// entities) under their own Account and choose which modules each one needs.
// Everything is scoped to the caller's Account (derived from req.user.companyId),
// so a Tenant Admin can never create or list companies for another subscriber.

// GET /api/auth/company/available-modules
// All system modules the admin can pick from when creating a company.
exports.listAvailableModules = async (req, res) => {
    try {
        const modules = await Module.findAll({
            attributes: ['id', 'name', 'icon', 'description'],
            order: [['name', 'ASC']],
        });
        res.status(200).json(modules);
    } catch (error) {
        console.error("Error listing available modules:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// GET /api/auth/companies  -> companies under the caller's Account
exports.listCompanies = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) {
            return res.status(404).json({ message: "Your account could not be resolved." });
        }

        const companies = await Company.findAll({
            where: { accountId },
            include: [{ model: Module, as: 'SubscribedModules', attributes: ['id', 'name', 'icon'], through: { attributes: [] } }],
            order: [['createdAt', 'DESC']],
        });

        res.status(200).json(companies);
    } catch (error) {
        console.error("Error listing companies:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// POST /api/auth/companies  -> create a company under the caller's Account
// Body: { name, registrationNumber?, timezone?, moduleIds?: string[] }
exports.createCompany = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const accountId = await resolveAccountId(req.user.companyId, transaction);
        if (!accountId) {
            await transaction.rollback();
            return res.status(404).json({ message: "Your account could not be resolved." });
        }

        const { name, registrationNumber, timezone, moduleIds } = req.body;
        if (!name || !name.trim()) {
            await transaction.rollback();
            return res.status(400).json({ message: "Company name is required." });
        }

        // Validate the selected modules actually exist (any system module is allowed).
        const selectedModuleIds = Array.isArray(moduleIds) ? [...new Set(moduleIds)] : [];
        if (selectedModuleIds.length > 0) {
            const found = await Module.count({ where: { id: selectedModuleIds }, transaction });
            if (found !== selectedModuleIds.length) {
                await transaction.rollback();
                return res.status(400).json({ message: "One or more selected modules do not exist." });
            }
        }

        const company = await Company.create({
            accountId,
            name: name.trim(),
            registrationNumber: registrationNumber || null,
            timezone: timezone || 'Asia/Kuala_Lumpur',
            isActive: true,
        }, { transaction });

        // Seed a per-company Tenant Admin role (mirrors how the first company is
        // provisioned in admin.createSubscription).
        const tenantAdminRole = await Role.create({
            companyId: company.id,
            name: 'Tenant Admin',
            description: 'Full administrative access to the company workspace.',
        }, { transaction });

        // Subscribe the company to the selected modules and grant the Tenant Admin
        // role access to those modules' menus.
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

        // Make the creating admin a Tenant Admin of the new company so they can
        // switch into it and manage it. (companyId is part of the CompanyUser
        // unique key, so this never collides with their existing membership.)
        await CompanyUser.create({
            userId: req.user.id,
            companyId: company.id,
            roleId: tenantAdminRole.id,
            isActive: true,
        }, { transaction });

        await transaction.commit();

        res.status(201).json({
            message: "Company created successfully.",
            company: {
                id: company.id,
                name: company.name,
                registrationNumber: company.registrationNumber,
                timezone: company.timezone,
                isActive: company.isActive,
            },
        });
    } catch (error) {
        if (transaction && !transaction.finished) {
            await transaction.rollback();
        }
        console.error("Error creating company:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// PUT /api/auth/companies/:companyId/modules  -> set a company's modules to an
// exact set (diff-based add/revoke). Body: { moduleIds: string[] }.
//
// Added modules are subscribed and their menus granted to the company's Tenant
// Admin role. Revoked modules are HARD-removed: the CompanyModule link is deleted
// and those modules' menus are stripped from EVERY role in the company, so no one
// retains access to a module the company no longer has.
exports.updateCompanyModules = async (req, res) => {
    const target = await resolveTargetCompany(req, req.params.companyId);
    if (target.status) return res.status(target.status).json({ message: target.message });
    const companyId = target.companyId;

    const desired = Array.isArray(req.body.moduleIds) ? [...new Set(req.body.moduleIds)] : [];

    const transaction = await sequelize.transaction();
    try {
        // Every requested module must exist.
        if (desired.length > 0) {
            const found = await Module.count({ where: { id: desired }, transaction });
            if (found !== desired.length) {
                await transaction.rollback();
                return res.status(400).json({ message: "One or more selected modules do not exist." });
            }
        }

        const current = await CompanyModule.findAll({ where: { companyId }, attributes: ['moduleId'], transaction });
        const currentIds = current.map(c => c.moduleId);
        const toAdd = desired.filter(id => !currentIds.includes(id));
        const toRemove = currentIds.filter(id => !desired.includes(id));

        // --- ADD: subscribe + grant the new modules' menus to the Tenant Admin role ---
        if (toAdd.length > 0) {
            await CompanyModule.bulkCreate(
                toAdd.map(moduleId => ({ companyId, moduleId, isActive: true })),
                { transaction }
            );

            const tenantAdminRole = await Role.findOne({ where: { companyId, name: 'Tenant Admin' }, transaction });
            if (tenantAdminRole) {
                const menus = await Menu.findAll({ where: { moduleId: toAdd }, attributes: ['id'], transaction });
                if (menus.length > 0) {
                    const already = await RoleMenu.findAll({
                        where: { roleId: tenantAdminRole.id, menuId: menus.map(m => m.id) },
                        attributes: ['menuId'],
                        transaction,
                    });
                    const have = new Set(already.map(r => r.menuId));
                    const grants = menus.filter(m => !have.has(m.id)).map(m => ({ roleId: tenantAdminRole.id, menuId: m.id }));
                    if (grants.length > 0) await RoleMenu.bulkCreate(grants, { transaction });
                }
            }
        }

        // --- REVOKE (hard): delete the link + strip menus from ALL roles in the company ---
        if (toRemove.length > 0) {
            await CompanyModule.destroy({ where: { companyId, moduleId: toRemove }, transaction });

            const roles = await Role.findAll({ where: { companyId }, attributes: ['id'], transaction });
            const roleIds = roles.map(r => r.id);
            if (roleIds.length > 0) {
                const menus = await Menu.findAll({ where: { moduleId: toRemove }, attributes: ['id'], transaction });
                const menuIds = menus.map(m => m.id);
                if (menuIds.length > 0) {
                    await RoleMenu.destroy({ where: { roleId: roleIds, menuId: menuIds }, transaction });
                }
            }
        }

        await transaction.commit();
        res.status(200).json({ message: "Company modules updated.", added: toAdd.length, removed: toRemove.length });
    } catch (error) {
        if (transaction && !transaction.finished) {
            await transaction.rollback();
        }
        console.error("Error updating company modules:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// PUT /api/auth/companies/:companyId  -> update a company's profile / billing details
// Body may include any of: name, registrationNumber, taxRegistrationNumber, email,
// phone, website, addressLine1, addressLine2, city, state, postalCode, country,
// timezone. Only provided fields are changed; an empty string clears a field.
exports.updateCompany = async (req, res) => {
    const target = await resolveTargetCompany(req, req.params.companyId);
    if (target.status) return res.status(target.status).json({ message: target.message });

    try {
        const company = await Company.findByPk(target.companyId);
        if (!company) {
            return res.status(404).json({ message: "Company not found." });
        }

        const b = req.body;

        // Name is required: if it's being changed it must be non-empty.
        if (b.name !== undefined) {
            if (!b.name || !b.name.trim()) {
                return res.status(400).json({ message: "Company name is required." });
            }
            company.name = b.name.trim();
        }

        // Optional profile fields: set when provided; empty string clears to null.
        const fields = [
            'registrationNumber', 'taxRegistrationNumber', 'email', 'phone', 'website',
            'addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'country', 'timezone',
        ];
        for (const f of fields) {
            if (b[f] !== undefined) {
                const v = typeof b[f] === 'string' ? b[f].trim() : b[f];
                company[f] = v === '' ? null : v;
            }
        }
        // timezone is NOT NULL — never let it be cleared.
        if (!company.timezone) company.timezone = 'Asia/Kuala_Lumpur';

        await company.save();

        res.status(200).json({ message: "Company profile updated.", company });
    } catch (error) {
        console.error("Error updating company:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// POST /api/auth/company/collaborators  -> add an EXISTING user to the caller's company
// Body: { email, roleId }
//
// Fast path for the SAME-ACCOUNT case: a Tenant Admin can directly add a person
// who already belongs to their subscriber account as a collaborator on another
// of the account's companies (with a possibly different role). Cross-account /
// global identities go through the consent-based invitation flow instead
// (see invitation.controller.js), so no admin can attach an outsider unilaterally.
exports.addCollaborator = async (req, res) => {
    const { email, roleId, companyId: bodyCompanyId } = req.body;

    const target = await resolveTargetCompany(req, bodyCompanyId);
    if (target.status) return res.status(target.status).json({ message: target.message });
    const companyId = target.companyId;

    const transaction = await sequelize.transaction();
    try {
        const accountId = await resolveAccountId(companyId, transaction);
        if (!accountId) {
            await transaction.rollback();
            return res.status(404).json({ message: "Your account could not be resolved." });
        }

        if (!email || !email.trim()) {
            await transaction.rollback();
            return res.status(400).json({ message: "Email is required." });
        }

        // If a role was chosen, it must belong to THIS company.
        if (roleId) {
            const role = await Role.findOne({ where: { id: roleId, companyId }, transaction });
            if (!role) {
                await transaction.rollback();
                return res.status(400).json({ message: "Selected role does not belong to your workspace." });
            }
        }

        // Resolve the user (if any) and whether they already belong to this
        // subscriber account (member of at least one company under it).
        const user = await User.findOne({
            where: { email: email.toLowerCase() },
            attributes: ['id', 'email', 'full_name'],
            transaction,
        });

        let sharesAccount = false;
        if (user) {
            const memberships = await CompanyUser.findAll({ where: { userId: user.id }, attributes: ['companyId'], transaction });
            const memberCompanyIds = memberships.map(m => m.companyId).filter(Boolean);
            sharesAccount = memberCompanyIds.length > 0 && await Company.count({
                where: { id: memberCompanyIds, accountId },
                transaction,
            }) > 0;
        }

        // ONE generic outcome whether the email is unknown OR belongs to another
        // account — so this endpoint can't be used to probe which emails exist on
        // the platform. Both cases route the admin to the consent-based invite.
        if (!user || !sharesAccount) {
            await transaction.rollback();
            return res.status(422).json({
                message: "That person isn't in your account yet. Use \"Invite Collaborator\" to invite them by email.",
            });
        }

        // Already a collaborator on this company?
        const already = await CompanyUser.findOne({ where: { userId: user.id, companyId }, transaction });
        if (already) {
            await transaction.rollback();
            return res.status(409).json({ message: "That person is already a collaborator on this company." });
        }

        await CompanyUser.create({
            userId: user.id,
            companyId,
            roleId: roleId || null,
            isActive: true,
        }, { transaction });

        await transaction.commit();

        res.status(201).json({
            message: "Collaborator added to this company.",
            user: { id: user.id, email: user.email, full_name: user.full_name },
        });
    } catch (error) {
        if (transaction && !transaction.finished) {
            await transaction.rollback();
        }
        console.error("Error adding collaborator:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
