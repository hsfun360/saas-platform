import { Component, OnInit, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { OnboardingModule } from '../models/auth.models';

// Create-your-organization wizard for the LIMBO state: a verified user with no
// workspace yet (self-registered or first-time SSO). Runs full-screen OUTSIDE
// the app shell on an onboarding-scoped token; a successful provision swaps it
// for a real workspace session and enters /home.
@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './onboarding.html',
  styleUrls: ['./onboarding.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly userEmail = localStorage.getItem('userEmail') || '';

  readonly modules = signal<OnboardingModule[]>([]);
  readonly selectedModuleIds = signal<ReadonlySet<string>>(new Set());
  readonly modulesLoading = signal(true);
  readonly submitting = signal(false);
  readonly errorMessage = signal('');

  readonly form = this.fb.nonNullable.group({
    subscriberName: ['', [Validators.required, Validators.maxLength(120)]],
    companyName: ['', [Validators.maxLength(120)]],
  });

  // The org name typed so far, for the live "what will be created" summary.
  readonly orgName = signal('');
  readonly effectiveCompanyName = computed(() => this.companyNameValue() || this.orgName());
  private readonly companyNameValue = signal('');

  readonly selectedCount = computed(() => this.selectedModuleIds().size);

  ngOnInit(): void {
    this.form.controls.subscriberName.valueChanges.subscribe(v => this.orgName.set(v.trim()));
    this.form.controls.companyName.valueChanges.subscribe(v => this.companyNameValue.set(v.trim()));

    this.auth.getOnboardingModules().subscribe({
      next: (mods) => {
        this.modules.set(mods);
        // Everything pre-selected: the subscriber starts fully entitled and
        // can trim modules later in Companies.
        this.selectedModuleIds.set(new Set(mods.map(m => m.id)));
        this.modulesLoading.set(false);
      },
      error: () => {
        this.modulesLoading.set(false);
        this.errorMessage.set('Could not load the available systems. Please refresh the page.');
      },
    });
  }

  isSelected(id: string): boolean {
    return this.selectedModuleIds().has(id);
  }

  toggleModule(id: string): void {
    this.selectedModuleIds.update(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { subscriberName, companyName } = this.form.getRawValue();
    this.submitting.set(true);
    this.errorMessage.set('');

    this.auth.provisionOnboarding({
      subscriberName: subscriberName.trim(),
      companyName: (companyName.trim() || subscriberName.trim()),
      moduleIds: [...this.selectedModuleIds()],
    }).subscribe({
      next: (res) => {
        if (!res.token) {
          this.submitting.set(false);
          this.errorMessage.set(res.message || 'Something went wrong. Please try again.');
          return;
        }
        // CRITICAL: replace the onboarding token with the full workspace
        // session (same storage as a normal login), then enter the app.
        localStorage.setItem('token', res.token);
        localStorage.setItem('userEmail', res.email || this.userEmail);
        localStorage.setItem('userRole', res.roleName || 'User');
        localStorage.setItem('userFullName', res.fullName || 'User');
        localStorage.setItem('userProfilePicture', res.profilePicture || '');
        this.auth.storeUserMenus(res.menus);
        this.auth.updateAvatarState(res.profilePicture || '');
        if (res.fullName) this.auth.updateFullNameState(res.fullName);
        this.router.navigate(['/home']);
      },
      error: (err) => {
        this.submitting.set(false);
        this.errorMessage.set(err?.error?.message || 'Failed to create your workspace. Please try again.');
      },
    });
  }

  signOut(): void {
    localStorage.clear();
    this.router.navigate(['/login']);
  }
}
