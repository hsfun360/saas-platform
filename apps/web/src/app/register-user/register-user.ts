import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-register-user',
  standalone: true,
  templateUrl: './register-user.html',
  styleUrls: ['../shared/auth-card.css'],
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterUserComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  // Signals, not plain fields: the app is ZONELESS, so a field mutated inside
  // an HTTP subscribe callback never re-renders the view.
  readonly isRegistering = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  showError(name: 'email' | 'password'): boolean {
    const c = this.form.controls[name];
    return c.invalid && c.touched;
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.isRegistering.set(true);
    this.successMessage.set('');
    this.errorMessage.set('');
    const { email, password } = this.form.getRawValue();
    this.authService.register(email, password).subscribe({
      next: (response) => {
        this.isRegistering.set(false);
        this.successMessage.set(response.message || 'Registration successful! Please check your email.');
        this.form.reset();
      },
      error: (err) => {
        this.isRegistering.set(false);
        this.errorMessage.set(err.error?.message || 'Registration failed. Please try again.');
      },
    });
  }
}
