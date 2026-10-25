import { Component, Injector, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  FacilityRateCell,
  FacilityTransactionType,
  FacilityTransactionTypeMeta,
  FacilityTransactionTypePayload,
  FacilityTransactionTypeRate,
  FacilityTransactionTypeService,
} from '../services/facility-transaction-type.service';
import { ScrollReturnService } from '../services/scroll-return.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { ConfirmDialogComponent, ConfirmRequest } from '../shared/confirm-dialog/confirm-dialog';
import { CanDirective } from '../shared/can.directive';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { FieldInfoComponent } from '../shared/field-info/field-info';
import { ComboboxComponent } from '../shared/combobox/combobox';
import { MoneyInputDirective } from '../shared/money-input.directive';
import { OverflowMenuComponent } from '../shared/overflow-menu/overflow-menu';
import { MenuItemDirective } from '../shared/overflow-menu/menu-item.directive';
import { LocalDatePipe, formatLocalDate, localDateOnly } from '../shared/local-date.pipe';
import { MoneyPipe } from '../shared/money.pipe';
import { TaxSchemeRef } from '../models/auth.models';

// One price cell row in the rate-card editor (house standard: typed FormArray
// rows; the array's dirty state feeds the dialog's guard).
type CellGroup = FormGroup<{
  participantType: FormControl<string>;
  dayScope: FormControl<string>;
  sessionId: FormControl<string>;
  amount: FormControl<number | null>;
}>;

// Facility Management → Transaction Types (/facility/transaction-types;
// structure approved 2026-10-25). The billing-item catalog: code + charge
// type + fee basis (per slot / per participant / per booking) + the facility
// type it belongs to + the participant category it is the auto-charged
// default for + THE tax scheme + price override + icon; and each item's
// PRICING - effective-dated cards whose matrix is participant x day scope x
// session cells (facility and guest fees) or one flat amount. ONE drawer
// with three views (item form / card list / card form).
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-facility-transaction-types',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent, ConfirmDialogComponent,
    CanDirective, FieldInfoComponent, ComboboxComponent, MoneyInputDirective, OverflowMenuComponent, MenuItemDirective, LocalDatePipe, MoneyPipe],
  templateUrl: './facility-transaction-types.html',
  styleUrls: ['../membership-types/membership-types.css', './facility-transaction-types.css'],
})
export class FacilityTransactionTypesComponent implements OnInit {
  private readonly service = inject(FacilityTransactionTypeService);
  private readonly fb = inject(FormBuilder);
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private static readonly LIST_PATH = '/facility/transaction-types';

  readonly rows = signal<FacilityTransactionType[]>([]);
  readonly meta = signal<FacilityTransactionTypeMeta | null>(null);
  readonly taxSchemes = signal<TaxSchemeRef[]>([]);
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);
  readonly uploading = signal(false);
  readonly confirmAction = signal<ConfirmRequest | null>(null);

  readonly search = signal('');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly hint = {
    chargeType: 'Facility fee: the hire of a slot (court, hall). Guest fee: charged per guest participant. Issue fee: a locker or towel charge at the station. Class fee, no-show and miscellaneous price by one flat amount. Packages and deposits arrive in a later slice.',
    feeBasis: 'How many lines the item puts on a bill: per slot (one per reserved slot), per participant (one per matching participant) or per booking (one line).',
    defaultFor: 'Marks this item as the one auto-charged for that participant category when a bill opens - at most one active default per facility type and category. Leave blank for a manual item picked from the tiles.',
    facilityType: 'Ties the fee to one facility type; its rate cards then price that type only. Blank = usable on any type.',
    cells: 'One row per price: a participant type, the day scope it applies to and optionally a session band. At billing the most specific row wins - an exact session over any session, an exact day scope over all days. A participant with no matching row cannot be billed this item, so cover every category you serve.',
  };

  readonly chargeTypes = computed(() => (this.meta()?.chargeTypes || []).filter((c) => !(this.meta()?.reservedChargeTypes || []).includes(c.key)));
  readonly feeBases = computed(() => this.meta()?.feeBases || []);
  readonly facilityTypes = computed(() => this.meta()?.facilityTypes || []);
  readonly participantTypes = computed(() => this.meta()?.participantTypes || []);
  readonly sessions = computed(() => this.meta()?.sessions || []);
  readonly dayScopes = computed(() => this.meta()?.dayScopes || [{ key: 'all', label: 'All days' }, { key: 'weekday', label: 'Weekdays' }, { key: 'weekend', label: 'Weekends' }]);
  readonly taxOptions = computed(() => this.taxSchemes().map((s) => ({ value: s.taxSchemeCode, label: `${s.taxSchemeCode} - ${s.name}` })));

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const sorted = [...this.rows()].sort((a, b) => {
      const aActive = a.isActive !== false;
      const bActive = b.isActive !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return a.transactionType.localeCompare(b.transactionType);
    });
    if (!q) return sorted;
    return sorted.filter((t) => t.transactionType.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q)
      || this.chargeLabel(t.chargeType).toLowerCase().includes(q) || this.facilityTypeLabel(t.facilityTypeId).toLowerCase().includes(q));
  });
  readonly activeCount = computed(() => this.rows().filter((t) => t.isActive !== false).length);

  // --- The ONE drawer: item form / card list / card form ---
  readonly dlgMode = signal<'form' | 'rates' | 'rateForm' | null>(null);
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);
  readonly editRow = signal<FacilityTransactionType | null>(null);

  readonly form = this.fb.nonNullable.group({
    transactionType: ['', [Validators.required, Validators.maxLength(50)]],
    chargeType: ['facility-fee', [Validators.required]],
    feeBasis: ['per-slot', [Validators.required]],
    facilityTypeId: [''],
    description: ['', [Validators.maxLength(255)]],
    participantType: [''],
    taxSchemeCode: [''],
    allowPriceOverride: [false],
    iconUrl: [''],
  });

  readonly rateType = signal<FacilityTransactionType | null>(null);
  readonly rates = signal<FacilityTransactionTypeRate[]>([]);
  readonly ratesLoading = signal(false);
  readonly rateTogglingId = signal<string | null>(null);
  readonly rateSaving = signal(false);
  readonly editRateId = signal<string | null>(null);
  readonly rateForm = this.fb.nonNullable.group({
    effectiveDate: ['', [Validators.required]],
    flatAmount: this.fb.control<number | null>(null),
  });
  readonly cells: FormArray<CellGroup> = this.fb.array<CellGroup>([]);
  readonly cellsForm = this.fb.group({ cells: this.cells });

  readonly dialogTitle = computed(() => {
    const mode = this.dlgMode();
    const code = this.rateType()?.transactionType || '';
    if (mode === 'rates') return `Pricing - ${code}`;
    if (mode === 'rateForm') return this.editRateId() ? `Edit price - ${code}` : `New price - ${code}`;
    return this.editId() ? 'Edit transaction type' : 'New transaction type';
  });
  readonly busy = computed(() => this.saving() || this.ratesLoading() || this.rateSaving() || this.uploading());

  isDirty(): boolean {
    switch (this.dlgMode()) {
      case 'form': return this.form.dirty;
      case 'rateForm': return this.rateForm.dirty || this.cells.dirty;
      default: return false;
    }
  }

  ngOnInit(): void {
    this.service.meta().subscribe({ next: (m) => this.meta.set(m), error: () => undefined });
    this.service.taxSchemes().subscribe({ next: (r) => this.taxSchemes.set(r.schemes), error: () => undefined });
    this.load();
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  chargeLabel(key: string): string {
    return this.meta()?.chargeTypes.find((c) => c.key === key)?.label || key;
  }
  feeBasisLabel(key: string): string {
    return this.feeBases().find((f) => f.key === key)?.label || key;
  }
  facilityTypeLabel(id: string | null): string {
    if (!id) return '';
    const t = this.facilityTypes().find((x) => x.id === id);
    return t ? t.code : '';
  }
  participantLabel(code: string | null): string {
    if (!code) return '';
    return this.participantTypes().find((p) => p.key === code)?.label || code;
  }
  sessionLabel(id: string | null): string {
    if (!id) return 'Any session';
    const s = this.sessions().find((x) => x.id === id);
    return s ? s.name : 'Session';
  }
  scopeLabel(key: string): string {
    return this.dayScopes().find((s) => s.key === key)?.label || key;
  }

  // The form's charge type decides which fields apply (show the expected result).
  isMatrixCharge(chargeType = this.form.controls.chargeType.value): boolean {
    return (this.meta()?.matrixChargeTypes || ['facility-fee', 'guest-fee']).includes(chargeType);
  }
  takesDefault(): boolean {
    return (this.meta()?.defaultTypedChargeTypes || ['facility-fee', 'guest-fee']).includes(this.form.controls.chargeType.value);
  }

  // Picking a charge type seeds the fee basis a club almost always wants.
  onChargeTypeChange(): void {
    const ct = this.form.controls.chargeType.value;
    const basis = ct === 'guest-fee' ? 'per-participant' : ct === 'facility-fee' ? 'per-slot' : ct === 'no-show' ? 'per-booking' : this.form.controls.feeBasis.value;
    this.form.controls.feeBasis.setValue(basis);
    if (!this.takesDefault()) this.form.controls.participantType.setValue('');
  }

  load(): void {
    this.loading.set(true);
    this.service.list().subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
        this.returnScroll.consume(FacilityTransactionTypesComponent.LIST_PATH, this.injector);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load transaction types.');
      },
    });
  }

  // --- Item form ---

  openAdd(): void {
    this.clearMessages();
    this.editId.set(null);
    this.editRow.set(null);
    this.form.reset({ transactionType: '', chargeType: 'facility-fee', feeBasis: 'per-slot', facilityTypeId: '', description: '', participantType: '', taxSchemeCode: '', allowPriceOverride: false, iconUrl: '' });
    this.form.controls.chargeType.enable();
    this.dlgMode.set('form');
  }

  openEdit(t: FacilityTransactionType): void {
    this.clearMessages();
    this.editId.set(t.id);
    this.editRow.set(t);
    this.form.reset({
      transactionType: t.transactionType, chargeType: t.chargeType, feeBasis: t.feeBasis, facilityTypeId: t.facilityTypeId || '',
      description: t.description || '', participantType: t.participantType || '', taxSchemeCode: t.taxSchemeCode || '',
      allowPriceOverride: t.allowPriceOverride === true, iconUrl: t.iconUrl || '',
    });
    // The charge type is frozen once a price card exists (the cards' shape follows it).
    if (t.rateCount > 0) this.form.controls.chargeType.disable();
    else this.form.controls.chargeType.enable();
    this.dlgMode.set('form');
  }

  chargeFrozen(): boolean {
    return this.form.controls.chargeType.disabled;
  }

  closeDialog(): void {
    this.dlgMode.set(null);
    this.rateType.set(null);
    this.cells.clear();
    this.cells.markAsPristine();
  }

  onIconSelected(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.clearMessages();
    this.uploading.set(true);
    this.service.uploadIcon(file).subscribe({
      next: (res) => {
        this.form.controls.iconUrl.setValue(res.url);
        this.form.controls.iconUrl.markAsDirty();
        this.uploading.set(false);
      },
      error: (err) => {
        this.uploading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to upload the icon.');
      },
    });
  }

  removeIcon(): void {
    this.form.controls.iconUrl.setValue('');
    this.form.controls.iconUrl.markAsDirty();
  }

  onSave(): void {
    this.clearMessages();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const payload: FacilityTransactionTypePayload = {
      transactionType: v.transactionType.trim().toUpperCase(),
      chargeType: v.chargeType,
      feeBasis: v.feeBasis as FacilityTransactionTypePayload['feeBasis'],
      facilityTypeId: v.facilityTypeId || null,
      description: v.description.trim() || null,
      participantType: this.takesDefault() ? v.participantType || null : null,
      taxSchemeCode: v.taxSchemeCode || null,
      allowPriceOverride: v.allowPriceOverride === true,
      iconUrl: v.iconUrl || null,
    };
    this.saving.set(true);
    const id = this.editId();
    const req$ = id ? this.service.update(id, payload) : this.service.create(payload);
    req$.subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.saving.set(false);
        this.form.markAsPristine();
        this.closeDialog();
        this.returnScroll.remember(FacilityTransactionTypesComponent.LIST_PATH, res.transactionType.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save the transaction type.');
        this.saving.set(false);
      },
    });
  }

  toggleActive(t: FacilityTransactionType): void {
    this.clearMessages();
    const next = !(t.isActive !== false);
    this.togglingId.set(t.id);
    this.service.setActive(t.id, next).subscribe({
      next: () => {
        this.successMessage.set(`${t.transactionType} ${next ? 'enabled' : 'disabled'}.`);
        this.togglingId.set(null);
        this.returnScroll.remember(FacilityTransactionTypesComponent.LIST_PATH, t.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update the transaction type.');
        this.togglingId.set(null);
      },
    });
  }

  // --- Pricing ---

  openRates(t: FacilityTransactionType): void {
    this.clearMessages();
    this.rateType.set(t);
    this.rates.set([]);
    this.dlgMode.set('rates');
    this.reloadRates();
  }

  private reloadRates(): void {
    const t = this.rateType();
    if (!t) return;
    this.ratesLoading.set(true);
    this.service.rates(t.id).subscribe({
      next: (rates) => {
        this.rates.set(rates);
        this.ratesLoading.set(false);
      },
      error: (err) => {
        this.ratesLoading.set(false);
        this.closeDialog();
        this.errorMessage.set(err.error?.message || 'Failed to load the price cards.');
      },
    });
  }

  backToRates(): void {
    this.dlgMode.set('rates');
    this.rateForm.markAsPristine();
    this.cells.clear();
    this.cells.markAsPristine();
  }

  rateIsMatrix(): boolean {
    const t = this.rateType();
    return !!t && this.isMatrixCharge(t.chargeType);
  }

  rateInForce(r: FacilityTransactionTypeRate): boolean {
    return String(r.effectiveDate) <= localDateOnly();
  }

  // Rate card summary for the list: cell count or the flat amount.
  rateSummary(r: FacilityTransactionTypeRate): string {
    if (this.rateIsMatrix()) return `${r.cells.length} price${r.cells.length === 1 ? '' : 's'}`;
    return r.flatAmount === null ? 'No amount' : `${Number(r.flatAmount).toFixed(2)} flat`;
  }

  private newCell(c: FacilityRateCell): CellGroup {
    return this.fb.nonNullable.group({
      participantType: [c.participantType, [Validators.required]],
      dayScope: [c.dayScope || 'all'],
      sessionId: [c.sessionId || ''],
      amount: this.fb.control<number | null>(c.amount ?? null, [Validators.required, Validators.min(0)]),
    });
  }

  private setCells(rows: FacilityRateCell[], dirty: boolean): void {
    this.cells.clear();
    for (const r of rows) this.cells.push(this.newCell(r));
    if (dirty) this.cells.markAsDirty();
    else this.cells.markAsPristine();
  }

  openRateForm(r?: FacilityTransactionTypeRate): void {
    this.clearMessages();
    this.editRateId.set(r?.id || null);
    this.rateForm.reset({ effectiveDate: r?.effectiveDate || '', flatAmount: r?.flatAmount ?? null });
    if (this.rateIsMatrix()) {
      if (r) this.setCells(r.cells, false);
      else this.seedCells();
    } else {
      this.setCells([], false);
    }
    this.dlgMode.set('rateForm');
  }

  // One row per active participant type, all days, any session - the usual
  // starting point; the club adds weekend or session rows where prices differ.
  seedCells(): void {
    const seeded = this.participantTypes().map((p) => ({ participantType: p.key, dayScope: 'all', sessionId: null, amount: 0 }));
    this.setCells(seeded, true);
  }

  addCell(): void {
    this.cells.push(this.newCell({ participantType: this.participantTypes()[0]?.key || '', dayScope: 'all', sessionId: null, amount: 0 }));
    this.cells.markAsDirty();
  }

  removeCell(index: number): void {
    this.cells.removeAt(index);
    this.cells.markAsDirty();
  }

  onSaveRate(): void {
    this.clearMessages();
    const t = this.rateType();
    if (!t) return;
    if (this.rateForm.invalid) {
      this.rateForm.markAllAsTouched();
      return;
    }
    const f = this.rateForm.getRawValue();
    let payload: { effectiveDate: string; flatAmount?: number | null; cells?: FacilityRateCell[] };
    if (this.rateIsMatrix()) {
      if (this.cells.length === 0) {
        this.errorMessage.set('Add at least one price row.');
        return;
      }
      const seen = new Set<string>();
      const cells: FacilityRateCell[] = [];
      for (const g of this.cells.controls) {
        const c = g.getRawValue();
        if (!c.participantType) {
          this.errorMessage.set('Every price row needs a participant type.');
          return;
        }
        const amount = Number(c.amount);
        if (!Number.isFinite(amount) || amount < 0) {
          this.errorMessage.set(`Price for ${this.participantLabel(c.participantType)} must be 0.00 or more.`);
          return;
        }
        const key = `${c.participantType}|${c.dayScope}|${c.sessionId || '*'}`;
        if (seen.has(key)) {
          this.errorMessage.set(`Duplicate price row for ${this.participantLabel(c.participantType)} (${this.scopeLabel(c.dayScope)}, ${this.sessionLabel(c.sessionId || null)}).`);
          return;
        }
        seen.add(key);
        cells.push({ participantType: c.participantType, dayScope: c.dayScope, sessionId: c.sessionId || null, amount: Math.round(amount * 100) / 100 });
      }
      payload = { effectiveDate: f.effectiveDate, cells };
    } else {
      const amount = Number(f.flatAmount);
      if (!Number.isFinite(amount) || amount < 0) {
        this.errorMessage.set('The amount must be 0.00 or more.');
        return;
      }
      payload = { effectiveDate: f.effectiveDate, flatAmount: Math.round(amount * 100) / 100 };
    }
    this.rateSaving.set(true);
    const id = this.editRateId();
    const req$ = id ? this.service.updateRate(t.id, id, payload) : this.service.createRate(t.id, payload);
    req$.subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.rateSaving.set(false);
        this.rateForm.markAsPristine();
        this.backToRates();
        this.reloadRates();
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save the price.');
        this.rateSaving.set(false);
      },
    });
  }

  toggleRateActive(r: FacilityTransactionTypeRate): void {
    const t = this.rateType();
    if (!t) return;
    this.clearMessages();
    const next = !(r.isActive !== false);
    this.rateTogglingId.set(r.id);
    this.service.setRateActive(t.id, r.id, next).subscribe({
      next: () => {
        this.successMessage.set(`Price effective ${formatLocalDate(r.effectiveDate)} ${next ? 'enabled' : 'disabled'}.`);
        this.rateTogglingId.set(null);
        this.reloadRates();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update the price.');
        this.rateTogglingId.set(null);
      },
    });
  }

  askDeleteRate(r: FacilityTransactionTypeRate): void {
    const t = this.rateType();
    if (!t) return;
    this.clearMessages();
    this.confirmAction.set({
      title: 'Delete price',
      message: `Delete the price effective ${formatLocalDate(r.effectiveDate)}? Only a future-dated price can be deleted; one already in force is history and is disabled instead.`,
      confirmLabel: 'Delete price',
      run: () => {
        this.confirmAction.set(null);
        this.rateTogglingId.set(r.id);
        this.service.deleteRate(t.id, r.id).subscribe({
          next: (res) => {
            this.rateTogglingId.set(null);
            this.successMessage.set(res.message);
            this.reloadRates();
            this.load();
          },
          error: (err) => {
            this.rateTogglingId.set(null);
            this.errorMessage.set(err.error?.message || 'Failed to delete the price.');
          },
        });
      },
    });
  }

  clearSearch(): void {
    this.search.set('');
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
