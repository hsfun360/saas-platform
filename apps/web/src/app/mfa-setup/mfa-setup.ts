import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { MfaEnableResponse } from '../models/auth.models';

// Type guard: the enable response carries the full login only on the
// forced-enrollment token; a self-service enable returns recovery codes alone.
function hasSessionToken(res: MfaEnableResponse): res is MfaEnableResponse & { token: string } {
  return typeof res.token === 'string' && res.token.length > 0;
}

// Forced MFA enrollment: administrator accounts (System Admin / Tenant Admin
// without MFA) and, since 2026-10-30, every user of an account whose security
// policy requires MFA. Runs full-screen OUTSIDE the shell on the 'mfa-enroll'
// purpose token; a successful enable completes the login (the response carries
// the full session) and lands in /home. Self-service enrollment for everyone
// else lives in Profile -> Security.
@Component({
  selector: 'app-mfa-setup',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './mfa-setup.html',
  styleUrls: ['../shared/auth-card.css', './mfa-setup.css'],
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
  // The 6-digit code is a reactive control so Enter submits the form.
  readonly code = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(6)] });

  // After enabling: show the recovery codes ONCE, then continue into the app.
  readonly recoveryCodes = signal<string[]>([]);
  // The completed login the forced-enrollment flow returns (token present).
  private pendingSession: (MfaEnableResponse & { token: string }) | null = null;

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

  confirm(): void {
    if (this.code.invalid) {
      this.code.markAsTouched();
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set('');
    this.auth.mfaEnable(this.code.value.trim()).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.recoveryCodes.set(res.recoveryCodes || []);
        if (hasSessionToken(res)) {
          // Forced-enrollment flow: the response IS the completed login.
          this.pendingSession = res;
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
    if (res) {
      localStorage.setItem('token', res.token);
      localStorage.setItem('userEmail', res.email || this.userEmail);
      localStorage.setItem('userRole', res.roleName || 'User');
      localStorage.setItem('userFullName', res.fullName || 'User');
      localStorage.setItem('userProfilePicture', res.profilePicture || '');
      this.auth.storeUserMenus(res.menus || []);
      this.auth.updateAvatarState(res.profilePicture || '');
      if (res.fullName) this.auth.updateFullNameState(res.fullName);
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
