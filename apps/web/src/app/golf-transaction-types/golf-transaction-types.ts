import { Component, Injector, OnInit, computed, inject, signal } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { GolfTransactionTypeService } from '../services/golf-transaction-type.service';
import { NationalityService } from '../services/nationality.service';
import { ScrollReturnService } from '../services/scroll-return.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { CanDirective } from '../shared/can.directive';
import { GolfTransactionType, GolfTransactionTypeElement, GolfTransactionTypeEligibility, GolfTransactionTypeRate, MembershipStatusOption, TaxSchemeRef } from '../models/auth.models';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { OverflowMenuComponent, MenuItemDirective } from '../shared/overflow-menu/overflow-menu';
import { MoneyInputDirective } from '../shared/money-input.directive';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { ComboboxComponent } from '../shared/combobox/combobox';

// The four matrix cells - 9/18 holes × weekday vs
// weekend (public holidays count as weekend platform-wide).
const MATRIX_CELLS = [
  'price9Weekday', 'price18Weekday', 'price9Weekend', 'price18Weekend',
] as const;

// The charge-type key whose transaction types bundle OTHER transaction types
// (fixed vocabulary key, mirrored from transactionType.constants.js).
const PACKAGE_KEY = 'package';

// Package composition rows live INSIDE the type form as FormArrays (house
// standard): one element line per group, one eligibility condition per group
// (days as a nested group of seven booleans). form.dirty therefore covers
// them - no hand-kept dirty flag.
type PkgGroup = FormGroup<{
  elementTransactionTypeId: FormControl<string>;
  quantity: FormControl<number>;
  unitAmount: FormControl<number>;
}>;
type EligGroup = FormGroup<{
  days: FormGroup<Record<string, FormControl<boolean>>>;
  excludePublicHolidays: FormControl<boolean>;
  startTime: FormControl<string>;
  endTime: FormControl<string>;
  holes: FormControl<string>;      // '' | '9' | '18'
  minAge: FormControl<number | null>;
  maxAge: FormControl<number | null>;
  gender: FormControl<string>;     // '' | 'male' | 'female'
  nationalityCode: FormControl<string>;
}>;

// Golf Management → Master File Setup → Transaction Type.
// Per-company billing-item catalog: code + charge type (fixed vocabulary:
// green fee / caddy fee / buggy fee / no show / miscellaneous) + description +
// THE tax scheme (single source - consuming rows inherit it) + whether the
// pre-set price may be overridden at billing. Enable/disable, no delete.
// Each transaction type carries effective-dated PRICE CARDS: the 8-cell
// member/visitor × 9/18 × weekday/weekend matrix for green/caddy/buggy fees,
// a single flat amount for no-show/miscellaneous - managed in the Pricing
// dialog (one dialog instance, mode-switched views per the single-dialog rule).
@Component({
  selector: 'app-golf-transaction-types',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent,
    CanDirective, OverflowMenuComponent, MenuItemDirective, MoneyInputDirective, LocalDatePipe, ComboboxComponent],
  templateUrl: './golf-transaction-types.html',
  // membership-types.css supplies the shared .mt-chip pill; own css = pricing grid.
  styleUrls: ['../system-setup/system-setup.css', '../membership-types/membership-types.css', './golf-transaction-types.css'],
})
export class GolfTransactionTypesComponent implements OnInit {
  private readonly service = inject(GolfTransactionTypeService);
  private readonly nationalityService = inject(NationalityService);
  private readonly fb = inject(FormBuilder);
  // After-save return-to-row (app standard): the list re-sorts on reload, so
  // the saved/toggled card is scrolled back into view and flashed.
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private static readonly LIST_PATH = '/golf/transaction-types';

  readonly rows = signal<GolfTransactionType[]>([]);
  readonly chargeTypes = signal<MembershipStatusOption[]>([]);
  readonly matrixKeys = signal<string[]>(['green-fee', 'caddy-fee', 'buggy-fee']);
  readonly golferTypes = signal<{ key: string; label: string }[]>([]);
  readonly taxSchemes = signal<TaxSchemeRef[]>([]);
  // Constrained-combobox rows (house standard for long reference lists):
  // code AND name in the label so type-to-filter matches both.
  readonly taxSchemeOptions = computed(() =>
    this.taxSchemes().map((s) => ({ value: s.taxSchemeCode, label: s.name ? `${s.taxSchemeCode} — ${s.name}` : s.taxSchemeCode })));
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);

  readonly dialogOpen = signal(false);
  readonly saving = signal(false);
  readonly uploading = signal(false);
  readonly editId = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    transactionType: ['', [Validators.required, Validators.maxLength(50)]],
    chargeType: ['', [Validators.required]],
    golferType: [''],
    description: ['', [Validators.maxLength(255)]],
    taxSchemeCode: [''],
    allowPriceOverride: [false],
    iconUrl: [''],
    autoTransactionTypeId: [''],
    // PACKAGE composition (see PkgGroup / EligGroup).
    packageItems: this.fb.array<PkgGroup>([]),
    eligibility: this.fb.array<EligGroup>([]),
  });
  get pkgLines(): FormArray<PkgGroup> { return this.form.controls.packageItems; }
  get eligLines(): FormArray<EligGroup> { return this.form.controls.eligibility; }
  // The pickable elements: active, not a package, not the record being edited.
  readonly elementOptions = computed(() => {
    const selfId = this.editId();
    return this.rows()
      .filter((t) => t.chargeType !== PACKAGE_KEY && t.isActive !== false && t.id !== selfId)
      .sort((a, b) => a.transactionType.localeCompare(b.transactionType));
  });
  // The same list shaped for the constrained combobox ({value, label}).
  readonly elementComboOptions = computed(() =>
    this.elementOptions().map((o) => ({ value: o.id, label: o.description ? `${o.transactionType} — ${o.description}` : o.transactionType })));

  // ---- Pricing dialog (single instance, 'list' ↔ 'form' views) ----
  readonly prOpen = signal(false);
  readonly prMode = signal<'list' | 'form' | 'delete'>('list');
  readonly prDeleteTarget = signal<GolfTransactionTypeRate | null>(null);
  readonly prType = signal<GolfTransactionType | null>(null);
  readonly prRates = signal<GolfTransactionTypeRate[]>([]);
  readonly prLoading = signal(false);
  readonly prSaving = signal(false);
  readonly prTogglingId = signal<string | null>(null);
  readonly prEditId = signal<string | null>(null);

  readonly rateForm = this.fb.nonNullable.group({
    effectiveDate: ['', [Validators.required]],
    price9Weekday: [0, [Validators.required, Validators.min(0)]],
    price18Weekday: [0, [Validators.required, Validators.min(0)]],
    price9Weekend: [0, [Validators.required, Validators.min(0)]],
    price18Weekend: [0, [Validators.required, Validators.min(0)]],
    flatAmount: [0, [Validators.required, Validators.min(0)]],
  });

  readonly search = signal('');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const sorted = [...this.rows()].sort((a, b) => {
      const aActive = a.isActive !== false;
      const bActive = b.isActive !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return a.transactionType.localeCompare(b.transactionType);
    });
    if (!q) return sorted;
    return sorted.filter(
      (t) =>
        t.transactionType.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        this.chargeTypeLabel(t.chargeType).toLowerCase().includes(q),
    );
  });
  readonly activeCount = computed(() => this.rows().filter((t) => t.isActive !== false).length);

  readonly dialogTitle = computed(() => (this.editId() ? 'Edit transaction type' : 'New transaction type'));

  // Whether the pricing dialog's transaction type prices by the 8-cell matrix
  // (green/caddy/buggy) or by a single flat amount (no-show/miscellaneous).
  readonly prIsMatrix = computed(() => {
    const t = this.prType();
    return !!t && this.matrixKeys().includes(t.chargeType);
  });
  readonly prTitle = computed(() => {
    const code = this.prType()?.transactionType || '';
    if (this.prMode() === 'form') return this.prEditId() ? `Edit price — ${code}` : `New price — ${code}`;
    if (this.prMode() === 'delete') return `Delete price — ${code}`;
    return `Default Price — ${code}`;
  });
  readonly prBusy = computed(() => this.prLoading() || this.prSaving());
  // Method (not computed): rateForm.dirty is not a signal, but template
  // bindings re-evaluate every CD pass - same as the other dialogs.
  prDirty(): boolean {
    return this.prMode() === 'form' && this.rateForm.dirty;
  }

  // The card in force today: rates are listed newest-first, so it is the first
  // active row whose effective date is on-or-before today.
  readonly inForceId = computed(() => {
    const today = this.todayStr();
    return this.prRates().find((r) => r.isActive !== false && r.effectiveDate <= today)?.id || null;
  });

  ngOnInit(): void {
    this.service.meta().subscribe({
      next: (m) => {
        this.chargeTypes.set(m.chargeTypes);
        if (m.matrixChargeTypes?.length) this.matrixKeys.set(m.matrixChargeTypes);
        if (m.golferTypes?.length) this.golferTypes.set(m.golferTypes);
      },
      error: () => {},
    });
    this.service.taxSchemes().subscribe({ next: (r) => this.taxSchemes.set(r.schemes), error: () => {} });
    this.nationalityService.listActive().subscribe({ next: (list) => this.nationalities.set(list), error: () => {} });
    this.load();
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  chargeTypeLabel(key: string): string {
    return this.chargeTypes().find((c) => c.key === key)?.label || key;
  }

  // Charge types that may carry the "Default for golfer type" marker: green
  // fee (auto-charged at registration) and buggy / caddy (the category's only
  // tile on the bill). Mirrors GOLFER_TYPED_CHARGE_TYPE_KEYS on the API.
  golferTyped(chargeType: string): boolean {
    return chargeType === 'green-fee' || chargeType === 'buggy-fee' || chargeType === 'caddy-fee';
  }

  golferTypeLabel(key: string | null | undefined): string {
    return key ? (this.golferTypes().find((g) => g.key === key)?.label || key) : '';
  }

  // Whether the dialog form currently composes a package (method, not
  // computed: control values are not signals; bindings re-evaluate per CD).
  isPackageForm(): boolean {
    return this.form.controls.chargeType.value === PACKAGE_KEY;
  }

  isPackage(t: GolfTransactionType): boolean {
    return t.chargeType === PACKAGE_KEY;
  }

  typeCode(id: string): string {
    return this.rows().find((t) => t.id === id)?.transactionType || '?';
  }

  // "1× BUGGY + 2× CADDY" summary for a package card.
  pkgSummary(t: GolfTransactionType): string {
    const items = t.packageItems || [];
    return items.map((i) => `${i.quantity}× ${this.typeCode(i.elementTransactionTypeId)}`).join(' + ');
  }

  // Sum of the element allocations in the editor (qty × unit amount).
  pkgSum(): number {
    return this.pkgLines.controls.reduce((s, g) => s + (Number(g.controls.quantity.value) || 0) * (Number(g.controls.unitAmount.value) || 0), 0);
  }

  // ---- Package eligibility (who may be billed this package; rows OR-ed) ----

  readonly dayKeys: { key: string; label: string }[] = [
    { key: 'monday', label: 'Mon' }, { key: 'tuesday', label: 'Tue' }, { key: 'wednesday', label: 'Wed' },
    { key: 'thursday', label: 'Thu' }, { key: 'friday', label: 'Fri' }, { key: 'saturday', label: 'Sat' }, { key: 'sunday', label: 'Sun' },
  ];

  private newEligGroup(r?: GolfTransactionTypeEligibility): EligGroup {
    const days: Record<string, FormControl<boolean>> = {};
    for (const d of this.dayKeys) days[d.key] = this.fb.nonNullable.control(!!r?.daysOfWeek?.includes(d.key));
    return this.fb.group({
      days: this.fb.group(days),
      excludePublicHolidays: this.fb.nonNullable.control(r?.excludePublicHolidays === true),
      startTime: this.fb.nonNullable.control(r?.startTime || ''),
      endTime: this.fb.nonNullable.control(r?.endTime || ''),
      holes: this.fb.nonNullable.control(r?.holes ? String(r.holes) : ''),
      minAge: this.fb.control<number | null>(r?.minAge ?? null),
      maxAge: this.fb.control<number | null>(r?.maxAge ?? null),
      gender: this.fb.nonNullable.control(r?.gender || ''),
      nationalityCode: this.fb.nonNullable.control(r?.nationalityCode || ''),
    });
  }

  // The model shape of one condition group (null = no restriction), used by
  // the row summary and the save payload.
  eligModel(g: EligGroup): GolfTransactionTypeEligibility {
    const v = g.getRawValue();
    const days = this.dayKeys.map((d) => d.key).filter((k) => v.days[k]);
    const clampAge = (n: number | null) => (n === null || n === undefined || Number.isNaN(n) ? null : Math.max(0, Math.min(120, Math.floor(n))));
    return {
      daysOfWeek: days.length ? days : null,
      excludePublicHolidays: v.excludePublicHolidays,
      startTime: v.startTime || null,
      endTime: v.endTime || null,
      holes: v.holes ? Number(v.holes) : null,
      minAge: clampAge(v.minAge),
      maxAge: clampAge(v.maxAge),
      gender: v.gender === 'male' || v.gender === 'female' ? v.gender : null,
      nationalityCode: v.nationalityCode || null,
    };
  }

  addEligRow(): void {
    this.eligLines.push(this.newEligGroup());
    this.eligLines.markAsDirty();
  }

  removeEligRow(index: number): void {
    this.eligLines.removeAt(index);
    this.eligLines.markAsDirty();
  }

  // "Mon-Thu · not on holidays · 07:05-09:05 · age 55+ · local" summary for
  // a package card.
  eligSummary(t: GolfTransactionType): string {
    return (t.eligibility || []).map((r) => this.eligRowText(r)).join('  |  ');
  }

  eligRowText(r: GolfTransactionTypeEligibility): string {
    const parts: string[] = [];
    if (r.daysOfWeek && r.daysOfWeek.length) parts.push(r.daysOfWeek.map((d) => this.dayKeys.find((k) => k.key === d)?.label || d).join('/'));
    if (r.excludePublicHolidays) parts.push('not on holidays');
    if (r.startTime && r.endTime) parts.push(`${r.startTime}-${r.endTime}`);
    if (r.holes) parts.push(`${r.holes}H`);
    if (r.minAge !== null && r.maxAge !== null) parts.push(`age ${r.minAge}-${r.maxAge}`);
    else if (r.minAge !== null) parts.push(`age ${r.minAge}+`);
    else if (r.maxAge !== null) parts.push(`age ≤${r.maxAge}`);
    if (r.gender) parts.push(r.gender === 'female' ? 'ladies' : 'men');
    if (r.nationalityCode) parts.push(this.nationalityLabel(r.nationalityCode));
    return parts.join(' · ') || 'everyone';
  }

  // Subscriber nationality list for the "nationality" condition (the club
  // names its local nationality, e.g. MAS - Malaysian).
  readonly nationalities = signal<{ nationalityCode: string; description?: string | null }[]>([]);
  readonly nationalityOptions = computed(() =>
    this.nationalities().map((n) => ({ value: n.nationalityCode, label: `${n.nationalityCode}${n.description ? ' — ' + n.description : ''}` })),
  );

  nationalityLabel(code: string): string {
    const n = this.nationalities().find((x) => x.nationalityCode === code);
    return n && n.description ? `${n.description} only` : `nationality ${code}`;
  }

  private newPkgGroup(i?: GolfTransactionTypeElement): PkgGroup {
    return this.fb.nonNullable.group({
      elementTransactionTypeId: [i?.elementTransactionTypeId || ''],
      quantity: [i?.quantity ?? 1, [Validators.min(1), Validators.max(99)]],
      unitAmount: [i?.unitAmount ?? 0, [Validators.min(0)]],
    });
  }

  addPkgRow(): void {
    this.pkgLines.push(this.newPkgGroup());
    this.pkgLines.markAsDirty();
  }

  removePkgRow(index: number): void {
    this.pkgLines.removeAt(index);
    this.pkgLines.markAsDirty();
  }

  // Replace both composition arrays (reset() alone keeps the old row count).
  private setComposition(items: GolfTransactionTypeElement[], elig: GolfTransactionTypeEligibility[]): void {
    this.pkgLines.clear();
    for (const i of items) this.pkgLines.push(this.newPkgGroup(i));
    this.eligLines.clear();
    for (const r of elig) this.eligLines.push(this.newEligGroup(r));
  }

  taxSchemeName(code: string | null | undefined): string {
    if (!code) return '';
    const s = this.taxSchemes().find((t) => t.taxSchemeCode === code);
    return s ? `${s.taxSchemeCode}${s.name ? ' — ' + s.name : ''}` : code;
  }

  load(): void {
    this.loading.set(true);
    this.service.list().subscribe({
      next: (data) => {
        this.rows.set(data);
        this.loading.set(false);
        this.returnScroll.consume(GolfTransactionTypesComponent.LIST_PATH, this.injector);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load transaction types.');
      },
    });
  }

  openAdd(): void {
    this.clearMessages();
    this.editId.set(null);
    this.setComposition([], []);
    this.form.reset({ transactionType: '', chargeType: '', golferType: '', description: '', taxSchemeCode: '', allowPriceOverride: false, iconUrl: '', autoTransactionTypeId: '' });
    this.form.markAsPristine();
    this.dialogOpen.set(true);
  }

  openEdit(t: GolfTransactionType): void {
    this.clearMessages();
    this.editId.set(t.id);
    this.setComposition(
      (t.packageItems || []).map((i) => ({ elementTransactionTypeId: i.elementTransactionTypeId, quantity: i.quantity, unitAmount: i.unitAmount })),
      t.eligibility || [],
    );
    this.form.reset({
      transactionType: t.transactionType,
      chargeType: t.chargeType,
      golferType: t.golferType || '',
      description: t.description || '',
      taxSchemeCode: t.taxSchemeCode || '',
      allowPriceOverride: t.allowPriceOverride === true,
      iconUrl: t.iconUrl || '',
      autoTransactionTypeId: t.autoTransactionTypeId || '',
    });
    this.form.markAsPristine();
    this.dialogOpen.set(true);
  }

  closeDialog(): void {
    this.dialogOpen.set(false);
  }

  onSave(): void {
    this.clearMessages();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const isPackage = v.chargeType === PACKAGE_KEY;
    const items: GolfTransactionTypeElement[] = v.packageItems.map((i) => ({
      elementTransactionTypeId: i.elementTransactionTypeId,
      quantity: Math.max(1, Math.floor(Number(i.quantity) || 1)),
      unitAmount: Math.max(0, Number(i.unitAmount) || 0),
    }));
    if (isPackage) {
      if (items.length === 0) {
        this.errorMessage.set('A package needs at least one element - use "Add element".');
        return;
      }
      if (items.some((i) => !i.elementTransactionTypeId)) {
        this.errorMessage.set('Every package element needs a transaction type.');
        return;
      }
      const ids = items.map((i) => i.elementTransactionTypeId);
      if (new Set(ids).size !== ids.length) {
        this.errorMessage.set('A package cannot list the same element twice - use the quantity instead.');
        return;
      }
      if (!v.autoTransactionTypeId) {
        this.errorMessage.set('Select the Auto Transaction Type - the automatic balance line posts to it.');
        return;
      }
    }
    const payload: Partial<GolfTransactionType> = {
      transactionType: v.transactionType.trim(),
      chargeType: v.chargeType,
      golferType: this.golferTyped(v.chargeType) ? (v.golferType || null) : null,
      description: v.description.trim() || null,
      taxSchemeCode: v.taxSchemeCode || null,
      allowPriceOverride: v.allowPriceOverride,
      iconUrl: v.iconUrl || null,
      autoTransactionTypeId: isPackage ? v.autoTransactionTypeId : null,
    };
    if (isPackage) {
      payload.packageItems = items.map((i, n) => ({ ...i, sortOrder: n }));
      const eligibility = this.eligLines.controls.map((g) => this.eligModel(g));
      for (const [n, r] of eligibility.entries()) {
        if (!!r.startTime !== !!r.endTime) {
          this.errorMessage.set(`Eligibility condition ${n + 1}: set both From and To times, or neither.`);
          return;
        }
        if (r.minAge !== null && r.maxAge !== null && r.minAge > r.maxAge) {
          this.errorMessage.set(`Eligibility condition ${n + 1}: the minimum age is above the maximum age.`);
          return;
        }
      }
      payload.eligibility = eligibility;
    }

    this.saving.set(true);
    const id = this.editId();
    const req$ = id ? this.service.update(id, payload) : this.service.create(payload);
    req$.subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.saving.set(false);
        this.dialogOpen.set(false);
        this.returnScroll.remember(GolfTransactionTypesComponent.LIST_PATH, res.transactionType.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save the transaction type.');
        this.saving.set(false);
      },
    });
  }

  onIconSelected(input: HTMLInputElement): void {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    this.clearMessages();
    this.uploading.set(true);
    this.service.uploadIcon(file).subscribe({
      next: (res) => {
        this.form.controls.iconUrl.setValue(res.url);
        this.form.controls.iconUrl.markAsDirty(); // uploads count as unsaved changes
        this.uploading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to upload the icon.');
        this.uploading.set(false);
      },
    });
  }

  removeIcon(): void {
    this.form.controls.iconUrl.setValue('');
    this.form.controls.iconUrl.markAsDirty();
  }

  toggleActive(t: GolfTransactionType): void {
    this.clearMessages();
    const next = !(t.isActive !== false);
    this.togglingId.set(t.id);
    this.service.setActive(t.id, next).subscribe({
      next: () => {
        this.successMessage.set(`${t.transactionType} ${next ? 'enabled' : 'disabled'}.`);
        this.togglingId.set(null);
        this.returnScroll.remember(GolfTransactionTypesComponent.LIST_PATH, t.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update the transaction type.');
        this.togglingId.set(null);
      },
    });
  }

  // ---- Pricing ----

  openPricing(t: GolfTransactionType): void {
    this.clearMessages();
    this.prType.set(t);
    this.prRates.set([]);
    this.prMode.set('list');
    this.prOpen.set(true);
    this.reloadRates();
  }

  closePricing(): void {
    this.prOpen.set(false);
    this.prMode.set('list');
  }

  backToRates(): void {
    this.prMode.set('list');
  }

  private reloadRates(): void {
    const t = this.prType();
    if (!t) return;
    this.prLoading.set(true);
    this.service.rates(t.id).subscribe({
      next: (data) => {
        this.prRates.set(data);
        this.prLoading.set(false);
      },
      error: (err) => {
        this.prLoading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load pricing.');
      },
    });
  }

  openRateForm(r?: GolfTransactionTypeRate): void {
    this.prEditId.set(r?.id || null);
    this.rateForm.reset({
      effectiveDate: r?.effectiveDate || '',
      price9Weekday: r?.price9Weekday ?? 0,
      price18Weekday: r?.price18Weekday ?? 0,
      price9Weekend: r?.price9Weekend ?? 0,
      price18Weekend: r?.price18Weekend ?? 0,
      flatAmount: r?.flatAmount ?? 0,
    });
    this.prMode.set('form');
  }

  // Convenience: same prices on weekend/public holiday as on weekday.
  copyWeekdayToWeekend(): void {
    const v = this.rateForm.getRawValue();
    this.rateForm.patchValue({
      price9Weekend: v.price9Weekday,
      price18Weekend: v.price18Weekday,
    });
    this.rateForm.markAsDirty();
  }

  onSaveRate(): void {
    this.clearMessages();
    const t = this.prType();
    if (!t) return;
    if (this.rateForm.invalid) {
      this.rateForm.markAllAsTouched();
      return;
    }
    const v = this.rateForm.getRawValue();
    const payload: Partial<GolfTransactionTypeRate> = { effectiveDate: v.effectiveDate };
    if (this.prIsMatrix()) {
      for (const cell of MATRIX_CELLS) payload[cell] = v[cell];
    } else {
      payload.flatAmount = v.flatAmount;
    }

    this.prSaving.set(true);
    const rateId = this.prEditId();
    const req$ = rateId ? this.service.updateRate(t.id, rateId, payload) : this.service.createRate(t.id, payload);
    req$.subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.prSaving.set(false);
        this.rateForm.markAsPristine();
        this.prMode.set('list');
        this.reloadRates();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save the price.');
        this.prSaving.set(false);
      },
    });
  }

  toggleRateActive(r: GolfTransactionTypeRate): void {
    const t = this.prType();
    if (!t) return;
    this.clearMessages();
    const next = !(r.isActive !== false);
    this.prTogglingId.set(r.id);
    this.service.setRateActive(t.id, r.id, next).subscribe({
      next: () => {
        this.prTogglingId.set(null);
        this.reloadRates();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update the price.');
        this.prTogglingId.set(null);
      },
    });
  }

  // Only a price that has not come into force yet may be deleted.
  canDeleteRate(r: GolfTransactionTypeRate): boolean {
    return r.effectiveDate > this.todayStr();
  }

  // Confirm as a VIEW of the open pricing drawer (single-dialog standard).
  deleteRate(r: GolfTransactionTypeRate): void {
    this.clearMessages();
    this.prDeleteTarget.set(r);
    this.prMode.set('delete');
  }

  performDeleteRate(): void {
    const t = this.prType();
    const r = this.prDeleteTarget();
    if (!t || !r) return;
    this.clearMessages();
    this.prMode.set('list');
    this.prDeleteTarget.set(null);
    this.prTogglingId.set(r.id);
    this.service.deleteRate(t.id, r.id).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.prTogglingId.set(null);
        this.reloadRates();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to delete the price.');
        this.prTogglingId.set(null);
      },
    });
  }

  rateStatus(r: GolfTransactionTypeRate): 'in-force' | 'scheduled' | 'superseded' | 'disabled' {
    if (r.isActive === false) return 'disabled';
    if (r.id === this.inForceId()) return 'in-force';
    return r.effectiveDate > this.todayStr() ? 'scheduled' : 'superseded';
  }

  fmt(n: number | null | undefined): string {
    return n === null || n === undefined ? '—' : n.toFixed(2);
  }

  // 'YYYY-MM-DD' of today in the DEVICE's timezone (date-only strings are
  // parsed local app-wide, so the comparison stays consistent).
  private todayStr(): string {
    const d = new Date();
    const p = (x: number) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  clearSearch(): void {
    this.search.set('');
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
