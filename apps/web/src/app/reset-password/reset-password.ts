import { Component, OnInit, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
    selector: 'app-reset-password',
    standalone: true,
    templateUrl: './reset-password.html',
    styleUrls: ['./reset-password.css'],
    imports: [ReactiveFormsModule, RouterLink],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPasswordComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  resetForm!: FormGroup;
  token: string | null = null;

  // Signals, not plain fields: the app is ZONELESS, so a field mutated inside
  // an HTTP subscribe callback never re-renders the view (the same freeze the
  // forgot-password and register screens had).
  readonly isSubmitting = signal(false);
  readonly message = signal<string | null>(null);
  readonly isError = signal(false); // toggles success (green) vs error (red)

  ngOnInit(): void {
    // 1. Grab the secure token from the URL query parameters
    this.token = this.route.snapshot.queryParamMap.get('token');

    if (!this.token) {
      this.message.set('Invalid or missing password reset link. Please request a new one.');
      this.isError.set(true);
    }

    // 2. Build the form with our custom password match validator.
    // Password floor unified app-wide at 8 characters.
    this.resetForm = this.fb.group({
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]]
    }, { validators: this.passwordMatchValidator });
  }

  // Helper function to check if the passwords match
  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password')?.value;
    const confirmPassword = control.get('confirmPassword')?.value;
    return password === confirmPassword ? null : { mismatch: true };
  }

  onSubmit(): void {
    if (this.resetForm.invalid || !this.token) return;

    this.isSubmitting.set(true);
    const newPassword = this.resetForm.value.password;

    // 3. Send the token and new password to the backend
    this.authService.resetPassword(this.token, newPassword).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.message.set('Password successfully reset! Redirecting to login...');
        this.isError.set(false);

        // Automatically send them back to the login page after 3 seconds
        setTimeout(() => this.router.navigate(['/login']), 3000);
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.isError.set(true);
        this.message.set(err.error?.message || 'Failed to reset password. The link might be expired.');
      }
    });
  }
}
