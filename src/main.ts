import { ApplicationConfig } from '@angular/core';
import { provideRouter, Routes } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './app/auth.interceptor';
import { bootstrapApplication } from '@angular/platform-browser';

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
import { TenantUsersComponent } from './app/tenant-users/tenant-users';
import { CompaniesComponent } from './app/companies/companies';
import { ModulesMenusComponent } from './app/modules-menus/modules-menus';
import { SystemDashboardComponent } from './app/systems/system-dashboard';

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

      // Platform Administration (Control Plane) — landing + admin screens
      { path: 'platform', component: SystemDashboardComponent, data: { title: 'Platform Administration', icon: 'admin_panel_settings', blurb: 'Subscribers, modules and platform health.' } },
      { path: 'admin/roles', component: RoleManagementComponent },
      { path: 'admin/users', component: TenantUsersComponent },
      { path: 'admin/companies', component: CompaniesComponent },
      { path: 'admin/system-setup', component: SystemSetupComponent },
      { path: 'admin/system-setup/:tab', component: SystemSetupComponent },
      { path: 'admin/modules-menus', component: ModulesMenusComponent },
      { path: 'admin/modules-menus/:moduleId', component: ModulesMenusComponent },

      // Core product systems — landing dashboards (own components as built)
      { path: 'membership', component: SystemDashboardComponent, data: { title: 'Membership Management', icon: 'card_membership', blurb: 'Members, tiers, dues and standing.' } },
      { path: 'golf', component: SystemDashboardComponent, data: { title: 'Golf Management', icon: 'sports_golf', blurb: 'Tee sheet, bookings and competitions.' } },
      { path: 'facility', component: SystemDashboardComponent, data: { title: 'Facility Management', icon: 'meeting_room', blurb: 'Facilities, availability and reservations.' } },

      { path: '', redirectTo: 'home', pathMatch: 'full' },
    ],
  },
  // Safety net: unknown URLs (incl. legacy /dashboard/* bookmarks) go home.
  { path: '**', redirectTo: 'home' },
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
