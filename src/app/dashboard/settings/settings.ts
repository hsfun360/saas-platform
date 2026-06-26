import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { AuthService } from '../../auth.service'; // Double check this path!
import { TitleCasePipe } from '@angular/common'; // Needed for the {{ authMethod | titlecase }}

// 👇 1. Create a custom validator to check if passwords match
export function passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
  const newPassword = control.get('newPassword')?.value;
  const confirmPassword = control.get('confirmPassword')?.value;

  // If both fields have text, but they don't match, return an error
  if (newPassword && confirmPassword && newPassword !== confirmPassword) {
    return { passwordsMismatch: true };
  }
  return null;
}

@Component({
    selector: 'app-settings',
    standalone: true,
    templateUrl: './settings.html', // Note: Ensure this points to settings.html
    styleUrl: './settings.css', // Note: Ensure this points to settings.css
    imports: [ReactiveFormsModule, TitleCasePipe] // 👈 Make sure these are here!
})
export class SettingsComponent implements OnInit {

  // 1. The variables we need for the new UI
  authMethod: string = 'local';
  passwordForm!: FormGroup;

  // 👇 1. Add this variable to track if General Settings is open (default to true)
  isGeneralSettingsExpanded: boolean = true;

  settings = {
    darkMode: false,
    emailNotifications: true,
    compactView: false
  };

  constructor(
    private fb: FormBuilder,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    // 2. Initialize the empty password form with the new confirmPassword field
    this.passwordForm = this.fb.group({
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', Validators.required]
    }, { validators: passwordMatchValidator }); // Attach validator to the whole group

    // 3. Fetch the authMethod from the backend to decide whether to hide the form!
    this.authService.getProfile().subscribe({
      next: (res) => {
        this.authMethod = res.user.authMethod || 'local';
      },
      error: (err) => console.error('Failed to load settings profile', err)
    });
  }
  
  // 👇 2. Add this function to toggle the state when clicked
  toggleGeneralSettings() {
    this.isGeneralSettingsExpanded = !this.isGeneralSettingsExpanded;
  }

  toggleSetting(key: keyof typeof this.settings) {
    this.settings[key] = !this.settings[key];
    localStorage.setItem('appSettings', JSON.stringify(this.settings));
    
    // If it's Dark Mode, we can apply a class to the body
    if (key === 'darkMode') {
      document.body.classList.toggle('dark-theme', this.settings.darkMode);
    }
  }

  onChangePassword() {
    if (this.passwordForm.valid) {
      // Extract the passwords from the form
      const { currentPassword, newPassword } = this.passwordForm.value;
      
      const payload = {
        currentPassword: currentPassword,
        newPassword: newPassword
      };

      // Call the backend service!
      this.authService.changePassword(payload).subscribe({
        next: (res) => {
          // Success! Show an alert and clear the form
          alert('Success: ' + res.message);
          this.passwordForm.reset();
        },
        error: (err) => {
          // Failure (e.g., they typed the wrong current password)
          console.error('Password change failed:', err);
          alert('Error: ' + (err.error?.message || 'Failed to update password.'));
        }
      });
    }
  }
}