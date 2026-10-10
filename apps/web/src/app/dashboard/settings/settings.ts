import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { TitleCasePipe } from '@angular/common';
import { AuthService } from '../../auth.service';
import { LanguageService } from '../../services/language.service';
import { ThemeService } from '../../services/theme.service';
import { I18nService } from '../../i18n/i18n.service';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { Language } from '../../models/auth.models';

// The signed-in user's own preferences: appearance, language and password.
@Component({
  selector: 'app-settings',
  standalone: true,
  templateUrl: './settings.html',
  styleUrl: './settings.css',
  imports: [ReactiveFormsModule, TitleCasePipe, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly languageService = inject(LanguageService);
  // Public: the template binds the language select to i18n.lang() - the ONE
  // live source of the applied language, shared with the header quick-switch.
  readonly i18n = inject(I18nService);
  readonly theme = inject(ThemeService);

  readonly authMethod = signal('local');
  readonly generalOpen = signal(true);
  readonly languageOptions = signal<Language[]>([]);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');
  readonly changingPassword = signal(false);

  // Password floor unified app-wide at 8 characters.
  readonly passwordForm = this.fb.nonNullable.group(
    {
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordMatchValidator },
  );

  ngOnInit(): void {
    // The password form only applies to local accounts (SSO users change it
    // with their provider).
    this.authService.getProfile().subscribe({
      next: (res) => this.authMethod.set(res.user.authMethod || 'local'),
      error: () => {},
    });
    this.languageService.getMyLanguage().subscribe({
      next: (state) => {
        this.languageOptions.set(state.options);
        this.i18n.setFallback(state.accountDefault);
      },
      error: () => {},
    });
  }

  onLanguageChange(code: string): void {
    this.i18n.use(code); // apply immediately; the select tracks i18n.lang()
    this.languageService.setMyLanguage(code).subscribe({
      next: (state) => {
        this.i18n.use(state.effective); // settle on the server's resolution
        this.successMessage.set(this.i18n.translate('language.saved'));
      },
      error: (err) => this.errorMessage.set(err?.error?.message || 'Failed to save the language preference.'),
    });
  }

  toggleGeneral(): void {
    this.generalOpen.update((v) => !v);
  }

  showError(name: 'currentPassword' | 'newPassword' | 'confirmPassword'): boolean {
    const c = this.passwordForm.controls[name];
    return c.invalid && c.touched;
  }

  get mismatch(): boolean {
    return this.passwordForm.controls.confirmPassword.touched && this.passwordForm.hasError('passwordsMismatch');
  }

  onChangePassword(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    const { currentPassword, newPassword } = this.passwordForm.getRawValue();
    this.changingPassword.set(true);
    this.successMessage.set('');
    this.errorMessage.set('');
    this.authService.changePassword({ currentPassword, newPassword }).subscribe({
      next: (res) => {
        this.changingPassword.set(false);
        this.successMessage.set(res.message || 'Password updated.');
        this.passwordForm.reset();
      },
      error: (err) => {
        this.changingPassword.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to update the password.');
      },
    });
  }
}

export function passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
  const newPassword = control.get('newPassword')?.value;
  const confirmPassword = control.get('confirmPassword')?.value;
  return newPassword && confirmPassword && newPassword !== confirmPassword ? { passwordsMismatch: true } : null;
}
