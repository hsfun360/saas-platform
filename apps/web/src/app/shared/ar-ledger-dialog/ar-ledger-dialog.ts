import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, debounceTime } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DialogComponent } from '../dialog/dialog';
import { MoneyInputDirective } from '../money-input.directive';
import { ArService } from '../../services/ar.service';
import { ArAccountMeta, ArDebtor, ArLedgerDoc } from '../../models/ar.models';

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

  readonly form = this.fb.nonNullable.group({
    docNo: [''],
    docDate: ['', [Validators.required]],
    trxDate: ['', [Validators.required]],
    transactionTypeId: ['', [Validators.required]],
    incurredByMemberId: [''],
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
    this.form.reset({
      docNo: '', docDate: t, trxDate: t, transactionTypeId: '', incurredByMemberId: '',
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

  // --- Submit ---

  onSave(): void {
    const debtor = this.activeDebtor();
    if (!debtor) return;
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const f = this.form.getRawValue();
    const payload = {
      docNo: f.docNo.trim() || null,
      docDate: f.docDate,
      trxDate: f.trxDate,
      transactionTypeId: f.transactionTypeId,
      incurredByMemberId: f.incurredByMemberId || null,
      description: f.description.trim() || null,
      amount: f.amount,
      targetLedgerId: this.kind() === 'credit-note' ? (f.targetLedgerId || null) : null,
      fifo: this.kind() === 'credit-note' ? f.fifo : false,
    };
    this.saving.set(true);
    const req = this.debtor()
      ? this.service.postLedger(debtor.id, { ...payload, docKind: this.kind() })
      : this.service.postInvoice({ ...payload, debtorId: debtor.id });
    req.subscribe({
      next: (res) => { this.saving.set(false); this.posted.emit(res.message); },
      error: (err) => {
        this.saving.set(false);
        this.failed.emit(err.error?.message || 'Failed to post the document.');
      },
    });
  }
}
