import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';

// Self-subscribe step 1: a prospect leaves their name, company and work email
// and receives the activation link (setup-password completes the sign-up).
@Component({
  selector: 'app-register-lead',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register-lead.html',
  styleUrls: ['../shared/auth-card.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterLeadComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  // Signals (zoneless): a plain field set inside the HTTP callback never
  // re-rendered, so the button used to stay on "Generating link…".
  readonly loading = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    companyName: ['', [Validators.required, Validators.maxLength(150)]],
    email: ['', [Validators.required, Validators.email]],
  });

  showError(name: 'name' | 'companyName' | 'email'): boolean {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.errorMessage.set('');
    // The prospect's local timezone travels silently with the lead.
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    this.authService.registerLead({ ...this.form.getRawValue(), timezone, source: 'Organic' }).subscribe({
      next: () => {
        this.loading.set(false);
        this.successMessage.set('Your account has been created. Check your inbox to complete the activation.');
        this.form.reset();
      },
      error: (err) => {
        this.loading.set(false);
        if (err.status === 400 && err.error?.message?.includes('already exists')) {
          this.errorMessage.set('This email address has already been used. Please create your account with a different email.');
        } else {
          this.errorMessage.set(err.error?.message || 'Something went wrong. Please try again.');
        }
      },
    });
  }
}
