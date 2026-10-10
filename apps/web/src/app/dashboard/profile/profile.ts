import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../auth.service';
import { PhoneInputComponent } from '../../shared/phone-input/phone-input';
import { MfaStatus } from '../../models/auth.models';

// The signed-in user's own profile (name, phone, bio, photo) and their
// two-factor authentication. Everything the template reads is a signal or a
// form control (zoneless + OnPush): no manual change detection.
@Component({
  selector: 'app-profile',
  standalone: true,
  templateUrl: './profile.html',
  styleUrl: './profile.css',
  imports: [ReactiveFormsModule, PhoneInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  readonly successMessage = signal('');
  readonly errorMessage = signal('');
  readonly isLoading = signal(true);
  readonly saving = signal(false);
  readonly authMethod = signal('local');
  readonly selectedImagePreview = signal<string | null>(null);

  readonly profileForm = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.maxLength(150)]],
    email: [{ value: localStorage.getItem('userEmail') || '', disabled: true }],
    phone: [''], // combined "+60123..." - the phone-input component splits/joins it
    bio: ['', Validators.maxLength(500)],
    profilePicture: [''],
  });

  // --- Security (two-factor authentication) ---
  readonly mfaStatus = signal<MfaStatus | null>(null);
  readonly mfaQr = signal('');
  readonly mfaOtpauth = signal('');
  readonly mfaRecoveryCodes = signal<string[]>([]);
  readonly mfaBusy = signal(false);
  readonly mfaError = signal('');
  readonly mfaMode = signal<'idle' | 'enrolling' | 'disabling'>('idle');
  // The code is a reactive control so Enter submits the enrol / disable form.
  readonly mfaCode = new FormControl('', { nonNullable: true, validators: [Validators.required] });

  ngOnInit(): void {
    this.loadMfaStatus();
    this.authService.getProfile().subscribe({
      next: (response) => {
        this.isLoading.set(false);
        const userData = response.user;
        this.authMethod.set(userData.authMethod || 'local');
        this.selectedImagePreview.set(userData.profilePicture || null);
        this.profileForm.reset({
          fullName: userData.full_name || '',
          email: this.profileForm.controls.email.value,
          phone: userData.phone || '',
          bio: userData.bio || '',
          profilePicture: userData.profilePicture || '',
        });
      },
      error: () => {
        this.isLoading.set(false);
        this.errorMessage.set('Failed to load your profile.');
      },
    });
  }

  showError(name: 'fullName' | 'bio'): boolean {
    const c = this.profileForm.controls[name];
    return c.invalid && c.touched;
  }

  loadMfaStatus(): void {
    this.authService.getMfaStatus().subscribe({
      next: (s) => this.mfaStatus.set(s),
      error: () => {}, // the card simply stays hidden when the status cannot load
    });
  }

  startMfaSetup(): void {
    this.mfaError.set('');
    this.mfaBusy.set(true);
    this.authService.mfaSetup().subscribe({
      next: (res) => {
        this.mfaBusy.set(false);
        this.mfaQr.set(res.qrDataUrl);
        this.mfaOtpauth.set(res.otpauthUrl);
        this.mfaCode.reset('');
        this.mfaMode.set('enrolling');
      },
      error: (err) => {
        this.mfaBusy.set(false);
        this.mfaError.set(err?.error?.message || 'Could not start the setup.');
      },
    });
  }

  confirmMfaEnable(): void {
    const code = this.mfaCode.value.trim();
    if (!code) { this.mfaCode.markAsTouched(); return; }
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
    this.mfaCode.reset('');
    this.mfaMode.set('disabling');
  }

  confirmMfaDisable(): void {
    const code = this.mfaCode.value.trim();
    if (!code) { this.mfaCode.markAsTouched(); return; }
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
    this.mfaCode.reset('');
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    // 1MB limit, enforced here before the upload starts.
    if (file.size > 1024 * 1024) {
      this.errorMessage.set('That image is too large. Please choose one under 1MB.');
      input.value = '';
      return;
    }
    // Instant preview (also pushed to the header avatar).
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      this.selectedImagePreview.set(base64);
      this.authService.updateAvatarState(base64);
    };
    reader.readAsDataURL(file);

    const formData = new FormData();
    formData.append('avatar', file);
    this.authService.uploadProfilePicture(formData).subscribe({
      next: (res) => {
        this.successMessage.set('Profile picture updated.');
        this.profileForm.controls.profilePicture.setValue(res.url);
        this.authService.updateAvatarState(res.url);
      },
      error: () => this.errorMessage.set('Failed to upload the profile picture.'),
    });
  }

  onUpdateProfile(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }
    const v = this.profileForm.getRawValue();
    this.saving.set(true);
    this.successMessage.set('');
    this.errorMessage.set('');
    this.authService.updateProfile({ full_name: v.fullName, phone: v.phone, bio: v.bio }).subscribe({
      next: () => {
        this.saving.set(false);
        this.successMessage.set('Profile saved.');
        this.profileForm.markAsPristine();
        if (v.fullName) this.authService.updateFullNameState(v.fullName);
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err?.error?.message || 'Failed to save the changes.');
      },
    });
  }
}
