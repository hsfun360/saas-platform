const User = require('../models/user.model');
const Role = require('../models/role.model');
const CompanyUser = require('../models/companyUser.model');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../config/db');

// --- 1. ROLE MANAGEMENT ---

// POST /api/roles
exports.createRole = async (req, res) => {
    try {
        const { name, description, companyId } = req.body;

        if (!name) {
            return res.status(400).json({ message: "Role name is required." });
        }

        // If companyId is provided, it's a Tenant Role. If null, it's an Internal SaaS Role.
        const targetCompanyId = companyId || null;

        const existingRole = await Role.findOne({ 
            where: { name: name, companyId: targetCompanyId } 
        });

        if (existingRole) {
            return res.status(409).json({ message: "Role already exists for this workspace." });
        }

        const newRole = await Role.create({
            name,
            description,
            companyId: targetCompanyId
        });

        res.status(201).json({ message: "Role created successfully", role: newRole });
    } catch (error) {
        console.error("Error creating role:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// GET /api/roles?companyId=XYZ
exports.getRoles = async (req, res) => {
    try {
        // Fetch internal roles if no companyId is passed
        const targetCompanyId = req.query.companyId || null; 
        
        const roles = await Role.findAll({ where: { companyId: targetCompanyId } });
        res.status(200).json(roles);
    } catch (error) {
        console.error("Error fetching roles:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// --- 2. USER MANAGEMENT ---

// POST /api/users
exports.createUser = async (req, res) => {
    try {
        const { email, password, fullName, phone } = req.body;

        if (!email || !password || !fullName) {
            return res.status(400).json({ message: "Email, password, and full name are required." });
        }

        // Check if user already exists across the ENTIRE system
        const existingUser = await User.findOne({ where: { email: email.toLowerCase() } });
        if (existingUser) {
            return res.status(409).json({ message: "User with this email already exists." });
        }

        // Hash the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create the global user identity
        const newUser = await User.create({
            email: email.toLowerCase(),
            password: hashedPassword,
            full_name: fullName,
            phone: phone || null
        });

        // Remove password from the response for security
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

        // Verify the user exists
        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        // Verify the role exists
        const role = await Role.findByPk(roleId);
        if (!role) {
            return res.status(404).json({ message: "Role not found." });
        }

        const targetCompanyId = companyId || null;

        // Ensure we aren't creating a duplicate assignment for this specific workspace
        const existingAssignment = await CompanyUser.findOne({
            where: { userId, companyId: targetCompanyId }
        });

        if (existingAssignment) {
            // Update their existing role in this workspace
            existingAssignment.roleId = roleId;
            await existingAssignment.save();
            return res.status(200).json({ message: "User role updated successfully.", assignment: existingAssignment });
        }

        // Create a new workspace/role assignment
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