import { MsalService } from '@azure/msal-angular';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { AuthResponse, Workspace } from '../models/auth.models';
import { finalize } from 'rxjs';

declare var google: { accounts: { oauth2: { initTokenClient(config: { client_id: string; scope: string; callback: (res: { access_token?: string }) => void }): { requestAccessToken(): void } } } };

@Component({
    selector: 'app-login',
    templateUrl: './login.html',
    styleUrls: ['./login.css'],
    imports: [ReactiveFormsModule, RouterLink]
})
export class LoginComponent implements OnInit {

  loginForm!: FormGroup;
  loading = false;
  errorMessage: string | null = null;
  successMessage: string | null = null;

  showPassword = false;
  isLoggingIn = false;

  isWorkspaceSelection = false;
  availableWorkspaces: Workspace[] = [];
  pendingLoginMethod: 'local' | 'google' | null = null;
  pendingGoogleToken: string | null = null;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef, // 2. Inject it here
    private msalService: MsalService // 👈 Add this here!
  ) {}

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

    // 👇 ADD THIS: Catch the user when they return from the Microsoft Redirect
    this.msalService.handleRedirectObservable().subscribe({
      next: (response: { accessToken?: string } | null) => {
        if (response !== null && response?.accessToken) {
          this.processMicrosoftToken(response.accessToken);
        }
      },
      error: () => {
        this.errorMessage = 'Microsoft sign-in failed. Please try again.';
      }
    });
  }
  
  processMicrosoftToken(token: string): void {
    this.authService.microsoftLogin(token).subscribe({
      next: (res) => {
        this.handleLoginResponse(res, 'local');
      },
      error: () => {
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
      });
  }

  loginWithGoogle(): void {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: '148523901156-uc6a3f7q2le2fsqbm5idc0ai27vebe69.apps.googleusercontent.com',
      scope: 'email profile openid',
      callback: (tokenResponse: { access_token?: string }) => {
        if (tokenResponse?.access_token) {
          this.authService.googleLogin(tokenResponse.access_token).subscribe({
            next: (response) => {
              this.handleLoginResponse(response, 'google', tokenResponse.access_token);
            },
            error: () => {
              this.errorMessage = 'Google sign-in failed. Please try again.';
              this.cdr.detectChanges();
            }
          });
        }
      }
    });
    client.requestAccessToken();
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
  private handleLoginResponse(res: AuthResponse, method: 'local' | 'google', googleToken?: string): void {
    if (res.clubs) {
      // SCENARIO B: The 206 Multi-Workspace Pause!
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
      
      // if (res.profilePicture) this.authService.updateAvatarState(res.profilePicture);
      // if (res.fullName) this.authService.updateFullNameState(res.fullName);
      if (res.profilePicture) {
        localStorage.setItem('profilePicture', res.profilePicture);
        this.authService.updateAvatarState(res.profilePicture); // Broadcast to the app
      }
      if (res.fullName) {
        this.authService.updateFullNameState(res.fullName); // Broadcast to the app
      }

      this.successMessage = 'Login successful! Redirecting...';
      this.cdr.detectChanges();
      setTimeout(() => this.router.navigate(['/home']), 1000);
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
        error: (_err) => this.errorMessage = 'Login failed.'
      });
    } else if (this.pendingLoginMethod === 'google' && this.pendingGoogleToken) {
      this.authService.googleLogin(this.pendingGoogleToken, companyId).pipe(
        finalize(() => { this.loading = false; this.cdr.detectChanges(); })
      ).subscribe({
        next: (res) => this.handleLoginResponse(res, 'google'),
        error: (_err) => this.errorMessage = 'Google login failed.'
      });
    }
  }
}
