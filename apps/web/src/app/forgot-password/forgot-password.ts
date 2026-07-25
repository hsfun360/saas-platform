import { Component, OnInit, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../auth.service';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-forgot-password',
    standalone: true,
    templateUrl: './forgot-password.html',
    styleUrls: ['./forgot-password.css'],
    imports: [ReactiveFormsModule, RouterLink],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  forgotPasswordForm!: FormGroup;

  // Signals, not plain fields: the app is ZONELESS, so a field mutated inside
  // an HTTP subscribe callback never re-renders the view - the button used to
  // stay on "Sending..." forever even though the API had already answered.
  readonly isSubmitting = signal(false);
  readonly successMessage = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.forgotPasswordForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  onSubmit(): void {
    if (this.forgotPasswordForm.invalid) {
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);
    const email = this.forgotPasswordForm.value.email;

    this.authService.forgotPassword(email).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        // Hide the form and show the success message. Deliberately the same
        // whether or not the email exists (no account enumeration).
        this.successMessage.set('If an account exists for that email, we have sent a password reset link.');
      },
      error: (err) => {
        this.isSubmitting.set(false);
        // SSO accounts / server errors surface inline (no alert() popups).
        this.errorMessage.set(err?.error?.message || 'An error occurred. Please try again later.');
      }
    });
  }
}
