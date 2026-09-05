import { ApplicationConfig, provideAppInitializer, inject } from '@angular/core';
import { provideRouter, Routes } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './app/auth.interceptor';
import { bootstrapApplication } from '@angular/platform-browser';
import { I18nService } from './app/i18n/i18n.service';
import { ThemeService } from './app/services/theme.service';

// Microsoft MSAL Imports
//import { MSAL_INSTANCE, MSAL_GUARD_CONFIG, MsalGuardConfiguration, MsalService } from '@azure/msal-angular';
import { MSAL_INSTANCE, MSAL_GUARD_CONFIG, MsalGuardConfiguration, MsalService, MsalBroadcastService } from '@azure/msal-angular';
import { IPublicClientApplication, PublicClientApplication, InteractionType } from '@azure/msal-browser';

// Components.
//
// Only the entry points are EAGER: the app root, the login screen (the landing
// page must paint instantly) and the Dashboard shell (top bar + sidebar). Every
// routed screen below uses `loadComponent` so it compiles into its own lazy
// chunk, loaded on first navigation - this keeps the initial bundle small and
// far away from the production `initial` error budget (it had crept to 1.99 MB
// of the 2 MB cap when everything was eager). Routes that share a component
// (e.g. tax-schemes + platform-tax) share one chunk; the import() paths make
// that automatic. New screens MUST follow this pattern (see coding-standards:
// "Implement lazy loading for feature routes").
import { App } from './app/app'; // Make sure this path matches your app.ts location!
import { LoginComponent } from './app/login/login';
import { Dashboard } from './app/dashboard/dashboard';
import { authGuard, onboardingGuard, mfaSetupGuard } from './app/auth.guard';
import { systemAccessGuard } from './app/access.guard';

// 1. Define Routes
//
// The authenticated app is a SHELL LAYOUT at the root path. Each "system" is a
// top-level namespace under it:
//   /home /profile /settings            — account / shared
//   /platform  /admin/*                 — Platform Administration (Control Plane)
//   /membership  /golf  /facility       — core product systems
// A system's landing route IS its dashboard. Public routes are matched first.
const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'register-user', loadComponent: () => import('./app/register-user/register-user').then((m) => m.RegisterUserComponent) },
  { path: 'forgot-password', loadComponent: () => import('./app/forgot-password/forgot-password').then((m) => m.ForgotPasswordComponent) },
  { path: 'reset-password', loadComponent: () => import('./app/reset-password/reset-password').then((m) => m.ResetPasswordComponent) },
  { path: 'register-lead', loadComponent: () => import('./app/register-lead/register-lead').then((m) => m.RegisterLeadComponent) },
  { path: 'setup-password', loadComponent: () => import('./app/setup-password/setup-password').then((m) => m.SetupPasswordComponent) },
  // Self-register activation email lands here (the email links the FRONTEND,
  // never the raw API host - see verifyEmailJson on the backend).
  { path: 'verify-email', loadComponent: () => import('./app/verify-email/verify-email').then((m) => m.VerifyEmailComponent) },
  // Limbo onboarding: a verified user with no workspace yet creates their
  // organization here (full-screen, outside the shell; onboarding-scoped token).
  { path: 'onboarding', loadComponent: () => import('./app/onboarding/onboarding').then((m) => m.OnboardingComponent), canActivate: [onboardingGuard] },
  // Forced MFA enrollment for admin roles (full-screen, 'mfa-enroll' token).
  { path: 'mfa-setup', loadComponent: () => import('./app/mfa-setup/mfa-setup').then((m) => m.MfaSetupComponent), canActivate: [mfaSetupGuard] },
  // Member Portal - the member's own surface, deliberately OUTSIDE the staff
  // shell (no sidebar/menus/RBAC). Registration is public (signed email-link
  // token); the portal home needs only a valid session.
  { path: 'portal/register', loadComponent: () => import('./app/portal/portal-register').then((m) => m.PortalRegisterComponent) },
  { path: 'portal', loadComponent: () => import('./app/portal/portal-home').then((m) => m.PortalHomeComponent), canActivate: [authGuard] },
  // Sales Agent portal - same shape as the member portal (public registration
  // via invite token; the home lists every engagement of the login, cross-club).
  { path: 'agent/register', loadComponent: () => import('./app/agent-portal/agent-register').then((m) => m.AgentRegisterComponent) },
  { path: 'agent', loadComponent: () => import('./app/agent-portal/agent-home').then((m) => m.AgentHomeComponent), canActivate: [authGuard] },
  {
    // Shell layout — wraps the whole authenticated tree (top bar + sidebar +
    // <router-outlet>). Children are reached at the root (e.g. /golf, /admin/roles).
    path: '',
    component: Dashboard,
    canActivate: [authGuard],
    children: [
      // Account / shared
      { path: 'home', loadComponent: () => import('./app/dashboard/home/home').then((m) => m.HomeComponent) },
      { path: 'profile', loadComponent: () => import('./app/dashboard/profile/profile').then((m) => m.ProfileComponent) },
      { path: 'settings', loadComponent: () => import('./app/dashboard/settings/settings').then((m) => m.SettingsComponent) },
      // My Approvals — the caller's personal workflow inbox. Person-scoped like
      // /home (assignee-only, enforced server-side), so no moduleCode guard.
      { path: 'approvals', loadComponent: () => import('./app/approvals/approvals').then((m) => m.ApprovalsComponent) },

      // Sample CRUD master–detail screen. Both paths point at the same component;
      // the :id segment ('new' = create) is the single source of truth for the
      // open item — deep-linkable, with working back/forward. No moduleCode
      // guard: it's a demo screen everyone may see (like home/profile).
      { path: 'items', loadComponent: () => import('./app/items/items').then((m) => m.ItemsComponent) },
      { path: 'items/:id', loadComponent: () => import('./app/items/items').then((m) => m.ItemsComponent) },

      // Platform Administration (Control Plane) — admin screens.
      // `data.moduleCode` + systemAccessGuard block users without that access.
      // NOTE: there are no per-system landing routes (/platform, /membership,
      // /golf, /facility) anymore - switching systems lands on /home
      // (My Dashboard); the launchpad pages were removed 2026-07-23.
      { path: 'admin/roles', loadComponent: () => import('./app/role-management/role-management').then((m) => m.RoleManagementComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'TENANT_ADMIN' } },
      { path: 'admin/users', loadComponent: () => import('./app/tenant-users/tenant-users').then((m) => m.TenantUsersComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'TENANT_ADMIN' } },
      { path: 'admin/companies', loadComponent: () => import('./app/companies/companies').then((m) => m.CompaniesComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'TENANT_ADMIN' } },
      { path: 'admin/account-languages', loadComponent: () => import('./app/account-languages/account-languages').then((m) => m.AccountLanguagesComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'TENANT_ADMIN' } },
      { path: 'admin/account-currencies', loadComponent: () => import('./app/account-currencies/account-currencies').then((m) => m.AccountCurrenciesComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'TENANT_ADMIN' } },
      // Subscriber-owned shared reference data (consumed across products).
      { path: 'admin/industry-types', loadComponent: () => import('./app/industry-types/industry-types').then((m) => m.IndustryTypesComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'TENANT_ADMIN' } },
      { path: 'admin/departments', loadComponent: () => import('./app/departments/departments').then((m) => m.DepartmentsComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'TENANT_ADMIN' } },
      { path: 'admin/positions', loadComponent: () => import('./app/positions/positions').then((m) => m.PositionsComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'TENANT_ADMIN' } },
      { path: 'admin/salutations', loadComponent: () => import('./app/salutations/salutations').then((m) => m.SalutationsComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'TENANT_ADMIN' } },
      { path: 'admin/nationalities', loadComponent: () => import('./app/nationalities/nationalities').then((m) => m.NationalitiesComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'TENANT_ADMIN' } },
      { path: 'admin/races', loadComponent: () => import('./app/races/races').then((m) => m.RacesComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'TENANT_ADMIN' } },
      // Numbering Control - split per owning module 2026-08-05 (one shared
      // component; the route data picks the module's table + purposes).
      { path: 'membership/numbering', loadComponent: () => import('./app/numbering/numbering').then((m) => m.NumberingComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'MEMBERSHIP', numberingModule: 'membership' } },
      { path: 'ar/numbering', loadComponent: () => import('./app/numbering/numbering').then((m) => m.NumberingComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'AR', numberingModule: 'ar' } },
      { path: 'admin/titles', loadComponent: () => import('./app/titles/titles').then((m) => m.TitlesComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'TENANT_ADMIN' } },
      { path: 'admin/public-holidays', loadComponent: () => import('./app/public-holidays/public-holidays').then((m) => m.PublicHolidaysComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'TENANT_ADMIN' } },
      { path: 'admin/workflows', loadComponent: () => import('./app/workflow-setup/workflow-setup').then((m) => m.WorkflowSetupComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'TENANT_ADMIN' } },
      { path: 'admin/account-email-templates', loadComponent: () => import('./app/account-email-templates/account-email-templates').then((m) => m.AccountEmailTemplatesComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'TENANT_ADMIN' } },
      { path: 'admin/account-email-templates/:key', loadComponent: () => import('./app/account-email-templates/account-email-template-edit').then((m) => m.AccountEmailTemplateEditComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'TENANT_ADMIN' } },
      // Tax Setup — subscriber-owned tax-scheme catalog (master–detail; :id opens a scheme).
      { path: 'admin/tax-schemes', loadComponent: () => import('./app/tax-schemes/tax-schemes').then((m) => m.TaxSchemesComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'TENANT_ADMIN' } },
      { path: 'admin/tax-schemes/:id', loadComponent: () => import('./app/tax-schemes/tax-schemes').then((m) => m.TaxSchemesComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'TENANT_ADMIN' } },
      // Company Tax — per active company: which schemes it uses + GL overrides.
      { path: 'admin/company-tax', loadComponent: () => import('./app/company-tax/company-tax').then((m) => m.CompanyTaxComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'TENANT_ADMIN' } },
      // Platform Tax - the platform's own tax catalog (accountId NULL), SaaS Admin.
      // Reuses the Tax Setup screen at platform scope via data.taxScope.
      { path: 'admin/platform-tax', loadComponent: () => import('./app/tax-schemes/tax-schemes').then((m) => m.TaxSchemesComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'PLATFORM_ADMIN', taxScope: 'platform' } },
      { path: 'admin/platform-tax/:id', loadComponent: () => import('./app/tax-schemes/tax-schemes').then((m) => m.TaxSchemesComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'PLATFORM_ADMIN', taxScope: 'platform' } },
      // Platform Profile - the platform's own company of record (invoice issuer + tax anchor), SaaS Admin.
      { path: 'admin/platform-profile', loadComponent: () => import('./app/platform-profile/platform-profile').then((m) => m.PlatformProfileComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'PLATFORM_ADMIN' } },
      { path: 'admin/subscribers', loadComponent: () => import('./app/subscribers/subscribers').then((m) => m.SubscribersComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'PLATFORM_ADMIN' } },
      { path: 'admin/system-roles', loadComponent: () => import('./app/platform-roles/platform-roles').then((m) => m.PlatformRolesComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'PLATFORM_ADMIN' } },
      { path: 'admin/platform-users', loadComponent: () => import('./app/platform-users/platform-users').then((m) => m.PlatformUsersComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'PLATFORM_ADMIN' } },
      { path: 'admin/unverified-users', loadComponent: () => import('./app/unverified-users/unverified-users').then((m) => m.UnverifiedUsersComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'PLATFORM_ADMIN' } },
      { path: 'admin/audit-log', loadComponent: () => import('./app/audit-log/audit-log').then((m) => m.AuditLogComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'PLATFORM_ADMIN' } },
      // Tenant-scoped audit view (System Setup; menu record added in the DB
      // like the other System Setup screens - route /admin/account-audit-log).
      { path: 'admin/account-audit-log', loadComponent: () => import('./app/audit-log/audit-log').then((m) => m.AuditLogComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'TENANT_ADMIN', auditScope: 'account' } },
      { path: 'admin/countries', loadComponent: () => import('./app/countries/countries').then((m) => m.CountriesComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'PLATFORM_ADMIN' } },
      { path: 'admin/languages', loadComponent: () => import('./app/languages/languages').then((m) => m.LanguagesComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'PLATFORM_ADMIN' } },
      { path: 'admin/currencies', loadComponent: () => import('./app/currencies/currencies').then((m) => m.CurrenciesComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'PLATFORM_ADMIN' } },
      { path: 'admin/e-invoice-classification-codes', loadComponent: () => import('./app/e-invoice-classification-codes/e-invoice-classification-codes').then((m) => m.EInvoiceClassificationCodesComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'PLATFORM_ADMIN' } },
      { path: 'admin/e-invoice-msic-codes', loadComponent: () => import('./app/e-invoice-msic-codes/e-invoice-msic-codes').then((m) => m.EInvoiceMsicCodesComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'PLATFORM_ADMIN' } },
      { path: 'admin/e-invoice-tax-types', loadComponent: () => import('./app/e-invoice-tax-types/e-invoice-tax-types').then((m) => m.EInvoiceTaxTypesComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'PLATFORM_ADMIN' } },
      { path: 'admin/e-invoice-unit-types', loadComponent: () => import('./app/e-invoice-unit-types/e-invoice-unit-types').then((m) => m.EInvoiceUnitTypesComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'PLATFORM_ADMIN' } },
      { path: 'admin/e-invoice-state-codes', loadComponent: () => import('./app/e-invoice-state-codes/e-invoice-state-codes').then((m) => m.EInvoiceStateCodesComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'PLATFORM_ADMIN' } },
      { path: 'admin/e-invoice-payment-methods', loadComponent: () => import('./app/e-invoice-payment-methods/e-invoice-payment-methods').then((m) => m.EInvoicePaymentMethodsComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'PLATFORM_ADMIN' } },
      { path: 'admin/e-invoice-document-types', loadComponent: () => import('./app/e-invoice-document-types/e-invoice-document-types').then((m) => m.EInvoiceDocumentTypesComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'PLATFORM_ADMIN' } },
      { path: 'admin/system-setup', loadComponent: () => import('./app/system-setup/system-setup').then((m) => m.SystemSetupComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'PLATFORM_ADMIN' } },
      // The catalogue maintenance is split into two grantable screens - one per
      // Module.audience - sharing one component (route data picks the side).
      { path: 'admin/modules-menus', loadComponent: () => import('./app/modules-menus/modules-menus').then((m) => m.ModulesMenusComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'PLATFORM_ADMIN', audience: 'tenant' } },
      { path: 'admin/modules-menus/:moduleId', loadComponent: () => import('./app/modules-menus/modules-menus').then((m) => m.ModulesMenusComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'PLATFORM_ADMIN', audience: 'tenant' } },
      { path: 'admin/platform-menus', loadComponent: () => import('./app/modules-menus/modules-menus').then((m) => m.ModulesMenusComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'PLATFORM_ADMIN', audience: 'platform' } },
      { path: 'admin/platform-menus/:moduleId', loadComponent: () => import('./app/modules-menus/modules-menus').then((m) => m.ModulesMenusComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'PLATFORM_ADMIN', audience: 'platform' } },
      { path: 'admin/email-templates', loadComponent: () => import('./app/email-templates/email-templates').then((m) => m.EmailTemplatesComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'PLATFORM_ADMIN' } },
      { path: 'admin/email-templates/:key', loadComponent: () => import('./app/email-templates/email-template-edit').then((m) => m.EmailTemplateEditComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'PLATFORM_ADMIN' } },

      // Core product systems.
      // Business Insights - the two analytics screens (split 2026-07-22):
      // membership movement/demographics, and sales channel/agent performance.
      { path: 'membership/membership-analysis', loadComponent: () => import('./app/membership-insights/membership-analysis').then((m) => m.MembershipAnalysisComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'MEMBERSHIP' } },
      { path: 'membership/agent-performance', loadComponent: () => import('./app/membership-insights/agent-performance').then((m) => m.AgentPerformanceComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'MEMBERSHIP' } },
      // Club Specification (SRS 2.1.1) - the per-company membership system master.
      { path: 'membership/settings', loadComponent: () => import('./app/club-specification/club-specification').then((m) => m.ClubSpecificationComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'MEMBERSHIP' } },
      // Master File Setup → Membership Status (per-company master file).
      { path: 'membership/statuses', loadComponent: () => import('./app/membership-statuses/membership-statuses').then((m) => m.MembershipStatusesComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'MEMBERSHIP' } },
      { path: 'membership/fees', loadComponent: () => import('./app/membership-fees/membership-fees').then((m) => m.MembershipFeesComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'MEMBERSHIP' } },
      { path: 'membership/types', loadComponent: () => import('./app/membership-types/membership-types').then((m) => m.MembershipTypesComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'MEMBERSHIP' } },
      { path: 'membership/transaction-types', loadComponent: () => import('./app/membership-transaction-types/membership-transaction-types').then((m) => m.MembershipTransactionTypesComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'MEMBERSHIP' } },
      // Membership / Member CRM (SRS 2.3): the contract list (individual +
      // corporate, nominees/dependents managed inside) and the flat member search.
      { path: 'membership/memberships', loadComponent: () => import('./app/memberships/memberships').then((m) => m.MembershipsComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'MEMBERSHIP' } },
      { path: 'membership/members', loadComponent: () => import('./app/members/members').then((m) => m.MembersComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'MEMBERSHIP' } },
      // Membership import (Excel -> staging -> selective migration).
      { path: 'membership/import', loadComponent: () => import('./app/membership-import/membership-import').then((m) => m.MembershipImportComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'MEMBERSHIP' } },
      { path: 'membership/import/:id', loadComponent: () => import('./app/membership-import/membership-import').then((m) => m.MembershipImportComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'MEMBERSHIP' } },
      // Membership Type import (same staging pattern, one flat sheet).
      { path: 'membership/type-import', loadComponent: () => import('./app/membership-type-import/membership-type-import').then((m) => m.MembershipTypeImportComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'MEMBERSHIP' } },
      { path: 'membership/type-import/:id', loadComponent: () => import('./app/membership-type-import/membership-type-import').then((m) => m.MembershipTypeImportComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'MEMBERSHIP' } },
      // Billing Schedules (fee runs) - list + per-schedule review (same menu).
      { path: 'membership/billing', loadComponent: () => import('./app/membership-billing/membership-billing').then((m) => m.MembershipBillingComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'MEMBERSHIP' } },
      { path: 'membership/billing/:id', loadComponent: () => import('./app/membership-billing/membership-billing-detail').then((m) => m.MembershipBillingDetailComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'MEMBERSHIP' } },
      { path: 'membership/sales-agencies', loadComponent: () => import('./app/sales-agencies/sales-agencies').then((m) => m.SalesAgenciesComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'MEMBERSHIP' } },
      { path: 'membership/sales-agents', loadComponent: () => import('./app/sales-agents/sales-agents').then((m) => m.SalesAgentsComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'MEMBERSHIP' } },
      // Account Receivable → Debtor Listing (all three debtor types in one
      // list; Other Debtors managed from the same screen).
      { path: 'ar/debtors', loadComponent: () => import('./app/ar-debtors/ar-debtors').then((m) => m.ArDebtorsComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'AR' } },
      // Debtor account (documents/receipts/deposits) - the listing's detail
      // surface; route falls back to the /ar/debtors menu for RBAC/title.
      { path: 'ar/debtors/:id', loadComponent: () => import('./app/ar-debtor-account/ar-debtor-account').then((m) => m.ArDebtorAccountComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'AR' } },
      // AR Transactions - one menu/screen per document type (invoice first);
      // the same component serves every type via data.arDocType.
      { path: 'ar/invoices', loadComponent: () => import('./app/ar-transactions/ar-transactions').then((m) => m.ArTransactionsComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'AR', arDocType: 'invoice' } },
      { path: 'ar/debit-notes', loadComponent: () => import('./app/ar-transactions/ar-transactions').then((m) => m.ArTransactionsComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'AR', arDocType: 'debit-note' } },
      { path: 'ar/credit-notes', loadComponent: () => import('./app/ar-transactions/ar-transactions').then((m) => m.ArTransactionsComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'AR', arDocType: 'credit-note' } },
      { path: 'ar/receipts', loadComponent: () => import('./app/ar-transactions/ar-transactions').then((m) => m.ArTransactionsComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'AR', arDocType: 'receipt' } },
      { path: 'ar/refunds', loadComponent: () => import('./app/ar-transactions/ar-transactions').then((m) => m.ArTransactionsComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'AR', arDocType: 'refund' } },
      { path: 'ar/deposits', loadComponent: () => import('./app/ar-transactions/ar-transactions').then((m) => m.ArTransactionsComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'AR', arDocType: 'deposit' } },
      // Posted Interest documents (docType 'interest' since 2026-09-04) -
      // READ-ONLY listing; the Interest Generation run posts them.
      { path: 'ar/interests', loadComponent: () => import('./app/ar-transactions/ar-transactions').then((m) => m.ArTransactionsComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'AR', arDocType: 'interest' } },
      // Periodic processing: staged interest run + monthly statement run.
      { path: 'ar/interest', loadComponent: () => import('./app/ar-interest/ar-interest').then((m) => m.ArInterestComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'AR' } },
      // AR Master File Setup - the AR-owned Transaction Type catalog (moved
      // from Membership 2026-08-15; the membership route is a read-only view).
      { path: 'ar/transaction-types', loadComponent: () => import('./app/ar-transaction-types/ar-transaction-types').then((m) => m.ArTransactionTypesComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'AR' } },
      // Master File Setup → Exchange Rates (multicurrency step 1): effective-dated
      // foreign-currency rates against the company base currency.
      { path: 'ar/exchange-rates', loadComponent: () => import('./app/ar-exchange-rates/ar-exchange-rates').then((m) => m.ArExchangeRatesComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'AR' } },
      // Master File Setup → Analysis Setup (hybrid design 2026-08-25):
      // dimensions master-detail; selection in the URL for deep links/back.
      { path: 'ar/analysis', loadComponent: () => import('./app/ar-analysis/ar-analysis').then((m) => m.ArAnalysisComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'AR' } },
      { path: 'ar/analysis/:id', loadComponent: () => import('./app/ar-analysis/ar-analysis').then((m) => m.ArAnalysisComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'AR' } },
      // AR Specification - company-wide AR options (same role as Club Specification).
      { path: 'ar/settings', loadComponent: () => import('./app/ar-specification/ar-specification').then((m) => m.ArSpecificationComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'AR' } },
      { path: 'ar/statement-generation', loadComponent: () => import('./app/ar-statement-generation/ar-statement-generation').then((m) => m.ArStatementGenerationComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'AR' } },
      { path: 'ar/statements', loadComponent: () => import('./app/ar-statements/ar-statements').then((m) => m.ArStatementsComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'AR' } },
      // Master File Setup → Unit Courses (per-company 9-hole building blocks).
      { path: 'golf/unit-courses', loadComponent: () => import('./app/golf-unit-courses/golf-unit-courses').then((m) => m.GolfUnitCoursesComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'GOLF' } },
      // Master File Setup → Courses (18-hole pairing of two unit courses).
      { path: 'golf/courses', loadComponent: () => import('./app/golf-courses/golf-courses').then((m) => m.GolfCoursesComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'GOLF' } },
      // Master File Setup → Transaction Type (golf billing-item catalog).
      { path: 'golf/transaction-types', loadComponent: () => import('./app/golf-transaction-types/golf-transaction-types').then((m) => m.GolfTransactionTypesComponent), canActivate: [systemAccessGuard], data: { moduleCode: 'GOLF' } },
      // Shown when systemAccessGuard denies a route (no guard on this one).
      { path: 'access-denied', loadComponent: () => import('./app/access-denied/access-denied').then((m) => m.AccessDeniedComponent) },

      { path: '', redirectTo: 'home', pathMatch: 'full' },

      // Any other route under the shell (a menu whose page isn't built yet, or a
      // legacy /dashboard/* bookmark) renders the Under Construction placeholder
      // INSIDE the shell, so the header + sidebar stay and the user keeps context.
      { path: '**', loadComponent: () => import('./app/under-construction/under-construction').then((m) => m.UnderConstructionComponent) },
    ],
  },
];

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),

    // 👇 Add this exact line to turn on your HTTP traffic cop!
    provideHttpClient(withInterceptors([authInterceptor]))
  ]
};

// 2. Microsoft Configuration Factory
export function MSALInstanceFactory(): IPublicClientApplication {
  return new PublicClientApplication({
    auth: {
      clientId: 'eceb828c-0816-4ccf-b4b5-9e05061d3526', // Your Entra ID
      authority: 'https://login.microsoftonline.com/common',
      redirectUri: 'http://localhost:4200/login' // Must match your Entra app registration
    },
    cache: {
      cacheLocation: 'sessionStorage', // sessionStorage is safer for redirects
    },
    system: {
      loggerOptions: {
        loggerCallback: (level, message, containsPii) => {
          console.log('[MSAL]', message);
        },
        piiLoggingEnabled: false
      }
    }
  });
}

// 3. The Guard Config (From your snippet!)
export function MSALGuardConfigFactory(): MsalGuardConfiguration {
  return {
    interactionType: InteractionType.Redirect,
    authRequest: { scopes: ['User.Read', 'email', 'profile'] }
  };
}

// 4. Bootstrap the Standalone Application
bootstrapApplication(App, {
  providers: [

    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    // Load the active language dictionary before first paint (English base +
    // stored choice), so the UI renders already translated.
    provideAppInitializer(() => inject(I18nService).init()),
    // Apply the stored theme (light/dark/system) before first paint.
    provideAppInitializer(() => inject(ThemeService).init()),
    {
      provide: MSAL_INSTANCE,
      useFactory: MSALInstanceFactory
    },
    {
      provide: MSAL_GUARD_CONFIG,
      useFactory: MSALGuardConfigFactory // 👈 Register the new config here
    },
    MsalService,
    MsalBroadcastService // 👈 Add this right here!
  ]
}).catch(err => console.error(err));
