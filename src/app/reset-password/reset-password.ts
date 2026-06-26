import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
    selector: 'app-reset-password',
    standalone: true,
    templateUrl: './reset-password.html',
    styleUrls: ['./reset-password.css'],
    imports: [ReactiveFormsModule, RouterLink],
})
export class ResetPasswordComponent implements OnInit {
  resetForm!: FormGroup;
  token: string | null = null;
  isSubmitting = false;
  message: string | null = null;
  isError = false; // To toggle between success (green) and error (red) messages

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    // 1. Grab the secure token from the URL query parameters
    this.token = this.route.snapshot.queryParamMap.get('token');

    if (!this.token) {
      this.message = 'Invalid or missing password reset link. Please request a new one.';
      this.isError = true;
    }

    // 2. Build the form with our custom password match validator
    this.resetForm = this.fb.group({
      password: ['', [Validators.required, Validators.minLength(6)]],
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

    this.isSubmitting = true;
    const newPassword = this.resetForm.value.password;

    // 3. Send the token and new password to the backend
    this.authService.resetPassword(this.token, newPassword).subscribe({
      next: (res) => {
        this.isSubmitting = false;
        this.message = 'Password successfully reset! Redirecting to login...';
        this.isError = false;
        
        // Automatically send them back to the login page after 3 seconds
        setTimeout(() => this.router.navigate(['/login']), 3000);
      },
      error: (err) => {
        this.isSubmitting = false;
        this.isError = true;
        this.message = err.error?.message || 'Failed to reset password. The link might be expired.';
      }
    });
  }
}
