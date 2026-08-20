import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, debounceTime } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DialogComponent } from '../dialog/dialog';
import { MoneyInputDirective } from '../money-input.directive';
import { ArService } from '../../services/ar.service';
import { ArAccountMeta, ArDebtor, ArDocListRow, ArLedgerDoc } from '../../models/ar.models';

// The ONE ledger-document entry dialog (Invoice / Debit Note / Credit Note),
// shared by the Debtor Account screen (debtor known - entry only) and the
// per-document transaction screens (no debtor yet - a picker step first).
// Single-dialog rule: one <app-dialog>, the picker/entry steps are @switch
// views behind a mode signal.
//
// Posting door follows the caller's RBAC surface: with a preset [debtor] the
// account screen's kind-agnostic endpoint is used (gated '/ar/debtors');
// standalone the type's own endpoint is used (gated on that type's menu).
export interface ArLedgerDialogDebtor {
  id: string;
  no: string | null;
  name: string | null;
}

@Component({
  selector: 'app-ar-ledger-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DialogComponent, MoneyInputDirective],
  templateUrl: './ar-ledger-dialog.html',
  styleUrls: ['./ar-ledger-dialog.css'],
})
export class ArLedgerDialogComponent implements OnInit {
  private readonly service = inject(ArService);
  private readonly fb = inject(FormBuilder);

  readonly kind = input.required<'invoice' | 'debit-note' | 'credit-note'>();
  // Preset debtor (account screen). null = standalone: pick a debtor first.
  readonly debtor = input<ArLedgerDialogDebtor | null>(null);
  // Entry meta provided by the account screen; self-loaded after a pick.
  readonly meta = input<ArAccountMeta | null>(null);
  // CN "apply against" candidates (account screen provides its open debits).
  readonly openDebits = input<ArLedgerDoc[]>([]);
  // Editing an existing Open (draft) invoice: prefill + PATCH instead of POST.
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
  // The catalog is AR-owned with per-document classes (2026-08-15): each
  // entry dialog offers only its own class's types.
  readonly classTypes = computed(() =>
    (this.effMeta()?.transactionTypes || []).filter((t) => t.trxClass === this.kind()));
  // Invoices follow the Save (draft) -> Submit lifecycle; DN/CN still post
  // immediately until their slices adopt it.
  readonly isLifecycle = computed(() => this.kind() === 'invoice');
  readonly submitLabel = computed(() => (this.effMeta()?.invoiceApproval ? 'Submit for Approval' : 'Submit'));

  readonly form = this.fb.nonNullable.group({
    docNo: [''],
    docDate: ['', [Validators.required]],
    trxDate: ['', [Validators.required]],
    transactionTypeId: ['', [Validators.required]],
    description: [''],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    targetLedgerId: [''],
    fifo: [false],
  });

  constructor() {
    this.pickQuery$.pipe(debounceTime(300), takeUntilDestroyed()).subscribe(() => this.loadPickRows());
  }

  ngOnInit(): void {
    const t = this.today();
    const edit = this.editRow();
    if (edit) {
      // Edit an existing draft: debtor fixed, form prefilled, meta self-loaded.
      this.form.reset({
        docNo: edit.docNo || '',
        docDate: edit.docDate,
        trxDate: edit.trxDate,
        transactionTypeId: edit.transactionTypeId,
        description: edit.description || '',
        amount: Number(edit.netAmount),
        targetLedgerId: '', fifo: false,
      });
      this.pickedDebtor.set({ id: edit.debtor.id, no: edit.debtor.no, name: edit.debtor.name });
      this.mode.set('entry');
      this.metaLoading.set(true);
      this.service.accountMeta(edit.debtor.id).subscribe({
        next: (m) => { this.selfMeta.set(m); this.metaLoading.set(false); },
        error: (err) => {
          this.metaLoading.set(false);
          this.failed.emit(err.error?.message || 'Failed to load the entry options.');
        },
      });
      return;
    }
    this.form.reset({
      docNo: '', docDate: t, trxDate: t, transactionTypeId: '',
      description: '', amount: 0, targetLedgerId: '', fifo: false,
    });
    // A preset debtor (account screen) starts straight in entry mode;
    // standalone starts at the debtor picker.
    if (this.debtor()) {
      this.mode.set('entry');
    } else {
      this.mode.set('pick');
      this.loadPickRows();
    }
  }

  private today(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  kindLabel(kind?: string): string {
    const k = kind || this.kind();
    return k === 'invoice' ? 'Invoice' : k === 'debit-note' ? 'Debit Note' : k === 'credit-note' ? 'Credit Note' : k;
  }

  remaining(doc: ArLedgerDoc): string {
    return (Number(doc.grossAmount) - Number(doc.settledAmount)).toFixed(2);
  }

  numberingMode(): string | null {
    return this.effMeta()?.numberingModes?.[`ar-${this.kind()}`] ?? null;
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
    this.metaLoading.set(true);
    this.service.accountMeta(row.id).subscribe({
      next: (m) => { this.selfMeta.set(m); this.metaLoading.set(false); },
      error: (err) => {
        this.metaLoading.set(false);
        this.failed.emit(err.error?.message || 'Failed to load the entry options.');
      },
    });
  }

  changeDebtor(): void {
    // Standalone only (the button is hidden when the debtor is preset).
    this.pickedDebtor.set(null);
    this.selfMeta.set(null);
    this.mode.set('pick');
    this.loadPickRows();
  }

  // --- Save / Submit ---
  // Invoices: Save keeps/creates the Open draft; Submit saves first, then
  // posts (or routes into the approval chain). DN/CN: single Post as before.

  private payload(): Record<string, unknown> {
    const f = this.form.getRawValue();
    return {
      docNo: f.docNo.trim() || null,
      docDate: f.docDate,
      trxDate: f.trxDate,
      transactionTypeId: f.transactionTypeId,
      description: f.description.trim() || null,
      amount: f.amount,
      targetLedgerId: this.kind() === 'credit-note' ? (f.targetLedgerId || null) : null,
      fifo: this.kind() === 'credit-note' ? f.fifo : false,
    };
  }

  // A new draft saved by a Submit whose submit step then failed - further
  // saves must PATCH it, never create a duplicate.
  private readonly savedDraftId = signal<string | null>(null);

  // The save request for the current context: edit (or an already-saved new
  // draft) -> PATCH; standalone new -> the invoice door; account-preset new ->
  // the account door (which creates the draft server-side for invoices).
  private saveRequest() {
    const debtor = this.activeDebtor();
    const editId = this.editRow()?.id || this.savedDraftId();
    if (editId) return this.service.updateInvoice(editId, this.payload());
    return this.debtor()
      ? this.service.postLedger(debtor!.id, { ...this.payload(), docKind: this.kind() })
      : this.service.postInvoice({ ...this.payload(), debtorId: debtor!.id });
  }

  onSave(): void {
    if (!this.activeDebtor()) return;
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    this.saveRequest().subscribe({
      next: (res) => { this.saving.set(false); this.posted.emit(res.message); },
      error: (err) => {
        this.saving.set(false);
        this.failed.emit(err.error?.message || 'Failed to save the document.');
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
        this.service.submitInvoice(saved.id).subscribe({
          next: (res) => { this.saving.set(false); this.posted.emit(res.message); },
          error: (err) => {
            this.saving.set(false);
            // The draft IS saved (dialog stays open for a retry; a repeat
            // Save/Submit PATCHes the same draft).
            this.failed.emit(`${err.error?.message || 'Submit failed.'} The invoice stays saved as Open.`);
          },
        });
      },
      error: (err) => {
        this.saving.set(false);
        this.failed.emit(err.error?.message || 'Failed to save the document.');
      },
    });
  }
}
