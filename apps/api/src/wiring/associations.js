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
const Invitation = require('../modules/saas/invitation.model');
const Country = require('../modules/saas/country.model'); // standalone reference table (no associations)
const Language = require('../modules/saas/language.model'); // reference table
const Currency = require('../modules/saas/currency.model'); // reference table
const AccountCurrency = require('../modules/saas/accountCurrency.model'); // Account <-> Currency join
const AccountLanguage = require('../modules/saas/accountLanguage.model'); // Account <-> Language join

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

// 3b. Menu tree (adjacency list) — a menu may nest under another menu in the
// same module, to arbitrary depth. Deleting a parent lifts its children up a
// level (SET NULL), it never cascade-deletes them.
Menu.hasMany(Menu, { foreignKey: 'parentId', as: 'Children', onDelete: 'SET NULL' });
Menu.belongsTo(Menu, { foreignKey: 'parentId', as: 'Parent' });

// 4. Company Subscriptions (Paywall)
Company.belongsToMany(Module, { through: CompanyModule, foreignKey: 'companyId', as: 'SubscribedModules' });
Module.belongsToMany(Company, { through: CompanyModule, foreignKey: 'moduleId', as: 'SubscribedCompanies' });

// 5. Roles (Account Level) — a Role is an account-wide named set of menu
// permissions. The legacy Company<->Role link is kept during the transition
// (dropped once migrate-account-roles.js backfills + merges).
Account.hasMany(Role, { foreignKey: 'accountId', as: 'Roles' });
Role.belongsTo(Account, { foreignKey: 'accountId', as: 'Account' });
Company.hasMany(Role, { foreignKey: 'companyId', as: 'CompanyRoles' });   // legacy
Role.belongsTo(Company, { foreignKey: 'companyId', as: 'Company' });       // legacy

// 6. Role Permissions (Menu Access)
Role.belongsToMany(Menu, { through: RoleMenu, foreignKey: 'roleId', as: 'PermittedMenus' });
Menu.belongsToMany(Role, { through: RoleMenu, foreignKey: 'menuId', as: 'Roles' });

// 7. Assigning Roles to Users
Role.hasMany(CompanyUser, { foreignKey: 'roleId', as: 'AssignedUsers' });
CompanyUser.belongsTo(Role, { foreignKey: 'roleId', as: 'Role' });

// 8b. Subscriber language selection (Account opts into a subset of Languages)
Account.belongsToMany(Language, { through: AccountLanguage, foreignKey: 'accountId', otherKey: 'languageCode', as: 'Languages' });
Language.belongsToMany(Account, { through: AccountLanguage, foreignKey: 'languageCode', otherKey: 'accountId', as: 'Accounts' });

// 8c. Subscriber currency selection (Account opts into a subset of Currencies)
Account.belongsToMany(Currency, { through: AccountCurrency, foreignKey: 'accountId', otherKey: 'currencyCode', as: 'Currencies' });
Currency.belongsToMany(Account, { through: AccountCurrency, foreignKey: 'currencyCode', otherKey: 'accountId', as: 'CurrencyAccounts' });

// 8. Collaborator Invitations (consent-based cross-tenant bridge)
Invitation.belongsTo(Company, { foreignKey: 'companyId', as: 'Company' });
Invitation.belongsTo(Account, { foreignKey: 'accountId', as: 'Account' });
Invitation.belongsTo(Role, { foreignKey: 'roleId', as: 'Role' });

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
    Invitation,
    Country,
    Language,
    AccountLanguage,
    Currency,
    AccountCurrency,
};
