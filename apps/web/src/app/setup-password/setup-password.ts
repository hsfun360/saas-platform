import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';

// Self-subscribe step 2: the activation link lands here; the signed token in
// the URL names the company and email, the prospect sets a password and the
// workspace is provisioned.
@Component({
  selector: 'app-setup-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './setup-password.html',
  styleUrls: ['../shared/auth-card.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SetupPasswordComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  private token: string | null = null;

  // Signals (zoneless): plain fields set inside the HTTP callback never
  // re-rendered - the error banner stayed hidden and the button stuck on
  // "Provisioning…".
  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly extractedEmail = signal('');
  readonly extractedCompanyName = signal('');
  readonly isLinkValid = signal(false);
  readonly activated = signal(false);

  readonly form = this.fb.nonNullable.group(
    {
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordMatchValidator },
  );

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token');
    if (!this.token) return;
    // The link's token carries the company name, email and expiry; a mangled
    // or expired token shows the "link expired" card (the API re-checks).
    try {
      const payload = JSON.parse(atob(this.token.split('.')[1])) as { exp?: number; email?: string; companyName?: string };
      if (payload.exp && Date.now() > payload.exp * 1000) return;
      this.extractedEmail.set(payload.email || '');
      this.extractedCompanyName.set(payload.companyName || '');
      this.isLinkValid.set(true);
    } catch {
      this.isLinkValid.set(false);
    }
  }

  showError(name: 'password' | 'confirmPassword'): boolean {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  onSubmit(): void {
    if (!this.token) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.errorMessage.set('');
    this.authService.activateAccount(this.token, this.form.getRawValue().password).subscribe({
      next: () => {
        this.loading.set(false);
        this.activated.set(true);
        // Show the outcome, then hand over to login.
        setTimeout(() => this.router.navigate(['/login']), 2500);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to activate the account. The link may have expired.');
      },
    });
  }
}

function passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
  return control.get('password')?.value === control.get('confirmPassword')?.value ? null : { mismatch: true };
}
