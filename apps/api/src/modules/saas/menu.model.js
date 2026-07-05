const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

const Menu = sequelize.define('Menu', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false // e.g., "Tee Time Setup" — base/English name + fallback
    },
    // Localized names keyed by language code, e.g. { en: 'Companies', ms: 'Syarikat' }.
    // Edited in the Modules & Menus screen; resolved to the active language at
    // display, falling back to `name`.
    names: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
    },
    // Adjacency list: a menu may nest under another menu in the SAME module
    // (arbitrary depth). Null = top level. A menu with children acts as a
    // collapsible section in the sidebar. Self-referencing FK, SET NULL on
    // delete so removing a parent lifts its children up a level (never cascades).
    parentId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'Menus', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
    },
    // Order among siblings (menus sharing the same parentId). Set by drag-reorder.
    sequence: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    },
    route: {
        type: DataTypes.STRING,
        allowNull: false // e.g., "/golf/tee-times"
    },
    icon: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'folder' // Default icon just in case!
    },
    moduleId: {
        type: DataTypes.UUID,
        allowNull: false // Links to the Module table
    }
});

module.exports = Menu;