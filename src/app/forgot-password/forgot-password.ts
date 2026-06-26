import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
//import { RouterModule } from '@angular/router'; // 👈 Add this so routerLink works
import { AuthService } from '../auth.service';
import { RouterLink } from '@angular/router'; // Adjust path if necessary

@Component({
    selector: 'app-forgot-password',
    standalone: true,
    templateUrl: './forgot-password.html',
    styleUrls: ['./forgot-password.css'],
    imports: [ReactiveFormsModule, RouterLink]
})
export class ForgotPasswordComponent implements OnInit {
  forgotPasswordForm!: FormGroup;
  isSubmitting = false;
  successMessage: string | null = null;

  constructor(private fb: FormBuilder, private authService: AuthService) {}

  ngOnInit(): void {
    this.forgotPasswordForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  onSubmit(): void {
    if (this.forgotPasswordForm.invalid) {
      return;
    }

    this.isSubmitting = true;
    const email = this.forgotPasswordForm.value.email;

    this.authService.forgotPassword(email).subscribe({
      next: (response) => {
        this.isSubmitting = false;
        // Hide the form and show the success message
        this.successMessage = 'If an account exists for that email, we have sent a password reset link.';
      },
      error: (err) => {
        this.isSubmitting = false;
        // For security, it's best practice to show a generic success message even if the email isn't in the DB,
        // but if your backend throws a 500 server error, you can catch it here.
        alert('An error occurred. Please try again later.');
        console.error('Forgot Password Error:', err);
      }
    });
  }
}