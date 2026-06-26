import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../auth.service';
import { CompanyEntity, ModuleOption } from '../models/auth.models';

// Tenant Admin view: create and list companies (business entities) under the
// subscriber's account, choosing which modules each company needs.
@Component({
  selector: 'app-companies',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './companies.html',
  styleUrls: ['./companies.css'],
})
export class CompaniesComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  readonly companies = signal<CompanyEntity[]>([]);
  readonly modules = signal<ModuleOption[]>([]);
  readonly companiesLoading = signal(false);
  readonly modulesLoading = signal(false);
  readonly creating = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  // Modules picked for the company being created (set of module ids).
  private readonly selectedModuleIds = signal<ReadonlySet<string>>(new Set());
  readonly selectedCount = computed(() => this.selectedModuleIds().size);

  // Editing modules on an EXISTING company.
  readonly editingCompanyId = signal<string | null>(null);
  readonly savingModules = signal(false);
  private readonly editModuleIds = signal<ReadonlySet<string>>(new Set());
  readonly editCount = computed(() => this.editModuleIds().size);

  // Editing the profile / billing details of an EXISTING company.
  readonly editingProfileCompanyId = signal<string | null>(null);
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
  });

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    registrationNumber: [''],
    timezone: ['Asia/Kuala_Lumpur'],
  });

  ngOnInit(): void {
    this.loadCompanies();
    this.loadModules();
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

    const { name, registrationNumber, timezone } = this.form.getRawValue();

    this.creating.set(true);
    this.auth
      .createCompany({
        name: name.trim(),
        registrationNumber: registrationNumber.trim() || undefined,
        timezone: timezone.trim() || undefined,
        moduleIds: Array.from(this.selectedModuleIds()),
      })
      .subscribe({
        next: (res) => {
          this.successMessage.set(res.message || `Company "${name.trim()}" created.`);
          this.form.reset({ name: '', registrationNumber: '', timezone: 'Asia/Kuala_Lumpur' });
          this.selectedModuleIds.set(new Set());
          this.creating.set(false);
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
    });
    this.editingProfileCompanyId.set(company.id);
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
    this.auth.updateCompany(companyId, this.profileForm.getRawValue()).subscribe({
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
