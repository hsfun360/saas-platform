// src/modules/saas/tenant.controller.js
//
// Tenant-scoped user & role management, performed BY a Tenant Admin WITHIN their
// own company. Every query is scoped to req.user.companyId (taken from the JWT),
// so a Tenant Admin can never see or touch another company's data.

const User = require('../identity/user.model');
const CompanyUser = require('./companyUser.model');
const Role = require('./role.model');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../../platform/db');

// GET /api/auth/company/roles  -> roles defined for the caller's company
exports.listTenantRoles = async (req, res) => {
    try {
        const companyId = req.user.companyId;
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

// GET /api/auth/company/users  -> users in the caller's company, with their role
exports.listTenantUsers = async (req, res) => {
    try {
        const companyId = req.user.companyId;
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

// POST /api/auth/company/users  -> create a user in the caller's company
// Body: { email, password, fullName, phone?, roleId? }
exports.createTenantUser = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const companyId = req.user.companyId;
        const { email, password, fullName, phone, roleId } = req.body;

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

// POST /api/auth/company/users/assign-role  -> set a user's role within the company
// Body: { userId, roleId }
exports.assignTenantUserRole = async (req, res) => {
    try {
        const companyId = req.user.companyId;
        const { userId, roleId } = req.body;

        if (!userId || !roleId) {
            return res.status(400).json({ message: "User ID and Role ID are required." });
        }

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

        membership.roleId = roleId;
        await membership.save();

        res.status(200).json({ message: "User role updated successfully." });
    } catch (error) {
        console.error("Error assigning tenant user role:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
