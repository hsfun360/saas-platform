import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DialogComponent } from '../shared/dialog/dialog';
import { CanDirective } from '../shared/can.directive';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { MoneyInputDirective } from '../shared/money-input.directive';
import { ArLedgerDialogComponent, ArLedgerDialogDebtor } from '../shared/ar-ledger-dialog/ar-ledger-dialog';
import { ArReceiptDialogComponent } from '../shared/ar-receipt-dialog/ar-receipt-dialog';
import { ArRefundDialogComponent } from '../shared/ar-refund-dialog/ar-refund-dialog';
import { ArDepositDialogComponent } from '../shared/ar-deposit-dialog/ar-deposit-dialog';
import { ArService } from '../services/ar.service';
import { ArAccount, ArAccountMeta, ArDepositDoc, ArLedgerDoc, ArReceiptDoc } from '../models/ar.models';

// Account Receivable → Debtor Account (the Debtor Listing's detail surface,
// same '/ar/debtors' menu). Shows the ledger account's balances and its three
// document books, and hosts every manual document entry:
// Invoice / Debit Note / Credit Note (one dialog, kind preset), Official
// Receipt (with optional deposit collection + FIFO), Refund (funded from
// credit or a deposit), Deposit open / convert-to-CN, and the void flows.
//
// docDate = occurrence (drives aging/dueDate); trxDate = accounting period
// (defaults to docDate; differs when back-keying into a closed GL month).
@Component({
  selector: 'app-ar-debtor-account',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink, DialogComponent, CanDirective,
    LocalDatePipe, MoneyInputDirective, ArLedgerDialogComponent, ArReceiptDialogComponent,
    ArRefundDialogComponent, ArDepositDialogComponent,
  ],
  templateUrl: './ar-debtor-account.html',
  styleUrls: ['../system-setup/system-setup.css', './ar-debtor-account.css'],
})
export class ArDebtorAccountComponent {
  private readonly service = inject(ArService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly account = signal<ArAccount | null>(null);
  readonly meta = signal<ArAccountMeta | null>(null);
  readonly loading = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');
  debtorId = '';

  // Section fold state (all start expanded).
  readonly expanded = signal<Record<string, boolean>>({ ledger: true, money: true, deposits: true });

  readonly openDebits = computed(() =>
    (this.account()?.ledger || []).filter((d) => d.mode === 'debit' && d.status === 'open'));
  readonly openDeposits = computed(() =>
    (this.account()?.deposits || []).filter((d) => d.status === 'open'));
  readonly heldDeposits = computed(() =>
    this.openDeposits().filter((d) => Number(d.heldAmount) > 0));

  // --- Ledger dialog (Invoice / DN / CN) - the shared entry dialog with the
  // debtor preset; this screen only tracks which kind is open.
  readonly ledgerOpen = signal(false);
  readonly ledgerKind = signal<'invoice' | 'debit-note' | 'credit-note'>('invoice');
  readonly ledgerDebtor = computed<ArLedgerDialogDebtor | null>(() => {
    const a = this.account();
    return a ? { id: a.debtor.id, no: a.debtor.no, name: a.debtor.name } : null;
  });

  // --- Official Receipt dialog (shared component; the deposit "Collect"
  // button pre-selects that deposit for collection) ---
  readonly receiptOpen = signal(false);
  readonly receiptDepositId = signal<string | null>(null);

  // --- Refund dialog (SHARED component since the refund slice 2026-08-31) ---
  readonly refundOpen = signal(false);

  // --- Deposit dialog (SHARED component since the deposit slice 2026-09-01;
  // it owns the form, fx defaulting and the Save/Submit lifecycle) ---
  readonly depositOpen = signal(false);

  // --- Convert-deposit dialog ---
  readonly convertOpen = signal(false);
  readonly convertSaving = signal(false);
  readonly convertDeposit = signal<ArDepositDoc | null>(null);
  readonly convertForm = this.fb.nonNullable.group({
    docDate: ['', [Validators.required]],
    trxDate: ['', [Validators.required]],
    amount: [0, [Validators.required, Validators.min(0.01)]],
  });

  // --- Void confirmation (shared). Invoices require a reason - the number
  // stays consumed in the gapless series and who/when/why is the audit trail.
  readonly voidOpen = signal(false);
  readonly voidBusy = signal(false);
  readonly voidMessage = signal('');
  readonly voidReason = signal('');
  readonly voidNeedsReason = signal(false);
  private voidAction: (() => void) | null = null;

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      const id = p.get('id') || '';
      if (id && id !== this.debtorId) {
        this.debtorId = id;
        this.load();
      }
    });
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  load(): void {
    this.loading.set(true);
    this.service.account(this.debtorId).subscribe({
      next: (a) => { this.account.set(a); this.loading.set(false); },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load the debtor account.');
      },
    });
    this.service.accountMeta(this.debtorId).subscribe({
      next: (m) => this.meta.set(m),
      error: () => { /* pickers degrade */ },
    });
  }

  back(): void {
    this.router.navigate(['/ar/debtors']);
  }

  toggleSection(key: string): void {
    this.expanded.update((s) => ({ ...s, [key]: !s[key] }));
  }
  isExpanded(key: string): boolean {
    return this.expanded()[key] !== false;
  }

  // --- display helpers ---
  // Ledger lifecycle display (2026-08-13): draft="Open", open|settled="Posted".
  ledgerStatusLabel(doc: ArLedgerDoc): string {
    return doc.status === 'draft' ? 'Open'
      : doc.status === 'pending-approval' ? 'Pending Approval'
      : doc.status === 'void' ? 'Void' : 'Posted';
  }
  // Numbers issue at SAVE (gapless rule 2026-08-14) - every row carries one.
  ledgerDocRef(doc: ArLedgerDoc): string {
    return doc.docNo || 'Draft';
  }
  // Receipt lifecycle display (2026-08-20): draft="Open", open="Posted".
  receiptStatusLabel(doc: ArReceiptDoc): string {
    return doc.status === 'draft' ? 'Open' : doc.status === 'open' ? 'Posted' : doc.status;
  }
  // Deposit lifecycle display (2026-09-01): same vocabulary; 'closed' (fully
  // collected and drawn down) keeps its own word - it explains why the row
  // offers no actions.
  depositStatusLabel(d: ArDepositDoc): string {
    return d.status === 'draft' ? 'Open'
      : d.status === 'pending-approval' ? 'Pending Approval'
      : d.status === 'open' ? 'Posted' : d.status;
  }
  // Debit documents (Invoice / Debit Note since its slice 2026-09-01):
  // draft-only void (posted = Credit Note territory). CN drafts void like
  // invoice drafts (lifecycle 2026-08-20); a POSTED unallocated CN keeps the
  // reversal void (deposit-conversion CNs rely on it).
  canVoidLedgerDoc(doc: ArLedgerDoc): boolean {
    if (doc.docKind === 'invoice' || doc.docKind === 'debit-note') return doc.status === 'draft';
    if (doc.docKind === 'credit-note' && doc.status === 'draft') return true;
    return doc.status === 'open' && Number(doc.balanceAmount) === Number(doc.grossAmount);
  }

  // Any allocation has reduced the balance below the gross.
  hasAllocations(doc: ArLedgerDoc): boolean {
    return Number(doc.balanceAmount) < Number(doc.grossAmount);
  }
  kindLabel(kind: string): string {
    return kind === 'invoice' ? 'Invoice'
      : kind === 'debit-note' ? 'Debit Note'
      : kind === 'credit-note' ? 'Credit Note'
      : kind === 'receipt' ? 'Official Receipt'
      : kind === 'refund' ? 'Refund' : kind;
  }
  remaining(doc: ArLedgerDoc): string {
    return Number(doc.balanceAmount).toFixed(2);
  }
  unallocated(doc: ArReceiptDoc): string {
    return Number(doc.balanceAmount).toFixed(2);
  }
  held(d: ArDepositDoc): string {
    return Number(d.heldAmount).toFixed(2);
  }
  // Collected so far derives from the remaining counters (amount - balance).
  collected(d: ArDepositDoc): string {
    return (Number(d.amount) - Number(d.balanceAmount)).toFixed(2);
  }
  // A posted receipt is voidable only while nothing has been allocated.
  receiptUntouched(doc: ArReceiptDoc): boolean {
    return Number(doc.balanceAmount) === Number(doc.amount);
  }
  // Collect stays available while the billed amount is not fully paid in.
  canCollect(d: ArDepositDoc): boolean {
    return Number(d.balanceAmount) > 0;
  }
  // A deposit is voidable only before its first collection.
  depositUntouched(d: ArDepositDoc): boolean {
    return Number(d.balanceAmount) === Number(d.amount);
  }
  numberingMode(purpose: string): string | null {
    return this.meta()?.numberingModes?.[purpose] ?? null;
  }

  private today(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // --- Ledger documents (entry via the shared dialog) ---
  openLedger(kind: 'invoice' | 'debit-note' | 'credit-note'): void {
    this.clearMessages();
    this.ledgerKind.set(kind);
    this.ledgerOpen.set(true);
  }
  onLedgerPosted(message: string): void {
    // A failed attempt's error must not outlive the save that followed it.
    this.errorMessage.set('');
    this.successMessage.set(message);
    this.ledgerOpen.set(false);
    this.load();
  }

  // --- Official Receipt (the SHARED dialog since the receipt lifecycle
  // 2026-08-20 - Save = Open draft, Submit posts directly) ---
  openReceipt(depositId = ''): void {
    this.clearMessages();
    this.receiptDepositId.set(depositId || null);
    this.receiptOpen.set(true);
  }
  onReceiptPosted(message: string): void {
    this.errorMessage.set('');
    this.successMessage.set(message);
    this.receiptOpen.set(false);
    this.load();
  }

  // --- Refund (the shared dialog owns the form; three kinds incl.
  // deposit-to-outstanding via a Credit Note leg) ---
  openRefund(): void {
    this.clearMessages();
    this.refundOpen.set(true);
  }
  onRefundPosted(message: string): void {
    this.errorMessage.set('');
    this.successMessage.set(message);
    this.refundOpen.set(false);
    this.load();
  }

  // --- Deposit (the shared dialog owns the form; Save = Open draft, Submit
  // routes through the ar-deposit approval chain or posts) ---
  openDeposit(): void {
    this.clearMessages();
    this.depositOpen.set(true);
  }
  onDepositPosted(message: string): void {
    this.errorMessage.set('');
    this.successMessage.set(message);
    this.depositOpen.set(false);
    this.load();
  }

  // --- Convert deposit to Credit Note ---
  openConvert(d: ArDepositDoc): void {
    this.clearMessages();
    const t = this.today();
    this.convertDeposit.set(d);
    this.convertForm.reset({ docDate: t, trxDate: t, amount: Number(this.held(d)) });
    this.convertOpen.set(true);
  }
  closeConvert(): void { this.convertOpen.set(false); }
  onSaveConvert(): void {
    this.clearMessages();
    const dep = this.convertDeposit();
    if (!dep) return;
    if (this.convertForm.invalid) { this.convertForm.markAllAsTouched(); return; }
    const f = this.convertForm.getRawValue();
    this.convertSaving.set(true);
    this.service.convertDeposit(dep.id, { docDate: f.docDate, trxDate: f.trxDate, amount: f.amount }).subscribe({
      next: (res) => { this.successMessage.set(res.message); this.convertSaving.set(false); this.convertOpen.set(false); this.load(); },
      error: (err) => { this.errorMessage.set(err.error?.message || 'Failed to convert the deposit.'); this.convertSaving.set(false); },
    });
  }

  // --- Voids (shared confirmation dialog) ---
  askVoidLedger(doc: ArLedgerDoc): void {
    // Draft void (reason required for audit): invoices and debit notes
    // always route there server-side; CN drafts too (lifecycle 2026-08-20).
    const isDraftVoid = doc.docKind === 'invoice' || doc.docKind === 'debit-note'
      || (doc.docKind === 'credit-note' && doc.status === 'draft');
    this.voidNeedsReason.set(isDraftVoid);
    this.openVoid(
      isDraftVoid
        ? `Void ${this.kindLabel(doc.docKind)} ${this.ledgerDocRef(doc)}? The draft never posted - the number stays consumed and the record remains as Void with your reason.`
        : doc.mode === 'debit'
          ? `Void ${this.kindLabel(doc.docKind)} ${doc.docNo}? A credit-mode reversal will be posted against it.`
          : `Void ${this.kindLabel(doc.docKind)} ${doc.docNo}?`,
      () => this.service.voidLedger(doc.id, isDraftVoid ? { reason: this.voidReason().trim() } : {}).subscribe({
        next: (res) => this.voidDone(res.message),
        error: (err) => this.voidFailed(err),
      }),
    );
  }
  askVoidReceipt(doc: ArReceiptDoc): void {
    // Receipt DRAFTS void with a reason (gapless-series audit, lifecycle
    // 2026-08-20); posted unallocated receipts keep the plain flip.
    const isDraft = doc.status === 'draft';
    this.voidNeedsReason.set(isDraft);
    this.openVoid(
      isDraft
        ? `Void Official Receipt ${doc.docNo}? The draft never posted - the number stays consumed and the record remains as Void with your reason.`
        : `Void Official Receipt ${doc.docNo}?`,
      () => this.service.voidReceipt(doc.id, isDraft ? this.voidReason().trim() : undefined).subscribe({
      next: (res) => this.voidDone(res.message),
      error: (err) => this.voidFailed(err),
    }));
  }
  askVoidDeposit(doc: ArDepositDoc): void {
    // Deposit DRAFTS void with a reason (gapless-series audit, deposit
    // lifecycle 2026-09-01); posted collections-free deposits keep the flip.
    const isDraft = doc.status === 'draft';
    this.voidNeedsReason.set(isDraft);
    this.openVoid(
      isDraft
        ? `Void Deposit ${doc.docNo}? The draft never posted - the number stays consumed and the record remains as Void with your reason.`
        : `Void Deposit ${doc.docNo}?`,
      () => this.service.voidDeposit(doc.id, isDraft ? this.voidReason().trim() : undefined).subscribe({
        next: (res) => this.voidDone(res.message),
        error: (err) => this.voidFailed(err),
      }));
  }
  private openVoid(message: string, action: () => void): void {
    this.clearMessages();
    this.voidMessage.set(message);
    this.voidReason.set('');
    this.voidAction = action;
    this.voidOpen.set(true);
  }
  confirmVoid(): void {
    if (!this.voidAction) return;
    if (this.voidNeedsReason() && !this.voidReason().trim()) {
      this.errorMessage.set('Enter the void reason - it is kept for audit.');
      return;
    }
    this.voidBusy.set(true);
    this.voidAction();
  }
  closeVoid(): void {
    this.voidOpen.set(false);
    this.voidAction = null;
  }
  private voidDone(message: string): void {
    this.successMessage.set(message);
    this.voidBusy.set(false);
    this.voidOpen.set(false);
    this.voidAction = null;
    this.load();
  }
  private voidFailed(err: { error?: { message?: string } }): void {
    this.errorMessage.set(err.error?.message || 'Void failed.');
    this.voidBusy.set(false);
    this.voidOpen.set(false);
    this.voidAction = null;
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
