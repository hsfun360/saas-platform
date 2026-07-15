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

// Merge a partial localized-names patch (keyed by language code) into an existing
// map: a non-empty value sets/updates that language, an empty value clears it.
// Returns a NEW object (so Sequelize detects the JSONB change).
function mergeNames(existing, patch) {
    const merged = { ...(existing || {}) };
    if (patch && typeof patch === 'object' && !Array.isArray(patch)) {
        for (const [lang, value] of Object.entries(patch)) {
            const code = String(lang).trim().toLowerCase();
            if (!code) continue;
            const name = String(value ?? '').trim();
            if (name) merged[code] = name;
            else delete merged[code];
        }
    }
    return merged;
}

// True if nesting `menuId` under `newParentId` would create a cycle, i.e. the
// proposed parent is the menu itself or one of its own descendants. Walks the
// ancestor chain of the proposed parent (in memory, one query per module).
async function wouldCreateCycle(menuId, newParentId, moduleId) {
    if (!newParentId) return false;
    if (newParentId === menuId) return true;
    const all = await Menu.findAll({ where: { moduleId }, attributes: ['id', 'parentId'] });
    const parentOf = new Map(all.map(m => [m.id, m.parentId]));
    const seen = new Set();
    let cur = newParentId;
    while (cur) {
        if (cur === menuId) return true;
        if (seen.has(cur)) break; // guard against a pre-existing corrupt chain
        seen.add(cur);
        cur = parentOf.get(cur) || null;
    }
    return false;
}

// --- 1. ROLE MANAGEMENT ---

// POST /api/admin/roles
// Body: { name, description?, menuIds?: string[] }
// Creates a PLATFORM (system) role (accountId NULL) and (optionally) grants it the
// selected menu permissions, both in a single transaction.
exports.createRole = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { name, description, menuIds } = req.body;

        if (!name) {
            await transaction.rollback();
            return res.status(400).json({ message: "Role name is required." });
        }

        const existingRole = await Role.findOne({
            where: { name: name, accountId: null },
            transaction,
        });

        if (existingRole) {
            await transaction.rollback();
            return res.status(409).json({ message: "Role already exists for this workspace." });
        }

        const newRole = await Role.create({
            name,
            description,
            accountId: null,
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

// GET /api/admin/roles
// Returns the PLATFORM (system) roles (accountId NULL) with their granted menus
// (PermittedMenus) for display.
exports.getRoles = async (req, res) => {
    try {
        const roles = await Role.findAll({
            where: { accountId: null },
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

// PUT /api/admin/roles/:id
// Update a system role's name/description and its menu permissions (diff-based
// add/revoke). The seeded "System Admin" role is system-managed and rejected -
// renaming it would break the DB-backed admin check, and narrowing its menus
// could lock every admin out.
exports.updateRole = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { name, description, menuIds } = req.body;

        const role = await Role.findOne({ where: { id: req.params.id, accountId: null }, transaction });
        if (!role) {
            await transaction.rollback();
            return res.status(404).json({ message: "Role not found." });
        }
        if (role.name === 'System Admin') {
            await transaction.rollback();
            return res.status(400).json({ message: "The System Admin role is managed by the system and can't be edited." });
        }

        // Name (when provided) must stay unique among system roles.
        if (typeof name === 'string' && name.trim() && name.trim() !== role.name) {
            const clash = await Role.findOne({ where: { name: name.trim(), accountId: null }, transaction });
            if (clash) {
                await transaction.rollback();
                return res.status(409).json({ message: "Another system role already uses this name." });
            }
            role.name = name.trim();
        }
        if (typeof description === 'string') {
            role.description = description.trim() || null;
        }
        await role.save({ transaction });

        // Menu permissions -> exact set (validated), applied as a minimal diff.
        if (Array.isArray(menuIds)) {
            const desired = [...new Set(menuIds)];
            if (desired.length > 0) {
                const found = await Menu.count({ where: { id: desired }, transaction });
                if (found !== desired.length) {
                    await transaction.rollback();
                    return res.status(400).json({ message: "One or more selected menus do not exist." });
                }
            }
            const current = await RoleMenu.findAll({ where: { roleId: role.id }, attributes: ['menuId'], transaction });
            const currentIds = current.map(c => c.menuId);
            const toAdd = desired.filter(id => !currentIds.includes(id));
            const toRemove = currentIds.filter(id => !desired.includes(id));
            if (toAdd.length > 0) await RoleMenu.bulkCreate(toAdd.map(menuId => ({ roleId: role.id, menuId })), { transaction });
            if (toRemove.length > 0) await RoleMenu.destroy({ where: { roleId: role.id, menuId: toRemove }, transaction });
        }

        await transaction.commit();
        res.status(200).json({ message: "Role updated.", role: { id: role.id, name: role.name, description: role.description } });
    } catch (error) {
        if (transaction && !transaction.finished) await transaction.rollback();
        console.error("Error updating role:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// DELETE /api/admin/roles/:id
// Hard-delete a system role and its menu grants. Blocked for the system-managed
// "System Admin" role and while any user still holds the role.
exports.deleteRole = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const role = await Role.findOne({ where: { id: req.params.id, accountId: null }, transaction });
        if (!role) {
            await transaction.rollback();
            return res.status(404).json({ message: "Role not found." });
        }
        if (role.name === 'System Admin') {
            await transaction.rollback();
            return res.status(400).json({ message: "The System Admin role is managed by the system and can't be deleted." });
        }

        const inUse = await CompanyUser.count({ where: { companyId: null, roleId: role.id }, transaction });
        if (inUse > 0) {
            await transaction.rollback();
            return res.status(409).json({
                message: `${inUse} user(s) still have this role. Change their role under Assign Role first, then delete it.`,
            });
        }

        await RoleMenu.destroy({ where: { roleId: role.id }, transaction });
        await role.destroy({ transaction });
        await transaction.commit();
        res.status(200).json({ message: "Role deleted." });
    } catch (error) {
        if (transaction && !transaction.finished) await transaction.rollback();
        console.error("Error deleting role:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// GET /api/admin/modules
// Returns every module so the admin can flag which ones a new subscriber gets.
exports.listModules = async (req, res) => {
    try {
        const modules = await Module.findAll({
            attributes: ['id', 'name', 'names', 'icon', 'description', 'landingRoute'],
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

// --- 1b. MODULES & MENUS MAINTENANCE (System Admin master–detail) ---
// Modules are the "master" catalogue (a product area, e.g. "Golf Management");
// each Menu is a "detail" navigation entry belonging to one module. Subscribers
// subscribe to Modules (CompanyModule); Roles grant access to Menus (RoleMenu).

// POST /api/admin/modules  Body: { name, icon?, description?, landingRoute? }
exports.createModule = async (req, res) => {
    try {
        const name = (req.body.name || '').trim();
        if (!name) return res.status(400).json({ message: "Module name is required." });

        const existing = await Module.findOne({ where: { name } });
        if (existing) return res.status(409).json({ message: "A module with that name already exists." });

        const icon = (req.body.icon || '').trim();
        const module = await Module.create({
            name,
            names: mergeNames({}, req.body.names),
            icon: icon || undefined, // fall back to the model default ('widgets')
            description: (req.body.description || '').trim() || null,
            landingRoute: (req.body.landingRoute || '').trim() || null,
        });
        res.status(201).json({ message: "Module created.", module });
    } catch (error) {
        console.error("Error creating module:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// PUT /api/admin/modules/:moduleId  Body: { name?, icon?, description?, landingRoute? }
exports.updateModule = async (req, res) => {
    try {
        const module = await Module.findByPk(req.params.moduleId);
        if (!module) return res.status(404).json({ message: "Module not found." });

        const updates = {};
        if (typeof req.body.name === 'string' && req.body.name.trim()) {
            const name = req.body.name.trim();
            if (name !== module.name) {
                const dup = await Module.findOne({ where: { name } });
                if (dup) return res.status(409).json({ message: "A module with that name already exists." });
            }
            updates.name = name;
        }
        if (typeof req.body.icon === 'string') updates.icon = req.body.icon.trim() || 'widgets';
        if (typeof req.body.description === 'string') updates.description = req.body.description.trim() || null;
        if (typeof req.body.landingRoute === 'string') updates.landingRoute = req.body.landingRoute.trim() || null;
        if (req.body.names && typeof req.body.names === 'object') updates.names = mergeNames(module.names, req.body.names);

        await module.update(updates);
        res.status(200).json({ message: "Module updated.", module });
    } catch (error) {
        console.error("Error updating module:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// DELETE /api/admin/modules/:moduleId
// Blocked while any company still subscribes to the module (remove it from those
// companies first). Otherwise cascade-removes the module's menus and any RoleMenu
// grants to those menus, then the module itself — all in one transaction.
exports.deleteModule = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const module = await Module.findByPk(req.params.moduleId, { transaction });
        if (!module) {
            await transaction.rollback();
            return res.status(404).json({ message: "Module not found." });
        }

        const subscribers = await CompanyModule.count({ where: { moduleId: module.id }, transaction });
        if (subscribers > 0) {
            await transaction.rollback();
            return res.status(409).json({
                message: `${subscribers} company(ies) still subscribe to this module. Remove it from those companies first.`,
            });
        }

        const menus = await Menu.findAll({ where: { moduleId: module.id }, attributes: ['id'], transaction });
        const menuIds = menus.map(m => m.id);
        if (menuIds.length > 0) {
            await RoleMenu.destroy({ where: { menuId: menuIds }, transaction });
            await Menu.destroy({ where: { id: menuIds }, transaction });
        }
        await module.destroy({ transaction });

        await transaction.commit();
        res.status(200).json({ message: "Module deleted." });
    } catch (error) {
        if (transaction && !transaction.finished) await transaction.rollback();
        console.error("Error deleting module:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// GET /api/admin/modules/:moduleId/menus  -> the menus of one module (detail pane)
exports.listModuleMenus = async (req, res) => {
    try {
        const module = await Module.findByPk(req.params.moduleId, { attributes: ['id'] });
        if (!module) return res.status(404).json({ message: "Module not found." });

        const menus = await Menu.findAll({
            where: { moduleId: req.params.moduleId },
            attributes: ['id', 'name', 'names', 'description', 'descriptions', 'route', 'icon', 'parentId', 'moduleId', 'sequence'],
            order: [['sequence', 'ASC'], ['name', 'ASC']],
        });
        res.status(200).json(menus);
    } catch (error) {
        console.error("Error fetching module menus:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// POST /api/admin/menus  Body: { name, route, icon?, moduleId, parentId?, names?, description?, descriptions? }
exports.createMenu = async (req, res) => {
    try {
        const name = (req.body.name || '').trim();
        const route = (req.body.route || '').trim();
        const moduleId = req.body.moduleId;
        if (!name || !route || !moduleId) {
            return res.status(400).json({ message: "Menu name, route and module are required." });
        }

        const module = await Module.findByPk(moduleId);
        if (!module) return res.status(400).json({ message: "The selected module does not exist." });

        // Optional parent (nesting): must be another menu in the same module.
        const parentId = req.body.parentId || null;
        if (parentId) {
            const parent = await Menu.findOne({ where: { id: parentId, moduleId } });
            if (!parent) return res.status(400).json({ message: "The selected parent menu does not belong to this module." });
        }

        // Append to the end of its sibling set (menus sharing the same parent).
        const maxSeq = await Menu.max('sequence', { where: { moduleId, parentId } });
        const sequence = (Number.isFinite(maxSeq) ? maxSeq : -1) + 1;

        const icon = (req.body.icon || '').trim();
        const menu = await Menu.create({
            name,
            names: mergeNames({}, req.body.names),
            description: (req.body.description || '').trim() || null,
            descriptions: mergeNames({}, req.body.descriptions),
            route,
            icon: icon || undefined, // fall back to the model default ('folder')
            moduleId,
            parentId,
            sequence,
        });
        res.status(201).json({ message: "Menu created.", menu });
    } catch (error) {
        console.error("Error creating menu:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// PUT /api/admin/menus/:menuId  Body: { name?, route?, icon?, moduleId?, parentId?, names?, description?, descriptions? }
exports.updateMenu = async (req, res) => {
    try {
        const menu = await Menu.findByPk(req.params.menuId);
        if (!menu) return res.status(404).json({ message: "Menu not found." });

        const updates = {};
        if (typeof req.body.name === 'string' && req.body.name.trim()) updates.name = req.body.name.trim();
        if (typeof req.body.route === 'string' && req.body.route.trim()) updates.route = req.body.route.trim();
        if (typeof req.body.icon === 'string') updates.icon = req.body.icon.trim() || 'folder';
        if (typeof req.body.moduleId === 'string' && req.body.moduleId) {
            const module = await Module.findByPk(req.body.moduleId);
            if (!module) return res.status(400).json({ message: "The selected module does not exist." });
            updates.moduleId = req.body.moduleId;
        }
        // Re-parent (nesting): validate the new parent is in the same module and
        // does not create a cycle, then append to the end of the new sibling set.
        if ('parentId' in req.body) {
            const parentId = req.body.parentId || null;
            if (parentId !== menu.parentId) {
                if (parentId) {
                    const parent = await Menu.findOne({ where: { id: parentId, moduleId: menu.moduleId } });
                    if (!parent) return res.status(400).json({ message: "The selected parent menu does not belong to this module." });
                    if (await wouldCreateCycle(menu.id, parentId, menu.moduleId)) {
                        return res.status(400).json({ message: "A menu cannot be nested under itself or one of its own descendants." });
                    }
                }
                updates.parentId = parentId;
                const maxSeq = await Menu.max('sequence', { where: { moduleId: menu.moduleId, parentId } });
                updates.sequence = (Number.isFinite(maxSeq) ? maxSeq : -1) + 1;
            }
        }
        if (req.body.names && typeof req.body.names === 'object') updates.names = mergeNames(menu.names, req.body.names);
        if (typeof req.body.description === 'string') updates.description = req.body.description.trim() || null;
        if (req.body.descriptions && typeof req.body.descriptions === 'object') updates.descriptions = mergeNames(menu.descriptions, req.body.descriptions);

        await menu.update(updates);
        res.status(200).json({ message: "Menu updated.", menu });
    } catch (error) {
        console.error("Error updating menu:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// DELETE /api/admin/menus/:menuId
// Removes the menu and any RoleMenu grants to it (so no role keeps a dangling
// permission to a deleted menu).
exports.deleteMenu = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const menu = await Menu.findByPk(req.params.menuId, { transaction });
        if (!menu) {
            await transaction.rollback();
            return res.status(404).json({ message: "Menu not found." });
        }

        await RoleMenu.destroy({ where: { menuId: menu.id }, transaction });
        await menu.destroy({ transaction });

        await transaction.commit();
        res.status(200).json({ message: "Menu deleted." });
    } catch (error) {
        if (transaction && !transaction.finished) await transaction.rollback();
        console.error("Error deleting menu:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// PUT /api/admin/modules/:moduleId/menus/order
// Body: { items: [{ id, sequence }] }
// Persists the order of one sibling set after a drag (re-parenting is done via
// updateMenu, so this only rewrites `sequence`). Idempotent, one transaction.
exports.reorderMenus = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const items = Array.isArray(req.body.items) ? req.body.items : [];
        const menus = await Menu.findAll({
            where: { moduleId: req.params.moduleId },
            attributes: ['id'],
            transaction,
        });
        const validMenus = new Set(menus.map(m => m.id));

        for (const item of items) {
            if (!item || !validMenus.has(item.id)) {
                await transaction.rollback();
                return res.status(400).json({ message: "One or more menus do not belong to this module." });
            }
        }

        await Promise.all(items.map(item =>
            Menu.update(
                { sequence: Number(item.sequence) || 0 },
                { where: { id: item.id }, transaction },
            ),
        ));

        await transaction.commit();
        res.status(200).json({ message: "Menu order saved." });
    } catch (error) {
        if (transaction && !transaction.finished) await transaction.rollback();
        console.error("Error reordering menus:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// --- 2. USER MANAGEMENT ---

// GET /api/admin/users
// Lists PLATFORM users only: those with a system-level membership (a CompanyUser
// row with companyId = NULL), the mirror of tenant users (companyId = a real
// company). Tenant users are intentionally excluded. Each row carries the
// membership's isActive so the UI can show + toggle active/inactive.
exports.listUsers = async (req, res) => {
    try {
        const memberships = await CompanyUser.findAll({
            where: { companyId: null },
            attributes: ['userId', 'isActive', 'roleId'],
        });
        const membershipByUser = new Map(memberships.map(m => [m.userId, m]));
        const userIds = [...membershipByUser.keys()];
        if (userIds.length === 0) return res.status(200).json([]);

        // Resolve the assigned system-role names in one query (for the Assign Role list).
        const roleIds = [...new Set(memberships.map(m => m.roleId).filter(Boolean))];
        const roles = roleIds.length
            ? await Role.findAll({ where: { id: roleIds }, attributes: ['id', 'name'] })
            : [];
        const roleNameById = new Map(roles.map(r => [r.id, r.name]));

        const users = await User.findAll({
            where: { id: userIds },
            attributes: ['id', 'email', 'full_name', 'phone', 'bio', 'authMethod', 'createdAt'],
            order: [['createdAt', 'DESC']],
        });

        res.status(200).json(users.map(u => {
            const m = membershipByUser.get(u.id);
            return {
                id: u.id,
                email: u.email,
                full_name: u.full_name,
                phone: u.phone,
                bio: u.bio,
                authMethod: u.authMethod,
                createdAt: u.createdAt,
                isActive: m.isActive !== false,
                roleId: m.roleId || null,
                roleName: m.roleId ? (roleNameById.get(m.roleId) || null) : null,
            };
        }));
    } catch (error) {
        console.error("Error listing users:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// POST /api/admin/users
// Creates a PLATFORM user: the User row PLUS a system-level membership
// (CompanyUser with companyId = NULL), both in one transaction. The membership is
// what makes them a real platform user - it gives them the System workspace (so
// they can log in instead of hitting the "0 workspaces -> 403" path), makes them
// appear in listUsers, and carries their active/inactive flag. The role stays
// null until granted under Assign Role.
exports.createUser = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { email, password, fullName, phone, bio } = req.body;

        if (!email || !password || !fullName) {
            await transaction.rollback();
            return res.status(400).json({ message: "Email, password, and full name are required." });
        }

        const existingUser = await User.findOne({ where: { email: email.toLowerCase() } });
        if (existingUser) {
            await transaction.rollback();
            return res.status(409).json({ message: "User with this email already exists." });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = await User.create({
            email: email.toLowerCase(),
            password: hashedPassword,
            full_name: fullName,
            phone: phone || null,
            bio: bio || null
        }, { transaction });

        await CompanyUser.create({
            userId: newUser.id,
            companyId: null,
            roleId: null,
            isActive: true,
        }, { transaction });

        await transaction.commit();

        newUser.password = undefined;
        res.status(201).json({ message: "User created successfully", user: newUser });
    } catch (error) {
        if (transaction && !transaction.finished) await transaction.rollback();
        console.error("Error creating user:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// PATCH /api/admin/users/:id
// Edit a platform user's profile fields. Email stays unique (login identity), so
// a change is checked against other users first.
exports.updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { email, fullName, phone, bio } = req.body;

        const user = await User.findByPk(id);
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        if (email !== undefined) {
            const normalized = String(email).trim().toLowerCase();
            if (!normalized) return res.status(400).json({ message: "Email cannot be empty." });
            if (normalized !== user.email) {
                const clash = await User.findOne({ where: { email: normalized } });
                if (clash) return res.status(409).json({ message: "Another user already uses this email." });
                user.email = normalized;
            }
        }
        if (fullName !== undefined) {
            if (!String(fullName).trim()) return res.status(400).json({ message: "Full name cannot be empty." });
            user.full_name = String(fullName).trim();
        }
        if (phone !== undefined) {
            user.phone = String(phone).trim() || null;
        }
        if (bio !== undefined) {
            user.bio = String(bio).trim() || null;
        }

        await user.save();
        res.status(200).json({
            message: "User updated.",
            user: {
                id: user.id,
                email: user.email,
                full_name: user.full_name,
                phone: user.phone,
                bio: user.bio,
                authMethod: user.authMethod,
            },
        });
    } catch (error) {
        console.error("Error updating user:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// PATCH /api/admin/users/:id/status   Body: { isActive: boolean }
// Activate/deactivate a platform user by flipping isActive on their system-level
// (companyId = NULL) membership. A deactivated user is skipped by the login and
// workspace-resolution queries, so they can no longer enter the System workspace.
exports.setUserStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        if (typeof isActive !== 'boolean') {
            return res.status(400).json({ message: "isActive (boolean) is required." });
        }

        // Guard against locking yourself out mid-session.
        if (!isActive && req.user && req.user.id === id) {
            return res.status(409).json({ message: "You cannot deactivate your own account." });
        }

        const membership = await CompanyUser.findOne({ where: { userId: id, companyId: null } });
        if (!membership) {
            return res.status(404).json({ message: "Platform user not found." });
        }

        membership.isActive = isActive;
        await membership.save();
        res.status(200).json({ message: isActive ? "User activated." : "User deactivated.", isActive });
    } catch (error) {
        console.error("Error updating user status:", error);
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

        // The subscriber's first user is the workspace owner: default them to the
        // account-level "Tenant Admin" role (implicit full access; menus are
        // computed at login as role menus ∩ company entitlement, so no grants).
        const tenantAdminRole = await Role.create({
            accountId: account.id,
            name: 'Tenant Admin',
            description: 'Full administrative access to the company workspace.'
        }, { transaction });

        // Subscribe the company to the SELECTED modules (entitlement only). The
        // set of modules is chosen per-subscriber (independent of plan).
        const selectedModuleIds = Array.isArray(moduleIds) ? moduleIds : [];
        if (selectedModuleIds.length > 0) {
            await CompanyModule.bulkCreate(
                selectedModuleIds.map(moduleId => ({ companyId: company.id, moduleId, isActive: true })),
                { transaction }
            );
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

// PATCH /api/admin/subscriptions/:id
// Amend a subscriber: account-level fields (subscriberName / subscriptionPlan /
// status) plus the subscriber's PRIMARY (oldest) company's details
// (registrationNumber / timezone). Only provided fields are changed.
exports.updateSubscription = async (req, res) => {
    const { id } = req.params;
    const { subscriberName, subscriptionPlan, status, registrationNumber, timezone } = req.body;

    const transaction = await sequelize.transaction();
    try {
        const account = await Account.findByPk(id, { transaction });
        if (!account) {
            await transaction.rollback();
            return res.status(404).json({ message: "Subscriber not found." });
        }

        // --- Account-level fields ---
        if (typeof subscriberName === 'string') {
            if (!subscriberName.trim()) {
                await transaction.rollback();
                return res.status(400).json({ message: "Subscriber / Company name is required." });
            }
            account.subscriberName = subscriberName.trim();
        }
        if (typeof subscriptionPlan === 'string' && subscriptionPlan.trim()) {
            account.subscriptionPlan = subscriptionPlan.trim();
        }
        if (typeof status === 'string' && status.trim()) {
            account.status = status.trim();
        }
        await account.save({ transaction });

        // --- Primary company fields (the subscriber's first/oldest company) ---
        if (registrationNumber !== undefined || timezone !== undefined) {
            const company = await Company.findOne({
                where: { accountId: account.id },
                order: [['createdAt', 'ASC']],
                transaction,
            });
            if (company) {
                if (registrationNumber !== undefined) {
                    const v = typeof registrationNumber === 'string' ? registrationNumber.trim() : registrationNumber;
                    company.registrationNumber = v === '' ? null : v;
                }
                if (timezone !== undefined) {
                    const v = typeof timezone === 'string' ? timezone.trim() : timezone;
                    // timezone is NOT NULL — keep the existing value if cleared.
                    company.timezone = v ? v : (company.timezone || 'Asia/Kuala_Lumpur');
                }
                await company.save({ transaction });
            }
        }

        await transaction.commit();

        // Return the updated subscriber in the same shape as listSubscriptions.
        const updated = await Account.findByPk(account.id, {
            include: [{ model: Company, as: 'Companies' }],
        });
        res.status(200).json({
            message: "Subscriber updated.",
            data: { ...updated.toJSON(), companyName: updated.subscriberName },
        });
    } catch (error) {
        if (transaction && !transaction.finished) await transaction.rollback();
        console.error("Update Subscription Error:", error);
        res.status(500).json({ message: "Internal server error" });
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


