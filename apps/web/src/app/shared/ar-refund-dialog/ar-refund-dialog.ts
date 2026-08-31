import { Component, OnInit, computed, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, debounceTime } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DialogComponent } from '../dialog/dialog';
import { MoneyInputDirective } from '../money-input.directive';
import { ComboboxComponent, ComboOption } from '../combobox/combobox';
import { ArService } from '../../services/ar.service';
import { ArAccountMeta, ArDebtor, ArDocListRow, ArRefundMode } from '../../models/ar.models';
import { ArLedgerDialogDebtor } from '../ar-ledger-dialog/ar-ledger-dialog';
import { AR_RATE_PATTERN, arBaseEquivalent, arRateForDate, arTrimRate } from '../ar-fx';

// The Refund entry dialog (refund slice 2026-08-31), shared by the Debtor
// Account screen (debtor preset) and the standalone Refund screen. Single-
// dialog rule: pick (debtor) -> kind (WHAT is being refunded, the .dlg-pick
// class step) -> entry, all @switch views in one <app-dialog>. The three
// kinds (user requirements):
//   deposit - pay a deposit's held balance back (bank/cash out);
//   credit  - pay back excess payment: unallocated receipt credit (bank out);
//   offset  - apply a deposit's held balance to OUTSTANDING via a Credit Note
//             leg - no money moves, so no payment method (Cash Book untouched).
// Save keeps an editable Open draft; Submit routes through the ar-refund
// approval chain when one is active (refunds move money out), else posts.
interface RefundKindDef {
  key: ArRefundMode;
  label: string;
  icon: string;
  caption: string;
}

const REFUND_KINDS: RefundKindDef[] = [
  {
    key: 'deposit', label: 'Deposit refund', icon: 'account_balance',
    caption: 'pays a deposit’s held balance back to the debtor (money out via bank/cash).',
  },
  {
    key: 'credit', label: 'Excess payment refund', icon: 'undo',
    caption: 'pays back unallocated receipt credit, oldest first (money out via bank/cash).',
  },
  {
    key: 'offset', label: 'Deposit to outstanding', icon: 'swap_horiz',
    caption: 'applies a deposit’s held balance to open items through a Credit Note — no money leaves the bank.',
  },
];

@Component({
  selector: 'app-ar-refund-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DialogComponent, MoneyInputDirective, ComboboxComponent],
  templateUrl: './ar-refund-dialog.html',
  // Same chrome as the ledger dialog (.ald-* pick list / debtor band).
  styleUrls: ['../ar-ledger-dialog/ar-ledger-dialog.css'],
})
export class ArRefundDialogComponent implements OnInit {
  private readonly service = inject(ArService);
  private readonly fb = inject(FormBuilder);

  // Preset debtor (account screen). null = standalone: pick a debtor first.
  readonly debtor = input<ArLedgerDialogDebtor | null>(null);
  // Entry meta provided by the account screen; self-loaded otherwise.
  readonly meta = input<ArAccountMeta | null>(null);
  // Editing an existing Open (draft) refund: prefill + PATCH instead of POST.
  readonly editRow = input<ArDocListRow | null>(null);

  readonly closed = output<void>();
  readonly posted = output<string>();
  readonly failed = output<string>();

  readonly mode = signal<'pick' | 'kind' | 'entry'>('entry');
  readonly refundKind = signal<ArRefundMode | null>(null);
  readonly pickedDebtor = signal<ArLedgerDialogDebtor | null>(null);
  readonly selfMeta = signal<ArAccountMeta | null>(null);
  readonly metaLoading = signal(false);
  readonly saving = signal(false);

  readonly refundKinds = REFUND_KINDS;

  // Debtor picker state (standalone mode).
  readonly pickSearch = signal('');
  readonly pickLoading = signal(false);
  readonly pickRows = signal<ArDebtor[]>([]);
  private readonly pickQuery$ = new Subject<void>();

  readonly activeDebtor = computed(() => this.debtor() || this.pickedDebtor());
  readonly effMeta = computed(() => this.meta() || this.selfMeta());
  // Payment methods = the Refund-class entries of the AR catalog (the Cash
  // Book hook - the deposit/credit kinds move money out).
  readonly methodTypes = computed(() =>
    (this.effMeta()?.transactionTypes || []).filter((t) => t.trxClass === 'refund'));
  readonly methodOptions = computed<ComboOption[]>(() => this.methodTypes().map((tt) => ({
    value: tt.id,
    label: tt.description ? `${tt.transactionType} — ${tt.description}` : tt.transactionType,
  })));
  // Refundable deposits: open, with a HELD balance to draw on.
  readonly refundableDeposits = computed(() =>
    (this.effMeta()?.openDeposits || []).filter((d) => Number(d.heldAmount ?? 0) > 0));
  // The bank-facing kinds carry a payment method; the offset kind never does.
  readonly bankFacing = computed(() => this.refundKind() !== 'offset');
  readonly needsDeposit = computed(() => this.refundKind() === 'deposit' || this.refundKind() === 'offset');
  readonly kindLabel = computed(() => REFUND_KINDS.find((k) => k.key === this.refundKind())?.label || '');
  readonly submitLabel = computed(() => (this.effMeta()?.refundApproval ? 'Submit for Approval' : 'Submit'));

  readonly form = this.fb.nonNullable.group({
    docNo: [''],
    docDate: ['', [Validators.required]],
    trxDate: ['', [Validators.required]],
    transactionTypeId: [''],
    paymentRef: [''],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    collectDepositId: [''],
    description: [''],
    // Multicurrency: the rate at payout on a foreign account.
    exchangeRate: ['', [Validators.pattern(AR_RATE_PATTERN)]],
  });

  // --- Multicurrency - same mechanics as the receipt dialog ---
  readonly fxCurrency = computed(() => this.effMeta()?.currency || null);
  readonly isForeign = computed(() => { const c = this.fxCurrency(); return !!c && !c.isBase && !!c.code; });
  private readonly amountSig = signal<number | null>(0);
  private readonly rateSig = signal('');
  private readonly docDateSig = signal('');
  private readonly rateTouched = signal(false);
  readonly baseEquivalent = computed(() => arBaseEquivalent(this.amountSig(), this.rateSig()));

  constructor() {
    this.pickQuery$.pipe(debounceTime(300), takeUntilDestroyed()).subscribe(() => this.loadPickRows());
    this.form.controls.amount.valueChanges.pipe(takeUntilDestroyed()).subscribe((v) => this.amountSig.set(v));
    this.form.controls.docDate.valueChanges.pipe(takeUntilDestroyed()).subscribe((v) => this.docDateSig.set(v));
    this.form.controls.exchangeRate.valueChanges.pipe(takeUntilDestroyed()).subscribe((v) => {
      this.rateSig.set(v);
      this.rateTouched.set(true);
    });
    effect(() => {
      if (!this.isForeign() || this.rateTouched()) return;
      const r = arRateForDate(this.fxCurrency(), this.docDateSig());
      this.form.controls.exchangeRate.setValue(r, { emitEvent: false });
      this.rateSig.set(r);
    });
  }

  private syncFxSignals(): void {
    this.amountSig.set(this.form.controls.amount.value);
    this.docDateSig.set(this.form.controls.docDate.value);
    this.rateSig.set(this.form.controls.exchangeRate.value);
  }

  // Validators depend on the chosen kind: bank-facing needs a payment method,
  // deposit-drawing kinds need the deposit.
  private applyKindValidators(kind: ArRefundMode): void {
    const txn = this.form.controls.transactionTypeId;
    const dep = this.form.controls.collectDepositId;
    txn.setValidators(kind === 'offset' ? [] : [Validators.required]);
    dep.setValidators(kind === 'credit' ? [] : [Validators.required]);
    if (kind === 'offset') txn.setValue('', { emitEvent: false });
    if (kind === 'credit') dep.setValue('', { emitEvent: false });
    txn.updateValueAndValidity({ emitEvent: false });
    dep.updateValueAndValidity({ emitEvent: false });
  }

  chooseKind(kind: ArRefundMode): void {
    this.refundKind.set(kind);
    this.applyKindValidators(kind);
    this.mode.set('entry');
  }

  // The kind decides the document's meaning - it can change only while the
  // form is untouched (same rule as the class pickers elsewhere).
  changeKind(): void {
    if (this.form.dirty) return;
    this.mode.set('kind');
  }

  ngOnInit(): void {
    const t = this.today();
    const edit = this.editRow();
    if (edit) {
      const kind = (edit.refundMode as ArRefundMode) || (edit.collectDepositId ? 'deposit' : 'credit');
      this.refundKind.set(kind);
      this.applyKindValidators(kind);
      this.form.reset({
        docNo: edit.docNo || '',
        docDate: edit.docDate,
        trxDate: edit.trxDate,
        transactionTypeId: edit.transactionTypeId || '',
        paymentRef: edit.paymentRef || '',
        amount: Number(edit.netAmount),
        collectDepositId: edit.collectDepositId || '',
        description: edit.description || '',
        exchangeRate: arTrimRate(edit.exchangeRate),
      }, { emitEvent: false });
      this.rateTouched.set(!!edit.exchangeRate);
      this.syncFxSignals();
      this.pickedDebtor.set({ id: edit.debtor.id, no: edit.debtor.no, name: edit.debtor.name });
      this.mode.set('entry');
      this.loadMeta(edit.debtor.id);
      return;
    }
    this.form.reset({
      docNo: '', docDate: t, trxDate: t, transactionTypeId: '',
      paymentRef: '', amount: 0, collectDepositId: '',
      description: '', exchangeRate: '',
    }, { emitEvent: false });
    this.rateTouched.set(false);
    this.syncFxSignals();
    const preset = this.debtor();
    if (preset) {
      this.mode.set('kind');
      if (!this.meta()) this.loadMeta(preset.id);
    } else {
      this.mode.set('pick');
      this.loadPickRows();
    }
  }

  private loadMeta(debtorId: string): void {
    this.metaLoading.set(true);
    this.service.accountMeta(debtorId).subscribe({
      next: (m) => { this.selfMeta.set(m); this.metaLoading.set(false); },
      error: (err) => {
        this.metaLoading.set(false);
        this.failed.emit(err.error?.message || 'Failed to load the entry options.');
      },
    });
  }

  private today(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  numberingMode(): string | null {
    return this.effMeta()?.numberingModes?.['ar-refund'] ?? null;
  }

  depositLabel(d: { docNo: string | null; heldAmount?: string | null }): string {
    return `${d.docNo} — held ${Number(d.heldAmount ?? 0).toFixed(2)}`;
  }

  // --- Debtor picker ---

  onPickSearch(value: string): void {
    this.pickSearch.set(value);
    this.pickQuery$.next();
  }

  private loadPickRows(): void {
    this.pickLoading.set(true);
    this.service.debtorOptions(this.pickSearch().trim()).subscribe({
      next: (res) => { this.pickRows.set(res.debtors); this.pickLoading.set(false); },
      error: (err) => {
        this.pickLoading.set(false);
        this.failed.emit(err.error?.message || 'Failed to search debtors.');
      },
    });
  }

  pick(row: ArDebtor): void {
    this.pickedDebtor.set({ id: row.id, no: row.no, name: row.name });
    this.mode.set('kind');
    this.loadMeta(row.id);
  }

  changeDebtor(): void {
    this.pickedDebtor.set(null);
    this.selfMeta.set(null);
    this.mode.set('pick');
    this.loadPickRows();
  }

  // --- Save / Submit ---

  private payload(): Record<string, unknown> {
    const f = this.form.getRawValue();
    const kind = this.refundKind();
    return {
      docNo: f.docNo.trim() || null,
      docDate: f.docDate,
      trxDate: f.trxDate,
      refundMode: kind,
      transactionTypeId: kind === 'offset' ? null : (f.transactionTypeId || null),
      paymentRef: kind === 'offset' ? null : (f.paymentRef.trim() || null),
      amount: f.amount,
      collectDepositId: kind === 'credit' ? null : (f.collectDepositId || null),
      description: f.description.trim() || null,
      ...(this.isForeign() ? { exchangeRate: f.exchangeRate.trim() || null } : {}),
    };
  }

  // A draft saved by a Submit whose submit step then failed - further saves
  // must PATCH it, never create a duplicate.
  private readonly savedDraftId = signal<string | null>(null);

  private saveRequest() {
    const debtor = this.activeDebtor();
    const editId = this.editRow()?.id || this.savedDraftId();
    if (editId) return this.service.updateRefund(editId, this.payload());
    return this.service.createRefund({ ...this.payload(), debtorId: debtor!.id });
  }

  onSave(): void {
    if (!this.activeDebtor() || !this.refundKind()) return;
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.saveRequest().subscribe({
      next: (res) => { this.saving.set(false); this.posted.emit(res.message); },
      error: (err) => {
        this.saving.set(false);
        this.failed.emit(err.error?.message || 'Failed to save the refund.');
      },
    });
  }

  onSubmit(): void {
    if (!this.activeDebtor() || !this.refundKind()) return;
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.saveRequest().subscribe({
      next: (saved) => {
        this.savedDraftId.set(saved.id);
        this.form.markAsPristine(); // the draft is persisted - no discard prompt
        this.service.submitRefund(saved.id).subscribe({
          next: (res) => { this.saving.set(false); this.posted.emit(res.message); },
          error: (err) => {
            this.saving.set(false);
            this.failed.emit(`${err.error?.message || 'Submit failed.'} The refund stays saved as Open.`);
          },
        });
      },
      error: (err) => {
        this.saving.set(false);
        this.failed.emit(err.error?.message || 'Failed to save the refund.');
      },
    });
  }
}
