import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../auth.service';
//import { NgFor, NgIf } from '@angular/common'; // 👈 1. Make sure this import path is correct

@Component({
    selector: 'app-profile',
    standalone: true,
    templateUrl: './profile.html',
    styleUrl: './profile.css',
//    imports: [ReactiveFormsModule, NgFor, NgIf]
    imports: [ReactiveFormsModule]
})
export class ProfileComponent implements OnInit {
  profileForm!: FormGroup;
  successMessage: string = '';
  errorMessage: string = '';
  isLoading: boolean = true;
  authMethod: string = 'local';

  // List of common country codes. You can add more as needed!
  countryCodes = [
    { code: '+60', country: 'Malaysia (+60)' },
    { code: '+65', country: 'Singapore (+65)' },
    { code: '+62', country: 'Indonesia (+62)' },
    { code: '+66', country: 'Thailand (+66)' },
    { code: '+1', country: 'US/Canada (+1)' },
    { code: '+44', country: 'UK (+44)' },
    { code: '+61', country: 'Australia (+61)' }
  ];

  constructor(
    private fb: FormBuilder, 
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) 
  {}

  selectedImagePreview: string | ArrayBuffer | null = null;

  ngOnInit(): void {
  // Get the email we stored during login
  const savedEmail = localStorage.getItem('userEmail') || '';

  // Initialize the form with empty/default values
  this.profileForm = this.fb.group({
    fullName: ['Loading...', [Validators.required]],
    email: [{ value: savedEmail, disabled: true }],
    countryCode: ['+60'], // Defaulting to +60
    phoneNumber: [''],
    bio: [''],
    profilePicture: [''] // 👈 Add this new control
  });

  // 2. Fetch the saved data from Postgres
  this.authService.getProfile().subscribe({
      next: (response) => {
        this.isLoading = false;
        const userData = response.user;
        this.authMethod = userData.authMethod || 'local';

        let parsedCode = '+60';
        let parsedNumber = '';

        if (userData.phone) {
          const matchedCountry = this.countryCodes.find(c => userData.phone!.startsWith(c.code));
          if (matchedCountry) {
            parsedCode = matchedCountry.code;
            parsedNumber = userData.phone.substring(matchedCountry.code.length);
          } else {
            parsedNumber = userData.phone;
          }
        }

        this.selectedImagePreview = userData.profilePicture || null;

        this.profileForm.patchValue({
          fullName: userData.full_name || '',
          countryCode: parsedCode,
          phoneNumber: parsedNumber,
          bio: userData.bio || '',
          profilePicture: userData.profilePicture || ''
        });
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = 'Failed to load profile data.';
        this.profileForm.patchValue({ fullName: '' }); // Clear "Loading..."
        console.error(err);
      }
    });
  }

  // 2. Add this new function to handle the file selection
  onFileSelected(event: any) {
    const file: File = event.target.files[0];
    
    if (file) {
      // 1. Enforce the 1MB limit on the frontend!
      if (file.size > 1024 * 1024) {
        this.errorMessage = 'File is too large! Please select an image under 1MB.';
        this.cdr.detectChanges(); // Ensure the error message updates immediately
        setTimeout(() => this.errorMessage = '', 3000);
        return;
      }

      // 2. Show an instant preview for the user
      const reader = new FileReader();
      reader.onload = (e) => {
        // this.selectedImagePreview = e.target?.result as string;
        const base64String = e.target?.result as string;
        
        // Updates the big picture on the Profile page itself
        this.selectedImagePreview = base64String; 
        
        // 👇 ADD THIS LINE: Instantly push the Base64 preview to the top-right corner!
        this.authService.updateAvatarState(base64String);

        this.cdr.detectChanges(); // Ensure the preview updates immediately
      };
      reader.readAsDataURL(file);

      // 3. Package the file into FormData
      const formData = new FormData();
      formData.append('avatar', file);

      // 4. Send it directly to your new Cloud Storage backend route
      this.authService.uploadProfilePicture(formData).subscribe({
        next: (res) => {
          this.successMessage = 'Profile picture updated successfully!';
          // Update the form with the new Google Cloud URL so it's kept in sync
          this.profileForm.patchValue({ profilePicture: res.url });
          this.authService.updateAvatarState(res.url);
          this.cdr.detectChanges();

          setTimeout(() => { this.successMessage = ''; this.cdr.detectChanges(); }, 3000);
        },
        error: (err) => {
          console.error('Upload failed:', err);
          this.errorMessage = 'Failed to upload profile picture.';
          this.cdr.detectChanges();
          setTimeout(() => this.errorMessage = '', 3000);
        }
      });
    }
  }

  onUpdateProfile() {
    if (this.profileForm.valid) {
      const formValues = this.profileForm.getRawValue();
      
      // Combine the country code and phone number before saving
      const combinedPhone = formValues.phoneNumber 
        ? `${formValues.countryCode}${formValues.phoneNumber}` 
        : ''; // Save as empty string if no number was typed

      const dataToSave = {
        full_name: formValues.fullName,
        phone: combinedPhone,
        bio: formValues.bio
//        profilePicture: formValues.profilePicture // This will be the Base64 string of the image
      };
      
      this.authService.updateProfile(dataToSave).subscribe({
        next: (res) => {
          this.successMessage = 'Saved to Database!';
          setTimeout(() => this.successMessage = '', 3000);

          // 👇 ADD THIS LINE: Broadcast the new picture immediately!
          //if (dataToSave.profilePicture) {
          //  this.authService.updateAvatarState(dataToSave.profilePicture);
          //}

          // 👇 ADD THIS LINE: Broadcast the new name immediately!
          if (dataToSave.full_name) {
            this.authService.updateFullNameState(dataToSave.full_name);
          }
        },
        error: (err) => {
          this.errorMessage = 'Failed to save changes.';
          setTimeout(() => this.errorMessage = '', 3000);
          console.error('Database save failed', err);
        }
        });
      }
    }
  }
