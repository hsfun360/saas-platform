import { Component, OnInit, ChangeDetectorRef, signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../auth.service';
import { PhoneInputComponent } from '../../shared/phone-input/phone-input';
import { MfaStatus } from '../../models/auth.models';

@Component({
    selector: 'app-profile',
    standalone: true,
    templateUrl: './profile.html',
    styleUrl: './profile.css',
    imports: [ReactiveFormsModule, PhoneInputComponent]
})
export class ProfileComponent implements OnInit {
  profileForm!: FormGroup;
  successMessage: string = '';
  errorMessage: string = '';
  isLoading: boolean = true;
  authMethod: string = 'local';

  constructor(
    private fb: FormBuilder, 
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) 
  {}

  selectedImagePreview: string | ArrayBuffer | null = null;

  // --- Security (two-factor authentication) - signals so the zoneless view
  // updates on async results without manual change detection. ---
  readonly mfaStatus = signal<MfaStatus | null>(null);
  readonly mfaQr = signal('');
  readonly mfaOtpauth = signal('');
  readonly mfaRecoveryCodes = signal<string[]>([]);
  readonly mfaCode = signal('');
  readonly mfaBusy = signal(false);
  readonly mfaError = signal('');
  readonly mfaMode = signal<'idle' | 'enrolling' | 'disabling'>('idle');

  loadMfaStatus(): void {
    this.authService.getMfaStatus().subscribe({
      next: (s) => this.mfaStatus.set(s),
      error: () => {}, // card simply stays hidden when status can't load
    });
  }

  onMfaCodeInput(event: Event): void {
    this.mfaCode.set((event.target as HTMLInputElement).value);
  }

  startMfaSetup(): void {
    this.mfaError.set('');
    this.mfaBusy.set(true);
    this.authService.mfaSetup().subscribe({
      next: (res) => {
        this.mfaBusy.set(false);
        this.mfaQr.set(res.qrDataUrl);
        this.mfaOtpauth.set(res.otpauthUrl);
        this.mfaCode.set('');
        this.mfaMode.set('enrolling');
      },
      error: (err) => {
        this.mfaBusy.set(false);
        this.mfaError.set(err?.error?.message || 'Could not start the setup.');
      },
    });
  }

  confirmMfaEnable(): void {
    const code = this.mfaCode().trim();
    if (!code) return;
    this.mfaError.set('');
    this.mfaBusy.set(true);
    this.authService.mfaEnable(code).subscribe({
      next: (res) => {
        this.mfaBusy.set(false);
        this.mfaRecoveryCodes.set(res.recoveryCodes || []);
        this.mfaMode.set('idle');
        this.loadMfaStatus();
      },
      error: (err) => {
        this.mfaBusy.set(false);
        this.mfaError.set(err?.error?.message || 'That code is not valid.');
      },
    });
  }

  startMfaDisable(): void {
    this.mfaError.set('');
    this.mfaCode.set('');
    this.mfaMode.set('disabling');
  }

  confirmMfaDisable(): void {
    const code = this.mfaCode().trim();
    if (!code) return;
    this.mfaError.set('');
    this.mfaBusy.set(true);
    this.authService.mfaDisable(code).subscribe({
      next: () => {
        this.mfaBusy.set(false);
        this.mfaMode.set('idle');
        this.mfaRecoveryCodes.set([]);
        this.loadMfaStatus();
      },
      error: (err) => {
        this.mfaBusy.set(false);
        this.mfaError.set(err?.error?.message || 'That code is not valid.');
      },
    });
  }

  cancelMfaFlow(): void {
    this.mfaMode.set('idle');
    this.mfaError.set('');
    this.mfaCode.set('');
  }

  ngOnInit(): void {
  this.loadMfaStatus();

  // Get the email we stored during login
  const savedEmail = localStorage.getItem('userEmail') || '';

  // Initialize the form with empty/default values
  this.profileForm = this.fb.group({
    fullName: ['Loading...', [Validators.required]],
    email: [{ value: savedEmail, disabled: true }],
    phone: [''], // combined "+60123..." — the phone-input component splits/joins it
    bio: [''],
    profilePicture: [''] // 👈 Add this new control
  });

  // 2. Fetch the saved data from Postgres
  this.authService.getProfile().subscribe({
      next: (response) => {
        this.isLoading = false;
        const userData = response.user;
        this.authMethod = userData.authMethod || 'local';

        this.selectedImagePreview = userData.profilePicture || null;

        this.profileForm.patchValue({
          fullName: userData.full_name || '',
          phone: userData.phone || '',
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

      const dataToSave = {
        full_name: formValues.fullName,
        phone: formValues.phone, // already combined ("+60123…") by the phone-input component
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
