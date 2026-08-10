const { DataTypes } = require('sequelize');
const { sequelize } = require('../../platform/db');

// UserFavorite - a screen the user pinned to My Dashboard's Quick access
// (the fav-star beside each screen title), stored SERVER-SIDE so favorites
// follow the user across devices (same reasoning as User.lastWorkspaceId).
//
// Scoped per (userId, companyId): a user's favorites in one club are not the
// same list as in another (different modules, different grants). companyId
// NULL = the SYSTEM workspace (platform users pin SaaS Administration screens),
// following the platform NULL-discriminator pattern - the partial unique below
// backs the NULL subset because Postgres treats NULLs as distinct in the
// composite unique. References are plain UUIDs (userId -> Identity's User,
// companyId -> Company, menuId -> Menu) with no DB FKs, per the cross-service
// golden rules. `sequence` is the user's own sort order (managed on My
// Dashboard); the whole list is PUT-replaced like CompanyWeekendDay.
const UserFavorite = sequelize.define('UserFavorite', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    userId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    companyId: {
        type: DataTypes.UUID,
        allowNull: true, // NULL = the SYSTEM (platform) workspace
    },
    menuId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    sequence: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
}, {
    tableName: 'UserFavorite',
    timestamps: true,
    indexes: [
        { name: 'IDX_UserFavorite_User_Company_Menu', fields: ['userId', 'companyId', 'menuId'], unique: true },
        // The SYSTEM-workspace subset: companyId NULL escapes the composite
        // unique (Postgres NULLs are distinct), so it gets its own partial.
        {
            name: 'UX_UserFavorite_User_Menu_System',
            fields: ['userId', 'menuId'],
            unique: true,
            where: { companyId: null },
        },
    ],
});

module.exports = UserFavorite;
