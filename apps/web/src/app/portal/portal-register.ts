import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { PortalService, PortalRegistrationContext } from '../services/portal.service';

// Member Portal self-registration - the landing page of the welcome email's
// "Register for the Member Portal" link. Public route; the signed token in the
// URL is the credential. Greets the member with who/where (no dark rooms),
// takes a password, then either logs them straight into /portal (new account)
// or points them to /login (their email already had an account - linked).
@Component({
  selector: 'app-portal-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './portal-register.html',
  styleUrls: ['../setup-password/setup-password.css'],
})
export class PortalRegisterComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly portal = inject(PortalService);

  private token = '';
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly context = signal<PortalRegistrationContext | null>(null);
  readonly invalidMessage = signal('');
  readonly linkedMessage = signal('');
  readonly errorMessage = signal('');

  readonly form = this.fb.nonNullable.group(
    {
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordMatchValidator },
  );

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') || '';
    if (!this.token) {
      this.loading.set(false);
      this.invalidMessage.set('This registration link is missing its token. Please use the link from your welcome email.');
      return;
    }
    this.portal.registrationContext(this.token).subscribe({
      next: (ctx) => {
        this.context.set(ctx);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.invalidMessage.set(err.error?.message || 'This registration link is invalid or has expired.');
      },
    });
  }

  showError(name: 'password' | 'confirmPassword'): boolean {
    const c = this.form.get(name);
    return !!c && c.touched && c.invalid;
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set('');
    this.portal.register(this.token, this.form.getRawValue().password).subscribe({
      next: (res) => {
        this.submitting.set(false);
        if (res.linked) {
          // Existing account - their current password stays; hand over to login.
          this.linkedMessage.set(res.message);
          return;
        }
        if (res.token) {
          this.authService.storeToken(res.token);
          if (res.email) this.authService.setEmail(res.email);
          this.router.navigate(['/portal']);
        }
      },
      error: (err) => {
        this.submitting.set(false);
        this.errorMessage.set(err.error?.message || 'Registration failed. Please try again.');
      },
    });
  }
}

function passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
  return control.get('password')?.value === control.get('confirmPassword')?.value ? null : { mismatch: true };
}
