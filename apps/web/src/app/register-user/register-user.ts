import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../auth.service';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-register-user', // <--- ADD THIS LINE to force Classic mode
    standalone: true,
    templateUrl: './register-user.html',
    styleUrls: ['./register-user.css'],
    imports: [ReactiveFormsModule, RouterLink]
})
export class RegisterUserComponent implements OnInit {
  // 1. We only need ONE form variable here
  registrationForm!: FormGroup;
  
  loading = false;
  successMessage: string = '';
  errorMessage: string = '';
  isRegistering: boolean = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    // 2. Initialize the form
    this.registrationForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  get f() { return this.registrationForm.controls; }

  onSubmit() {
    // 3. Check the correct variable
    if (this.registrationForm.valid) {
      this.isRegistering = true;
      this.successMessage = '';
      this.errorMessage = '';

      // 4. Read the values from the correct variable
      const { email, password } = this.registrationForm.value;

      this.authService.register(email, password).subscribe({
        next: (response) => {
          this.isRegistering = false;
          // Display the message from the backend ("Registration successful! Please check your email...")
          this.successMessage = response.message || 'Registration successful! Please check your email.'; 
          
          // 5. Reset the correct variable
          this.registrationForm.reset(); 
        },
        error: (err) => {
          this.isRegistering = false;
          // Extract the error message from the backend if available
          this.errorMessage = err.error?.message || 'Registration failed. Please try again.';
          console.error(err);
        }
      });
    }
  }
}