import { MsalService } from '@azure/msal-angular';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { LanguageService } from '../services/language.service';
import { I18nService } from '../i18n/i18n.service';
import { TranslatePipe } from '../i18n/translate.pipe';
import { SHIPPED_UI_LANGUAGES } from '../i18n/ui-languages';
import { AuthResponse, Workspace, Language, SsoConfig } from '../models/auth.models';
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
  standalone: true,
  templateUrl: './login.html',
  styleUrls: ['../shared/auth-card.css', './login.css'],
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly msalService = inject(MsalService);
  private readonly languageService = inject(LanguageService);
  readonly i18n = inject(I18nService);

  // Everything the template reads is a signal (zoneless + OnPush): the view
  // re-renders on every async outcome without manual change detection.

  // Languages offered by the pre-login switcher. Seeded with the shipped set so it
  // always works, then replaced by the platform's active languages if reachable.
  readonly loginLanguages = signal<Language[]>(SHIPPED_UI_LANGUAGES);

  readonly loginForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
    // "Keep me signed in": 7-day session instead of 24h (backend decides
    // the actual lifetimes; the flag also survives workspace switching).
    rememberMe: [false],
  });

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly showPassword = signal(false);

  // True while a sign-in is being completed - an SSO redirect return, a local
  // (email/password) submit, or a workspace-selection resume. The template
  // shows the full-screen "Signing you in…" overlay so every login method has
  // the same progress feedback.
  readonly signingIn = signal(false);

  // Per-environment SSO wiring (null until /auth/sso-config answers).
  readonly ssoConfig = signal<SsoConfig | null>(null);
  // Microsoft stays visible unless the environment explicitly disables it.
  readonly microsoftEnabled = computed(() => this.ssoConfig()?.microsoftEnabled !== false);

  readonly isWorkspaceSelection = signal(false);
  readonly availableWorkspaces = signal<Workspace[]>([]);
  private pendingLoginMethod: 'local' | 'google' | null = null;
  private pendingGoogleToken: string | null = null;

  // MFA step-up: password/SSO succeeded, now the 6-digit (or recovery) code.
  readonly isMfaStep = signal(false);
  private pendingMfaToken: string | null = null;
  readonly mfaForm = this.fb.nonNullable.group({
    code: ['', [Validators.required]],
    // "Don't ask again on this device for 30 days" (trusted-device cookie).
    rememberDevice: [true],
  });

  // Switch the login UI language. Persists via I18nService (localStorage), so the
  // choice carries into the app after sign-in.
  switchLoginLanguage(code: string): void {
    this.i18n.use(code);
  }

  ngOnInit(): void {
    // Arriving from the email-verification redirect (legacy GET verify link).
    if (new URLSearchParams(window.location.search).get('verified') === 'true') {
      this.successMessage.set('Email verified successfully! Please log in.');
    }

    // Offer the platform's active languages in the pre-login switcher (falls back
    // to the shipped set already seeded if the public endpoint returns nothing).
    this.languageService.listActivePublic().subscribe({
      next: (list) => { if (list?.length) this.loginLanguages.set(list); },
      error: () => {}, // keep the shipped fallback
    });

    // Per-environment SSO wiring (Google client id + Microsoft toggle).
    this.authService.getSsoConfig().subscribe({
      next: (cfg) => this.ssoConfig.set(cfg),
      error: () => {}, // Google stays unavailable until the config answers
    });

    // Returning from the Google redirect (?code=… in the query): show the
    // "Signing you in…" overlay immediately so the login form never flashes back
    // up. handleGoogleRedirect manages its own reset.
    if (new URLSearchParams(window.location.search).has('code')) {
      this.signingIn.set(true);
    }
    this.handleGoogleRedirect();

    // Returning from the Microsoft redirect - MSAL puts its response in the URL
    // FRAGMENT (#code=…/#error=…), so detect that separately from Google's query.
    const msReturn = window.location.hash.includes('code=') || window.location.hash.includes('error=');
    if (msReturn) {
      this.signingIn.set(true);
    }
    this.msalService.handleRedirectObservable().subscribe({
      next: (response: { accessToken?: string } | null) => {
        if (response?.accessToken) {
          this.processMicrosoftToken(response.accessToken);
        } else if (msReturn) {
          // A Microsoft return without a usable token - drop the overlay.
          this.signingIn.set(false);
        }
      },
      error: () => {
        if (msReturn) this.signingIn.set(false);
        this.errorMessage.set('Microsoft sign-in failed. Please try again.');
      },
    });
  }

  private processMicrosoftToken(token: string): void {
    this.authService.microsoftLogin(token).subscribe({
      next: (res) => this.handleLoginResponse(res, 'local'),
      error: () => {
        this.signingIn.set(false);
        this.errorMessage.set('Microsoft sign-in failed. Please try again.');
      },
    });
  }

  showError(name: 'email' | 'password'): boolean {
    const c = this.loginForm.controls[name];
    return c.invalid && c.touched;
  }

  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    // Same progress feedback as SSO: the "Signing you in…" overlay covers the
    // form for the whole attempt. Dropped again on any non-success outcome
    // (wrong password here; MFA / workspace picker inside handleLoginResponse).
    this.loading.set(true);
    this.signingIn.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    const { email, password, rememberMe } = this.loginForm.getRawValue();
    this.authService.login(email, password, null, rememberMe)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (response) => this.handleLoginResponse(response, 'local'),
        error: (err) => {
          // Surface the backend reason (invalid email/password, deactivated
          // account, etc.); fall back to a generic message otherwise.
          this.signingIn.set(false);
          this.errorMessage.set(err?.error?.message || 'Login failed. Please try again.');
        },
      });
  }

  // Same-tab redirect (like Microsoft), using Google's authorization-code flow.
  // Google redirects back to /login?code=…&state=…, handled in ngOnInit.
  loginWithGoogle(): void {
    const clientId = this.ssoConfig()?.googleClientId;
    if (!clientId) {
      // No hard-coded fallback key (project constraint): without the
      // environment's config, Google sign-in simply is not available.
      this.errorMessage.set('Google sign-in is not available right now. Please sign in with your email and password.');
      return;
    }
    const state = Math.random().toString(36).slice(2);
    sessionStorage.setItem('googleOauthState', state);
    const client = google.accounts.oauth2.initCodeClient({
      client_id: clientId,
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
      this.signingIn.set(false);
      this.errorMessage.set('Google sign-in failed (state mismatch). Please try again.');
      return;
    }

    this.loading.set(true);
    const fail = () => {
      this.signingIn.set(false);
      this.loading.set(false);
      this.errorMessage.set('Google sign-in failed. Please try again.');
    };
    this.authService.exchangeGoogleCode(code, redirectUri).subscribe({
      next: ({ accessToken }) => {
        this.authService.googleLogin(accessToken).subscribe({
          next: (response) => {
            this.loading.set(false);
            this.handleLoginResponse(response, 'google', accessToken);
          },
          error: fail,
        });
      },
      error: fail,
    });
  }

  loginWithMicrosoft(): void {
    this.msalService.loginRedirect({ scopes: ['User.Read', 'email', 'profile'] });
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((v) => !v);
  }

  // A helper function to handle both Local and Google API responses. The
  // "Signing you in…" overlay (signingIn) is up for every method by the time
  // we get here; it stays until navigation on success and is dropped on the
  // branches that need more input (MFA, workspace picker).
  private handleLoginResponse(res: AuthResponse, method: 'local' | 'google', googleToken?: string): void {
    const formEmail = this.loginForm.controls.email.value;
    if (res.mfaEnrollRequired && res.mfaToken) {
      // Admin role without MFA: enrollment is mandatory. The purpose-scoped
      // token drives the full-screen /mfa-setup flow (guards keep it there).
      localStorage.setItem('token', res.mfaToken);
      localStorage.setItem('userEmail', res.email || formEmail);
      this.router.navigate(['/mfa-setup']);
      return;
    }
    if (res.mfaRequired && res.mfaToken) {
      this.signingIn.set(false);
      this.isMfaStep.set(true);
      this.pendingMfaToken = res.mfaToken;
      this.mfaForm.reset({ code: '', rememberDevice: true });
      this.errorMessage.set('');
      return;
    }
    if (res.onboarding && res.token) {
      // LIMBO: verified user with no workspace yet. Store the onboarding-scoped
      // token and run the Create-your-organization wizard (the guards keep this
      // token out of the shell, and the API rejects it everywhere else).
      localStorage.setItem('token', res.token);
      localStorage.setItem('userEmail', res.email || formEmail);
      if (res.fullName) localStorage.setItem('userFullName', res.fullName);
      this.router.navigate(['/onboarding']);
      return;
    }
    if (res.clubs) {
      // SCENARIO B: the 206 multi-workspace pause - show the picker.
      this.signingIn.set(false);
      this.isWorkspaceSelection.set(true);
      this.availableWorkspaces.set(res.clubs);
      this.pendingLoginMethod = method;
      if (googleToken) this.pendingGoogleToken = googleToken;
    } else if (res.token) {
      // SCENARIO C: login is complete.
      localStorage.setItem('token', res.token);
      localStorage.setItem('userEmail', res.email || formEmail);
      localStorage.setItem('userRole', res.roleName || 'User');
      localStorage.setItem('userFullName', res.fullName || 'User');
      localStorage.setItem('userProfilePicture', res.profilePicture || '');
      this.authService.storeUserMenus(res.menus);

      // Always reflect THIS user's avatar (empty/null -> default), so a previous
      // user's picture (e.g. a Google SSO avatar) never carries into the next login.
      this.authService.updateAvatarState(res.profilePicture || '');
      if (res.fullName) {
        this.authService.updateFullNameState(res.fullName);
      }

      // Apply the user's effective language for this workspace (personal preference
      // -> account default -> platform default), resolved server-side.
      this.languageService.getMyLanguage().subscribe({
        next: (state) => {
          this.i18n.setFallback(state.accountDefault);
          this.i18n.use(state.effective);
        },
        error: () => {}, // keep the current/stored language
      });

      // Go straight into the app - the "Signing you in…" overlay stays until
      // navigation, so the login form never reappears.
      this.router.navigate(['/home']);
    }
  }

  // Submit the MFA code (TOTP or XXXX-XXXX recovery code).
  submitMfaCode(): void {
    if (this.mfaForm.invalid) {
      this.mfaForm.markAllAsTouched();
      return;
    }
    const { code, rememberDevice } = this.mfaForm.getRawValue();
    if (!this.pendingMfaToken) return;
    this.loading.set(true);
    this.signingIn.set(true);
    this.errorMessage.set('');
    this.authService.mfaVerify(this.pendingMfaToken, code.trim(), rememberDevice)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (res) => {
          this.isMfaStep.set(false);
          this.pendingMfaToken = null;
          this.handleLoginResponse(res, 'local');
        },
        error: (err) => {
          this.signingIn.set(false);
          this.errorMessage.set(err?.error?.message || 'That code is not valid. Please try again.');
        },
      });
  }

  cancelMfa(): void {
    this.isMfaStep.set(false);
    this.pendingMfaToken = null;
    this.mfaForm.reset({ code: '', rememberDevice: true });
    this.errorMessage.set('');
  }

  // Resume the paused login inside the chosen workspace.
  selectWorkspace(companyId: string): void {
    this.loading.set(true);
    this.signingIn.set(true);
    const fail = (fallback: string) => (err: { error?: { message?: string } }) => {
      this.signingIn.set(false);
      this.errorMessage.set(err?.error?.message || fallback);
    };
    if (this.pendingLoginMethod === 'local') {
      const { email, password, rememberMe } = this.loginForm.getRawValue();
      this.authService.login(email, password, companyId, rememberMe)
        .pipe(finalize(() => this.loading.set(false)))
        .subscribe({ next: (res) => this.handleLoginResponse(res, 'local'), error: fail('Login failed.') });
    } else if (this.pendingLoginMethod === 'google' && this.pendingGoogleToken) {
      this.authService.googleLogin(this.pendingGoogleToken, companyId)
        .pipe(finalize(() => this.loading.set(false)))
        .subscribe({ next: (res) => this.handleLoginResponse(res, 'google'), error: fail('Google login failed.') });
    }
  }
}
