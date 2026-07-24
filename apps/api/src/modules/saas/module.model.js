const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

const Module = sequelize.define('Module', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true // e.g., "Golf Management" — base/English name + fallback
    },
    // Localized names keyed by language code, e.g. { en: 'Golf Management', ms: '...' }.
    // Edited in the Modules & Menus screen; resolved to the active language at
    // display, falling back to `name`.
    names: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
    },
    icon: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'widgets' // Fallback icon
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true
    },
    landingRoute: {
        type: DataTypes.STRING,
        allowNull: true // the system's default dashboard route, e.g. '/golf'
    },
    // System module (like a system Role): platform infrastructure every tenant
    // needs - always entitled by provisioning, never deletable, base name
    // locked (code + the mandatory-entitlement lookup key on it). Stamped at
    // boot by ensureSystemModules(); currently "System Administration".
    isSystem: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    }
});

module.exports = Module;