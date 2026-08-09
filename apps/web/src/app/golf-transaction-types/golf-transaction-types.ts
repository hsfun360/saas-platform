import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { GolfTransactionTypeService } from '../services/golf-transaction-type.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { CanDirective } from '../shared/can.directive';
import { GolfTransactionType, GolfTransactionTypeRate, MembershipStatusOption, TaxSchemeRef } from '../models/auth.models';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { OverflowMenuComponent, MenuItemDirective } from '../shared/overflow-menu/overflow-menu';
import { MoneyInputDirective } from '../shared/money-input.directive';
import { LocalDatePipe } from '../shared/local-date.pipe';

// The eight matrix cells - member vs guest/visitor × 9/18 holes × weekday vs
// weekend (public holidays count as weekend platform-wide).
const MATRIX_CELLS = [
  'member9Weekday', 'member18Weekday', 'member9Weekend', 'member18Weekend',
  'visitor9Weekday', 'visitor18Weekday', 'visitor9Weekend', 'visitor18Weekend',
] as const;

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
    CanDirective, OverflowMenuComponent, MenuItemDirective, MoneyInputDirective, LocalDatePipe],
  templateUrl: './golf-transaction-types.html',
  // membership-types.css supplies the shared .mt-chip pill; own css = pricing grid.
  styleUrls: ['../system-setup/system-setup.css', '../membership-types/membership-types.css', './golf-transaction-types.css'],
})
export class GolfTransactionTypesComponent implements OnInit {
  private readonly service = inject(GolfTransactionTypeService);
  private readonly fb = inject(FormBuilder);

  readonly rows = signal<GolfTransactionType[]>([]);
  readonly chargeTypes = signal<MembershipStatusOption[]>([]);
  readonly matrixKeys = signal<string[]>(['green-fee', 'caddy-fee', 'buggy-fee']);
  readonly taxSchemes = signal<TaxSchemeRef[]>([]);
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);

  readonly dialogOpen = signal(false);
  readonly saving = signal(false);
  readonly uploading = signal(false);
  readonly editId = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    transactionType: ['', [Validators.required, Validators.maxLength(50)]],
    chargeType: ['', [Validators.required]],
    description: ['', [Validators.maxLength(255)]],
    taxSchemeCode: [''],
    allowPriceOverride: [false],
    iconUrl: [''],
  });

  // ---- Pricing dialog (single instance, 'list' ↔ 'form' views) ----
  readonly prOpen = signal(false);
  readonly prMode = signal<'list' | 'form'>('list');
  readonly prType = signal<GolfTransactionType | null>(null);
  readonly prRates = signal<GolfTransactionTypeRate[]>([]);
  readonly prLoading = signal(false);
  readonly prSaving = signal(false);
  readonly prTogglingId = signal<string | null>(null);
  readonly prEditId = signal<string | null>(null);

  readonly rateForm = this.fb.nonNullable.group({
    effectiveDate: ['', [Validators.required]],
    member9Weekday: [0, [Validators.required, Validators.min(0)]],
    member18Weekday: [0, [Validators.required, Validators.min(0)]],
    member9Weekend: [0, [Validators.required, Validators.min(0)]],
    member18Weekend: [0, [Validators.required, Validators.min(0)]],
    visitor9Weekday: [0, [Validators.required, Validators.min(0)]],
    visitor18Weekday: [0, [Validators.required, Validators.min(0)]],
    visitor9Weekend: [0, [Validators.required, Validators.min(0)]],
    visitor18Weekend: [0, [Validators.required, Validators.min(0)]],
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
    return `Pricing — ${code}`;
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
      },
      error: () => {},
    });
    this.service.taxSchemes().subscribe({ next: (r) => this.taxSchemes.set(r.schemes), error: () => {} });
    this.load();
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  chargeTypeLabel(key: string): string {
    return this.chargeTypes().find((c) => c.key === key)?.label || key;
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
    this.form.reset({ transactionType: '', chargeType: '', description: '', taxSchemeCode: '', allowPriceOverride: false, iconUrl: '' });
    this.dialogOpen.set(true);
  }

  openEdit(t: GolfTransactionType): void {
    this.clearMessages();
    this.editId.set(t.id);
    this.form.reset({
      transactionType: t.transactionType,
      chargeType: t.chargeType,
      description: t.description || '',
      taxSchemeCode: t.taxSchemeCode || '',
      allowPriceOverride: t.allowPriceOverride === true,
      iconUrl: t.iconUrl || '',
    });
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
    const payload = {
      transactionType: v.transactionType.trim(),
      chargeType: v.chargeType,
      description: v.description.trim() || null,
      taxSchemeCode: v.taxSchemeCode || null,
      allowPriceOverride: v.allowPriceOverride,
      iconUrl: v.iconUrl || null,
    };

    this.saving.set(true);
    const id = this.editId();
    const req$ = id ? this.service.update(id, payload) : this.service.create(payload);
    req$.subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.saving.set(false);
        this.dialogOpen.set(false);
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
      member9Weekday: r?.member9Weekday ?? 0,
      member18Weekday: r?.member18Weekday ?? 0,
      member9Weekend: r?.member9Weekend ?? 0,
      member18Weekend: r?.member18Weekend ?? 0,
      visitor9Weekday: r?.visitor9Weekday ?? 0,
      visitor18Weekday: r?.visitor18Weekday ?? 0,
      visitor9Weekend: r?.visitor9Weekend ?? 0,
      visitor18Weekend: r?.visitor18Weekend ?? 0,
      flatAmount: r?.flatAmount ?? 0,
    });
    this.prMode.set('form');
  }

  // Convenience: same prices on weekend/public holiday as on weekday.
  copyWeekdayToWeekend(): void {
    const v = this.rateForm.getRawValue();
    this.rateForm.patchValue({
      member9Weekend: v.member9Weekday,
      member18Weekend: v.member18Weekday,
      visitor9Weekend: v.visitor9Weekday,
      visitor18Weekend: v.visitor18Weekday,
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

  deleteRate(r: GolfTransactionTypeRate): void {
    const t = this.prType();
    if (!t) return;
    this.clearMessages();
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
