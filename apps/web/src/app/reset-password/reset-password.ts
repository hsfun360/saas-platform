import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  templateUrl: './reset-password.html',
  styleUrls: ['../shared/auth-card.css'],
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPasswordComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  private token: string | null = null;

  // Password floor unified app-wide at 8 characters.
  readonly form = this.fb.nonNullable.group(
    {
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordMatchValidator },
  );

  // Signals, not plain fields: the app is ZONELESS.
  readonly isSubmitting = signal(false);
  readonly hasToken = signal(true);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token');
    if (!this.token) {
      this.hasToken.set(false);
      this.errorMessage.set('Invalid or missing password reset link. Please request a new one.');
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
    this.isSubmitting.set(true);
    this.errorMessage.set('');
    this.authService.resetPassword(this.token, this.form.getRawValue().password).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.successMessage.set('Your password has been reset. Taking you to the login page…');
        setTimeout(() => this.router.navigate(['/login']), 3000);
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to reset the password. The link might have expired.');
      },
    });
  }
}

function passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
  return control.get('password')?.value === control.get('confirmPassword')?.value ? null : { mismatch: true };
}
