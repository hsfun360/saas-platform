import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TaxSchemeService } from '../services/tax-scheme.service';
import { CountryService } from '../services/country.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { TaxScheme, TaxRate, TaxOption, Country, TaxTemplateOption } from '../models/auth.models';

// System Setup → Tax Setup (subscriber-owned catalog).
// Master–detail: the scheme list is the master; the selected scheme (its header +
// effective-dated rate lines) is the detail. The open scheme lives in the URL
// (/admin/tax-schemes/:id) so it deep-links and survives back/forward. Reuses the
// System Setup stylesheet for the shared admin-screen look.
@Component({
  selector: 'app-tax-schemes',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DialogComponent],
  templateUrl: './tax-schemes.html',
  styleUrls: ['../system-setup/system-setup.css', './tax-schemes.css'],
})
export class TaxSchemesComponent implements OnInit {
  private readonly service = inject(TaxSchemeService);
  private readonly countryService = inject(CountryService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  // Platform scope (accountId NULL catalog, SaaS Admin) vs subscriber scope. Set from
  // the route's `data.taxScope`; drives the API base and hides subscriber-only actions.
  readonly isPlatform = signal(false);

  readonly schemes = signal<TaxScheme[]>([]);
  readonly ieFlags = signal<TaxOption[]>([]);
  readonly taxClasses = signal<TaxOption[]>([]);
  readonly taxTypes = signal<TaxOption[]>([]);
  readonly countries = signal<Country[]>([]);
  // Alpha-2 codes of the countries the subscriber's companies operate in (subscriber
  // scope only). The Add-scheme picker restricts to these.
  readonly companyCountries = signal<string[]>([]);
  readonly loading = signal(false);

  // Selection flows FROM the url (never set directly), for deep-linking.
  readonly selectedId = signal<string | null>(null);
  readonly selectedScheme = computed(
    () => this.schemes().find((s) => s.id === this.selectedId()) || null,
  );
  // Claimable (flag + %) only applies to INPUT tax; hidden + forced off for OUTPUT.
  readonly claimableApplicable = computed(() => this.selectedScheme()?.taxClass === 'INPUT');

  readonly search = signal('');
  readonly countryFilter = signal<string>('');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly togglingSchemeId = signal<string | null>(null);
  readonly deletingRateId = signal<string | null>(null);

  // Scheme add/edit dialog. editId null = add. Typed reactive form; validators
  // live on the controls and `dirty` feeds the shared dialog's unsaved-changes guard.
  readonly schemeDialogOpen = signal(false);
  readonly schemeSaving = signal(false);
  schemeEditId: string | null = null;
  readonly schemeForm = this.fb.nonNullable.group({
    countryCode: ['', Validators.required],
    taxSchemeCode: ['', Validators.required],
    name: ['', Validators.required],
    ieFlag: ['EXCLUSIVE', Validators.required],
    taxClass: ['OUTPUT', Validators.required],
    description: [''],
  });

  // Rate add/edit dialog. editId null = add. Typed reactive form.
  readonly rateDialogOpen = signal(false);
  readonly rateSaving = signal(false);
  rateEditId: string | null = null;
  readonly rateForm = this.fb.nonNullable.group({
    taxCode: ['', Validators.required],
    taxRate: [0, [Validators.required, Validators.min(0)]],
    taxType: ['Tax'],
    taxPriority: [1],
    // isClaimable is defined before claimPercentage so a reset resets the flag first,
    // letting the conditional validator (below) settle before the percentage is set.
    isClaimable: [true],
    claimPercentage: [100],
    glAccountCode: [''],
    effectiveFrom: [this.today(), Validators.required],
    isActive: [true],
  });
  // Set while an open handler seeds the rate form, so the programmatic reset doesn't
  // trip the taxType→claimable side effect (which must only run on user interaction).
  private suppressTaxTypeSync = false;

  // Load-defaults dialog: preview the platform templates across the subscriber's
  // company countries (each row shows its country flag) and multi-select which to copy
  // in. A live search filters the list; no country picker.
  readonly loadDialogOpen = signal(false);
  readonly loadSaving = signal(false);
  readonly loadTemplates = signal<TaxTemplateOption[]>([]);
  readonly loadTemplatesLoading = signal(false);
  readonly loadSearch = signal('');
  // Selected rows, keyed by `countryCode|taxSchemeCode` (a code can repeat across countries).
  readonly loadSelected = signal<ReadonlySet<string>>(new Set());
  readonly loadSelectedCount = computed(() => this.loadSelected().size);
  // The templates matching the search box (matched on code, name and country name).
  readonly filteredLoadTemplates = computed(() => {
    const q = this.loadSearch().trim().toLowerCase();
    const list = this.loadTemplates();
    if (!q) return list;
    return list.filter(
      (t) =>
        t.taxSchemeCode.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        this.countryName(t.countryCode).toLowerCase().includes(q),
    );
  });

  // Countries actually used by the subscriber's schemes, for the master filter.
  readonly usedCountries = computed(() => {
    const codes = new Set(this.schemes().map((s) => s.countryCode));
    return [...codes].sort();
  });

  // Countries offered when ADDING a scheme. Platform scope: all active countries.
  // Subscriber scope: only the countries the subscriber's companies operate in
  // (falls back to all active countries if none are set, so creation is never blocked).
  readonly selectableCountries = computed<Country[]>(() => {
    if (this.isPlatform()) return this.countries();
    const codes = new Set(this.companyCountries());
    if (codes.size === 0) return this.countries();
    const filtered = this.countries().filter((c) => codes.has(c.alpha2));
    return filtered.length ? filtered : this.countries();
  });

  // When the subscriber operates in exactly one country, that alpha-2 (else '') -
  // used to auto-select and skip the picker on Add.
  readonly singleCompanyCountry = computed(() =>
    !this.isPlatform() && this.selectableCountries().length === 1 ? this.selectableCountries()[0].alpha2 : '',
  );

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
    this.isPlatform.set(this.route.snapshot.data['taxScope'] === 'platform');
    // The open scheme id is whatever the route says.
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      this.selectedId.set(p.get('id'));
    });

    // Claim percentage is required and 0–100 only while the line is claimable; when
    // it isn't, the validators are cleared and the field is reset (it's hidden then,
    // and forced to 0 on save).
    this.rateForm.controls.isClaimable.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((claimable) => {
        const pct = this.rateForm.controls.claimPercentage;
        if (claimable) {
          pct.setValidators([Validators.required, Validators.min(0), Validators.max(100)]);
        } else {
          pct.clearValidators();
          pct.reset(0);
        }
        pct.updateValueAndValidity();
      });

    // Tax type drives the claimable default (see onTaxTypeChange). Only user-initiated
    // changes should apply it - programmatic seeding suppresses it via the guard flag.
    this.rateForm.controls.taxType.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (this.suppressTaxTypeSync) return;
        this.onTaxTypeChange();
      });
  }

  // Fetch what the screen needs up front: the schemes, the country reference (for
  // flags/names), and - for a subscriber - the companies' countries (used by both the
  // Add picker and the Load-defaults screen). `meta` is needed only by the scheme
  // dialog's dropdowns, so it loads lazily on first open (and is cached).
  ngOnInit(): void {
    this.loadCountries();
    this.load();
    if (!this.isPlatform()) this.loadCompanyCountries();
  }

  loadCompanyCountries(): void {
    this.service.companyCountries().subscribe({
      next: (codes) => this.companyCountries.set(codes),
      error: () => {
        /* fall back to all countries if it can't be resolved */
      },
    });
  }

  // Ensure the scheme dialog's option lists (meta) are loaded once, then run `onReady`.
  private ensureMeta(onReady: () => void): void {
    if (this.ieFlags().length > 0) { onReady(); return; }
    this.loadMeta(onReady);
  }

  // ---- data ----
  // Seed values for a fresh scheme form (reset() on open keeps it pristine).
  private blankSchemeValues() {
    return { countryCode: '', taxSchemeCode: '', name: '', description: '', ieFlag: 'EXCLUSIVE', taxClass: 'OUTPUT' };
  }

  // Seed values for a fresh rate form. A new 'Tax' line defaults to fully claimable; a
  // 'Service Charge' line is not (see onTaxTypeChange). Only meaningful for INPUT
  // schemes; forced off otherwise.
  private blankRateValues() {
    return {
      taxCode: '',
      taxRate: 0,
      taxType: 'Tax',
      taxPriority: 1,
      isClaimable: true,
      claimPercentage: 100,
      glAccountCode: '',
      effectiveFrom: this.today(),
      isActive: true,
    };
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  // Show a control's validation message once the user has interacted with it (or after
  // a submit attempt marks everything touched).
  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
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

  // The country's flag emoji (from the Country reference), shown as the scheme icon.
  countryFlag(code: string): string {
    return this.countries().find((c) => c.alpha2 === code)?.flagEmoji || '';
  }

  // "🇲🇾 Malaysia" label (flag + name), for the read-only country field.
  countryLabel(code: string): string {
    const flag = this.countryFlag(code);
    const name = this.countryName(code);
    return flag ? `${flag} ${name}` : name;
  }

  loadMeta(done?: () => void): void {
    this.service.meta(this.isPlatform()).subscribe({
      next: (m) => {
        this.ieFlags.set(m.ieFlags);
        this.taxClasses.set(m.taxClasses);
        this.taxTypes.set(m.taxTypes || []);
        done?.();
      },
      // Dropdowns fall back to raw keys if meta fails.
      error: () => { done?.(); },
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
    this.service.list(undefined, this.isPlatform()).subscribe({
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
  private basePath(): string {
    return this.isPlatform() ? '/admin/platform-tax' : '/admin/tax-schemes';
  }

  select(id: string): void {
    this.router.navigate([this.basePath(), id]);
  }

  back(): void {
    this.router.navigate([this.basePath()]);
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
    this.schemeForm.reset(this.blankSchemeValues());
    this.ensureMeta(() => {
      // Default the country: a single company-country auto-selects (no picker needed);
      // otherwise pre-fill from the active master filter, if any.
      const single = this.singleCompanyCountry();
      if (single) this.schemeForm.controls.countryCode.setValue(single);
      else if (this.countryFilter()) this.schemeForm.controls.countryCode.setValue(this.countryFilter());
      this.schemeDialogOpen.set(true);
    });
  }

  openEditScheme(s: TaxScheme): void {
    this.clearMessages();
    this.schemeEditId = s.id;
    this.schemeForm.reset({
      countryCode: s.countryCode,
      taxSchemeCode: s.taxSchemeCode,
      name: s.name,
      description: s.description || '',
      ieFlag: s.ieFlag,
      taxClass: s.taxClass,
    });
    // Edit needs the class/flag dropdowns (meta); its country is fixed.
    this.ensureMeta(() => this.schemeDialogOpen.set(true));
  }

  closeSchemeDialog(): void {
    this.schemeDialogOpen.set(false);
  }

  onSaveScheme(): void {
    this.clearMessages();
    if (this.schemeForm.invalid) {
      this.schemeForm.markAllAsTouched(); // reveal every field's error at once
      return;
    }
    const f = this.schemeForm.getRawValue();
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
      this.service.updateScheme(this.schemeEditId, payload, this.isPlatform()).subscribe({
        next: (res) => {
          this.afterSchemeSaved(`${payload.taxSchemeCode} updated.`, res.scheme.id);
        },
        error: (err) => this.onSchemeError(err),
      });
    } else {
      this.service.createScheme(payload, this.isPlatform()).subscribe({
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
    this.service.list(undefined, this.isPlatform()).subscribe({
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
    this.service.updateScheme(s.id, { isActive: next }, this.isPlatform()).subscribe({
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

  // ---- load platform defaults (preview + multi-select) ----
  openLoadDefaults(): void {
    this.clearMessages();
    this.loadTemplates.set([]);
    this.loadSelected.set(new Set());
    this.loadSearch.set('');
    this.loadDialogOpen.set(true);
    this.fetchLoadTemplates();
  }

  // The stable key for a template row (a code can repeat across countries).
  private templateKey(t: TaxTemplateOption): string {
    return `${t.countryCode}|${t.taxSchemeCode}`;
  }

  // Fetch the templates across the subscriber's company countries and pre-select the
  // ones not yet loaded (so "Load" is one click for the common case), leaving
  // already-added ones out.
  private fetchLoadTemplates(): void {
    this.loadTemplatesLoading.set(true);
    this.service.defaultTemplates().subscribe({
      next: (list) => {
        this.loadTemplates.set(list);
        this.loadSelected.set(new Set(list.filter((t) => !t.alreadyLoaded).map((t) => this.templateKey(t))));
        this.loadTemplatesLoading.set(false);
      },
      error: (err) => {
        this.loadTemplatesLoading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load available schemes.');
      },
    });
  }

  isLoadSelected(t: TaxTemplateOption): boolean {
    return this.loadSelected().has(this.templateKey(t));
  }

  toggleLoadTemplate(t: TaxTemplateOption): void {
    const key = this.templateKey(t);
    const next = new Set(this.loadSelected());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.loadSelected.set(next);
  }

  clearLoadSearch(): void {
    this.loadSearch.set('');
  }

  // "🇲🇾 SST 8%" style summary of a template's rate components, for the preview list.
  templateRateSummary(t: TaxTemplateOption): string {
    return t.rates.map((r) => `${r.taxCode} ${r.taxRate}%`).join(' · ');
  }

  closeLoadDefaults(): void {
    this.loadDialogOpen.set(false);
  }

  onLoadDefaults(): void {
    this.clearMessages();
    const selections = [...this.loadSelected()].map((key) => {
      const [countryCode, taxSchemeCode] = key.split('|');
      return { countryCode, taxSchemeCode };
    });
    if (selections.length === 0) {
      this.errorMessage.set('Select at least one scheme to load.');
      return;
    }
    this.loadSaving.set(true);
    this.service.loadDefaults(selections).subscribe({
      next: (res) => {
        this.loadSaving.set(false);
        this.loadDialogOpen.set(false);
        this.successMessage.set(res.message);
        if (res.created > 0) {
          // If everything loaded came from one country, focus that country's list.
          const countries = new Set(selections.map((s) => s.countryCode));
          this.countryFilter.set(countries.size === 1 ? [...countries][0] : '');
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
    this.suppressTaxTypeSync = true;
    this.rateForm.reset(this.blankRateValues());
    this.suppressTaxTypeSync = false;
    this.rateDialogOpen.set(true);
  }

  openEditRate(r: TaxRate): void {
    this.clearMessages();
    this.rateEditId = r.id;
    this.suppressTaxTypeSync = true;
    this.rateForm.reset({
      taxCode: r.taxCode,
      taxRate: r.taxRate,
      taxType: r.taxType || 'Tax',
      taxPriority: r.taxPriority,
      isClaimable: r.isClaimable,
      claimPercentage: r.claimPercentage,
      glAccountCode: r.glAccountCode || '',
      effectiveFrom: r.effectiveFrom,
      isActive: r.isActive !== false,
    });
    this.suppressTaxTypeSync = false;
    this.rateDialogOpen.set(true);
  }

  closeRateDialog(): void {
    this.rateDialogOpen.set(false);
  }

  // Tax type drives the claimable default: a 'Tax' line is fully claimable (100%), a
  // 'Service Charge' line is not claimable (0%). Only surfaces for INPUT schemes, but
  // we keep the form values in sync regardless (they're forced off for non-INPUT on save).
  onTaxTypeChange(): void {
    if (this.rateForm.controls.taxType.value === 'Service Charge') {
      this.rateForm.patchValue({ isClaimable: false, claimPercentage: 0 });
    } else {
      this.rateForm.patchValue({ isClaimable: true, claimPercentage: 100 });
    }
  }

  onSaveRate(): void {
    this.clearMessages();
    const scheme = this.selectedScheme();
    if (!scheme) return;
    if (this.rateForm.invalid) {
      this.rateForm.markAllAsTouched();
      return;
    }
    const f = this.rateForm.getRawValue();
    // Claimable only applies to INPUT tax; force it off for OUTPUT (fields are hidden).
    const claimable = this.claimableApplicable() && !!f.isClaimable;
    const payload = {
      taxCode: f.taxCode.trim(),
      taxRate: Number(f.taxRate),
      taxType: f.taxType,
      taxPriority: Number(f.taxPriority),
      isClaimable: claimable,
      claimPercentage: claimable ? Number(f.claimPercentage) : 0,
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
      this.service.updateRate(this.rateEditId, payload, this.isPlatform()).subscribe({ next: () => done('Rate line updated.'), error: fail });
    } else {
      this.service.addRate(scheme.id, payload, this.isPlatform()).subscribe({ next: () => done('Rate line added.'), error: fail });
    }
  }

  deleteRate(r: TaxRate): void {
    this.clearMessages();
    this.deletingRateId.set(r.id);
    this.service.deleteRate(r.id, this.isPlatform()).subscribe({
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
