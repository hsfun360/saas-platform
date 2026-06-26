import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth.service'; // Adjust path if your service is elsewhere

@Component({
  selector: 'app-register-lead',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './register-lead.html',
  styleUrls: ['./register-lead.css']
})
export class RegisterLeadComponent implements OnInit {
  registerForm!: FormGroup;
  loading = false;
  submitted = false;
  successMessage = '';
  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.registerForm = this.fb.group({
      name: ['', Validators.required],
      companyName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]]
    });
  }

  onSubmit(): void {
    console.log('1. BUTTON CLICKED!'); // <--- Add this

    this.submitted = true;
    this.errorMessage = '';

    // Stop here if the form is missing required fields
    if (this.registerForm.invalid) {
      console.log('2. FORM IS INVALID. STOPPING.'); // <--- Add this
      console.log('Form Errors:', this.registerForm.errors);
      return;
    }

    console.log('3. FORM IS VALID. PROCEEDING.'); // <--- Add this
    this.loading = true;

    // SILENT CAPTURE: Get the user's local timezone automatically
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const leadData = {
      ...this.registerForm.value,
      timezone: userTimezone,
      source: 'Organic' 
    };

    // Send it to the Node.js backend
    this.authService.registerLead(leadData).subscribe({
      next: (res) => {
        console.log('4. BACKEND SUCCESS!', res);
        this.loading = false;
        
        // 1. Show the pop-up prompt!
        alert('Your account has been successfully created. Please check your email to complete the activation process.');
        
        // 2. Clear the form so they don't accidentally submit it twice
        this.registerForm.reset();
        this.submitted = false;
      },
      error: (err) => {
        console.log('5. BACKEND ERROR CAUGHT:', err);
        this.loading = false;

        // Check if it is the duplicate email error
        if (err.status === 400 && err.error?.message?.includes('already exists')) {
            // Show the pop-up prompt!
            alert('This email address has already been used. Please create your Account with a different email.');
        } else {
            // Fallback for other errors
            alert(err.error?.message || 'Something went wrong. Please try again.');
        }
      }
    });
  }
}