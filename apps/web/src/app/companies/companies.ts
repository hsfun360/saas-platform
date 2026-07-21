import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../auth.service';
import { CountryService } from '../services/country.service';
import { CurrencyService } from '../services/currency.service';
import { CompanyEntity, ModuleOption, Country, Currency } from '../models/auth.models';
import { DialogComponent } from '../shared/dialog/dialog';
import { PhoneInputComponent } from '../shared/phone-input/phone-input';
import { CompanySmtpDialogComponent } from '../company-smtp/company-smtp-dialog';
import { CompanyWeekendDialogComponent } from '../company-weekend/company-weekend-dialog';
import { TimezoneLabelPipe } from '../shared/timezone-label.pipe';
import { COUNTRY_TIMEZONES, FALLBACK_COUNTRIES } from '../shared/countries';

// Tenant Admin view: create and list companies (business entities) under the
// subscriber's account, choosing which modules each company needs.
@Component({
  selector: 'app-companies',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ScreenTitlePipe, ScreenSubtitlePipe, ReactiveFormsModule, DialogComponent, PhoneInputComponent, CompanySmtpDialogComponent, CompanyWeekendDialogComponent, TimezoneLabelPipe],
  templateUrl: './companies.html',
  styleUrls: ['./companies.css'],
})
export class CompaniesComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly countryService = inject(CountryService);
  private readonly currencyService = inject(CurrencyService);
  private readonly fb = inject(FormBuilder);

  // Currencies the subscriber (account) opted into — the choices for a company's
  // default currency. Empty until loaded / if the account selected none.
  readonly accountCurrencies = signal<Currency[]>([]);

  readonly companies = signal<CompanyEntity[]>([]);
  readonly modules = signal<ModuleOption[]>([]);
  // The company whose SMTP dialog is open (null = closed).
  readonly smtpCompany = signal<CompanyEntity | null>(null);
  // The company whose Weekend-days dialog is open (null = closed).
  readonly weekendCompany = signal<CompanyEntity | null>(null);
  // Active countries from the DB (Country table) for the editable country combobox.
  // Seeded with a bundled fallback so the combobox + timezone linkage work even
  // before the DB Country table is synced; replaced by the DB list once available.
  readonly countryOptions = signal<Country[]>(FALLBACK_COUNTRIES);
  // Country options for the picker: alphabetical, but with "Others" (zz) pinned
  // last so the special catch-all sits at the bottom of the list.
  readonly countryChoices = computed(() =>
    [...this.countryOptions()].sort((a, b) => {
      if (a.alpha2 === 'zz') return 1;
      if (b.alpha2 === 'zz') return -1;
      return a.name.localeCompare(b.name);
    }),
  );
  // Timezones for the currently-selected country (drives the Timezone shortlist).
  // Rendered with the shared `tzLabel` pipe (standard "(UTC +08:00)" offset).
  readonly timezoneOptions = signal<string[]>([]);

  // Curated timezone list for a country, keyed by ISO alpha-2 code (the value the
  // picker now stores). "Others"/blank/unknown codes have no linkage -> free text.
  private timezonesForCountryCode(code: string): string[] {
    return COUNTRY_TIMEZONES[(code || '').trim().toLowerCase()] || [];
  }
  readonly companiesLoading = signal(false);
  readonly modulesLoading = signal(false);
  readonly creating = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  // Listing chrome: live search over the loaded list + a FAB-toggled create form.
  readonly search = signal('');
  readonly showCreate = signal(false);
  readonly filteredCompanies = computed(() => {
    const query = this.search().trim().toLowerCase();
    const list = this.companies();
    if (!query) return list;
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        (c.registrationNumber || '').toLowerCase().includes(query) ||
        (c.timezone || '').toLowerCase().includes(query) ||
        (c.SubscribedModules || []).some((m) => m.name.toLowerCase().includes(query)),
    );
  });

  // Modules picked for the company being created (set of module ids).
  private readonly selectedModuleIds = signal<ReadonlySet<string>>(new Set());
  readonly selectedCount = computed(() => this.selectedModuleIds().size);

  // Editing modules on an EXISTING company.
  readonly editingCompanyId = signal<string | null>(null);
  readonly editingCompany = computed(() =>
    this.companies().find((c) => c.id === this.editingCompanyId()) ?? null,
  );
  readonly savingModules = signal(false);
  private readonly editModuleIds = signal<ReadonlySet<string>>(new Set());
  readonly editCount = computed(() => this.editModuleIds().size);

  // Editing the profile / billing details of an EXISTING company.
  readonly editingProfileCompanyId = signal<string | null>(null);
  readonly editingProfileCompany = computed(() =>
    this.companies().find((c) => c.id === this.editingProfileCompanyId()) ?? null,
  );
  readonly savingProfile = signal(false);
  readonly profileForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    registrationNumber: [''],
    taxRegistrationNumber: [''],
    email: ['', [Validators.email]],
    phone: [''],
    website: [''],
    addressLine1: [''],
    addressLine2: [''],
    city: [''],
    state: [''],
    postalCode: [''],
    country: [''],
    timezone: ['Asia/Kuala_Lumpur'],
    logo: [''],
    defaultCurrencyCode: [''],
  });

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    registrationNumber: [''],
    taxRegistrationNumber: [''],
    email: ['', [Validators.email]],
    phone: [''],
    website: [''],
    addressLine1: [''],
    addressLine2: [''],
    city: [''],
    state: [''],
    postalCode: [''],
    country: [''],
    timezone: ['Asia/Kuala_Lumpur'],
    logo: [''],
    defaultCurrencyCode: [''],
  });

  // Logo upload in-flight flags (create + edit dialogs).
  readonly uploadingLogo = signal(false);
  readonly uploadingEditLogo = signal(false);

  ngOnInit(): void {
    this.loadCompanies();
    this.loadModules();
    this.countryService.listActive().subscribe({
      next: (list) => { if (list.length) this.countryOptions.set(list); }, // else keep fallback
      error: () => {}, // keep fallback
    });
    // The account's opted-in currencies (via Subscriber → Currencies). The default
    // currency picker offers exactly these; empty if the subscriber selected none.
    this.currencyService.getAccountCurrencies().subscribe({
      next: (state) => this.accountCurrencies.set(state.selected),
      error: () => {}, // no picker options if it can't be resolved
    });
  }

  // Open the create dialog (FAB). Close any open edit dialog so only one editor
  // is active at a time. The dialog component handles focus in/trap/restore.
  private readonly emptyCompany = {
    name: '', registrationNumber: '', taxRegistrationNumber: '', email: '', phone: '',
    website: '', addressLine1: '', addressLine2: '', city: '', state: '', postalCode: '',
    country: '', timezone: 'Asia/Kuala_Lumpur', logo: '', defaultCurrencyCode: '',
  };

  openCreate(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
    this.editingCompanyId.set(null);
    this.editingProfileCompanyId.set(null);
    this.form.reset(this.emptyCompany);
    this.selectedModuleIds.set(new Set());
    this.timezoneOptions.set([]); // no country picked yet -> timezone free-text
    this.showCreate.set(true);
  }

  cancelCreate(): void {
    this.showCreate.set(false);
    this.form.reset(this.emptyCompany);
    this.selectedModuleIds.set(new Set());
  }

  // Upload a chosen logo file to GCS; store the returned URL on the given form.
  // `which` selects the create form vs the edit-details form.
  onLogoSelected(event: Event, which: 'create' | 'edit'): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.errorMessage.set('Please choose an image file for the logo.');
      return;
    }
    if (file.size > 1024 * 1024) {
      this.errorMessage.set('Logo is too large. Please choose an image under 1MB.');
      return;
    }
    const busy = which === 'create' ? this.uploadingLogo : this.uploadingEditLogo;
    const targetForm = which === 'create' ? this.form : this.profileForm;
    busy.set(true);
    const data = new FormData();
    data.append('logo', file);
    this.auth.uploadCompanyLogo(data).subscribe({
      next: (res) => {
        targetForm.patchValue({ logo: res.url });
        busy.set(false);
        input.value = ''; // allow re-selecting the same file later
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to upload logo.');
        busy.set(false);
      },
    });
  }

  removeLogo(which: 'create' | 'edit'): void {
    (which === 'create' ? this.form : this.profileForm).patchValue({ logo: '' });
  }

  clearSearch(): void {
    this.search.set('');
  }

  loadCompanies(): void {
    this.companiesLoading.set(true);
    this.auth.getCompanies().subscribe({
      next: (list) => {
        this.companies.set(list);
        this.companiesLoading.set(false);
      },
      error: () => this.companiesLoading.set(false),
    });
  }

  loadModules(): void {
    this.modulesLoading.set(true);
    this.auth.getAvailableModules().subscribe({
      next: (list) => {
        this.modules.set(list);
        this.modulesLoading.set(false);
      },
      error: () => this.modulesLoading.set(false),
    });
  }

  isModuleSelected(id: string): boolean {
    return this.selectedModuleIds().has(id);
  }

  toggleModule(id: string): void {
    const next = new Set(this.selectedModuleIds());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.selectedModuleIds.set(next);
  }

  onSubmit(): void {
    this.successMessage.set('');
    this.errorMessage.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Company name is required.');
      return;
    }

    const v = this.form.getRawValue();

    this.creating.set(true);
    this.auth
      .createCompany({
        name: v.name.trim(),
        registrationNumber: v.registrationNumber.trim() || undefined,
        taxRegistrationNumber: v.taxRegistrationNumber.trim() || undefined,
        email: v.email.trim() || undefined,
        phone: v.phone.trim() || undefined,
        website: v.website.trim() || undefined,
        addressLine1: v.addressLine1.trim() || undefined,
        addressLine2: v.addressLine2.trim() || undefined,
        city: v.city.trim() || undefined,
        state: v.state.trim() || undefined,
        postalCode: v.postalCode.trim() || undefined,
        country: v.country.trim() || undefined,
        // The picker's value is the alpha-2 code; mirror it to the canonical field.
        countryCode: v.country.trim().toLowerCase() || undefined,
        timezone: v.timezone.trim() || undefined,
        logo: v.logo || undefined,
        defaultCurrencyCode: v.defaultCurrencyCode || undefined,
        moduleIds: Array.from(this.selectedModuleIds()),
      })
      .subscribe({
        next: (res) => {
          this.successMessage.set(res.message || `Company "${v.name.trim()}" created.`);
          this.form.reset(this.emptyCompany);
          this.selectedModuleIds.set(new Set());
          this.creating.set(false);
          this.showCreate.set(false);
          this.loadCompanies();
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Failed to create company.');
          this.creating.set(false);
        },
      });
  }

  // --- Edit modules on an existing company ---
  startEditModules(company: CompanyEntity): void {
    this.successMessage.set('');
    this.errorMessage.set('');
    this.editingProfileCompanyId.set(null); // close the details editor if open
    this.editModuleIds.set(new Set((company.SubscribedModules || []).map((m) => m.id)));
    this.editingCompanyId.set(company.id);
  }

  cancelEditModules(): void {
    this.editingCompanyId.set(null);
  }

  isEditModuleSelected(id: string): boolean {
    return this.editModuleIds().has(id);
  }

  toggleEditModule(id: string): void {
    const next = new Set(this.editModuleIds());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.editModuleIds.set(next);
  }

  saveModules(companyId: string): void {
    this.successMessage.set('');
    this.errorMessage.set('');
    this.savingModules.set(true);
    this.auth.updateCompanyModules(companyId, Array.from(this.editModuleIds())).subscribe({
      next: (res) => {
        this.successMessage.set(res.message || 'Modules updated.');
        this.savingModules.set(false);
        this.editingCompanyId.set(null);
        this.loadCompanies();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update modules.');
        this.savingModules.set(false);
      },
    });
  }

  // --- Edit profile / billing details on an existing company ---
  startEditProfile(company: CompanyEntity): void {
    this.successMessage.set('');
    this.errorMessage.set('');
    this.editingCompanyId.set(null); // close the modules editor if open
    this.profileForm.reset({
      name: company.name || '',
      registrationNumber: company.registrationNumber || '',
      taxRegistrationNumber: company.taxRegistrationNumber || '',
      email: company.email || '',
      phone: company.phone || '',
      website: company.website || '',
      addressLine1: company.addressLine1 || '',
      addressLine2: company.addressLine2 || '',
      city: company.city || '',
      state: company.state || '',
      postalCode: company.postalCode || '',
      country: company.country || '',
      timezone: company.timezone || 'Asia/Kuala_Lumpur',
      logo: company.logo || '',
      defaultCurrencyCode: company.defaultCurrencyCode || '',
    });
    // Seed the timezone shortlist from the stored country (don't override the
    // stored timezone here - only a user country change re-derives it). If the
    // stored zone isn't in that country's list (legacy mismatch), keep it in the
    // list so the select can still show it.
    const tz = company.timezone || 'Asia/Kuala_Lumpur';
    const zones = this.timezonesForCountryCode(company.country || '');
    this.timezoneOptions.set(zones.length && !zones.includes(tz) ? [tz, ...zones] : zones);
    this.editingProfileCompanyId.set(company.id);
  }

  // Country -> Timezone: when the country changes, offer that country's timezones
  // and align the Timezone field. Single-timezone countries auto-fill; multi-zone
  // countries keep the current value if it's already valid, else default to the
  // first. "Others"/blank leave the timezone as the user typed it. `code` is the
  // selected ISO alpha-2 (or '' for the blank option).
  onCountryChange(code: string, which: 'create' | 'edit'): void {
    const zones = this.timezonesForCountryCode(code);
    this.timezoneOptions.set(zones); // empty -> the field falls back to free text
    if (zones.length === 0) return; // no linkage - keep whatever timezone was set
    if (which === 'create') {
      const cur = this.form.getRawValue().timezone;
      if (!cur || !zones.includes(cur)) this.form.patchValue({ timezone: zones[0] });
    } else {
      const cur = this.profileForm.getRawValue().timezone;
      if (!cur || !zones.includes(cur)) this.profileForm.patchValue({ timezone: zones[0] });
    }
  }

  cancelEditProfile(): void {
    this.editingProfileCompanyId.set(null);
  }

  onSaveProfile(companyId: string): void {
    this.successMessage.set('');
    this.errorMessage.set('');
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      this.errorMessage.set('Please fix the highlighted fields (name is required, email must be valid).');
      return;
    }
    this.savingProfile.set(true);
    const pv = this.profileForm.getRawValue();
    // The country picker stores the alpha-2 code; mirror it to the canonical field.
    this.auth.updateCompany(companyId, { ...pv, countryCode: pv.country.trim().toLowerCase() || '' }).subscribe({
      next: (res) => {
        this.successMessage.set(res.message || 'Company profile updated.');
        this.savingProfile.set(false);
        this.editingProfileCompanyId.set(null);
        this.loadCompanies();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update company.');
        this.savingProfile.set(false);
      },
    });
  }
}
