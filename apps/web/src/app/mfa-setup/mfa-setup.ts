import { Component, OnInit, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';

// Forced MFA enrollment for administrator accounts (System Admin / Tenant
// Admin without MFA). Runs full-screen OUTSIDE the shell on the 'mfa-enroll'
// purpose token; a successful enable completes the login (the response carries
// the full session) and lands in /home. Self-service enrollment for everyone
// else lives in Profile -> Security.
@Component({
  selector: 'app-mfa-setup',
  standalone: true,
  imports: [],
  templateUrl: './mfa-setup.html',
  styleUrls: ['./mfa-setup.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MfaSetupComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly userEmail = localStorage.getItem('userEmail') || '';

  readonly qrDataUrl = signal('');
  readonly otpauthUrl = signal('');
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly errorMessage = signal('');
  readonly code = signal('');

  // After enabling: show the recovery codes ONCE, then continue into the app.
  readonly recoveryCodes = signal<string[]>([]);
  private pendingSession: { token: string } & Record<string, unknown> | null = null;

  ngOnInit(): void {
    this.auth.mfaSetup().subscribe({
      next: (res) => {
        this.qrDataUrl.set(res.qrDataUrl);
        this.otpauthUrl.set(res.otpauthUrl);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err?.error?.message || 'Could not start the setup. Please log in again.');
      },
    });
  }

  onCodeInput(event: Event): void {
    this.code.set((event.target as HTMLInputElement).value);
  }

  confirm(): void {
    const code = this.code().trim();
    if (!code) return;
    this.submitting.set(true);
    this.errorMessage.set('');
    this.auth.mfaEnable(code).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.recoveryCodes.set(res.recoveryCodes || []);
        if (res.token) {
          // Forced-enrollment flow: the response IS the completed login.
          this.pendingSession = res as unknown as { token: string } & Record<string, unknown>;
        }
      },
      error: (err) => {
        this.submitting.set(false);
        this.errorMessage.set(err?.error?.message || 'That code is not valid. Please try again.');
      },
    });
  }

  continueToApp(): void {
    const res = this.pendingSession;
    if (res && typeof res['token'] === 'string') {
      localStorage.setItem('token', res['token'] as string);
      localStorage.setItem('userEmail', (res['email'] as string) || this.userEmail);
      localStorage.setItem('userRole', (res['roleName'] as string) || 'User');
      localStorage.setItem('userFullName', (res['fullName'] as string) || 'User');
      localStorage.setItem('userProfilePicture', (res['profilePicture'] as string) || '');
      this.auth.storeUserMenus(res['menus'] as never);
      this.auth.updateAvatarState((res['profilePicture'] as string) || '');
      if (res['fullName']) this.auth.updateFullNameState(res['fullName'] as string);
      this.router.navigate(['/home']);
    } else {
      // No session in the response (shouldn't happen on this flow) - re-login.
      localStorage.clear();
      this.router.navigate(['/login']);
    }
  }

  signOut(): void {
    localStorage.clear();
    this.router.navigate(['/login']);
  }
}
