import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  templateUrl: './forgot-password.html',
  styleUrls: ['../shared/auth-card.css'],
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  // Signals, not plain fields: the app is ZONELESS.
  readonly isSubmitting = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  showError(): boolean {
    const c = this.form.controls.email;
    return c.invalid && c.touched;
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.isSubmitting.set(true);
    this.errorMessage.set('');
    this.authService.forgotPassword(this.form.getRawValue().email).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        // Deliberately the same whether or not the email exists (no account enumeration).
        this.successMessage.set('If an account exists for that email, we have sent a password reset link.');
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(err?.error?.message || 'An error occurred. Please try again later.');
      },
    });
  }
}
