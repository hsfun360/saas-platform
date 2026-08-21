import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, debounceTime } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DialogComponent } from '../dialog/dialog';
import { MoneyInputDirective } from '../money-input.directive';
import { ArService } from '../../services/ar.service';
import { ArAccountMeta, ArDebtor, ArDocListRow } from '../../models/ar.models';
import { ArLedgerDialogDebtor } from '../ar-ledger-dialog/ar-ledger-dialog';

// The Official Receipt entry dialog (receipt lifecycle 2026-08-20), shared by
// the Debtor Account screen (debtor preset) and the standalone Receipt screen
// (debtor picker step first - single-dialog rule: pick/entry are @switch
// views in one <app-dialog>). Save keeps an editable Open draft; Submit posts
// DIRECTLY - collections carry no approval chain (user rule; Refunds will).
// Payment method = a Receipt-class Transaction Type; the optional deposit
// collection is stored on the draft and resolved at posting, after which the
// remainder auto-allocates FIFO across open items (receipt behaviour).
@Component({
  selector: 'app-ar-receipt-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DialogComponent, MoneyInputDirective],
  templateUrl: './ar-receipt-dialog.html',
  // Same chrome as the ledger dialog (.ald-* pick list / debtor band).
  styleUrls: ['../ar-ledger-dialog/ar-ledger-dialog.css'],
})
export class ArReceiptDialogComponent implements OnInit {
  private readonly service = inject(ArService);
  private readonly fb = inject(FormBuilder);

  // Preset debtor (account screen). null = standalone: pick a debtor first.
  readonly debtor = input<ArLedgerDialogDebtor | null>(null);
  // Entry meta provided by the account screen; self-loaded otherwise.
  readonly meta = input<ArAccountMeta | null>(null);
  // "Collect" on a deposit row: pre-select that deposit for collection.
  readonly presetDepositId = input<string | null>(null);
  // Editing an existing Open (draft) receipt: prefill + PATCH instead of POST.
  readonly editRow = input<ArDocListRow | null>(null);

  readonly closed = output<void>();
  readonly posted = output<string>();
  readonly failed = output<string>();

  readonly mode = signal<'pick' | 'entry'>('entry');
  readonly pickedDebtor = signal<ArLedgerDialogDebtor | null>(null);
  readonly selfMeta = signal<ArAccountMeta | null>(null);
  readonly metaLoading = signal(false);
  readonly saving = signal(false);

  // Debtor picker state (standalone mode).
  readonly pickSearch = signal('');
  readonly pickLoading = signal(false);
  readonly pickRows = signal<ArDebtor[]>([]);
  private readonly pickQuery$ = new Subject<void>();

  readonly activeDebtor = computed(() => this.debtor() || this.pickedDebtor());
  readonly effMeta = computed(() => this.meta() || this.selfMeta());
  // Payment methods = the Receipt-class entries of the AR catalog.
  readonly methodTypes = computed(() =>
    (this.effMeta()?.transactionTypes || []).filter((t) => t.trxClass === 'receipt'));
  readonly openDeposits = computed(() => this.effMeta()?.openDeposits || []);

  readonly form = this.fb.nonNullable.group({
    docNo: [''],
    docDate: ['', [Validators.required]],
    trxDate: ['', [Validators.required]],
    transactionTypeId: ['', [Validators.required]],
    paymentRef: [''],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    collectDepositId: [''],
    description: [''],
  });

  constructor() {
    this.pickQuery$.pipe(debounceTime(300), takeUntilDestroyed()).subscribe(() => this.loadPickRows());
  }

  ngOnInit(): void {
    const t = this.today();
    const edit = this.editRow();
    if (edit) {
      this.form.reset({
        docNo: edit.docNo || '',
        docDate: edit.docDate,
        trxDate: edit.trxDate,
        transactionTypeId: edit.transactionTypeId,
        paymentRef: edit.paymentRef || '',
        amount: Number(edit.netAmount),
        collectDepositId: edit.collectDepositId || '',
        description: edit.description || '',
      });
      this.pickedDebtor.set({ id: edit.debtor.id, no: edit.debtor.no, name: edit.debtor.name });
      this.mode.set('entry');
      this.loadMeta(edit.debtor.id);
      return;
    }
    this.form.reset({
      docNo: '', docDate: t, trxDate: t, transactionTypeId: '',
      paymentRef: '', amount: 0,
      collectDepositId: this.presetDepositId() || '',
      description: '',
    });
    const preset = this.debtor();
    if (preset) {
      this.mode.set('entry');
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
    return this.effMeta()?.numberingModes?.['ar-receipt'] ?? null;
  }

  depositLabel(d: { docNo: string | null; amount: string; collectedAmount: string }): string {
    return `${d.docNo} — to collect ${(Number(d.amount) - Number(d.collectedAmount)).toFixed(2)}`;
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
    this.mode.set('entry');
    this.loadMeta(row.id);
  }

  changeDebtor(): void {
    this.pickedDebtor.set(null);
    this.selfMeta.set(null);
    this.mode.set('pick');
    this.loadPickRows();
  }

  // --- Save / Submit (Save = editable Open draft; Submit posts directly) ---

  private payload(): Record<string, unknown> {
    const f = this.form.getRawValue();
    return {
      docNo: f.docNo.trim() || null,
      docDate: f.docDate,
      trxDate: f.trxDate,
      transactionTypeId: f.transactionTypeId,
      paymentRef: f.paymentRef.trim() || null,
      amount: f.amount,
      collectDepositId: f.collectDepositId || null,
      description: f.description.trim() || null,
    };
  }

  // A draft saved by a Submit whose submit step then failed - further saves
  // must PATCH it, never create a duplicate.
  private readonly savedDraftId = signal<string | null>(null);

  private saveRequest() {
    const debtor = this.activeDebtor();
    const editId = this.editRow()?.id || this.savedDraftId();
    if (editId) return this.service.updateReceipt(editId, this.payload());
    return this.debtor()
      ? this.service.postReceipt(debtor!.id, this.payload())
      : this.service.createReceipt({ ...this.payload(), debtorId: debtor!.id });
  }

  onSave(): void {
    if (!this.activeDebtor()) return;
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.saveRequest().subscribe({
      next: (res) => { this.saving.set(false); this.posted.emit(res.message); },
      error: (err) => {
        this.saving.set(false);
        this.failed.emit(err.error?.message || 'Failed to save the receipt.');
      },
    });
  }

  onSubmit(): void {
    if (!this.activeDebtor()) return;
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.saveRequest().subscribe({
      next: (saved) => {
        this.savedDraftId.set(saved.id);
        this.form.markAsPristine(); // the draft is persisted - no discard prompt
        this.service.submitReceipt(saved.id).subscribe({
          next: (res) => { this.saving.set(false); this.posted.emit(res.message); },
          error: (err) => {
            this.saving.set(false);
            this.failed.emit(`${err.error?.message || 'Submit failed.'} The receipt stays saved as Open.`);
          },
        });
      },
      error: (err) => {
        this.saving.set(false);
        this.failed.emit(err.error?.message || 'Failed to save the receipt.');
      },
    });
  }
}
