import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { AdminService } from '../services/admin.service';
import { LanguageService } from '../services/language.service';
import { CurrencyService } from '../services/currency.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { PhoneInputComponent } from '../shared/phone-input/phone-input';
import { SubscriptionInfo, AdminModule, TenantUser, Language, Currency } from '../models/auth.models';
import { FavStarComponent } from '../shared/fav-star/fav-star';

// Group-level cross-field validator for the create form: password and
// confirmPassword must match. Sets a `passwordMismatch` error on the group so
// the template can show a message under confirmPassword.
function passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return password === confirm ? null : { passwordMismatch: true };
}

// Subscriber Management — its own screen (split out of the old System Setup tab
// strip). Lists the subscriber accounts provisioned through this portal, lets a
// System Admin create a new subscriber (FAB → dialog) and transfer a company's
// Tenant Admin. Reuses the System Setup stylesheet so the look matches exactly.
//
// Reactive Forms (canonical reference: platform-users): create/edit use typed,
// nonNullable FormGroups, validators live on the controls (create adds a
// group-level password-match validator), and `form.dirty` feeds the shared
// dialog's unsaved-changes guard directly.
@Component({
  selector: 'app-subscribers',
  standalone: true,
  imports: [FavStarComponent, LocalDatePipe, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent, PhoneInputComponent],
  templateUrl: './subscribers.html',
  styleUrls: ['../system-setup/system-setup.css'],
})
export class SubscribersComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  // ── Subscriber list ──────────────────────────────────────────
  readonly subscriptions = signal<SubscriptionInfo[]>([]);
  readonly listLoading = signal(false);

  // Live filter over the loaded subscribers (name / plan / status / reg no.).
  readonly subscriberSearch = signal('');
  readonly filteredSubscriptions = computed(() => {
    const query = this.subscriberSearch().trim().toLowerCase();
    const list = this.subscriptions();
    if (!query) return list;
    return list.filter(
      (s) =>
        (s.subscriberName || '').toLowerCase().includes(query) ||
        (s.subscriptionPlan || '').toLowerCase().includes(query) ||
        (s.status || '').toLowerCase().includes(query) ||
        (s.Companies?.[0]?.registrationNumber || '').toLowerCase().includes(query),
    );
  });

  // ── Create subscriber (FAB → dialog) ─────────────────────────
  readonly createDialogOpen = signal(false);
  readonly creating = signal(false);
  // Create form. nonNullable keeps every control a non-null string. The
  // group-level validator enforces password === confirmPassword.
  readonly createForm = this.fb.nonNullable.group(
    {
      email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
      fullName: ['', [Validators.required, Validators.maxLength(150)]],
      subscriberName: ['', [Validators.required, Validators.maxLength(200)]],
      subscriptionPlan: ['BASIC', [Validators.required]],
      registrationNumber: ['', [Validators.maxLength(100)]],
      phone: [''],
    },
    { validators: passwordsMatchValidator },
  );
  readonly subscriptionPlans = ['BASIC', 'PRO', 'ENTERPRISE'];

  // Modules the new subscriber is granted (defaults to all selected).
  modules: AdminModule[] = [];
  readonly modulesLoading = signal(false);
  selectedModuleIds = new Set<string>();

  // ── Edit subscriber (FAB-less; opened from a card's Edit button) ─
  readonly editDialogOpen = signal(false);
  readonly updating = signal(false);
  // The edited subscriber's id isn't an input, so it lives outside the form.
  readonly editingId = signal<string | null>(null);
  readonly editForm = this.fb.nonNullable.group({
    subscriberName: ['', [Validators.required, Validators.maxLength(200)]],
    registrationNumber: ['', [Validators.maxLength(100)]],
    timezone: ['', [Validators.maxLength(100)]],
    subscriptionPlan: ['BASIC', [Validators.required]],
    status: ['ACTIVE', [Validators.required]],
  });
  readonly statuses = ['ACTIVE', 'SUSPENDED'];

  // ── Manage Tenant Admin (expands inside a subscriber card) ───
  managingCompanyId: string | null = null;
  companyUsers: TenantUser[] = [];
  readonly companyUsersLoading = signal(false);
  settingAdminUserId: string | null = null;

  // ── Manage subscriber languages (opened from a card's Languages button) ──
  private readonly languageService = inject(LanguageService);
  readonly languageDialogOpen = signal(false);
  readonly languagesLoading = signal(false);
  readonly savingLanguages = signal(false);
  languageAccountId: string | null = null;
  languageSubscriberName = '';
  languageAvailable: Language[] = [];
  languageSelected = new Set<string>();
  languageDefault = '';

  // ── Manage subscriber currencies (opened from a card's Currencies button) ──
  private readonly currencyService = inject(CurrencyService);
  readonly currencyDialogOpen = signal(false);
  readonly currenciesLoading = signal(false);
  readonly savingCurrencies = signal(false);
  currencyAccountId: string | null = null;
  currencySubscriberName = '';
  currencyAvailable: Currency[] = [];
  currencySelected = new Set<string>();
  currencyDefault = '';

  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  constructor(private adminService: AdminService) {}

  ngOnInit(): void {
    this.loadSubscriptions();
    this.loadModules();
  }

  // ── List ─────────────────────────────────────────────────────
  loadSubscriptions(): void {
    this.listLoading.set(true);
    this.adminService.listSubscriptions().subscribe({
      next: (data) => {
        this.subscriptions.set(data);
        this.listLoading.set(false);
      },
      error: () => this.listLoading.set(false),
    });
  }

  clearSearch(): void {
    this.subscriberSearch.set('');
  }

  // ── Modules for the create form ──────────────────────────────
  loadModules(): void {
    this.modulesLoading.set(true);
    this.adminService.listModules().subscribe({
      next: (mods) => {
        this.modules = mods;
        this.selectedModuleIds = new Set(mods.map((m) => m.id));
        this.modulesLoading.set(false);
      },
      error: () => this.modulesLoading.set(false),
    });
  }

  toggleModule(moduleId: string): void {
    if (this.selectedModuleIds.has(moduleId)) {
      this.selectedModuleIds.delete(moduleId);
    } else {
      this.selectedModuleIds.add(moduleId);
    }
  }

  // Show a control's validation message once the user has interacted with it
  // (or after a submit attempt marks everything touched).
  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  // ── Create ───────────────────────────────────────────────────
  openCreate(): void {
    this.clearMessages();
    this.resetForm();
    this.selectedModuleIds = new Set(this.modules.map((m) => m.id));
    this.createDialogOpen.set(true);
  }

  cancelCreate(): void {
    this.createDialogOpen.set(false);
  }

  onSubmit(): void {
    this.clearMessages();
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched(); // reveal every field's error at once
      return;
    }
    const value = this.createForm.getRawValue();

    this.creating.set(true);
    const payload = {
      email: value.email.trim(),
      password: value.password, // confirmPassword is never sent to the server
      fullName: value.fullName.trim(),
      companyName: value.subscriberName.trim(), // backend still expects companyName
      subscriptionPlan: value.subscriptionPlan,
      registrationNumber: value.registrationNumber.trim() || undefined,
      phone: value.phone.trim() || undefined,
      moduleIds: Array.from(this.selectedModuleIds),
    };

    this.adminService.createSubscription(payload).subscribe({
      next: () => {
        this.successMessage.set(`Subscriber "${payload.companyName}" (${payload.email}) created with ${payload.moduleIds.length} module(s)!`);
        this.resetForm();
        this.selectedModuleIds = new Set(this.modules.map((m) => m.id));
        this.creating.set(false);
        this.createDialogOpen.set(false);
        this.loadSubscriptions();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to create subscriber.');
        this.creating.set(false);
      },
    });
  }

  // ── Edit (amend) ─────────────────────────────────────────────
  startEdit(sub: SubscriptionInfo): void {
    this.clearMessages();
    const company = sub.Companies?.[0];
    this.editingId.set(sub.id);
    this.editForm.reset({
      subscriberName: sub.subscriberName || '',
      registrationNumber: company?.registrationNumber || '',
      timezone: company?.timezone || '',
      subscriptionPlan: sub.subscriptionPlan || 'BASIC',
      status: sub.status || 'ACTIVE',
    });
    this.editDialogOpen.set(true);
  }

  cancelEdit(): void {
    this.editDialogOpen.set(false);
    this.editingId.set(null);
  }

  onUpdate(): void {
    this.clearMessages();
    const id = this.editingId();
    if (!id) return;
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }
    const value = this.editForm.getRawValue();

    this.updating.set(true);
    this.adminService
      .updateSubscription(id, {
        subscriberName: value.subscriberName.trim(),
        subscriptionPlan: value.subscriptionPlan,
        status: value.status,
        registrationNumber: value.registrationNumber.trim() || undefined,
        timezone: value.timezone.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.successMessage.set(`Subscriber "${value.subscriberName.trim()}" updated.`);
          this.updating.set(false);
          this.editDialogOpen.set(false);
          this.editingId.set(null);
          this.loadSubscriptions();
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Failed to update subscriber.');
          this.updating.set(false);
        },
      });
  }

  // ── Manage subscriber languages ──────────────────────────────
  manageLanguages(sub: SubscriptionInfo): void {
    this.clearMessages();
    this.languageAccountId = sub.id;
    this.languageSubscriberName = sub.subscriberName || '';
    this.languageSelected = new Set();
    this.languageDefault = '';
    this.languageAvailable = [];
    this.languageDialogOpen.set(true);
    this.languagesLoading.set(true);
    this.languageService.getSubscriptionLanguages(sub.id).subscribe({
      next: (state) => {
        this.languageAvailable = state.available;
        this.languageSelected = new Set(state.selected.map((l) => l.languageCode));
        this.languageDefault = state.defaultLanguageCode || '';
        this.languagesLoading.set(false);
      },
      error: () => this.languagesLoading.set(false),
    });
  }

  toggleLanguage(code: string): void {
    if (this.languageSelected.has(code)) {
      this.languageSelected.delete(code);
      if (this.languageDefault === code) this.languageDefault = '';
    } else {
      this.languageSelected.add(code);
    }
    if (!this.languageDefault && this.languageSelected.size) {
      this.languageDefault = [...this.languageSelected][0];
    }
  }

  // Selected languages in available-list order (for the default picker).
  get selectedLanguageList(): Language[] {
    return this.languageAvailable.filter((l) => this.languageSelected.has(l.languageCode));
  }

  cancelLanguages(): void {
    this.languageDialogOpen.set(false);
    this.languageAccountId = null;
  }

  saveLanguages(): void {
    this.clearMessages();
    if (!this.languageAccountId) return;
    const codes = this.selectedLanguageList.map((l) => l.languageCode);
    this.savingLanguages.set(true);
    this.languageService
      .updateSubscriptionLanguages(this.languageAccountId, codes, this.languageDefault || null)
      .subscribe({
        next: () => {
          this.successMessage.set(`Languages updated for "${this.languageSubscriberName}".`);
          this.savingLanguages.set(false);
          this.languageDialogOpen.set(false);
          this.languageAccountId = null;
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Failed to update languages.');
          this.savingLanguages.set(false);
        },
      });
  }

  // ── Manage subscriber currencies ─────────────────────────────
  manageCurrencies(sub: SubscriptionInfo): void {
    this.clearMessages();
    this.currencyAccountId = sub.id;
    this.currencySubscriberName = sub.subscriberName || '';
    this.currencySelected = new Set();
    this.currencyDefault = '';
    this.currencyAvailable = [];
    this.currencyDialogOpen.set(true);
    this.currenciesLoading.set(true);
    this.currencyService.getSubscriptionCurrencies(sub.id).subscribe({
      next: (state) => {
        this.currencyAvailable = state.available;
        this.currencySelected = new Set(state.selected.map((c) => c.code));
        this.currencyDefault = state.defaultCurrencyCode || '';
        this.currenciesLoading.set(false);
      },
      error: () => this.currenciesLoading.set(false),
    });
  }

  toggleCurrency(code: string): void {
    if (this.currencySelected.has(code)) {
      this.currencySelected.delete(code);
      if (this.currencyDefault === code) this.currencyDefault = '';
    } else {
      this.currencySelected.add(code);
    }
    if (!this.currencyDefault && this.currencySelected.size) {
      this.currencyDefault = [...this.currencySelected][0];
    }
  }

  // Selected currencies in available-list order (for the default picker).
  get selectedCurrencyList(): Currency[] {
    return this.currencyAvailable.filter((c) => this.currencySelected.has(c.code));
  }

  cancelCurrencies(): void {
    this.currencyDialogOpen.set(false);
    this.currencyAccountId = null;
  }

  saveCurrencies(): void {
    this.clearMessages();
    if (!this.currencyAccountId) return;
    const codes = this.selectedCurrencyList.map((c) => c.code);
    this.savingCurrencies.set(true);
    this.currencyService
      .updateSubscriptionCurrencies(this.currencyAccountId, codes, this.currencyDefault || null)
      .subscribe({
        next: () => {
          this.successMessage.set(`Currencies updated for "${this.currencySubscriberName}".`);
          this.savingCurrencies.set(false);
          this.currencyDialogOpen.set(false);
          this.currencyAccountId = null;
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Failed to update currencies.');
          this.savingCurrencies.set(false);
        },
      });
  }

  // ── Manage Tenant Admin ──────────────────────────────────────
  manageAdmin(companyId: string | undefined): void {
    this.clearMessages();
    if (!companyId) {
      this.errorMessage.set('This subscriber has no company to manage.');
      return;
    }
    if (this.managingCompanyId === companyId) {
      this.managingCompanyId = null;
      this.companyUsers = [];
      return;
    }
    this.managingCompanyId = companyId;
    this.loadCompanyUsers(companyId);
  }

  loadCompanyUsers(companyId: string): void {
    this.companyUsersLoading.set(true);
    this.adminService.getCompanyUsers(companyId).subscribe({
      next: (users) => {
        this.companyUsers = users;
        this.companyUsersLoading.set(false);
      },
      error: () => this.companyUsersLoading.set(false),
    });
  }

  setTenantAdmin(companyId: string, userId: string): void {
    this.clearMessages();
    const target = this.companyUsers.find((u) => u.id === userId);
    const email = target?.email || 'this user';
    if (!window.confirm(`Transfer Tenant Admin to ${email}? This removes admin rights from the current Tenant Admin.`)) {
      return;
    }
    this.settingAdminUserId = userId;
    this.adminService.setTenantAdmin(companyId, userId).subscribe({
      next: (res) => {
        this.successMessage.set(res.message || 'Tenant Admin updated.');
        this.settingAdminUserId = null;
        this.loadCompanyUsers(companyId);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to set Tenant Admin.');
        this.settingAdminUserId = null;
      },
    });
  }

  // ── Helpers ──────────────────────────────────────────────────
  resetForm(): void {
    this.createForm.reset({
      email: '',
      password: '',
      confirmPassword: '',
      fullName: '',
      subscriberName: '',
      subscriptionPlan: 'BASIC',
      registrationNumber: '',
      phone: '',
    });
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
