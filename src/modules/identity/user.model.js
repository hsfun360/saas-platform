// src/models/user.model.js

const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

const User = sequelize.define('User', {
    // Unique identifier, automatically managed by Sequelize
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    // User email (must be unique)
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        //unique: true,
        validate: {
            isEmail: true,
        },
    },
    // Hashed password for local login
    password: {
        type: DataTypes.STRING,
        allowNull: true, // Allow null for OAuth users
    },
    // The method used for the last successful login (e.g., 'local', 'google')
    authMethod: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'local',
    },
    full_name: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    phone: {
        type: DataTypes.STRING,
        allowNull: true, // allowNull: true because a user might not provide it immediately
    },
    bio: {
        type: DataTypes.TEXT, // TEXT is better than STRING for bios because it allows long paragraphs
        allowNull: true,
    },
    profilePicture: {
        type: DataTypes.TEXT, // TEXT is required because Base64 image strings are very long
        allowNull: true,
    },
    // Add these 2 fields for email verification
    isVerified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false, // Users are unverified by default
    },
    verificationToken: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    resetPasswordToken: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    resetPasswordExpires: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    // Optional: Used to track the Google/OAuth ID if external login is used
    googleId: {
        type: DataTypes.STRING,
        allowNull: true
    },
    microsoftId: {
        type: DataTypes.STRING,
        allowNull: true
    }
}, {
    tableName: 'User', // Name the table in PostgreSQL 'User'
    timestamps: true, // Adds createdAt and updatedAt columns

    // --- CRITICAL INDEX CONFIGURATION ---
    indexes: [
        {
            name: 'IDX_User_Email_Unique',
            fields: ['email'],
            unique: true
        },
        {
            name: 'IDX_User_GoogleId_Unique',
            fields: ['googleId'],
            unique: true,
        },
        {
            name: 'IDX_User_MicrosoftId_Unique',
            fields: ['microsoftId'],
            unique: true,
        }

    ]
});

// IMPORTANT: This call creates the 'users' table if it doesn't exist.
// Force: true drops the table first (use ONLY in development)
// await User.sync({ alter: true }); // Use { alter: true } in development to safely update the schema

module.exports = User;
