import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TaxSchemeService } from '../services/tax-scheme.service';
import { CountryService } from '../services/country.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { TaxScheme, TaxRate, TaxOption, Country } from '../models/auth.models';

// System Setup → Tax Setup (subscriber-owned catalog).
// Master–detail: the scheme list is the master; the selected scheme (its header +
// effective-dated rate lines) is the detail. The open scheme lives in the URL
// (/admin/tax-schemes/:id) so it deep-links and survives back/forward. Reuses the
// System Setup stylesheet for the shared admin-screen look.
@Component({
  selector: 'app-tax-schemes',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogComponent],
  templateUrl: './tax-schemes.html',
  styleUrls: ['../system-setup/system-setup.css', './tax-schemes.css'],
})
export class TaxSchemesComponent implements OnInit {
  private readonly service = inject(TaxSchemeService);
  private readonly countryService = inject(CountryService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly schemes = signal<TaxScheme[]>([]);
  readonly ieFlags = signal<TaxOption[]>([]);
  readonly taxClasses = signal<TaxOption[]>([]);
  readonly countries = signal<Country[]>([]);
  readonly loading = signal(false);

  // Selection flows FROM the url (never set directly), for deep-linking.
  readonly selectedId = signal<string | null>(null);
  readonly selectedScheme = computed(
    () => this.schemes().find((s) => s.id === this.selectedId()) || null,
  );

  readonly search = signal('');
  readonly countryFilter = signal<string>('');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly togglingSchemeId = signal<string | null>(null);
  readonly deletingRateId = signal<string | null>(null);

  // Scheme add/edit dialog. editId null = add.
  readonly schemeDialogOpen = signal(false);
  readonly schemeSaving = signal(false);
  schemeEditId: string | null = null;
  schemeForm = this.blankSchemeForm();

  // Rate add/edit dialog. editId null = add.
  readonly rateDialogOpen = signal(false);
  readonly rateSaving = signal(false);
  rateEditId: string | null = null;
  rateForm = this.blankRateForm();

  // Load-defaults dialog (copy platform starter schemes for a country).
  readonly loadDialogOpen = signal(false);
  readonly loadSaving = signal(false);
  readonly loadCountry = signal<string>('');

  // Countries actually used by the subscriber's schemes, for the master filter.
  readonly usedCountries = computed(() => {
    const codes = new Set(this.schemes().map((s) => s.countryCode));
    return [...codes].sort();
  });

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const country = this.countryFilter();
    let list = [...this.schemes()];
    if (country) list = list.filter((s) => s.countryCode === country);
    // Active first, then by country, then by code.
    list.sort((a, b) => {
      const aActive = a.isActive !== false;
      const bActive = b.isActive !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return a.countryCode.localeCompare(b.countryCode) || a.taxSchemeCode.localeCompare(b.taxSchemeCode);
    });
    if (!q) return list;
    return list.filter(
      (s) =>
        s.taxSchemeCode.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q) ||
        this.countryName(s.countryCode).toLowerCase().includes(q),
    );
  });

  readonly activeCount = computed(() => this.schemes().filter((s) => s.isActive !== false).length);

  constructor() {
    // The open scheme id is whatever the route says.
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      this.selectedId.set(p.get('id'));
    });
  }

  ngOnInit(): void {
    this.loadMeta();
    this.loadCountries();
    this.load();
  }

  // ---- data ----
  private blankSchemeForm() {
    return { countryCode: '', taxSchemeCode: '', name: '', description: '', ieFlag: 'EXCLUSIVE', taxClass: 'OUTPUT' };
  }

  private blankRateForm() {
    return {
      taxCode: '',
      taxRate: 0,
      taxPriority: 1,
      isClaimable: false,
      claimPercentage: 0,
      glAccountCode: '',
      effectiveFrom: this.today(),
      isActive: true,
    };
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  ieFlagLabel(key: string): string {
    return this.ieFlags().find((o) => o.key === key)?.label || key;
  }

  taxClassLabel(key: string): string {
    return this.taxClasses().find((o) => o.key === key)?.label || key;
  }

  countryName(code: string): string {
    return this.countries().find((c) => c.alpha2 === code)?.name || code;
  }

  loadMeta(): void {
    this.service.meta().subscribe({
      next: (m) => {
        this.ieFlags.set(m.ieFlags);
        this.taxClasses.set(m.taxClasses);
      },
      error: () => {
        /* dropdowns fall back to raw keys if meta fails */
      },
    });
  }

  loadCountries(): void {
    this.countryService.listActive().subscribe({
      next: (list) => this.countries.set(list),
      error: () => {
        /* country names fall back to codes */
      },
    });
  }

  load(): void {
    this.loading.set(true);
    this.service.list().subscribe({
      next: (data) => {
        this.schemes.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load tax schemes.');
      },
    });
  }

  // ---- master selection (URL-driven) ----
  select(id: string): void {
    this.router.navigate(['/admin/tax-schemes', id]);
  }

  back(): void {
    this.router.navigate(['/admin/tax-schemes']);
  }

  setCountryFilter(code: string): void {
    this.countryFilter.set(code);
  }

  clearSearch(): void {
    this.search.set('');
  }

  // ---- scheme add/edit ----
  openAddScheme(): void {
    this.clearMessages();
    this.schemeEditId = null;
    this.schemeForm = this.blankSchemeForm();
    // Pre-fill the country from the active filter, if any.
    if (this.countryFilter()) this.schemeForm.countryCode = this.countryFilter();
    this.schemeDialogOpen.set(true);
  }

  openEditScheme(s: TaxScheme): void {
    this.clearMessages();
    this.schemeEditId = s.id;
    this.schemeForm = {
      countryCode: s.countryCode,
      taxSchemeCode: s.taxSchemeCode,
      name: s.name,
      description: s.description || '',
      ieFlag: s.ieFlag,
      taxClass: s.taxClass,
    };
    this.schemeDialogOpen.set(true);
  }

  closeSchemeDialog(): void {
    this.schemeDialogOpen.set(false);
  }

  onSaveScheme(): void {
    this.clearMessages();
    const f = this.schemeForm;
    if (!f.countryCode) {
      this.errorMessage.set('Country is required.');
      return;
    }
    if (!f.taxSchemeCode.trim()) {
      this.errorMessage.set('Tax scheme code is required.');
      return;
    }
    if (!f.name.trim()) {
      this.errorMessage.set('Name is required.');
      return;
    }
    const payload = {
      countryCode: f.countryCode,
      taxSchemeCode: f.taxSchemeCode.trim(),
      name: f.name.trim(),
      description: f.description.trim() || null,
      ieFlag: f.ieFlag as TaxScheme['ieFlag'],
      taxClass: f.taxClass as TaxScheme['taxClass'],
    };
    this.schemeSaving.set(true);

    if (this.schemeEditId) {
      this.service.updateScheme(this.schemeEditId, payload).subscribe({
        next: (res) => {
          this.afterSchemeSaved(`${payload.taxSchemeCode} updated.`, res.scheme.id);
        },
        error: (err) => this.onSchemeError(err),
      });
    } else {
      this.service.createScheme(payload).subscribe({
        next: (res) => {
          this.afterSchemeSaved(`${payload.taxSchemeCode} created.`, res.scheme.id);
        },
        error: (err) => this.onSchemeError(err),
      });
    }
  }

  private afterSchemeSaved(message: string, id: string): void {
    this.successMessage.set(message);
    this.schemeSaving.set(false);
    this.schemeDialogOpen.set(false);
    const wasCreate = !this.schemeEditId;
    this.service.list().subscribe({
      next: (data) => {
        this.schemes.set(data);
        if (wasCreate) this.select(id); // open the new scheme's detail
      },
    });
  }

  private onSchemeError(err: { error?: { message?: string } }): void {
    this.errorMessage.set(err.error?.message || 'Failed to save tax scheme.');
    this.schemeSaving.set(false);
  }

  toggleSchemeActive(s: TaxScheme): void {
    this.clearMessages();
    const next = !(s.isActive !== false);
    this.togglingSchemeId.set(s.id);
    this.service.updateScheme(s.id, { isActive: next }).subscribe({
      next: () => {
        this.successMessage.set(`${s.taxSchemeCode} ${next ? 'enabled' : 'disabled'}.`);
        this.togglingSchemeId.set(null);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update tax scheme.');
        this.togglingSchemeId.set(null);
      },
    });
  }

  // ---- load platform defaults ----
  openLoadDefaults(): void {
    this.clearMessages();
    // Default the picker to the current country filter, else the first used country.
    this.loadCountry.set(this.countryFilter() || this.usedCountries()[0] || '');
    this.loadDialogOpen.set(true);
  }

  closeLoadDefaults(): void {
    this.loadDialogOpen.set(false);
  }

  onLoadDefaults(): void {
    this.clearMessages();
    const country = this.loadCountry();
    if (!country) {
      this.errorMessage.set('Choose a country to load defaults for.');
      return;
    }
    this.loadSaving.set(true);
    this.service.loadDefaults(country).subscribe({
      next: (res) => {
        this.loadSaving.set(false);
        this.loadDialogOpen.set(false);
        this.successMessage.set(res.message);
        if (res.created > 0) {
          this.countryFilter.set(country); // focus the country we just populated
          this.load();
        }
      },
      error: (err) => {
        this.loadSaving.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load defaults.');
      },
    });
  }

  // ---- rate lines ----
  openAddRate(): void {
    this.clearMessages();
    this.rateEditId = null;
    this.rateForm = this.blankRateForm();
    this.rateDialogOpen.set(true);
  }

  openEditRate(r: TaxRate): void {
    this.clearMessages();
    this.rateEditId = r.id;
    this.rateForm = {
      taxCode: r.taxCode,
      taxRate: r.taxRate,
      taxPriority: r.taxPriority,
      isClaimable: r.isClaimable,
      claimPercentage: r.claimPercentage,
      glAccountCode: r.glAccountCode || '',
      effectiveFrom: r.effectiveFrom,
      isActive: r.isActive !== false,
    };
    this.rateDialogOpen.set(true);
  }

  closeRateDialog(): void {
    this.rateDialogOpen.set(false);
  }

  onSaveRate(): void {
    this.clearMessages();
    const scheme = this.selectedScheme();
    if (!scheme) return;
    const f = this.rateForm;
    if (!f.taxCode.trim()) {
      this.errorMessage.set('Tax code is required.');
      return;
    }
    if (!(f.taxRate >= 0)) {
      this.errorMessage.set('Tax rate must be a non-negative number.');
      return;
    }
    if (!f.effectiveFrom) {
      this.errorMessage.set('Effective-from date is required.');
      return;
    }
    const payload = {
      taxCode: f.taxCode.trim(),
      taxRate: Number(f.taxRate),
      taxPriority: Number(f.taxPriority),
      isClaimable: !!f.isClaimable,
      claimPercentage: f.isClaimable ? Number(f.claimPercentage) : 0,
      glAccountCode: f.glAccountCode.trim() || null,
      effectiveFrom: f.effectiveFrom,
      isActive: !!f.isActive,
    };
    this.rateSaving.set(true);

    const done = (message: string) => {
      this.successMessage.set(message);
      this.rateSaving.set(false);
      this.rateDialogOpen.set(false);
      this.load();
    };
    const fail = (err: { error?: { message?: string } }) => {
      this.errorMessage.set(err.error?.message || 'Failed to save rate line.');
      this.rateSaving.set(false);
    };

    if (this.rateEditId) {
      this.service.updateRate(this.rateEditId, payload).subscribe({ next: () => done('Rate line updated.'), error: fail });
    } else {
      this.service.addRate(scheme.id, payload).subscribe({ next: () => done('Rate line added.'), error: fail });
    }
  }

  deleteRate(r: TaxRate): void {
    this.clearMessages();
    this.deletingRateId.set(r.id);
    this.service.deleteRate(r.id).subscribe({
      next: () => {
        this.successMessage.set(`Rate line ${r.taxCode} removed.`);
        this.deletingRateId.set(null);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to remove rate line.');
        this.deletingRateId.set(null);
      },
    });
  }

  // Rate lines of the selected scheme, newest-effective first within each code.
  readonly selectedRates = computed(() => {
    const rates = this.selectedScheme()?.rates || [];
    return [...rates].sort(
      (a, b) =>
        a.taxPriority - b.taxPriority ||
        a.taxCode.localeCompare(b.taxCode) ||
        String(b.effectiveFrom).localeCompare(String(a.effectiveFrom)),
    );
  });

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
