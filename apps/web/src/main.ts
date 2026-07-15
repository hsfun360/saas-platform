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

// Components
import { App } from './app/app'; // Make sure this path matches your app.ts location!
import { LoginComponent } from './app/login/login';
import { RegisterUserComponent } from './app/register-user/register-user';
import { ForgotPasswordComponent } from './app/forgot-password/forgot-password';
import { ResetPasswordComponent } from './app/reset-password/reset-password';
import { Dashboard } from './app/dashboard/dashboard';
import { authGuard } from './app/auth.guard';
import { HomeComponent } from './app/dashboard/home/home';
import { ProfileComponent } from './app/dashboard/profile/profile';
import { SettingsComponent } from './app/dashboard/settings/settings';

import { RegisterLeadComponent } from './app/register-lead/register-lead';
import { SetupPasswordComponent } from './app/setup-password/setup-password';
import { RoleManagementComponent } from './app/role-management/role-management';

import { SystemSetupComponent } from './app/system-setup/system-setup';
import { SubscribersComponent } from './app/subscribers/subscribers';
import { PlatformRolesComponent } from './app/platform-roles/platform-roles';
import { PlatformUsersComponent } from './app/platform-users/platform-users';
import { CountriesComponent } from './app/countries/countries';
import { LanguagesComponent } from './app/languages/languages';
import { CurrenciesComponent } from './app/currencies/currencies';
import { AccountLanguagesComponent } from './app/account-languages/account-languages';
import { AccountCurrenciesComponent } from './app/account-currencies/account-currencies';
import { IndustryTypesComponent } from './app/industry-types/industry-types';
import { DepartmentsComponent } from './app/departments/departments';
import { PositionsComponent } from './app/positions/positions';
import { SalutationsComponent } from './app/salutations/salutations';
import { NationalitiesComponent } from './app/nationalities/nationalities';
import { RacesComponent } from './app/races/races';
import { NumberingComponent } from './app/numbering/numbering';
import { TitlesComponent } from './app/titles/titles';
import { PublicHolidaysComponent } from './app/public-holidays/public-holidays';
import { TenantUsersComponent } from './app/tenant-users/tenant-users';
import { CompaniesComponent } from './app/companies/companies';
import { ModulesMenusComponent } from './app/modules-menus/modules-menus';
import { EmailTemplatesComponent } from './app/email-templates/email-templates';
import { EmailTemplateEditComponent } from './app/email-templates/email-template-edit';
import { AccountEmailTemplatesComponent } from './app/account-email-templates/account-email-templates';
import { AccountEmailTemplateEditComponent } from './app/account-email-templates/account-email-template-edit';
import { SystemDashboardComponent } from './app/systems/system-dashboard';
import { MembershipStatusesComponent } from './app/membership-statuses/membership-statuses';
import { MembershipFeesComponent } from './app/membership-fees/membership-fees';
import { MembershipTypesComponent } from './app/membership-types/membership-types';
import { MembershipsComponent } from './app/memberships/memberships';
import { MembersComponent } from './app/members/members';
import { GolfUnitCoursesComponent } from './app/golf-unit-courses/golf-unit-courses';
import { GolfCoursesComponent } from './app/golf-courses/golf-courses';
import { TaxSchemesComponent } from './app/tax-schemes/tax-schemes';
import { CompanyTaxComponent } from './app/company-tax/company-tax';
import { PlatformProfileComponent } from './app/platform-profile/platform-profile';
import { ItemsComponent } from './app/items/items';
import { UnderConstructionComponent } from './app/under-construction/under-construction';
import { AccessDeniedComponent } from './app/access-denied/access-denied';
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
  { path: 'register-user', component: RegisterUserComponent },
  { path: 'forgot-password', component: ForgotPasswordComponent },
  { path: 'reset-password', component: ResetPasswordComponent },
  { path: 'register-lead', component: RegisterLeadComponent },
  { path: 'setup-password', component: SetupPasswordComponent },
  {
    // Shell layout — wraps the whole authenticated tree (top bar + sidebar +
    // <router-outlet>). Children are reached at the root (e.g. /golf, /admin/roles).
    path: '',
    component: Dashboard,
    canActivate: [authGuard],
    children: [
      // Account / shared
      { path: 'home', component: HomeComponent },
      { path: 'profile', component: ProfileComponent },
      { path: 'settings', component: SettingsComponent },

      // Sample CRUD master–detail screen. Both paths point at the same component;
      // the :id segment ('new' = create) is the single source of truth for the
      // open item — deep-linkable, with working back/forward. No systemModule
      // guard: it's a demo screen everyone may see (like home/profile).
      { path: 'items', component: ItemsComponent },
      { path: 'items/:id', component: ItemsComponent },

      // Platform Administration (Control Plane) — landing + admin screens.
      // `data.systemModule` + systemAccessGuard block users without that access.
      { path: 'platform', component: SystemDashboardComponent, canActivate: [systemAccessGuard], data: { systemModule: 'SaaS Administration', title: 'Platform Administration', icon: 'admin_panel_settings', blurb: 'Subscribers, modules and platform health.' } },
      { path: 'admin/roles', component: RoleManagementComponent, canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      { path: 'admin/users', component: TenantUsersComponent, canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      { path: 'admin/companies', component: CompaniesComponent, canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      { path: 'admin/account-languages', component: AccountLanguagesComponent, canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      { path: 'admin/account-currencies', component: AccountCurrenciesComponent, canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      // Subscriber-owned shared reference data (consumed across products).
      { path: 'admin/industry-types', component: IndustryTypesComponent, canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      { path: 'admin/departments', component: DepartmentsComponent, canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      { path: 'admin/positions', component: PositionsComponent, canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      { path: 'admin/salutations', component: SalutationsComponent, canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      { path: 'admin/nationalities', component: NationalitiesComponent, canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      { path: 'admin/races', component: RacesComponent, canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      { path: 'admin/numbering', component: NumberingComponent, canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      { path: 'admin/titles', component: TitlesComponent, canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      { path: 'admin/public-holidays', component: PublicHolidaysComponent, canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      { path: 'admin/account-email-templates', component: AccountEmailTemplatesComponent, canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      { path: 'admin/account-email-templates/:key', component: AccountEmailTemplateEditComponent, canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      // Tax Setup — subscriber-owned tax-scheme catalog (master–detail; :id opens a scheme).
      { path: 'admin/tax-schemes', component: TaxSchemesComponent, canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      { path: 'admin/tax-schemes/:id', component: TaxSchemesComponent, canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      // Company Tax — per active company: which schemes it uses + GL overrides.
      { path: 'admin/company-tax', component: CompanyTaxComponent, canActivate: [systemAccessGuard], data: { systemModule: 'System Setup' } },
      // Platform Tax - the platform's own tax catalog (accountId NULL), SaaS Admin.
      // Reuses the Tax Setup screen at platform scope via data.taxScope.
      { path: 'admin/platform-tax', component: TaxSchemesComponent, canActivate: [systemAccessGuard], data: { systemModule: 'SaaS Administration', taxScope: 'platform' } },
      { path: 'admin/platform-tax/:id', component: TaxSchemesComponent, canActivate: [systemAccessGuard], data: { systemModule: 'SaaS Administration', taxScope: 'platform' } },
      // Platform Profile - the platform's own company of record (invoice issuer + tax anchor), SaaS Admin.
      { path: 'admin/platform-profile', component: PlatformProfileComponent, canActivate: [systemAccessGuard], data: { systemModule: 'SaaS Administration' } },
      { path: 'admin/subscribers', component: SubscribersComponent, canActivate: [systemAccessGuard], data: { systemModule: 'SaaS Administration' } },
      { path: 'admin/system-roles', component: PlatformRolesComponent, canActivate: [systemAccessGuard], data: { systemModule: 'SaaS Administration' } },
      { path: 'admin/platform-users', component: PlatformUsersComponent, canActivate: [systemAccessGuard], data: { systemModule: 'SaaS Administration' } },
      { path: 'admin/countries', component: CountriesComponent, canActivate: [systemAccessGuard], data: { systemModule: 'SaaS Administration' } },
      { path: 'admin/languages', component: LanguagesComponent, canActivate: [systemAccessGuard], data: { systemModule: 'SaaS Administration' } },
      { path: 'admin/currencies', component: CurrenciesComponent, canActivate: [systemAccessGuard], data: { systemModule: 'SaaS Administration' } },
      { path: 'admin/system-setup', component: SystemSetupComponent, canActivate: [systemAccessGuard], data: { systemModule: 'SaaS Administration' } },
      { path: 'admin/modules-menus', component: ModulesMenusComponent, canActivate: [systemAccessGuard], data: { systemModule: 'SaaS Administration' } },
      { path: 'admin/modules-menus/:moduleId', component: ModulesMenusComponent, canActivate: [systemAccessGuard], data: { systemModule: 'SaaS Administration' } },
      { path: 'admin/email-templates', component: EmailTemplatesComponent, canActivate: [systemAccessGuard], data: { systemModule: 'SaaS Administration' } },
      { path: 'admin/email-templates/:key', component: EmailTemplateEditComponent, canActivate: [systemAccessGuard], data: { systemModule: 'SaaS Administration' } },

      // Core product systems — landing dashboards (own components as built).
      { path: 'membership', component: SystemDashboardComponent, canActivate: [systemAccessGuard], data: { systemModule: 'Membership Management', title: 'Membership Management', icon: 'card_membership', blurb: 'Members, tiers, dues and standing.' } },
      // Master File Setup → Membership Status (per-company master file).
      { path: 'membership/statuses', component: MembershipStatusesComponent, canActivate: [systemAccessGuard], data: { systemModule: 'Membership Management' } },
      { path: 'membership/fees', component: MembershipFeesComponent, canActivate: [systemAccessGuard], data: { systemModule: 'Membership Management' } },
      { path: 'membership/types', component: MembershipTypesComponent, canActivate: [systemAccessGuard], data: { systemModule: 'Membership Management' } },
      // Membership / Member CRM (SRS 2.3): the contract list (individual +
      // corporate, nominees/dependents managed inside) and the flat member search.
      { path: 'membership/memberships', component: MembershipsComponent, canActivate: [systemAccessGuard], data: { systemModule: 'Membership Management' } },
      { path: 'membership/members', component: MembersComponent, canActivate: [systemAccessGuard], data: { systemModule: 'Membership Management' } },
      { path: 'golf', component: SystemDashboardComponent, canActivate: [systemAccessGuard], data: { systemModule: 'Golf Management', title: 'Golf Management', icon: 'sports_golf', blurb: 'Tee sheet, bookings and competitions.' } },
      // Master File Setup → Unit Courses (per-company 9-hole building blocks).
      { path: 'golf/unit-courses', component: GolfUnitCoursesComponent, canActivate: [systemAccessGuard], data: { systemModule: 'Golf Management' } },
      // Master File Setup → Courses (18-hole pairing of two unit courses).
      { path: 'golf/courses', component: GolfCoursesComponent, canActivate: [systemAccessGuard], data: { systemModule: 'Golf Management' } },
      { path: 'facility', component: SystemDashboardComponent, canActivate: [systemAccessGuard], data: { systemModule: 'Facility Management', title: 'Facility Management', icon: 'meeting_room', blurb: 'Facilities, availability and reservations.' } },

      // Shown when systemAccessGuard denies a route (no guard on this one).
      { path: 'access-denied', component: AccessDeniedComponent },

      { path: '', redirectTo: 'home', pathMatch: 'full' },

      // Any other route under the shell (a menu whose page isn't built yet, or a
      // legacy /dashboard/* bookmark) renders the Under Construction placeholder
      // INSIDE the shell, so the header + sidebar stay and the user keeps context.
      { path: '**', component: UnderConstructionComponent },
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
