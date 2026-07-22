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
import { authGuard } from './app/auth.guard';
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

      // Sample CRUD master–detail screen. Both paths point at the same component;
      // the :id segment ('new' = create) is the single source of truth for the
      // open item — deep-linkable, with working back/forward. No systemModule
      // guard: it's a demo screen everyone may see (like home/profile).
      { path: 'items', loadComponent: () => import('./app/items/items').then((m) => m.ItemsComponent) },
      { path: 'items/:id', loadComponent: () => import('./app/items/items').then((m) => m.ItemsComponent) },

      // Platform Administration (Control Plane) — landing + admin screens.
      // `data.systemModule` + systemAccessGuard block users without that access.
      { path: 'platform', loadComponent: () => import('./app/systems/system-dashboard').then((m) => m.SystemDashboardComponent), canActivate: [systemAccessGuard], data: { systemModule: 'SaaS Administration', title: 'Platform Administration', icon: 'admin_panel_settings', blurb: 'Subscribers, modules and platform health.' } },
      { path: 'admin/roles', loadComponent: () => import('./app/role-management/role-management').then((m) => m.RoleManagementComponent), canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      { path: 'admin/users', loadComponent: () => import('./app/tenant-users/tenant-users').then((m) => m.TenantUsersComponent), canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      { path: 'admin/companies', loadComponent: () => import('./app/companies/companies').then((m) => m.CompaniesComponent), canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      { path: 'admin/account-languages', loadComponent: () => import('./app/account-languages/account-languages').then((m) => m.AccountLanguagesComponent), canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      { path: 'admin/account-currencies', loadComponent: () => import('./app/account-currencies/account-currencies').then((m) => m.AccountCurrenciesComponent), canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      // Subscriber-owned shared reference data (consumed across products).
      { path: 'admin/industry-types', loadComponent: () => import('./app/industry-types/industry-types').then((m) => m.IndustryTypesComponent), canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      { path: 'admin/departments', loadComponent: () => import('./app/departments/departments').then((m) => m.DepartmentsComponent), canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      { path: 'admin/positions', loadComponent: () => import('./app/positions/positions').then((m) => m.PositionsComponent), canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      { path: 'admin/salutations', loadComponent: () => import('./app/salutations/salutations').then((m) => m.SalutationsComponent), canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      { path: 'admin/nationalities', loadComponent: () => import('./app/nationalities/nationalities').then((m) => m.NationalitiesComponent), canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      { path: 'admin/races', loadComponent: () => import('./app/races/races').then((m) => m.RacesComponent), canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      { path: 'admin/numbering', loadComponent: () => import('./app/numbering/numbering').then((m) => m.NumberingComponent), canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      { path: 'admin/titles', loadComponent: () => import('./app/titles/titles').then((m) => m.TitlesComponent), canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      { path: 'admin/public-holidays', loadComponent: () => import('./app/public-holidays/public-holidays').then((m) => m.PublicHolidaysComponent), canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      { path: 'admin/account-email-templates', loadComponent: () => import('./app/account-email-templates/account-email-templates').then((m) => m.AccountEmailTemplatesComponent), canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      { path: 'admin/account-email-templates/:key', loadComponent: () => import('./app/account-email-templates/account-email-template-edit').then((m) => m.AccountEmailTemplateEditComponent), canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      // Tax Setup — subscriber-owned tax-scheme catalog (master–detail; :id opens a scheme).
      { path: 'admin/tax-schemes', loadComponent: () => import('./app/tax-schemes/tax-schemes').then((m) => m.TaxSchemesComponent), canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      { path: 'admin/tax-schemes/:id', loadComponent: () => import('./app/tax-schemes/tax-schemes').then((m) => m.TaxSchemesComponent), canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      // Company Tax — per active company: which schemes it uses + GL overrides.
      { path: 'admin/company-tax', loadComponent: () => import('./app/company-tax/company-tax').then((m) => m.CompanyTaxComponent), canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      // Platform Tax - the platform's own tax catalog (accountId NULL), SaaS Admin.
      // Reuses the Tax Setup screen at platform scope via data.taxScope.
      { path: 'admin/platform-tax', loadComponent: () => import('./app/tax-schemes/tax-schemes').then((m) => m.TaxSchemesComponent), canActivate: [systemAccessGuard], data: { systemModule: 'SaaS Administration', taxScope: 'platform' } },
      { path: 'admin/platform-tax/:id', loadComponent: () => import('./app/tax-schemes/tax-schemes').then((m) => m.TaxSchemesComponent), canActivate: [systemAccessGuard], data: { systemModule: 'SaaS Administration', taxScope: 'platform' } },
      // Platform Profile - the platform's own company of record (invoice issuer + tax anchor), SaaS Admin.
      { path: 'admin/platform-profile', loadComponent: () => import('./app/platform-profile/platform-profile').then((m) => m.PlatformProfileComponent), canActivate: [systemAccessGuard], data: { systemModule: 'SaaS Administration' } },
      { path: 'admin/subscribers', loadComponent: () => import('./app/subscribers/subscribers').then((m) => m.SubscribersComponent), canActivate: [systemAccessGuard], data: { systemModule: 'SaaS Administration' } },
      { path: 'admin/system-roles', loadComponent: () => import('./app/platform-roles/platform-roles').then((m) => m.PlatformRolesComponent), canActivate: [systemAccessGuard], data: { systemModule: 'SaaS Administration' } },
      { path: 'admin/platform-users', loadComponent: () => import('./app/platform-users/platform-users').then((m) => m.PlatformUsersComponent), canActivate: [systemAccessGuard], data: { systemModule: 'SaaS Administration' } },
      { path: 'admin/countries', loadComponent: () => import('./app/countries/countries').then((m) => m.CountriesComponent), canActivate: [systemAccessGuard], data: { systemModule: 'SaaS Administration' } },
      { path: 'admin/languages', loadComponent: () => import('./app/languages/languages').then((m) => m.LanguagesComponent), canActivate: [systemAccessGuard], data: { systemModule: 'SaaS Administration' } },
      { path: 'admin/currencies', loadComponent: () => import('./app/currencies/currencies').then((m) => m.CurrenciesComponent), canActivate: [systemAccessGuard], data: { systemModule: 'SaaS Administration' } },
      { path: 'admin/system-setup', loadComponent: () => import('./app/system-setup/system-setup').then((m) => m.SystemSetupComponent), canActivate: [systemAccessGuard], data: { systemModule: 'SaaS Administration' } },
      { path: 'admin/modules-menus', loadComponent: () => import('./app/modules-menus/modules-menus').then((m) => m.ModulesMenusComponent), canActivate: [systemAccessGuard], data: { systemModule: 'SaaS Administration' } },
      { path: 'admin/modules-menus/:moduleId', loadComponent: () => import('./app/modules-menus/modules-menus').then((m) => m.ModulesMenusComponent), canActivate: [systemAccessGuard], data: { systemModule: 'SaaS Administration' } },
      { path: 'admin/email-templates', loadComponent: () => import('./app/email-templates/email-templates').then((m) => m.EmailTemplatesComponent), canActivate: [systemAccessGuard], data: { systemModule: 'SaaS Administration' } },
      { path: 'admin/email-templates/:key', loadComponent: () => import('./app/email-templates/email-template-edit').then((m) => m.EmailTemplateEditComponent), canActivate: [systemAccessGuard], data: { systemModule: 'SaaS Administration' } },

      // Core product systems — landing dashboards (own components as built).
      // The '<system>/dashboard' alias serves the same launchpad: the Control
      // Plane's Module.landingRoute values are configured as '/x/dashboard'
      // (the sidebar Dashboard link navigates there), while '/x' stays the
      // bare-url landing.
      { path: 'membership', loadComponent: () => import('./app/systems/system-dashboard').then((m) => m.SystemDashboardComponent), canActivate: [systemAccessGuard], data: { systemModule: 'Membership Management', title: 'Membership Management', icon: 'card_membership', blurb: 'Members, tiers, dues and standing.' } },
      { path: 'membership/dashboard', loadComponent: () => import('./app/systems/system-dashboard').then((m) => m.SystemDashboardComponent), canActivate: [systemAccessGuard], data: { systemModule: 'Membership Management', title: 'Membership Management', icon: 'card_membership', blurb: 'Members, tiers, dues and standing.' } },
      // Business Insights - the two analytics screens (split 2026-07-22):
      // membership movement/demographics, and sales channel/agent performance.
      { path: 'membership/membership-analysis', loadComponent: () => import('./app/membership-insights/membership-analysis').then((m) => m.MembershipAnalysisComponent), canActivate: [systemAccessGuard], data: { systemModule: 'Membership Management' } },
      { path: 'membership/agent-performance', loadComponent: () => import('./app/membership-insights/agent-performance').then((m) => m.AgentPerformanceComponent), canActivate: [systemAccessGuard], data: { systemModule: 'Membership Management' } },
      // Club Specification (SRS 2.1.1) - the per-company membership system master.
      { path: 'membership/settings', loadComponent: () => import('./app/club-specification/club-specification').then((m) => m.ClubSpecificationComponent), canActivate: [systemAccessGuard], data: { systemModule: 'Membership Management' } },
      // Master File Setup → Membership Status (per-company master file).
      { path: 'membership/statuses', loadComponent: () => import('./app/membership-statuses/membership-statuses').then((m) => m.MembershipStatusesComponent), canActivate: [systemAccessGuard], data: { systemModule: 'Membership Management' } },
      { path: 'membership/fees', loadComponent: () => import('./app/membership-fees/membership-fees').then((m) => m.MembershipFeesComponent), canActivate: [systemAccessGuard], data: { systemModule: 'Membership Management' } },
      { path: 'membership/types', loadComponent: () => import('./app/membership-types/membership-types').then((m) => m.MembershipTypesComponent), canActivate: [systemAccessGuard], data: { systemModule: 'Membership Management' } },
      { path: 'membership/transaction-types', loadComponent: () => import('./app/membership-transaction-types/membership-transaction-types').then((m) => m.MembershipTransactionTypesComponent), canActivate: [systemAccessGuard], data: { systemModule: 'Membership Management' } },
      // Membership / Member CRM (SRS 2.3): the contract list (individual +
      // corporate, nominees/dependents managed inside) and the flat member search.
      { path: 'membership/memberships', loadComponent: () => import('./app/memberships/memberships').then((m) => m.MembershipsComponent), canActivate: [systemAccessGuard], data: { systemModule: 'Membership Management' } },
      { path: 'membership/members', loadComponent: () => import('./app/members/members').then((m) => m.MembersComponent), canActivate: [systemAccessGuard], data: { systemModule: 'Membership Management' } },
      { path: 'membership/sales-agencies', loadComponent: () => import('./app/sales-agencies/sales-agencies').then((m) => m.SalesAgenciesComponent), canActivate: [systemAccessGuard], data: { systemModule: 'Membership Management' } },
      { path: 'membership/sales-agents', loadComponent: () => import('./app/sales-agents/sales-agents').then((m) => m.SalesAgentsComponent), canActivate: [systemAccessGuard], data: { systemModule: 'Membership Management' } },
      { path: 'golf', loadComponent: () => import('./app/systems/system-dashboard').then((m) => m.SystemDashboardComponent), canActivate: [systemAccessGuard], data: { systemModule: 'Golf Management', title: 'Golf Management', icon: 'sports_golf', blurb: 'Tee sheet, bookings and competitions.' } },
      { path: 'golf/dashboard', loadComponent: () => import('./app/systems/system-dashboard').then((m) => m.SystemDashboardComponent), canActivate: [systemAccessGuard], data: { systemModule: 'Golf Management', title: 'Golf Management', icon: 'sports_golf', blurb: 'Tee sheet, bookings and competitions.' } },
      // Master File Setup → Unit Courses (per-company 9-hole building blocks).
      { path: 'golf/unit-courses', loadComponent: () => import('./app/golf-unit-courses/golf-unit-courses').then((m) => m.GolfUnitCoursesComponent), canActivate: [systemAccessGuard], data: { systemModule: 'Golf Management' } },
      // Master File Setup → Courses (18-hole pairing of two unit courses).
      { path: 'golf/courses', loadComponent: () => import('./app/golf-courses/golf-courses').then((m) => m.GolfCoursesComponent), canActivate: [systemAccessGuard], data: { systemModule: 'Golf Management' } },
      // Master File Setup → Transaction Type (golf billing-item catalog).
      { path: 'golf/transaction-types', loadComponent: () => import('./app/golf-transaction-types/golf-transaction-types').then((m) => m.GolfTransactionTypesComponent), canActivate: [systemAccessGuard], data: { systemModule: 'Golf Management' } },
      { path: 'facility', loadComponent: () => import('./app/systems/system-dashboard').then((m) => m.SystemDashboardComponent), canActivate: [systemAccessGuard], data: { systemModule: 'Facility Management', title: 'Facility Management', icon: 'meeting_room', blurb: 'Facilities, availability and reservations.' } },
      { path: 'facility/dashboard', loadComponent: () => import('./app/systems/system-dashboard').then((m) => m.SystemDashboardComponent), canActivate: [systemAccessGuard], data: { systemModule: 'Facility Management', title: 'Facility Management', icon: 'meeting_room', blurb: 'Facilities, availability and reservations.' } },

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
