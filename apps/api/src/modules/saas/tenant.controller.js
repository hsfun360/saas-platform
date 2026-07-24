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
const Department = require('./department.model');
const Position = require('./position.model');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../../platform/db');
const { hasTenantAdminRole } = require('./tenant');
const { isAccountOwner } = require('./account');
const CompanySmtpConfig = require('./companySmtpConfig.model');
const secretbox = require('../../platform/secretbox');
const companyMailer = require('../notification/companyMailer');

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
        const accountId = await resolveAccountId(target.companyId);

        const roles = await Role.findAll({
            where: { accountId },
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
        const accountId = await resolveAccountId(target.companyId);

        const role = await Role.findOne({
            where: { id: req.params.roleId, accountId },
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

    const transaction = await sequelize.transaction();
    try {
        const accountId = await resolveAccountId(target.companyId, transaction);
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
    const accountId = await resolveAccountId(target.companyId);

    const transaction = await sequelize.transaction();
    try {
        const role = await Role.findOne({ where: { id: req.params.roleId, accountId }, transaction });
        if (!role) {
            await transaction.rollback();
            return res.status(404).json({ message: "Role not found." });
        }
        if (role.name === 'Tenant Admin') {
            await transaction.rollback();
            return res.status(400).json({ message: "The Tenant Admin role is managed by the system and can't be deleted." });
        }

        // The role is account-level, so "in use" is any membership holding it (across
        // the account's companies), not just one company's.
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
            attributes: ['id', 'name', 'description', 'dataScope'],
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
            attributes: ['id', 'name', 'description', 'dataScope'],
        });
        if (!role) return res.status(404).json({ message: "Role not found." });

        const grants = await RoleMenu.findAll({
            where: { roleId: role.id },
            attributes: ['menuId', 'canCreate', 'canEdit', 'canDelete'],
        });
        res.status(200).json({
            id: role.id,
            name: role.name,
            description: role.description,
            dataScope: role.dataScope || 'all',
            menuIds: grants.map(g => g.menuId), // legacy shape, kept for older clients
            permissions: grants.map(g => ({
                menuId: g.menuId,
                canCreate: g.canCreate,
                canEdit: g.canEdit,
                canDelete: g.canDelete,
            })),
        });
    } catch (error) {
        console.error("Error fetching account role:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Normalize a role's grant payload to [{ menuId, canCreate, canEdit, canDelete }].
// Accepts the current shape `permissions: [{ menuId, canCreate?, canEdit?, canDelete? }]`
// (missing flags default TRUE = full access) and the legacy `menuIds: string[]`
// (full access). Deduped by menuId, last entry wins.
function normalizeGrants(body) {
    const byMenu = new Map();
    if (Array.isArray(body.permissions)) {
        for (const p of body.permissions) {
            if (!p || typeof p.menuId !== 'string' || !p.menuId) continue;
            byMenu.set(p.menuId, {
                menuId: p.menuId,
                canCreate: p.canCreate !== false,
                canEdit: p.canEdit !== false,
                canDelete: p.canDelete !== false,
            });
        }
    } else if (Array.isArray(body.menuIds)) {
        for (const menuId of body.menuIds) {
            if (typeof menuId !== 'string' || !menuId) continue;
            byMenu.set(menuId, { menuId, canCreate: true, canEdit: true, canDelete: true });
        }
    }
    return [...byMenu.values()];
}

const DATA_SCOPES = ['own', 'department', 'all'];

// POST /api/auth/account/roles
// Body: { roleName, description?, dataScope?, permissions: [{ menuId, canCreate?, canEdit?, canDelete? }] }
// (legacy `menuIds: string[]` still accepted = full access per menu)
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
        const grants = normalizeGrants(req.body);
        if (grants.length === 0) {
            await transaction.rollback();
            return res.status(400).json({ message: "Select at least one menu permission." });
        }
        const found = await Menu.count({ where: { id: grants.map(g => g.menuId) }, transaction });
        if (found !== grants.length) {
            await transaction.rollback();
            return res.status(400).json({ message: "One or more selected menus do not exist." });
        }

        // Unique role name per account.
        const clash = await Role.findOne({ where: { accountId, name }, transaction });
        if (clash) {
            await transaction.rollback();
            return res.status(409).json({ message: "A role with that name already exists." });
        }

        const dataScope = typeof req.body.dataScope === 'string' ? req.body.dataScope : 'all';
        if (!DATA_SCOPES.includes(dataScope)) {
            await transaction.rollback();
            return res.status(400).json({ message: "Data scope must be one of: own, department, all." });
        }

        const role = await Role.create(
            { accountId, name, description: (req.body.description || '').trim() || null, dataScope },
            { transaction },
        );
        await RoleMenu.bulkCreate(grants.map(g => ({ roleId: role.id, ...g })), { transaction });

        await transaction.commit();
        res.status(201).json({ message: "Role created.", role: { id: role.id, name: role.name, description: role.description, dataScope: role.dataScope } });
    } catch (error) {
        if (transaction && !transaction.finished) await transaction.rollback();
        console.error("Error creating account role:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// PUT /api/auth/account/roles/:roleId
// Body: { roleName?, description?, dataScope?, permissions: [{ menuId, canCreate?, canEdit?, canDelete? }] }
// (legacy `menuIds: string[]` still accepted = full access per menu)
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

        const grants = normalizeGrants(req.body);
        if (grants.length === 0) {
            await transaction.rollback();
            return res.status(400).json({ message: "A role must keep at least one menu permission." });
        }
        const found = await Menu.count({ where: { id: grants.map(g => g.menuId) }, transaction });
        if (found !== grants.length) {
            await transaction.rollback();
            return res.status(400).json({ message: "One or more selected menus do not exist." });
        }

        const updates = {};
        if (typeof req.body.roleName === 'string' && req.body.roleName.trim()) updates.name = req.body.roleName.trim();
        if (typeof req.body.description === 'string') updates.description = req.body.description.trim() || null;
        if (typeof req.body.dataScope === 'string') {
            if (!DATA_SCOPES.includes(req.body.dataScope)) {
                await transaction.rollback();
                return res.status(400).json({ message: "Data scope must be one of: own, department, all." });
            }
            updates.dataScope = req.body.dataScope;
        }
        if (updates.name && updates.name !== role.name) {
            const clash = await Role.findOne({ where: { accountId, name: updates.name }, transaction });
            if (clash) {
                await transaction.rollback();
                return res.status(409).json({ message: "A role with that name already exists." });
            }
        }
        if (Object.keys(updates).length > 0) await role.update(updates, { transaction });

        // Replace the grant set whole (small table, one transaction): simpler
        // than a three-way diff now that each grant also carries action flags.
        await RoleMenu.destroy({ where: { roleId: role.id }, transaction });
        await RoleMenu.bulkCreate(grants.map(g => ({ roleId: role.id, ...g })), { transaction });

        await transaction.commit();
        const updated = await Role.findByPk(role.id, { attributes: ['id', 'name', 'description', 'dataScope'] });
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

        // Resolve the org placement labels (plain UUID refs, no association).
        const departmentIds = [...new Set(memberships.map(m => m.departmentId).filter(Boolean))];
        const positionIds = [...new Set(memberships.map(m => m.positionId).filter(Boolean))];
        const departments = departmentIds.length
            ? await Department.findAll({ where: { id: departmentIds }, attributes: ['id', 'departmentCode', 'description'] })
            : [];
        const positions = positionIds.length
            ? await Position.findAll({ where: { id: positionIds }, attributes: ['id', 'positionCode', 'description', 'rank'] })
            : [];
        const departmentById = new Map(departments.map(d => [d.id, d]));
        const positionById = new Map(positions.map(p => [p.id, p]));

        const result = memberships.map(m => {
            const u = userById.get(m.userId);
            const dept = m.departmentId ? departmentById.get(m.departmentId) : null;
            const pos = m.positionId ? positionById.get(m.positionId) : null;
            return {
                id: m.userId,
                email: u ? u.email : null,
                full_name: u ? u.full_name : null,
                authMethod: u ? u.authMethod : null,
                roleId: m.roleId,
                roleName: m.Role ? m.Role.name : null,
                departmentId: m.departmentId || null,
                departmentName: dept ? (dept.description || dept.departmentCode) : null,
                positionId: m.positionId || null,
                positionName: pos ? (pos.description || pos.positionCode) : null,
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

// POST /api/auth/company/users/assign-role  -> set a user's role (and org
// placement) within a company.
// Body: { userId, roleId, companyId?, departmentId?, positionId? }
// departmentId/positionId: omitted = unchanged; null/'' = clear; a UUID must
// belong to the caller's account (subscriber masters).
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

        // Org placement (optional): validate against the subscriber's masters.
        if ('departmentId' in req.body) {
            const departmentId = req.body.departmentId || null;
            if (departmentId) {
                const dept = await Department.findOne({ where: { id: departmentId, accountId } });
                if (!dept) return res.status(400).json({ message: "Selected department does not belong to your account." });
            }
            membership.departmentId = departmentId;
        }
        if ('positionId' in req.body) {
            const positionId = req.body.positionId || null;
            if (positionId) {
                const pos = await Position.findOne({ where: { id: positionId, accountId } });
                if (!pos) return res.status(400).json({ message: "Selected position does not belong to your account." });
            }
            membership.positionId = positionId;
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

// PATCH /api/auth/company/users/:userId  -> edit a user's GLOBAL profile
// (full_name / email / phone / bio). Account-scoped: allowed only when the target
// is managed by this admin AND belongs ONLY to companies in this admin's account -
// never an external collaborator or system user (editing their global profile
// would leak across tenants).
exports.updateTenantUserProfile = async (req, res) => {
    try {
        const { userId } = req.params;
        const { email, fullName, phone, bio } = req.body;

        const accountId = await resolveAccountId(req.user.companyId);
        if (!accountId) return res.status(404).json({ message: "Your account could not be resolved." });

        const accountCompanies = await Company.findAll({ where: { accountId }, attributes: ['id'] });
        const accountCompanyIds = new Set(accountCompanies.map(c => c.id));

        // Companies this admin may administer (owner => all in account; else their Tenant Admin companies).
        let adminCompanyIds;
        if (await isAccountOwner(req.user.id, accountId)) {
            adminCompanyIds = new Set(accountCompanyIds);
        } else {
            const adminLinks = await CompanyUser.findAll({
                where: { userId: req.user.id },
                include: [{ model: Role, as: 'Role', where: { name: 'Tenant Admin' }, required: true, attributes: [] }],
                attributes: ['companyId'],
            });
            adminCompanyIds = new Set(adminLinks.map(l => l.companyId).filter(id => accountCompanyIds.has(id)));
        }

        const target = await User.findByPk(userId);
        if (!target) return res.status(404).json({ message: "User not found." });

        const memberships = await CompanyUser.findAll({ where: { userId }, attributes: ['companyId'] });
        if (!memberships.some(m => adminCompanyIds.has(m.companyId))) {
            return res.status(403).json({ message: "You don't manage this user." });
        }
        // Account-scoping: refuse if the user belongs anywhere outside this account
        // (another account's company, or a system-level membership).
        if (memberships.some(m => m.companyId === null || !accountCompanyIds.has(m.companyId))) {
            return res.status(403).json({ message: "This user also belongs to other accounts, so their profile can't be edited here." });
        }

        if (typeof email === 'string') {
            const normalized = email.trim().toLowerCase();
            if (!normalized) return res.status(400).json({ message: "Email cannot be empty." });
            if (normalized !== target.email) {
                const clash = await User.findOne({ where: { email: normalized } });
                if (clash) return res.status(409).json({ message: "Another user already uses this email." });
                target.email = normalized;
            }
        }
        if (typeof fullName === 'string') {
            if (!fullName.trim()) return res.status(400).json({ message: "Full name cannot be empty." });
            target.full_name = fullName.trim();
        }
        if (typeof phone === 'string') target.phone = phone.trim() || null;
        if (typeof bio === 'string') target.bio = bio.trim() || null;

        await target.save();
        res.status(200).json({
            message: "User profile updated.",
            user: { id: target.id, email: target.email, full_name: target.full_name, phone: target.phone, bio: target.bio },
        });
    } catch (error) {
        console.error("Error updating tenant user profile:", error);
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

        // Roles are account-level, so every administrable company shares the account's
        // one role set (for the role dropdowns).
        const roles = await Role.findAll({ where: { accountId }, attributes: ['id', 'name'], order: [['name', 'ASC']] });
        const accountRoles = roles.map(r => ({ id: r.id, name: r.name }));
        const companiesOut = companies.map(c => ({ id: c.id, name: c.name, roles: accountRoles }));

        // Memberships in those companies, grouped into people.
        const memberships = companyIds.length
            ? await CompanyUser.findAll({ where: { companyId: companyIds }, include: [{ model: Role, as: 'Role', attributes: ['id', 'name'] }] })
            : [];
        const userIds = [...new Set(memberships.map(m => m.userId))];
        const users = userIds.length ? await User.findAll({ where: { id: userIds }, attributes: ['id', 'email', 'full_name', 'phone', 'bio'] }) : [];
        const userById = new Map(users.map(u => [u.id, u]));

        // A person's GLOBAL profile is editable here only if ALL their memberships
        // are within this account (no external company, no system membership).
        const allAccountCompanies = await Company.findAll({ where: { accountId }, attributes: ['id'] });
        const accountCompanyIdSet = new Set(allAccountCompanies.map(c => c.id));
        const allMemberships = userIds.length
            ? await CompanyUser.findAll({ where: { userId: userIds }, attributes: ['userId', 'companyId'] })
            : [];
        const externalUserIds = new Set(
            allMemberships.filter(m => m.companyId === null || !accountCompanyIdSet.has(m.companyId)).map(m => m.userId),
        );

        // Resolve org-placement labels (plain UUID refs to the subscriber masters).
        const deptIds = [...new Set(memberships.map(m => m.departmentId).filter(Boolean))];
        const posIds = [...new Set(memberships.map(m => m.positionId).filter(Boolean))];
        const depts = deptIds.length
            ? await Department.findAll({ where: { id: deptIds }, attributes: ['id', 'departmentCode', 'description'] })
            : [];
        const poss = posIds.length
            ? await Position.findAll({ where: { id: posIds }, attributes: ['id', 'positionCode', 'description', 'rank'] })
            : [];
        const deptById = new Map(depts.map(d => [d.id, d]));
        const posById = new Map(poss.map(p => [p.id, p]));

        const peopleMap = new Map();
        for (const m of memberships) {
            const u = userById.get(m.userId);
            if (!u) continue;
            if (!peopleMap.has(m.userId)) {
                peopleMap.set(m.userId, {
                    id: u.id, email: u.email, full_name: u.full_name, phone: u.phone, bio: u.bio,
                    profileEditable: !externalUserIds.has(u.id),
                    memberships: [],
                });
            }
            const dept = m.departmentId ? deptById.get(m.departmentId) : null;
            const pos = m.positionId ? posById.get(m.positionId) : null;
            peopleMap.get(m.userId).memberships.push({
                companyId: m.companyId,
                companyName: companyNameById.get(m.companyId) || null,
                roleId: m.roleId,
                roleName: m.Role ? m.Role.name : null,
                departmentId: m.departmentId || null,
                departmentName: dept ? (dept.description || dept.departmentCode) : null,
                positionId: m.positionId || null,
                positionName: pos ? (pos.description || pos.positionCode) : null,
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
            attributes: ['id', 'name', 'icon', 'description', 'isSystem'],
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

        const {
            name, registrationNumber, taxRegistrationNumber, email, phone, website,
            addressLine1, addressLine2, city, state, postalCode, country, countryCode,
            timezone, moduleIds, logo, defaultCurrencyCode,
        } = req.body;
        if (!name || !name.trim()) {
            await transaction.rollback();
            return res.status(400).json({ message: "Company name is required." });
        }
        const trimOrNull = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

        // Validate the selected modules actually exist (any system module is allowed).
        const selectedModuleIds = Array.isArray(moduleIds) ? [...new Set(moduleIds)] : [];
        if (selectedModuleIds.length > 0) {
            const found = await Module.count({ where: { id: selectedModuleIds }, transaction });
            if (found !== selectedModuleIds.length) {
                await transaction.rollback();
                return res.status(400).json({ message: "One or more selected modules do not exist." });
            }
        }

        // System modules (tenant-administration screens) are mandatory for every
        // company - add them whatever was selected, mirroring provisionTenant()
        // and updateCompanyModules().
        const systemModules = await Module.findAll({ where: { isSystem: true }, attributes: ['id'], transaction });
        for (const m of systemModules) {
            if (!selectedModuleIds.includes(m.id)) selectedModuleIds.push(m.id);
        }

        const company = await Company.create({
            accountId,
            name: name.trim(),
            registrationNumber: trimOrNull(registrationNumber),
            taxRegistrationNumber: trimOrNull(taxRegistrationNumber),
            email: trimOrNull(email),
            phone: trimOrNull(phone),
            website: trimOrNull(website),
            addressLine1: trimOrNull(addressLine1),
            addressLine2: trimOrNull(addressLine2),
            city: trimOrNull(city),
            state: trimOrNull(state),
            postalCode: trimOrNull(postalCode),
            country: trimOrNull(country),
            // Canonical alpha-2 (lowercase) matching Country.alpha2; drives tax lookup.
            countryCode: countryCode ? String(countryCode).trim().toLowerCase() || null : null,
            logo: trimOrNull(logo),
            timezone: trimOrNull(timezone) || 'Asia/Kuala_Lumpur',
            defaultCurrencyCode: defaultCurrencyCode ? String(defaultCurrencyCode).trim().toUpperCase() || null : null,
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

        // System modules (tenant-administration screens) are mandatory for every
        // company - silently keep them in the set so they can never be unticked.
        const systemModules = await Module.findAll({ where: { isSystem: true }, attributes: ['id'], transaction });
        for (const m of systemModules) {
            if (!desired.includes(m.id)) desired.push(m.id);
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
            'addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'country', 'timezone', 'logo',
        ];
        for (const f of fields) {
            if (b[f] !== undefined) {
                const v = typeof b[f] === 'string' ? b[f].trim() : b[f];
                company[f] = v === '' ? null : v;
            }
        }
        // timezone is NOT NULL — never let it be cleared.
        if (!company.timezone) company.timezone = 'Asia/Kuala_Lumpur';

        // Default currency (ISO 4217, uppercase); empty clears it.
        if (b.defaultCurrencyCode !== undefined) {
            const c = typeof b.defaultCurrencyCode === 'string' ? b.defaultCurrencyCode.trim().toUpperCase() : '';
            company.defaultCurrencyCode = c || null;
        }

        // Canonical country (ISO 3166-1 alpha-2, lowercase); empty clears it.
        if (b.countryCode !== undefined) {
            const cc = typeof b.countryCode === 'string' ? b.countryCode.trim().toLowerCase() : '';
            company.countryCode = cc || null;
        }

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

// ==========================================
// COMPANY SMTP (outgoing email server) — Tenant Admin, per company
// ==========================================

// Shape a config for the client — never includes the password.
function presentSmtp(cfg) {
    if (!cfg) return { configured: false };
    return {
        configured: true,
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        username: cfg.username || '',
        hasPassword: !!cfg.passwordEnc,
        fromEmail: cfg.fromEmail,
        fromName: cfg.fromName || '',
        isActive: cfg.isActive,
        lastVerifiedAt: cfg.lastVerifiedAt,
        lastError: cfg.lastError,
    };
}

// GET /api/auth/companies/:companyId/smtp
exports.getCompanySmtp = async (req, res) => {
    const target = await resolveTargetCompany(req, req.params.companyId);
    if (target.status) return res.status(target.status).json({ message: target.message });
    try {
        const cfg = await CompanySmtpConfig.findOne({ where: { companyId: target.companyId } });
        res.status(200).json(presentSmtp(cfg));
    } catch (error) {
        console.error('Error getting company SMTP:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// PUT /api/auth/companies/:companyId/smtp
// Body: { host, port, secure, username, password?, fromEmail, fromName, isActive }
// A blank/omitted password keeps the stored one, so other fields can be edited
// without re-entering it.
exports.upsertCompanySmtp = async (req, res) => {
    const target = await resolveTargetCompany(req, req.params.companyId);
    if (target.status) return res.status(target.status).json({ message: target.message });
    if (!secretbox.isConfigured()) {
        return res.status(503).json({ message: 'Email encryption is not configured on the server. Contact the platform administrator.' });
    }
    try {
        const host = (req.body.host || '').trim();
        const fromEmail = (req.body.fromEmail || '').trim();
        const port = parseInt(req.body.port, 10);
        if (!host) return res.status(400).json({ message: 'SMTP host is required.' });
        if (!fromEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fromEmail)) {
            return res.status(400).json({ message: 'A valid From email address is required.' });
        }
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            return res.status(400).json({ message: 'A valid SMTP port is required.' });
        }

        const existing = await CompanySmtpConfig.findOne({ where: { companyId: target.companyId } });
        const updates = {
            companyId: target.companyId,
            host,
            port,
            secure: !!req.body.secure,
            username: (req.body.username || '').trim() || null,
            fromEmail,
            fromName: (req.body.fromName || '').trim() || null,
            isActive: req.body.isActive === undefined ? true : !!req.body.isActive,
        };
        // Set the password only when a new one is supplied; blank keeps the old.
        if (typeof req.body.password === 'string' && req.body.password.length) {
            updates.passwordEnc = secretbox.encrypt(req.body.password);
            updates.lastError = null;
        } else if (!existing) {
            updates.passwordEnc = null;
        }

        if (existing) await existing.update(updates);
        else await CompanySmtpConfig.create(updates);

        const cfg = await CompanySmtpConfig.findOne({ where: { companyId: target.companyId } });
        res.status(200).json({ message: 'SMTP settings saved.', smtp: presentSmtp(cfg) });
    } catch (error) {
        console.error('Error saving company SMTP:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// DELETE /api/auth/companies/:companyId/smtp -> revert to the platform mailer.
exports.deleteCompanySmtp = async (req, res) => {
    const target = await resolveTargetCompany(req, req.params.companyId);
    if (target.status) return res.status(target.status).json({ message: target.message });
    try {
        await CompanySmtpConfig.destroy({ where: { companyId: target.companyId } });
        res.status(200).json({ message: 'SMTP settings removed. Emails will use the platform default.' });
    } catch (error) {
        console.error('Error deleting company SMTP:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// POST /api/auth/companies/:companyId/smtp/test
// Body: { host, port, secure, username, password?, fromEmail, fromName, to }
// Verifies the connection and sends a test email using the POSTED values (so the
// admin can test before saving); a blank password falls back to the stored one.
exports.testCompanySmtp = async (req, res) => {
    const target = await resolveTargetCompany(req, req.params.companyId);
    if (target.status) return res.status(target.status).json({ message: target.message });
    if (!secretbox.isConfigured()) {
        return res.status(503).json({ message: 'Email encryption is not configured on the server.' });
    }
    try {
        const to = (req.body.to || '').trim();
        if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
            return res.status(400).json({ message: 'A valid recipient email is required for the test.' });
        }
        const host = (req.body.host || '').trim();
        const fromEmail = (req.body.fromEmail || '').trim();
        const port = parseInt(req.body.port, 10);
        if (!host || !fromEmail || !Number.isInteger(port)) {
            return res.status(400).json({ message: 'Host, port and From email are required to test.' });
        }

        // Password: use the posted one, else the stored (encrypted) one.
        let password = typeof req.body.password === 'string' && req.body.password.length ? req.body.password : null;
        if (!password) {
            const existing = await CompanySmtpConfig.findOne({ where: { companyId: target.companyId } });
            if (existing && existing.passwordEnc) password = secretbox.decrypt(existing.passwordEnc);
        }

        const { transporter, from } = companyMailer.buildTransport(
            { host, port, secure: !!req.body.secure, username: (req.body.username || '').trim() || null, fromEmail, fromName: (req.body.fromName || '').trim() || null },
            password,
        );

        await transporter.verify();
        await transporter.sendMail({
            from,
            to,
            subject: '[TEST] Your SMTP settings work',
            html: `<div style="font-family: Arial, sans-serif; padding: 20px;">
                <h2>SMTP test successful ✅</h2>
                <p>This confirms outgoing email for your company is configured correctly.</p>
                <p style="color:#64748b; font-size:12px;">Sent from ${host}:${port} as ${fromEmail}.</p>
            </div>`,
        });

        await CompanySmtpConfig.update({ lastError: null, lastVerifiedAt: new Date() }, { where: { companyId: target.companyId } });
        res.status(200).json({ message: `Test email sent to ${to}. Check the inbox to confirm delivery.` });
    } catch (error) {
        console.error('Error testing company SMTP:', error);
        try {
            await CompanySmtpConfig.update({ lastError: String(error.message).slice(0, 500) }, { where: { companyId: target.companyId } });
        } catch (_) { /* ignore */ }
        res.status(400).json({ message: `SMTP test failed: ${error.message}` });
    }
};
