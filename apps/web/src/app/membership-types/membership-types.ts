import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MembershipTypeService } from '../services/membership-type.service';
import { MembershipStatusService } from '../services/membership-status.service';
import { MembershipFeeService } from '../services/membership-fee.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { CanDirective } from '../shared/can.directive';
import { MoneyInputDirective } from '../shared/money-input.directive';
import { Currency, MembershipType, MembershipStatus, MembershipFee, MembershipStatusOption, TaxSchemeRef, TransactionTypePickerRow } from '../models/auth.models';

// Editable joining-fee row (amounts kept as strings for the inputs). The
// transaction type comes from the Transaction Type master and carries the tax.
interface FeeLineRow {
  transactionType: string;
  description: string;
  currencyCode: string;
  amount: string;
}

// Editable standing-charge row - one per active Membership Status (auto-seeded).
// A row with an empty transaction type means "no standing charge for this status"
// and is not persisted.
interface StandingRow {
  membershipStatusId: string;
  statusLabel: string;      // status value from the master, display only
  statusClassLabel: string; // status class from the master, display only
  description: string;
  chargesControl: string;
  transactionType: string;  // Transaction Type master code (carries the tax)
  transactionDescription: string;
  currencyCode: string;
  amount: string;
  frequency: string;
  fixedMonth: string;       // '1'..'12' when frequency is 'fixed-month'
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Membership Management → Master File Setup → Membership Type (Phase 1: main table).
// Category details + default rights + defaults. `membershipClass` toggles the
// personal-only (child age / play times) and corporate-only (nominee) fields.
// Reactive Forms + the shared dialog unsaved-changes guard (house standard).
@Component({
  selector: 'app-membership-types',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DialogComponent, MoneyInputDirective, CanDirective],
  templateUrl: './membership-types.html',
  styleUrls: ['../system-setup/system-setup.css', './membership-types.css'],
})
export class MembershipTypesComponent implements OnInit {
  private readonly service = inject(MembershipTypeService);
  private readonly statusService = inject(MembershipStatusService);
  private readonly feeService = inject(MembershipFeeService);
  private readonly fb = inject(FormBuilder);

  readonly types = signal<MembershipType[]>([]);
  readonly classes = signal<MembershipStatusOption[]>([]);
  readonly statuses = signal<MembershipStatus[]>([]);
  readonly fees = signal<MembershipFee[]>([]);
  readonly taxSchemes = signal<TaxSchemeRef[]>([]);
  readonly currencies = signal<Currency[]>([]);
  // Transaction Type master (active rows) - the fee/charge pickers, each dialog
  // filtered by the charge types it accepts. Joining fees HIDE membership-fee
  // and absentee-fee (user rule, 2026-07-16 - those items are billed by the
  // Membership Fee master / absentee function, never on joining); standing
  // charges show standing-charges only.
  readonly txTypes = signal<TransactionTypePickerRow[]>([]);
  readonly joiningFeeTxTypes = computed(() =>
    this.txTypes().filter((t) => t.chargeType !== 'membership-fee' && t.chargeType !== 'absentee-fee'));
  readonly standingTxTypes = computed(() =>
    this.txTypes().filter((t) => t.chargeType === 'standing-charges'));
  // Additional-fee lines (Category Details - Fee) - generated/edited in place,
  // saved atomically with the type. Row edits mark the form dirty by hand.
  readonly feeLines = signal<FeeLineRow[]>([]);
  // Standing charges - auto-seeded one row per active Membership Status.
  readonly standingRows = signal<StandingRow[]>([]);
  readonly frequencies = signal<MembershipStatusOption[]>([]);
  readonly monthNames = MONTH_NAMES;
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);

  readonly dialogOpen = signal(false);
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);

  // Joining-fees dialog (A): one-time charges billed when a new member joins
  // under the type. Its own dialog on the listing, separate from the type form.
  readonly feesOpen = signal(false);
  readonly feesSaving = signal(false);
  readonly feesDirty = signal(false);
  readonly feesType = signal<MembershipType | null>(null);

  // Standing-charges dialog (B): per-status recurring charges. Only statuses the
  // club charges get a row filled in.
  readonly chargesOpen = signal(false);
  readonly chargesSaving = signal(false);
  readonly chargesDirty = signal(false);
  readonly chargesType = signal<MembershipType | null>(null);

  readonly form = this.fb.nonNullable.group({
    category: ['', [Validators.required, Validators.maxLength(30)]],
    description: ['', [Validators.maxLength(200)]],
    membershipClass: ['individual', [Validators.required]],
    isGolfAllow: [false],
    dependentGolfingAllow: [false],
    votingRight: [false],
    transferRight: [false],
    isTermMembership: [false],
    termMonths: this.fb.control<number | null>(null, [Validators.min(1)]),
    conversionTargetIds: this.fb.nonNullable.control<string[]>([]),
    defaultMembershipStatusId: [''],
    defaultMembershipFeeId: [''],
    arDebtorType: ['', [Validators.maxLength(50)]],
    creditLimit: this.fb.control<number | null>(null, [Validators.min(0)]),
    // personal-only (enabled by class)
    childAgeFrom: this.fb.control<number | null>({ value: null, disabled: true }, [Validators.min(0)]),
    childAgeTo: this.fb.control<number | null>({ value: null, disabled: true }, [Validators.min(0)]),
    playTimes: this.fb.control<number | null>({ value: null, disabled: true }, [Validators.min(0)]),
    // corporate-only (enabled by class)
    noOfNominee: this.fb.control<number | null>({ value: null, disabled: true }, [Validators.min(0)]),
    nomineeCategoryId: this.fb.control<string>({ value: '', disabled: true }),
  });

  readonly search = signal('');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const sorted = [...this.types()].sort((a, b) => {
      const aActive = a.isActive !== false;
      const bActive = b.isActive !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return a.category.localeCompare(b.category);
    });
    if (!q) return sorted;
    return sorted.filter(
      (t) => t.category.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q),
    );
  });
  readonly activeCount = computed(() => this.types().filter((t) => t.isActive !== false).length);

  readonly dialogTitle = computed(() => (this.editId() ? 'Edit membership type' : 'New membership type'));

  // Other types (exclude the one being edited) — for conversion targets + nominee.
  readonly otherTypes = computed(() => {
    const id = this.editId();
    return this.types().filter((t) => t.id !== id);
  });

  constructor() {
    this.form.controls.membershipClass.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((cls) => this.syncClassControls(cls));
  }

  ngOnInit(): void {
    this.loadMeta();
    this.loadRefs();
    this.load();
  }

  // Enable the fields for the chosen class; reset + disable the other class's.
  // The enable branch does NOT reset, so loaded edit values are preserved.
  private syncClassControls(cls: string): void {
    const c = this.form.controls;
    if (cls === 'individual') {
      c.childAgeFrom.enable({ emitEvent: false });
      c.childAgeTo.enable({ emitEvent: false });
      c.playTimes.enable({ emitEvent: false });
      c.noOfNominee.reset(null, { emitEvent: false });
      c.noOfNominee.disable({ emitEvent: false });
      c.nomineeCategoryId.reset('', { emitEvent: false });
      c.nomineeCategoryId.disable({ emitEvent: false });
    } else {
      c.noOfNominee.enable({ emitEvent: false });
      c.nomineeCategoryId.enable({ emitEvent: false });
      c.childAgeFrom.reset(null, { emitEvent: false });
      c.childAgeFrom.disable({ emitEvent: false });
      c.childAgeTo.reset(null, { emitEvent: false });
      c.childAgeTo.disable({ emitEvent: false });
      c.playTimes.reset(null, { emitEvent: false });
      c.playTimes.disable({ emitEvent: false });
    }
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  isPersonal(): boolean {
    return this.form.controls.membershipClass.value === 'individual';
  }

  // Golf settings (dependent golfing, play times) show only when golfing access is on.
  isGolfAllowed(): boolean {
    return this.form.controls.isGolfAllow.value;
  }

  isTerm(): boolean {
    return this.form.controls.isTermMembership.value;
  }

  classLabel(key: string): string {
    return this.classes().find((c) => c.key === key)?.label || key;
  }
  statusLabel(id: string | null | undefined): string {
    if (!id) return '';
    return this.statuses().find((s) => s.id === id)?.membershipStatus || '';
  }
  feeLabel(id: string | null | undefined): string {
    if (!id) return '';
    return this.fees().find((f) => f.id === id)?.membershipFeeCode || '';
  }
  typeLabel(id: string | null | undefined): string {
    if (!id) return '';
    return this.types().find((t) => t.id === id)?.category || '';
  }
  // The tax a picked transaction type carries (read-only display - tax is
  // single-sourced from the Transaction Type master).
  txTaxLabel(code: string): string {
    if (!code) return '';
    const taxCode = this.txTypes().find((t) => t.transactionType === code)?.taxSchemeCode;
    if (!taxCode) return 'No tax';
    const s = this.taxSchemes().find((x) => x.taxSchemeCode === taxCode);
    return s ? `${s.taxSchemeCode}${s.name ? ' — ' + s.name : ''}` : taxCode;
  }

  loadMeta(): void {
    this.service.meta().subscribe({
      next: (m) => {
        this.classes.set(m.classes);
        this.frequencies.set(m.frequencies || []);
      },
      error: () => {},
    });
  }

  // Seed one standing-charge row per ACTIVE Membership Status, prefilled from the
  // type's persisted charges (statuses with no persisted charge start empty).
  private seedStandingRows(persisted: MembershipType['standingCharges']): void {
    const byStatus = new Map((persisted || []).map((c) => [c.membershipStatusId, c]));
    const defaultCurrency = this.currencies()[0]?.code || '';
    const rows = this.statuses()
      .filter((s) => s.isActive !== false)
      .map((s) => {
        const c = byStatus.get(s.id);
        return {
          membershipStatusId: s.id,
          statusLabel: s.membershipStatus,
          statusClassLabel: s.statusClass,
          description: c?.description || '',
          chargesControl: c?.chargesControl || '',
          transactionType: c?.transactionType || '',
          transactionDescription: c?.transactionDescription || '',
          currencyCode: c?.currencyCode || defaultCurrency,
          amount: c ? String(c.amount) : '0',
          frequency: c?.frequency || '',
          fixedMonth: c?.fixedMonth ? String(c.fixedMonth) : '',
        };
      });
    this.standingRows.set(rows);
  }

  updateStandingRow(index: number, field: keyof StandingRow, value: string): void {
    this.standingRows.update((rows) => rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
    this.chargesDirty.set(true);
  }

  loadRefs(): void {
    this.statusService.list().subscribe({ next: (d) => this.statuses.set(d), error: () => {} });
    this.feeService.list().subscribe({ next: (d) => this.fees.set(d), error: () => {} });
    // OUTPUT-only tax schemes (same source as the Membership Fee screen).
    this.feeService.taxSchemes().subscribe({ next: (r) => this.taxSchemes.set(r.schemes), error: () => {} });
    this.service.currencies().subscribe({ next: (d) => this.currencies.set(d), error: () => {} });
    this.service.transactionTypes().subscribe({ next: (d) => this.txTypes.set(d), error: () => {} });
  }

  load(): void {
    this.loading.set(true);
    this.service.list().subscribe({
      next: (data) => {
        this.types.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load membership types.');
      },
    });
  }

  openAdd(): void {
    this.clearMessages();
    this.editId.set(null);
    this.form.reset({
      category: '',
      description: '',
      membershipClass: 'individual',
      isGolfAllow: false,
      dependentGolfingAllow: false,
      votingRight: false,
      transferRight: false,
      isTermMembership: false,
      termMonths: null,
      conversionTargetIds: [],
      defaultMembershipStatusId: '',
      defaultMembershipFeeId: '',
      arDebtorType: '',
      creditLimit: null,
      childAgeFrom: null,
      childAgeTo: null,
      playTimes: null,
      noOfNominee: null,
      nomineeCategoryId: '',
    });
    this.syncClassControls('individual');
    this.dialogOpen.set(true);
  }

  openEdit(t: MembershipType): void {
    this.clearMessages();
    this.editId.set(t.id);
    this.form.reset({
      category: t.category,
      description: t.description || '',
      membershipClass: t.membershipClass,
      isGolfAllow: !!t.isGolfAllow,
      dependentGolfingAllow: !!t.dependentGolfingAllow,
      votingRight: !!t.votingRight,
      transferRight: !!t.transferRight,
      isTermMembership: !!t.isTermMembership,
      termMonths: t.termMonths ?? null,
      conversionTargetIds: [...(t.conversionTargetIds || [])],
      defaultMembershipStatusId: t.defaultMembershipStatusId || '',
      defaultMembershipFeeId: t.defaultMembershipFeeId || '',
      arDebtorType: t.arDebtorType || '',
      creditLimit: t.creditLimit ?? null,
      childAgeFrom: t.childAgeFrom ?? null,
      childAgeTo: t.childAgeTo ?? null,
      playTimes: t.playTimes ?? null,
      noOfNominee: t.noOfNominee ?? null,
      nomineeCategoryId: t.nomineeCategoryId || '',
    });
    this.syncClassControls(t.membershipClass);
    this.dialogOpen.set(true);
  }

  closeDialog(): void {
    this.dialogOpen.set(false);
  }

  // --- Joining fees dialog (A) ---
  openFees(t: MembershipType): void {
    this.clearMessages();
    this.feesType.set(t);
    this.feeLines.set(
      (t.additionalFees || []).map((f) => ({
        transactionType: f.transactionType,
        description: f.description || '',
        currencyCode: f.currencyCode,
        amount: String(f.amount),
      })),
    );
    this.feesDirty.set(false);
    this.feesOpen.set(true);
  }

  closeFees(): void {
    this.feesOpen.set(false);
    this.feesType.set(null);
  }

  saveFees(): void {
    this.clearMessages();
    const type = this.feesType();
    if (!type) return;

    // Client-side check of the fee lines (server re-validates).
    for (const [i, row] of this.feeLines().entries()) {
      if (!row.transactionType.trim()) {
        this.errorMessage.set(`Joining fee #${i + 1}: transaction type is required.`);
        return;
      }
      if (!row.currencyCode) {
        this.errorMessage.set(`Joining fee #${i + 1}: pick a currency.`);
        return;
      }
      const amt = Number(row.amount);
      if (!Number.isFinite(amt) || amt < 0) {
        this.errorMessage.set(`Joining fee #${i + 1}: amount must be a non-negative number.`);
        return;
      }
    }

    this.feesSaving.set(true);
    this.service.updateAdditionalFees(type.id, this.feeLines().map((r) => ({
      transactionType: r.transactionType.trim(),
      description: r.description.trim() || null,
      currencyCode: r.currencyCode,
      amount: Number(r.amount) || 0,
    }))).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.feesSaving.set(false);
        this.closeFees();
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save joining fees.');
        this.feesSaving.set(false);
      },
    });
  }

  addFeeLine(): void {
    const defaultCurrency = this.currencies()[0]?.code || '';
    this.feeLines.update((rows) => [
      ...rows,
      { transactionType: '', description: '', currencyCode: defaultCurrency, amount: '0' },
    ]);
    this.feesDirty.set(true);
  }

  removeFeeLine(index: number): void {
    this.feeLines.update((rows) => rows.filter((_, i) => i !== index));
    this.feesDirty.set(true);
  }

  updateFeeLine(index: number, field: keyof FeeLineRow, value: string): void {
    this.feeLines.update((rows) => rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
    this.feesDirty.set(true);
  }

  // --- Standing charges dialog (B) ---
  openCharges(t: MembershipType): void {
    this.clearMessages();
    this.chargesType.set(t);
    this.seedStandingRows(t.standingCharges || []);
    this.chargesDirty.set(false);
    this.chargesOpen.set(true);
  }

  closeCharges(): void {
    this.chargesOpen.set(false);
    this.chargesType.set(null);
  }

  saveCharges(): void {
    this.clearMessages();
    const type = this.chargesType();
    if (!type) return;

    // Only rows with a transaction type are persisted (an empty row = no
    // standing charge for that status). Validate the configured ones.
    const configuredCharges = this.standingRows().filter((r) => r.transactionType.trim());
    for (const row of configuredCharges) {
      const label = row.statusLabel;
      if (!row.currencyCode) {
        this.errorMessage.set(`Standing charge for '${label}': pick a currency.`);
        return;
      }
      const amt = Number(row.amount);
      if (!Number.isFinite(amt) || amt < 0) {
        this.errorMessage.set(`Standing charge for '${label}': amount must be a non-negative number.`);
        return;
      }
      if (!row.frequency) {
        this.errorMessage.set(`Standing charge for '${label}': select a frequency.`);
        return;
      }
      if (row.frequency === 'fixed-month' && !row.fixedMonth) {
        this.errorMessage.set(`Standing charge for '${label}': pick the month for a Fixed Month charge.`);
        return;
      }
    }

    this.chargesSaving.set(true);
    this.service.updateStandingCharges(type.id, configuredCharges.map((r) => ({
      membershipStatusId: r.membershipStatusId,
      description: r.description.trim() || null,
      chargesControl: r.chargesControl.trim() || null,
      transactionType: r.transactionType.trim(),
      transactionDescription: r.transactionDescription.trim() || null,
      currencyCode: r.currencyCode,
      amount: Number(r.amount) || 0,
      frequency: r.frequency,
      fixedMonth: r.frequency === 'fixed-month' ? Number(r.fixedMonth) : null,
    }))).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.chargesSaving.set(false);
        this.closeCharges();
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save standing charges.');
        this.chargesSaving.set(false);
      },
    });
  }

  toggleConversion(id: string): void {
    const ctrl = this.form.controls.conversionTargetIds;
    const cur = ctrl.value;
    ctrl.setValue(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
    ctrl.markAsDirty();
  }

  isConversionSelected(id: string): boolean {
    return this.form.controls.conversionTargetIds.value.includes(id);
  }

  onSave(): void {
    this.clearMessages();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const personal = v.membershipClass === 'individual';

    // A term membership needs its period (server re-validates).
    if (v.isTermMembership && (!v.termMonths || v.termMonths < 1)) {
      this.errorMessage.set('A term membership needs its period in months (at least 1).');
      this.form.controls.termMonths.markAsTouched();
      return;
    }

    // Joining fees / standing charges are maintained from their own dialogs on
    // the listing - the type form saves only the type row.
    const payload: Partial<MembershipType> = {
      category: v.category.trim(),
      description: v.description.trim() || null,
      membershipClass: v.membershipClass,
      isGolfAllow: v.isGolfAllow,
      dependentGolfingAllow: v.isGolfAllow ? v.dependentGolfingAllow : false,
      votingRight: v.votingRight,
      transferRight: v.transferRight,
      isTermMembership: v.isTermMembership,
      termMonths: v.isTermMembership ? v.termMonths ?? null : null,
      conversionTargetIds: v.conversionTargetIds,
      defaultMembershipStatusId: v.defaultMembershipStatusId || null,
      defaultMembershipFeeId: v.defaultMembershipFeeId || null,
      arDebtorType: v.arDebtorType.trim() || null,
      creditLimit: v.creditLimit ?? null,
      childAgeFrom: personal ? v.childAgeFrom ?? null : null,
      childAgeTo: personal ? v.childAgeTo ?? null : null,
      playTimes: personal && v.isGolfAllow ? v.playTimes ?? null : null,
      noOfNominee: personal ? null : v.noOfNominee ?? null,
      nomineeCategoryId: personal ? null : v.nomineeCategoryId || null,
    };

    this.saving.set(true);
    const id = this.editId();
    const req$ = id ? this.service.update(id, payload) : this.service.create(payload);
    req$.subscribe({
      next: () => {
        this.successMessage.set(`${payload.category} ${id ? 'updated' : 'added'}.`);
        this.saving.set(false);
        this.dialogOpen.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save membership type.');
        this.saving.set(false);
      },
    });
  }

  toggleActive(t: MembershipType): void {
    this.clearMessages();
    const next = !(t.isActive !== false);
    this.togglingId.set(t.id);
    this.service.setActive(t.id, next).subscribe({
      next: () => {
        this.successMessage.set(`${t.category} ${next ? 'enabled' : 'disabled'}.`);
        this.togglingId.set(null);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update membership type.');
        this.togglingId.set(null);
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
