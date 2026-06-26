import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-setup-password',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, RouterLink],
  templateUrl: './setup-password.html',
  styleUrls: ['./setup-password.css']
})
export class SetupPasswordComponent implements OnInit {
  setupForm!: FormGroup;
  token: string | null = null;
  loading = false;
  errorMessage = '';
  extractedEmail: string = '';
  extractedCompanyName: string = '';
  isLinkValid: boolean = false;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    // 1. Grab the token from the URL (e.g., ?token=eyJhbGci...)
    this.token = this.route.snapshot.queryParamMap.get('token');

    // 2. Decode the token to get the Company Name and Email
    if (this.token) {
      try {
        // A JWT has 3 parts separated by dots. The middle part contains our data!
        const payloadBase64 = this.token.split('.')[1];
        const decodedPayload = JSON.parse(atob(payloadBase64));
        
        // JWT expiration is in seconds, so we multiply by 1000 for milliseconds
        const expirationDate = decodedPayload.exp * 1000;
        const currentTime = Date.now();

        if (currentTime > expirationDate) {
           // The token is officially expired! 
           this.isLinkValid = false;
        } else {
           // The token is good! Extract the data and show the form
           this.extractedEmail = decodedPayload.email;
           this.extractedCompanyName = decodedPayload.companyName;
           this.isLinkValid = true;
        }
      } catch (error) {
        // If the token is mangled or tampered with, it's invalid
        this.isLinkValid = false;
        console.error('Could not decode token data');
      }
    }

    // 2. Initialize the form with password match validation
    this.setupForm = this.fb.group({
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required]
    }, { validators: this.passwordMatchValidator });
  }

  // Custom validator to ensure passwords match exactly
  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password')?.value;
    const confirmPassword = control.get('confirmPassword')?.value;
    return password === confirmPassword ? null : { mismatch: true };
  }

  onSubmit(): void {
    console.log('1. BUTTON CLICKED!');

    // Trap 1: Is the token missing?
    if (!this.token) {
      console.error('2. ERROR: Token is missing from the URL!');
      alert('Error: Missing activation token.');
      return;
    }

    // Trap 2: Is the form secretly invalid?
    if (this.setupForm.invalid) {
      console.error('2. ERROR: Form is invalid!', this.setupForm.errors);
      console.log('Password Errors:', this.setupForm.get('password')?.errors);
      console.log('Confirm Errors:', this.setupForm.get('confirmPassword')?.errors);
      console.log('Form Mismatch:', this.setupForm.hasError('mismatch'));
      return;
    }

    console.log('3. FORM IS VALID. Sending to backend...');
    this.loading = true;
    this.errorMessage = '';
    const password = this.setupForm.get('password')?.value;

    this.authService.activateAccount(this.token, password).subscribe({
      next: (res) => {
        console.log('4. BACKEND SUCCESS!', res);
        this.loading = false;
        
        alert('Workspace activated successfully! Redirecting to login...');
        
        // 👇 Now routing to the Login page as requested!
        this.router.navigate(['/login']); 
      },
      error: (err) => {
        console.error('5. BACKEND ERROR CAUGHT:', err);
        this.loading = false;
        this.errorMessage = err.error?.message || 'Failed to activate account. The link may have expired.';
      }
    });
  }
}