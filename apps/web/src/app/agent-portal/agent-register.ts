import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { SalesService, AgentRegistrationContext } from '../services/sales.service';

// Sales Agent self-registration - the landing page of the invite email's
// "Register for the Agent Portal" link. Public route; the signed token in the
// URL is the credential. Mirrors the member portal registration.
@Component({
  selector: 'app-agent-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './agent-register.html',
  styleUrls: ['../setup-password/setup-password.css'],
})
export class AgentRegisterComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly sales = inject(SalesService);

  private token = '';
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly context = signal<AgentRegistrationContext | null>(null);
  readonly invalidMessage = signal('');
  readonly linkedMessage = signal('');
  readonly errorMessage = signal('');

  readonly form = this.fb.nonNullable.group(
    {
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: agentPasswordMatch },
  );

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') || '';
    if (!this.token) {
      this.loading.set(false);
      this.invalidMessage.set('This registration link is missing its token. Please use the link from your invitation email.');
      return;
    }
    this.sales.registrationContext(this.token).subscribe({
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
    this.sales.register(this.token, this.form.getRawValue().password).subscribe({
      next: (res) => {
        this.submitting.set(false);
        if (res.linked) {
          this.linkedMessage.set(res.message);
          return;
        }
        if (res.token) {
          this.authService.storeToken(res.token);
          if (res.email) this.authService.setEmail(res.email);
          this.router.navigate(['/agent']);
        }
      },
      error: (err) => {
        this.submitting.set(false);
        this.errorMessage.set(err.error?.message || 'Registration failed. Please try again.');
      },
    });
  }
}

function agentPasswordMatch(control: AbstractControl): ValidationErrors | null {
  return control.get('password')?.value === control.get('confirmPassword')?.value ? null : { mismatch: true };
}
