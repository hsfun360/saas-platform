import { MsalService } from '@azure/msal-angular';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { LanguageService } from '../services/language.service';
import { I18nService } from '../i18n/i18n.service';
import { TranslatePipe } from '../i18n/translate.pipe';
import { SHIPPED_UI_LANGUAGES } from '../i18n/ui-languages';
import { AuthResponse, Workspace, Language } from '../models/auth.models';
import { finalize } from 'rxjs';

declare var google: {
  accounts: {
    oauth2: {
      initTokenClient(config: { client_id: string; scope: string; callback: (res: { access_token?: string }) => void }): { requestAccessToken(): void };
      // Authorization-code flow with a same-tab redirect (like MSAL loginRedirect).
      initCodeClient(config: { client_id: string; scope: string; ux_mode: 'redirect' | 'popup'; redirect_uri: string; state?: string }): { requestCode(): void };
    };
  };
};

@Component({
    selector: 'app-login',
    templateUrl: './login.html',
    styleUrls: ['./login.css'],
    imports: [ReactiveFormsModule, RouterLink, TranslatePipe]
})
export class LoginComponent implements OnInit {

  // Languages offered by the pre-login switcher. Seeded with the shipped set so it
  // always works, then replaced by the platform's active languages if reachable.
  loginLanguages: Language[] = SHIPPED_UI_LANGUAGES;

  loginForm!: FormGroup;
  loading = false;
  errorMessage: string | null = null;
  successMessage: string | null = null;

  showPassword = false;
  isLoggingIn = false;

  // True while completing an SSO redirect (Google), so the template shows a
  // "Signing you in…" state instead of the login form.
  ssoInProgress = false;

  isWorkspaceSelection = false;
  availableWorkspaces: Workspace[] = [];
  pendingLoginMethod: 'local' | 'google' | null = null;
  pendingGoogleToken: string | null = null;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef, // 2. Inject it here
    private msalService: MsalService, // 👈 Add this here!
    private languageService: LanguageService,
    public i18n: I18nService,
  ) {}

  // Switch the login UI language. Persists via I18nService (localStorage), so the
  // choice carries into the app after sign-in.
  switchLoginLanguage(code: string): void {
    this.i18n.use(code);
  }

  ngOnInit(): void {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]]
    });

    // Guarantee that the workspace selection screen is hidden when the page loads
    this.isWorkspaceSelection = false;
    this.pendingLoginMethod = null;
    this.pendingGoogleToken = null;
    this.availableWorkspaces = [];

    // Offer the platform's active languages in the pre-login switcher (falls back
    // to the shipped set already seeded if the public endpoint returns nothing).
    this.languageService.listActivePublic().subscribe({
      next: (list) => { if (list?.length) this.loginLanguages = list; },
      error: () => {}, // keep the shipped fallback
    });

    // Returning from the Google redirect (?code=… in the query): show the
    // "Signing you in…" overlay immediately so the login form never flashes back
    // up. handleGoogleRedirect manages its own reset.
    if (new URLSearchParams(window.location.search).has('code')) {
      this.ssoInProgress = true;
    }
    // Catch the user when they return from the Google authorization-code redirect.
    this.handleGoogleRedirect();

    // Returning from the Microsoft redirect — MSAL puts its response in the URL
    // FRAGMENT (#code=…/#error=…), so detect that separately from Google's query.
    const msReturn = window.location.hash.includes('code=') || window.location.hash.includes('error=');
    if (msReturn) {
      this.ssoInProgress = true;
    }
    this.msalService.handleRedirectObservable().subscribe({
      next: (response: { accessToken?: string } | null) => {
        if (response?.accessToken) {
          this.processMicrosoftToken(response.accessToken);
        } else if (msReturn) {
          // A Microsoft return without a usable token — drop the overlay.
          this.ssoInProgress = false;
          this.cdr.detectChanges();
        }
      },
      error: () => {
        if (msReturn) this.ssoInProgress = false;
        this.errorMessage = 'Microsoft sign-in failed. Please try again.';
        this.cdr.detectChanges();
      }
    });
  }
  
  processMicrosoftToken(token: string): void {
    this.authService.microsoftLogin(token).subscribe({
      next: (res) => {
        // Returning from SSO: go straight into the app, no "Redirecting…" delay.
        this.handleLoginResponse(res, 'local', undefined, true);
      },
      error: () => {
        this.ssoInProgress = false;
        this.errorMessage = 'Microsoft sign-in failed. Please try again.';
        this.cdr.detectChanges();
      }
    });
  }

  get f() { return this.loginForm.controls; }
  
  // Replace your old togglePasswordVisibility with these two
  setPasswordVisibility(visible: boolean): void {
    this.showPassword = visible;
  }

  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    // 1. Set loading state
    this.loading = true;
    this.errorMessage = null;
    this.successMessage = null;
    
    const { email, password } = this.loginForm.value;

    this.authService.login(email, password)
      .pipe(
        finalize(() => {
          // This runs ALWAYS (on success OR error)
          this.loading = false; 
          this.cdr.detectChanges(); // Tell the button to change back to "Login"
        })
      )
      .subscribe({
        next: (response) => {
          this.handleLoginResponse(response, 'local');
        },
        error: (err) => {
          // Surface the backend reason (invalid email/password, deactivated
          // account, etc.); fall back to a generic message otherwise.
          this.errorMessage = err?.error?.message || 'Login failed. Please try again.';
          this.cdr.detectChanges();
        },
      });
  }

  // Same-tab redirect (like Microsoft), using Google's authorization-code flow.
  // Google redirects back to /login?code=…&state=…, handled in ngOnInit.
  loginWithGoogle(): void {
    const state = Math.random().toString(36).slice(2);
    sessionStorage.setItem('googleOauthState', state);
    const client = google.accounts.oauth2.initCodeClient({
      client_id: '148523901156-uc6a3f7q2le2fsqbm5idc0ai27vebe69.apps.googleusercontent.com',
      scope: 'email profile openid',
      ux_mode: 'redirect',
      redirect_uri: window.location.origin + '/login',
      state,
    });
    client.requestCode();
  }

  // Handle the Google redirect return: exchange the code for an access token,
  // then continue exactly like the previous popup flow.
  private handleGoogleRedirect(): void {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return;

    const returnedState = params.get('state');
    const expectedState = sessionStorage.getItem('googleOauthState');
    sessionStorage.removeItem('googleOauthState');

    const redirectUri = window.location.origin + '/login';
    // Strip the OAuth params from the address bar.
    history.replaceState({}, '', '/login');

    if (!expectedState || returnedState !== expectedState) {
      this.ssoInProgress = false;
      this.errorMessage = 'Google sign-in failed (state mismatch). Please try again.';
      return;
    }

    this.loading = true;
    const fail = () => {
      this.ssoInProgress = false;
      this.loading = false;
      this.errorMessage = 'Google sign-in failed. Please try again.';
      this.cdr.detectChanges();
    };
    this.authService.exchangeGoogleCode(code, redirectUri).subscribe({
      next: ({ accessToken }) => {
        this.authService.googleLogin(accessToken).subscribe({
          next: (response) => {
            this.loading = false;
            // Returning from SSO: go straight into the app, no "Redirecting…" delay.
            this.handleLoginResponse(response, 'google', accessToken, true);
          },
          error: fail,
        });
      },
      error: fail,
    });
  }

  loginWithMicrosoft(): void {
    this.msalService.loginRedirect({
      scopes: ['User.Read', 'email', 'profile']
    });
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  // A helper function to handle both Local and Google API responses
  private handleLoginResponse(res: AuthResponse, method: 'local' | 'google', googleToken?: string, immediate = false): void {
    if (res.clubs) {
      // SCENARIO B: The 206 Multi-Workspace Pause! Show the picker (not the
      // "signing in" state).
      this.ssoInProgress = false;
      this.isWorkspaceSelection = true;
      this.availableWorkspaces = res.clubs;
      this.pendingLoginMethod = method;
      if (googleToken) this.pendingGoogleToken = googleToken;
    } else if (res.token) {
      // SCENARIO C: Login is complete!
      localStorage.setItem('token', res.token);
      localStorage.setItem('userEmail', res.email || this.loginForm.value.email);
      localStorage.setItem('userRole', res.roleName || 'User');
      localStorage.setItem('userFullName', res.fullName || 'User');
      localStorage.setItem('userProfilePicture', res.profilePicture || '');
      this.authService.storeUserMenus(res.menus);
      
      // Always reflect THIS user's avatar (empty/null -> default), so a previous
      // user's picture (e.g. a Google SSO avatar) never carries into the next login.
      this.authService.updateAvatarState(res.profilePicture || '');
      if (res.fullName) {
        this.authService.updateFullNameState(res.fullName); // Broadcast to the app
      }

      // Apply the user's effective language for this workspace (personal preference
      // -> account default -> platform default), resolved server-side.
      this.languageService.getMyLanguage().subscribe({
        next: (state) => {
          this.i18n.setFallback(state.accountDefault); // subscriber's fallback for missing translations
          this.i18n.use(state.effective);
        },
        error: () => {}, // keep the current/stored language
      });

      if (immediate) {
        // SSO return: go straight into the app (the "Signing you in…" state
        // stays until navigation, so the login form never reappears).
        this.router.navigate(['/home']);
      } else {
        this.successMessage = 'Login successful! Redirecting...';
        this.cdr.detectChanges();
        setTimeout(() => this.router.navigate(['/home']), 1000);
      }
    }
  }

  // 👇 The function triggered by your HTML Workspace buttons
  selectWorkspace(companyId: string) {
    this.loading = true;
    
    // Resume the login based on how they started (Email vs Google)
    if (this.pendingLoginMethod === 'local') {
      const { email, password } = this.loginForm.value;
      this.authService.login(email, password, companyId).pipe(
        finalize(() => { this.loading = false; this.cdr.detectChanges(); })
      ).subscribe({
        next: (res) => this.handleLoginResponse(res, 'local'),
        error: (err) => this.errorMessage = err?.error?.message || 'Login failed.'
      });
    } else if (this.pendingLoginMethod === 'google' && this.pendingGoogleToken) {
      this.authService.googleLogin(this.pendingGoogleToken, companyId).pipe(
        finalize(() => { this.loading = false; this.cdr.detectChanges(); })
      ).subscribe({
        next: (res) => this.handleLoginResponse(res, 'google'),
        error: (err) => this.errorMessage = err?.error?.message || 'Google login failed.'
      });
    }
  }
}
