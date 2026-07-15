const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

// A role's grant to one (leaf) menu. The ROW EXISTING means View access; the
// three flags refine what the role may do on that screen (any write implies
// View by construction — there is no "edit but not view" state to mis-configure).
// Defaults are true so pre-flag grants keep behaving as full access when
// sync({ alter }) adds the columns.
const RoleMenu = sequelize.define('RoleMenu', {
    roleId: {
        type: DataTypes.UUID,
        allowNull: false,
        primaryKey: true
    },
    menuId: {
        type: DataTypes.UUID,
        allowNull: false,
        primaryKey: true
    },
    canCreate: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    canEdit: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    canDelete: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    }
}, {
    timestamps: false // No need for createdAt/updatedAt on a simple mapping table
});

module.exports = RoleMenu;