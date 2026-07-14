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
// Notification service tables. EmailTemplate references Account by plain UUID
// (no FK) to respect the notification-service seam, so it has no associations.
const EmailTemplate = require('../modules/notification/emailTemplate.model');
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
const CompanySmtpConfig = require('../modules/saas/companySmtpConfig.model'); // per-company outgoing SMTP (references companyId by UUID; no FK)
const IndustryType = require('../modules/saas/industryType.model'); // subscriber-owned reference data (accountId value ref; no associations)
const Salutation = require('../modules/saas/salutation.model'); // subscriber-owned reference data (accountId value ref; no associations)
const Nationality = require('../modules/saas/nationality.model'); // subscriber-owned reference data (accountId value ref; deliberately NOT linked to Country)
const Race = require('../modules/saas/race.model'); // subscriber-owned reference data (accountId value ref; no associations)
const PublicHoliday = require('../modules/saas/publicHoliday.model'); // subscriber-owned reference data, scoped by country (accountId + countryCode value refs; no associations)
const CompanyWeekendDay = require('../modules/saas/companyWeekendDay.model'); // company-level weekend/rest-day set (companyId value ref; no associations)
// Product tier (Membership Management). Master files reference companyId by plain
// UUID (no cross-service FK), per the golden rules. Intra-service parent-child
// links (fee -> stages, type -> fee lines) DO use real associations - that
// boundary is inside the membership service.
const MembershipStatus = require('../modules/membership/membershipStatus.model');
const MembershipFee = require('../modules/membership/membershipFee.model');
const MembershipFeeScheme = require('../modules/membership/membershipFeeScheme.model');
const MembershipType = require('../modules/membership/membershipType.model');
const MembershipTypeFee = require('../modules/membership/membershipTypeFee.model');
const MembershipTypeStandingCharge = require('../modules/membership/membershipTypeStandingCharge.model');
// Product tier (Golf Management). Same golden rules - master files reference
// companyId by plain UUID (no cross-service FK). Intra-service parent-child
// links (unit course -> holes) DO use real associations.
const UnitCourse = require('../modules/golf/unitCourse.model');
const UnitCourseHole = require('../modules/golf/unitCourseHole.model');
const UnitCourseTeeBox = require('../modules/golf/unitCourseTeeBox.model');
const UnitCourseTeeBoxDistance = require('../modules/golf/unitCourseTeeBoxDistance.model');
// 18-hole course = a pairing of unit courses. The nine references are plain
// UUIDs validated in the controller (no eager-load need), so no associations.
const Course = require('../modules/golf/course.model');
// Shared financial reference (Tax). Header/detail pairs are intra-service, so they
// DO associate; accountId/countryCode/companyId stay plain UUID/value references.
// (The template seed layer was removed in the tax refactor - no template models.)
const TaxScheme = require('../modules/tax/taxScheme.model');
const TaxRate = require('../modules/tax/taxRate.model');
const CompanyTaxScheme = require('../modules/tax/companyTaxScheme.model');
const CompanyTaxAccount = require('../modules/tax/companyTaxAccount.model');

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
// permissions, owned by an Account (accountId NULL = platform/system role). The
// legacy Company<->Role link was removed with the companyId column (2026-07-10);
// keeping the belongsTo would re-add companyId as a Role attribute on every SELECT.
Account.hasMany(Role, { foreignKey: 'accountId', as: 'Roles' });
Role.belongsTo(Account, { foreignKey: 'accountId', as: 'Account' });

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

// 8d. Membership master-file header/detail pairs (both sides owned by the
// membership service, so real intra-service FKs with cascade).
// Membership Fee -> its installment stages.
MembershipFee.hasMany(MembershipFeeScheme, { foreignKey: 'membershipFeeId', as: 'Stages', onDelete: 'CASCADE' });
MembershipFeeScheme.belongsTo(MembershipFee, { foreignKey: 'membershipFeeId', as: 'Fee' });
// Membership Type -> its additional fee lines.
MembershipType.hasMany(MembershipTypeFee, { foreignKey: 'membershipTypeId', as: 'AdditionalFees', onDelete: 'CASCADE' });
MembershipTypeFee.belongsTo(MembershipType, { foreignKey: 'membershipTypeId', as: 'Type' });
// Membership Type -> its standing charges (one per membership status).
MembershipType.hasMany(MembershipTypeStandingCharge, { foreignKey: 'membershipTypeId', as: 'StandingCharges', onDelete: 'CASCADE' });
MembershipTypeStandingCharge.belongsTo(MembershipType, { foreignKey: 'membershipTypeId', as: 'Type' });

// 8e. Golf master-file header/detail pairs (both sides owned by the golf
// service, so real intra-service FKs with cascade).
// Unit Course -> its hole rows (numbering fixed by the course type).
UnitCourse.hasMany(UnitCourseHole, { foreignKey: 'unitCourseId', as: 'Holes', onDelete: 'CASCADE' });
UnitCourseHole.belongsTo(UnitCourse, { foreignKey: 'unitCourseId', as: 'UnitCourse' });
// Unit Course -> its tee boxes -> per-hole distances. (Difficulty ratings are
// NOT kept at this level - they arrive with the 18-hole Course Setup.)
UnitCourse.hasMany(UnitCourseTeeBox, { foreignKey: 'unitCourseId', as: 'TeeBoxes', onDelete: 'CASCADE' });
UnitCourseTeeBox.belongsTo(UnitCourse, { foreignKey: 'unitCourseId', as: 'UnitCourse' });
UnitCourseTeeBox.hasMany(UnitCourseTeeBoxDistance, { foreignKey: 'teeBoxId', as: 'Distances', onDelete: 'CASCADE' });
UnitCourseTeeBoxDistance.belongsTo(UnitCourseTeeBox, { foreignKey: 'teeBoxId', as: 'TeeBox' });

// 9. Tax scheme -> rate line(s), header/detail. Both tiers are wholly inside the
// Tax service, so these are real intra-service FKs (cascade lines with the header).
// 9b. Subscriber-owned authoritative catalog (effective-dated rates).
TaxScheme.hasMany(TaxRate, { foreignKey: 'taxSchemeId', as: 'Rates', onDelete: 'CASCADE' });
TaxRate.belongsTo(TaxScheme, { foreignKey: 'taxSchemeId', as: 'Scheme' });
// 9c. Per-company adoption/override of a scheme, with per-component GL overrides.
TaxScheme.hasMany(CompanyTaxScheme, { foreignKey: 'taxSchemeId', as: 'CompanyAdoptions', onDelete: 'CASCADE' });
CompanyTaxScheme.belongsTo(TaxScheme, { foreignKey: 'taxSchemeId', as: 'Scheme' });
CompanyTaxScheme.hasMany(CompanyTaxAccount, { foreignKey: 'companyTaxSchemeId', as: 'GlOverrides', onDelete: 'CASCADE' });
CompanyTaxAccount.belongsTo(CompanyTaxScheme, { foreignKey: 'companyTaxSchemeId', as: 'CompanyScheme' });

module.exports = {
    User,
    OutboxMessage,
    EmailTemplate,
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
    CompanySmtpConfig,
    IndustryType,
    Salutation,
    Nationality,
    Race,
    PublicHoliday,
    CompanyWeekendDay,
    MembershipStatus,
    MembershipFee,
    MembershipFeeScheme,
    MembershipType,
    MembershipTypeFee,
    MembershipTypeStandingCharge,
    UnitCourse,
    UnitCourseHole,
    UnitCourseTeeBox,
    UnitCourseTeeBoxDistance,
    Course,
    TaxScheme,
    TaxRate,
    CompanyTaxScheme,
    CompanyTaxAccount,
};
