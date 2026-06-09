// src/wiring/associations.js
//
// Centralized Sequelize associations for the modular monolith.
//
// ⚠️ MICROSERVICES SEAM: Some of these associations cross the identity <-> saas
// boundary (notably User <-> Company through CompanyUser, and Role's link back to
// users). They are intentionally kept INTACT in step 1 to preserve the current
// eager-loading behavior used by the login flow. When the Identity service is
// extracted (step 2), the cross-boundary foreign keys become soft UUID references
// (no DB-level FK) and the eager-loads become service calls / events.
//
// Requiring this module is what defines every model + association exactly once.

const User = require('../modules/identity/user.model');
const OutboxMessage = require('../platform/outboxMessage.model');
const Account = require('../modules/saas/account.model');
const Company = require('../modules/saas/company.model');
const CompanyUser = require('../modules/saas/companyUser.model');
const Module = require('../modules/saas/module.model');
const Menu = require('../modules/saas/menu.model');
const CompanyModule = require('../modules/saas/companyModule.model');
const Role = require('../modules/saas/role.model');
const RoleMenu = require('../modules/saas/roleMenu.model');
const RegistrationLead = require('../modules/saas/registrationLead.model');

// --- DEFINE SAAS RELATIONSHIPS ---

// 1. Account -> Companies (One-to-Many)
Account.hasMany(Company, { foreignKey: 'accountId', as: 'Companies' });
Company.belongsTo(Account, { foreignKey: 'accountId', as: 'Account' });

// 2. User <-> Companies (Many-to-Many through CompanyUser)  [identity <-> saas seam]
User.belongsToMany(Company, { through: CompanyUser, foreignKey: 'userId', as: 'Companies' });
Company.belongsToMany(User, { through: CompanyUser, foreignKey: 'companyId', as: 'Users' });

// 3. Modules & Menus (System Level)
Module.hasMany(Menu, { foreignKey: 'moduleId', as: 'Menus' });
Menu.belongsTo(Module, { foreignKey: 'moduleId', as: 'Module' });

// 4. Company Subscriptions (Paywall)
Company.belongsToMany(Module, { through: CompanyModule, foreignKey: 'companyId', as: 'SubscribedModules' });
Module.belongsToMany(Company, { through: CompanyModule, foreignKey: 'moduleId', as: 'SubscribedCompanies' });

// 5. Tenant Roles (Workspace Level)
Company.hasMany(Role, { foreignKey: 'companyId', as: 'Roles' });
Role.belongsTo(Company, { foreignKey: 'companyId', as: 'Company' });

// 6. Role Permissions (Menu Access)
Role.belongsToMany(Menu, { through: RoleMenu, foreignKey: 'roleId', as: 'PermittedMenus' });
Menu.belongsToMany(Role, { through: RoleMenu, foreignKey: 'menuId', as: 'Roles' });

// 7. Assigning Roles to Users
Role.hasMany(CompanyUser, { foreignKey: 'roleId', as: 'AssignedUsers' });
CompanyUser.belongsTo(Role, { foreignKey: 'roleId', as: 'Role' });

module.exports = {
    User,
    OutboxMessage,
    Account,
    Company,
    CompanyUser,
    Module,
    Menu,
    CompanyModule,
    Role,
    RoleMenu,
    RegistrationLead,
};
