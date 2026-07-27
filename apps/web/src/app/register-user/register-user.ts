import { Component, OnInit, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../auth.service';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-register-user',
    standalone: true,
    templateUrl: './register-user.html',
    styleUrls: ['./register-user.css'],
    imports: [ReactiveFormsModule, RouterLink],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterUserComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  registrationForm!: FormGroup;

  // Signals, not plain fields: the app is ZONELESS, so a field mutated inside
  // an HTTP subscribe callback never re-renders the view - the error path
  // (e.g. "User already exists") used to leave the button on "Registering..."
  // forever even though the API had already answered.
  readonly isRegistering = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  ngOnInit(): void {
    this.registrationForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]]
    });
  }

  get f() { return this.registrationForm.controls; }

  onSubmit() {
    if (this.registrationForm.valid) {
      this.isRegistering.set(true);
      this.successMessage.set('');
      this.errorMessage.set('');

      const { email, password } = this.registrationForm.value;

      this.authService.register(email, password).subscribe({
        next: (response) => {
          this.isRegistering.set(false);
          // Display the message from the backend ("Registration successful! Please check your email...")
          this.successMessage.set(response.message || 'Registration successful! Please check your email.');
          this.registrationForm.reset();
        },
        error: (err) => {
          this.isRegistering.set(false);
          this.errorMessage.set(err.error?.message || 'Registration failed. Please try again.');
          console.error(err);
        }
      });
    }
  }
}
