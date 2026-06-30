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
const Invitation = require('./invitation.model');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../../platform/db');
const { hasTenantAdminRole } = require('./tenant');
const { isAccountOwner } = require('./account');

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

// GET /api/auth/company/roles/:roleId[?companyId=]  -> a single role with the exact
// set of menu IDs it grants, so the Role Management screen can prefill its edit form.
exports.getTenantRole = async (req, res) => {
    try {
        const target = await resolveTargetCompany(req, req.query.companyId);
        if (target.status) return res.status(target.status).json({ message: target.message });

        const role = await Role.findOne({
            where: { id: req.params.roleId, companyId: target.companyId },
            attributes: ['id', 'name', 'description'],
        });
        if (!role) return res.status(404).json({ message: "Role not found." });

        const grants = await RoleMenu.findAll({
            where: { roleId: role.id },
            attributes: ['menuId'],
        });

        res.status(200).json({
            id: role.id,
            name: role.name,
            description: role.description,
            menuIds: grants.map(g => g.menuId),
        });
    } catch (error) {
        console.error("Error fetching tenant role:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// PUT /api/auth/company/roles/:roleId  -> update a role's name/description and its
// menu permissions to an exact set (diff-based add/revoke).
// Body: { roleName?, description?, menuIds: string[], companyId? }.
// The built-in "Tenant Admin" role is system-managed and rejected here so its
// permissions can never be narrowed (which could lock the admin out).
exports.updateTenantRole = async (req, res) => {
    const target = await resolveTargetCompany(req, req.body.companyId);
    if (target.status) return res.status(target.status).json({ message: target.message });
    const companyId = target.companyId;

    const transaction = await sequelize.transaction();
    try {
        const role = await Role.findOne({ where: { id: req.params.roleId, companyId }, transaction });
        if (!role) {
            await transaction.rollback();
            return res.status(404).json({ message: "Role not found." });
        }
        if (role.name === 'Tenant Admin') {
            await transaction.rollback();
            return res.status(400).json({ message: "The Tenant Admin role is managed by the system and can't be edited." });
        }

        const desired = Array.isArray(req.body.menuIds) ? [...new Set(req.body.menuIds)] : [];
        if (desired.length === 0) {
            await transaction.rollback();
            return res.status(400).json({ message: "A role must keep at least one menu permission." });
        }
        const found = await Menu.count({ where: { id: desired }, transaction });
        if (found !== desired.length) {
            await transaction.rollback();
            return res.status(400).json({ message: "One or more selected menus do not exist." });
        }

        // Update the name/description only when provided. An empty description
        // string clears it; an empty/whitespace name is ignored (kept as-is).
        const updates = {};
        if (typeof req.body.roleName === 'string' && req.body.roleName.trim()) {
            updates.name = req.body.roleName.trim();
        }
        if (typeof req.body.description === 'string') {
            updates.description = req.body.description.trim() || null;
        }
        if (Object.keys(updates).length > 0) await role.update(updates, { transaction });

        // Diff the granted menus and apply the minimal add/remove.
        const current = await RoleMenu.findAll({ where: { roleId: role.id }, attributes: ['menuId'], transaction });
        const currentIds = current.map(c => c.menuId);
        const toAdd = desired.filter(id => !currentIds.includes(id));
        const toRemove = currentIds.filter(id => !desired.includes(id));
        if (toAdd.length > 0) {
            await RoleMenu.bulkCreate(toAdd.map(menuId => ({ roleId: role.id, menuId })), { transaction });
        }
        if (toRemove.length > 0) {
            await RoleMenu.destroy({ where: { roleId: role.id, menuId: toRemove }, transaction });
        }

        await transaction.commit();
        const updated = await Role.findByPk(role.id, { attributes: ['id', 'name', 'description'] });
        res.status(200).json({ message: "Role updated.", role: updated });
    } catch (error) {
        if (transaction && !transaction.finished) await transaction.rollback();
        console.error("Error updating tenant role:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// DELETE /api/auth/company/roles/:roleId[?companyId=]  -> hard-delete a role and its
// menu grants. Blocked when the role is still assigned to users (reassign them
// first) or when it's the system-managed "Tenant Admin" role.
exports.deleteTenantRole = async (req, res) => {
    const target = await resolveTargetCompany(req, req.query.companyId);
    if (target.status) return res.status(target.status).json({ message: target.message });
    const companyId = target.companyId;

    const transaction = await sequelize.transaction();
    try {
        const role = await Role.findOne({ where: { id: req.params.roleId, companyId }, transaction });
        if (!role) {
            await transaction.rollback();
            return res.status(404).json({ message: "Role not found." });
        }
        if (role.name === 'Tenant Admin') {
            await transaction.rollback();
            return res.status(400).json({ message: "The Tenant Admin role is managed by the system and can't be deleted." });
        }

        const inUse = await CompanyUser.count({ where: { companyId, roleId: role.id }, transaction });
        if (inUse > 0) {
            await transaction.rollback();
            return res.status(409).json({
                message: `${inUse} user(s) still have this role. Change their role on the User Management screen first, then delete it.`,
            });
        }

        await RoleMenu.destroy({ where: { roleId: role.id }, transaction });
        await role.destroy({ transaction });

        await transaction.commit();
        res.status(200).json({ message: "Role deleted." });
    } catch (error) {
        if (transaction && !transaction.finished) await transaction.rollback();
        console.error("Error deleting tenant role:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// ============================================================================
// ACCOUNT-LEVEL ROLES (RBAC) — a Role is an account-wide named set of menu
// permissions, NOT tied to a company. Company enters only at entitlement
// (module subscription) and assignment (CompanyUser.roleId). All scoped to the
// caller's account (derived from req.user.companyId).
// ============================================================================

// GET /api/auth/account/menus  -> the account's entitled menu catalogue: menus
// from every module any of the account's companies is subscribed to (union).
exports.listAccountMenus = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: "Your account could not be resolved." });

        const companies = await Company.findAll({ where: { accountId }, attributes: ['id'] });
        const companyIds = companies.map(c => c.id);
        const subs = companyIds.length
            ? await CompanyModule.findAll({ where: { companyId: companyIds }, attributes: ['moduleId'] })
            : [];
        const moduleIds = [...new Set(subs.map(s => s.moduleId))];

        const menus = moduleIds.length
            ? await Menu.findAll({
                where: { moduleId: moduleIds },
                include: [{ model: Module, as: 'Module', attributes: ['name', 'icon', 'landingRoute'] }],
                order: [['name', 'ASC']],
            })
            : [];
        res.status(200).json(menus);
    } catch (error) {
        console.error("Error listing account menus:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// GET /api/auth/account/roles  -> all roles for the caller's account
exports.listAccountRoles = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: "Your account could not be resolved." });

        const roles = await Role.findAll({
            where: { accountId },
            attributes: ['id', 'name', 'description'],
            include: [{ model: Menu, as: 'PermittedMenus', attributes: ['id', 'name'], through: { attributes: [] } }],
            order: [['name', 'ASC']],
        });
        res.status(200).json(roles);
    } catch (error) {
        console.error("Error listing account roles:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// GET /api/auth/account/roles/:roleId  -> one role + the exact menu ids it grants
exports.getAccountRole = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: "Your account could not be resolved." });

        const role = await Role.findOne({
            where: { id: req.params.roleId, accountId },
            attributes: ['id', 'name', 'description'],
        });
        if (!role) return res.status(404).json({ message: "Role not found." });

        const grants = await RoleMenu.findAll({ where: { roleId: role.id }, attributes: ['menuId'] });
        res.status(200).json({
            id: role.id,
            name: role.name,
            description: role.description,
            menuIds: grants.map(g => g.menuId),
        });
    } catch (error) {
        console.error("Error fetching account role:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// POST /api/auth/account/roles  Body: { roleName, description?, menuIds: string[] }
exports.createAccountRole = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const accountId = await resolveAccountId(req.user.companyId, transaction);
        if (!accountId) {
            await transaction.rollback();
            return res.status(404).json({ message: "Your account could not be resolved." });
        }

        const name = typeof req.body.roleName === 'string' ? req.body.roleName.trim() : '';
        if (!name) {
            await transaction.rollback();
            return res.status(400).json({ message: "Role name is required." });
        }
        const desired = Array.isArray(req.body.menuIds) ? [...new Set(req.body.menuIds)] : [];
        if (desired.length === 0) {
            await transaction.rollback();
            return res.status(400).json({ message: "Select at least one menu permission." });
        }
        const found = await Menu.count({ where: { id: desired }, transaction });
        if (found !== desired.length) {
            await transaction.rollback();
            return res.status(400).json({ message: "One or more selected menus do not exist." });
        }

        // Unique role name per account.
        const clash = await Role.findOne({ where: { accountId, name }, transaction });
        if (clash) {
            await transaction.rollback();
            return res.status(409).json({ message: "A role with that name already exists." });
        }

        const role = await Role.create(
            { accountId, name, description: (req.body.description || '').trim() || null },
            { transaction },
        );
        await RoleMenu.bulkCreate(desired.map(menuId => ({ roleId: role.id, menuId })), { transaction });

        await transaction.commit();
        res.status(201).json({ message: "Role created.", role: { id: role.id, name: role.name, description: role.description } });
    } catch (error) {
        if (transaction && !transaction.finished) await transaction.rollback();
        console.error("Error creating account role:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// PUT /api/auth/account/roles/:roleId  Body: { roleName?, description?, menuIds: string[] }
exports.updateAccountRole = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const accountId = await resolveAccountId(req.user.companyId, transaction);
        if (!accountId) {
            await transaction.rollback();
            return res.status(404).json({ message: "Your account could not be resolved." });
        }

        const role = await Role.findOne({ where: { id: req.params.roleId, accountId }, transaction });
        if (!role) {
            await transaction.rollback();
            return res.status(404).json({ message: "Role not found." });
        }
        if (role.name === 'Tenant Admin') {
            await transaction.rollback();
            return res.status(400).json({ message: "The Tenant Admin role is managed by the system and can't be edited." });
        }

        const desired = Array.isArray(req.body.menuIds) ? [...new Set(req.body.menuIds)] : [];
        if (desired.length === 0) {
            await transaction.rollback();
            return res.status(400).json({ message: "A role must keep at least one menu permission." });
        }
        const found = await Menu.count({ where: { id: desired }, transaction });
        if (found !== desired.length) {
            await transaction.rollback();
            return res.status(400).json({ message: "One or more selected menus do not exist." });
        }

        const updates = {};
        if (typeof req.body.roleName === 'string' && req.body.roleName.trim()) updates.name = req.body.roleName.trim();
        if (typeof req.body.description === 'string') updates.description = req.body.description.trim() || null;
        if (updates.name && updates.name !== role.name) {
            const clash = await Role.findOne({ where: { accountId, name: updates.name }, transaction });
            if (clash) {
                await transaction.rollback();
                return res.status(409).json({ message: "A role with that name already exists." });
            }
        }
        if (Object.keys(updates).length > 0) await role.update(updates, { transaction });

        // Diff the granted menus.
        const current = await RoleMenu.findAll({ where: { roleId: role.id }, attributes: ['menuId'], transaction });
        const currentIds = current.map(c => c.menuId);
        const toAdd = desired.filter(id => !currentIds.includes(id));
        const toRemove = currentIds.filter(id => !desired.includes(id));
        if (toAdd.length > 0) await RoleMenu.bulkCreate(toAdd.map(menuId => ({ roleId: role.id, menuId })), { transaction });
        if (toRemove.length > 0) await RoleMenu.destroy({ where: { roleId: role.id, menuId: toRemove }, transaction });

        await transaction.commit();
        const updated = await Role.findByPk(role.id, { attributes: ['id', 'name', 'description'] });
        res.status(200).json({ message: "Role updated.", role: updated });
    } catch (error) {
        if (transaction && !transaction.finished) await transaction.rollback();
        console.error("Error updating account role:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// DELETE /api/auth/account/roles/:roleId
exports.deleteAccountRole = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const accountId = await resolveAccountId(req.user.companyId, transaction);
        if (!accountId) {
            await transaction.rollback();
            return res.status(404).json({ message: "Your account could not be resolved." });
        }

        const role = await Role.findOne({ where: { id: req.params.roleId, accountId }, transaction });
        if (!role) {
            await transaction.rollback();
            return res.status(404).json({ message: "Role not found." });
        }
        if (role.name === 'Tenant Admin') {
            await transaction.rollback();
            return res.status(400).json({ message: "The Tenant Admin role is managed by the system and can't be deleted." });
        }

        const inUse = await CompanyUser.count({ where: { roleId: role.id }, transaction });
        if (inUse > 0) {
            await transaction.rollback();
            return res.status(409).json({
                message: `${inUse} user(s) still have this role. Change their role on the User Management screen first, then delete it.`,
            });
        }

        await RoleMenu.destroy({ where: { roleId: role.id }, transaction });
        await role.destroy({ transaction });

        await transaction.commit();
        res.status(200).json({ message: "Role deleted." });
    } catch (error) {
        if (transaction && !transaction.finished) await transaction.rollback();
        console.error("Error deleting account role:", error);
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

        // If a role was chosen, it must belong to the caller's ACCOUNT (roles are
        // account-level now, usable in any of the account's companies).
        if (roleId) {
            const accountId = await resolveAccountId(companyId, transaction);
            const role = await Role.findOne({ where: { id: roleId, accountId }, transaction });
            if (!role) {
                await transaction.rollback();
                return res.status(400).json({ message: "Selected role does not belong to your account." });
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

        // The role must belong to the caller's account (account-level roles).
        const accountId = await resolveAccountId(companyId);
        const role = await Role.findOne({ where: { id: roleId, accountId } });
        if (!role) {
            return res.status(400).json({ message: "Selected role does not belong to your account." });
        }

        // The user must already be a member of this company.
        const membership = await CompanyUser.findOne({ where: { userId, companyId } });
        if (!membership) {
            return res.status(404).json({ message: "User is not a member of your workspace." });
        }

        // Last-admin lockout protection: don't allow demoting the company's only
        // Tenant Admin (that would leave the workspace with no one who can manage it).
        const tenantAdminRole = await Role.findOne({ where: { accountId, name: 'Tenant Admin' } });
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
        const accountId = await resolveAccountId(companyId);
        const tenantAdminRole = await Role.findOne({ where: { accountId, name: 'Tenant Admin' } });
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

// GET /api/auth/account/users  -> account-wide, person-centric view for the
// redesigned User Management screen. Returns the companies the caller may
// administer (each with its roles), every person who is a member of any of those
// companies (with their per-company role), and pending invitations — everything
// the UI needs to manage "who is in which company as what role" in one payload.
exports.listAccountUsers = async (req, res) => {
    try {
        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) {
            return res.status(404).json({ message: "Your account could not be resolved." });
        }

        // Companies the caller may administer: all of them if they own the account,
        // otherwise only the ones where they hold the Tenant Admin role.
        let companies;
        if (await isAccountOwner(req.user.id, accountId)) {
            companies = await Company.findAll({ where: { accountId }, attributes: ['id', 'name'], order: [['name', 'ASC']] });
        } else {
            const adminLinks = await CompanyUser.findAll({
                where: { userId: req.user.id },
                include: [{ model: Role, as: 'Role', where: { name: 'Tenant Admin' }, required: true, attributes: [] }],
                attributes: ['companyId'],
            });
            const adminIds = adminLinks.map(l => l.companyId).filter(Boolean);
            companies = adminIds.length
                ? await Company.findAll({ where: { id: adminIds, accountId }, attributes: ['id', 'name'], order: [['name', 'ASC']] })
                : [];
        }

        const companyIds = companies.map(c => c.id);
        const companyNameById = new Map(companies.map(c => [c.id, c.name]));

        // Roles per administrable company (for the role dropdowns).
        const roles = companyIds.length
            ? await Role.findAll({ where: { companyId: companyIds }, attributes: ['id', 'name', 'companyId'], order: [['name', 'ASC']] })
            : [];
        const rolesByCompany = {};
        for (const r of roles) {
            (rolesByCompany[r.companyId] ||= []).push({ id: r.id, name: r.name });
        }
        const companiesOut = companies.map(c => ({ id: c.id, name: c.name, roles: rolesByCompany[c.id] || [] }));

        // Memberships in those companies, grouped into people.
        const memberships = companyIds.length
            ? await CompanyUser.findAll({ where: { companyId: companyIds }, include: [{ model: Role, as: 'Role', attributes: ['id', 'name'] }] })
            : [];
        const userIds = [...new Set(memberships.map(m => m.userId))];
        const users = userIds.length ? await User.findAll({ where: { id: userIds }, attributes: ['id', 'email', 'full_name'] }) : [];
        const userById = new Map(users.map(u => [u.id, u]));

        const peopleMap = new Map();
        for (const m of memberships) {
            const u = userById.get(m.userId);
            if (!u) continue;
            if (!peopleMap.has(m.userId)) {
                peopleMap.set(m.userId, { id: u.id, email: u.email, full_name: u.full_name, memberships: [] });
            }
            peopleMap.get(m.userId).memberships.push({
                companyId: m.companyId,
                companyName: companyNameById.get(m.companyId) || null,
                roleId: m.roleId,
                roleName: m.Role ? m.Role.name : null,
            });
        }
        const people = [...peopleMap.values()].sort((a, b) => (a.email || '').localeCompare(b.email || ''));

        // Pending invitations across those companies.
        const invites = companyIds.length
            ? await Invitation.findAll({
                where: { companyId: companyIds, status: 'pending' },
                include: [{ model: Role, as: 'Role', attributes: ['name'] }],
                order: [['createdAt', 'DESC']],
            })
            : [];
        const invitations = invites.map(i => ({
            id: i.id,
            email: i.email,
            companyId: i.companyId,
            companyName: companyNameById.get(i.companyId) || null,
            roleName: i.Role ? i.Role.name : null,
            expiresAt: i.expiresAt,
        }));

        res.status(200).json({ companies: companiesOut, people, invitations });
    } catch (error) {
        console.error("List account users error:", error);
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

        // Reuse the ONE account-level Tenant Admin role (created with the account;
        // implicit full access, so no per-module menu grants are needed).
        let tenantAdminRole = await Role.findOne({ where: { accountId, name: 'Tenant Admin' }, transaction });
        if (!tenantAdminRole) {
            tenantAdminRole = await Role.create({
                accountId,
                name: 'Tenant Admin',
                description: 'Full administrative access to the company workspace.',
            }, { transaction });
        }

        // Subscribe the company to the selected modules (entitlement). Role->menu
        // access is computed at login as role menus ∩ entitlement, so there's no
        // menu-grant bookkeeping here anymore.
        if (selectedModuleIds.length > 0) {
            await CompanyModule.bulkCreate(
                selectedModuleIds.map(moduleId => ({ companyId: company.id, moduleId, isActive: true })),
                { transaction }
            );
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

        // Entitlement only. A role's effective access is computed at login as
        // (role menus ∩ the company's entitled menus), so adding/removing a
        // module here needs no role->menu bookkeeping: revoking a module instantly
        // removes its menus from every role's effective set, account-wide-safe.
        if (toAdd.length > 0) {
            await CompanyModule.bulkCreate(
                toAdd.map(moduleId => ({ companyId, moduleId, isActive: true })),
                { transaction }
            );
        }
        if (toRemove.length > 0) {
            await CompanyModule.destroy({ where: { companyId, moduleId: toRemove }, transaction });
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

        // If a role was chosen, it must belong to the caller's ACCOUNT.
        if (roleId) {
            const role = await Role.findOne({ where: { id: roleId, accountId }, transaction });
            if (!role) {
                await transaction.rollback();
                return res.status(400).json({ message: "Selected role does not belong to your account." });
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
