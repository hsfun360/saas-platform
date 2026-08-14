import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Subject, debounceTime } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { DialogComponent } from '../shared/dialog/dialog';
import { CanDirective } from '../shared/can.directive';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { OverflowMenuComponent, MenuItemDirective } from '../shared/overflow-menu/overflow-menu';
import { ArLedgerDialogComponent } from '../shared/ar-ledger-dialog/ar-ledger-dialog';
import { ArService } from '../services/ar.service';
import { ArDocListResult, ArDocListRow, ArDocStatus } from '../models/ar.models';

// Account Receivable → per-document-type transaction screens (hybrid design
// 2026-08-12): each document type is its OWN menu, so RBAC can grant e.g.
// invoice entry without credit-note authority, and cashiers key documents
// without round-tripping through Debtor Listing. ONE component serves all the
// types via route data (invoice first; the other five follow slice by slice).
// The Debtor Account screen stays as the account-first inquiry surface.
interface DocTypeCfg {
  kind: 'invoice' | 'debit-note' | 'credit-note';
  label: string;       // singular, e.g. 'Invoice'
  plural: string;      // fallback screen title
  icon: string;
  subtitle: string;
  list: (service: ArService, opts: { month?: string; q?: string; status?: string; offset?: number }) => ReturnType<ArService['listInvoices']>;
  void: (service: ArService, id: string) => ReturnType<ArService['voidInvoice']>;
}

const DOC_TYPES: Record<string, DocTypeCfg> = {
  invoice: {
    kind: 'invoice',
    label: 'Invoice',
    plural: 'Invoices',
    icon: 'request_quote',
    subtitle: 'Manual invoices across all debtors — key new invoices and void unsettled ones. System-generated invoices (fee runs, interest) appear here too.',
    list: (s, opts) => s.listInvoices(opts),
    void: (s, id) => s.voidInvoice(id),
  },
};

@Component({
  selector: 'app-ar-transactions',
  standalone: true,
  imports: [
    FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule,
    DialogComponent, CanDirective, LocalDatePipe, ArLedgerDialogComponent,
    OverflowMenuComponent, MenuItemDirective,
  ],
  templateUrl: './ar-transactions.html',
  styleUrls: ['../system-setup/system-setup.css', './ar-transactions.css'],
})
export class ArTransactionsComponent implements OnInit {
  private readonly service = inject(ArService);
  private readonly route = inject(ActivatedRoute);

  readonly cfg = signal<DocTypeCfg>(DOC_TYPES['invoice']);

  readonly rows = signal<ArDocListRow[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly loadingMore = signal(false);
  readonly month = signal('');
  readonly status = signal('');
  readonly search = signal('');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');
  readonly hasMore = computed(() => this.rows().length < this.total());

  private readonly query$ = new Subject<void>();

  // Entry dialog (the shared ledger dialog in standalone/pick-debtor mode).
  readonly entryOpen = signal(false);

  // Void confirmation.
  readonly voidOpen = signal(false);
  readonly voidBusy = signal(false);
  readonly voidRow = signal<ArDocListRow | null>(null);

  constructor() {
    this.query$.pipe(debounceTime(300), takeUntilDestroyed()).subscribe(() => this.load(true));
  }

  ngOnInit(): void {
    const type = String(this.route.snapshot.data['arDocType'] || 'invoice');
    this.cfg.set(DOC_TYPES[type] || DOC_TYPES['invoice']);
    this.month.set(this.thisMonth());
    this.load(true);
  }

  private thisMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  load(reset = true): void {
    if (reset) this.loading.set(true);
    else this.loadingMore.set(true);
    const offset = reset ? 0 : this.rows().length;
    this.cfg().list(this.service, {
      month: this.month(),
      q: this.search().trim(),
      status: this.status(),
      offset,
    }).subscribe({
      next: (res: ArDocListResult) => {
        this.rows.set(reset ? res.documents : [...this.rows(), ...res.documents]);
        this.total.set(res.total);
        this.loading.set(false);
        this.loadingMore.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.loadingMore.set(false);
        this.errorMessage.set(err.error?.message || `Failed to load ${this.cfg().plural.toLowerCase()}.`);
      },
    });
  }

  loadMore(): void {
    this.load(false);
  }

  onSearch(value: string): void {
    this.search.set(value);
    this.query$.next();
  }

  clearSearch(): void {
    this.search.set('');
    this.load(true);
  }

  setMonth(value: string): void {
    this.month.set(value);
    this.load(true);
  }

  setStatus(value: string): void {
    this.status.set(value);
    this.load(true);
  }

  remaining(doc: ArDocListRow): string {
    return (Number(doc.grossAmount) - Number(doc.settledAmount)).toFixed(2);
  }

  // Display vocabulary: draft = "Open" (editable, not financial),
  // open|settled = "Posted" (financial; balance shown, no Settled chip).
  statusLabel(status: ArDocStatus): string {
    return status === 'draft' ? 'Open'
      : status === 'pending-approval' ? 'Pending Approval'
      : status === 'void' ? 'Void' : 'Posted';
  }
  isPosted(doc: ArDocListRow): boolean {
    return doc.status === 'open' || doc.status === 'settled';
  }
  // Drafts within the caller's data scope carry the row actions.
  isEditableDraft(doc: ArDocListRow): boolean {
    return doc.status === 'draft' && doc.canModify !== false;
  }
  // Draft reference shown until the gapless number is issued at posting.
  docRef(doc: ArDocListRow): string {
    return doc.docNo || `DRAFT-${doc.id.slice(0, 8).toUpperCase()}`;
  }

  // --- Entry / edit (the shared dialog; editRow set = edit mode) ---
  readonly editRow = signal<ArDocListRow | null>(null);
  openEntry(): void {
    this.clearMessages();
    this.editRow.set(null);
    this.entryOpen.set(true);
  }
  openEdit(row: ArDocListRow): void {
    this.clearMessages();
    this.editRow.set(row);
    this.entryOpen.set(true);
  }
  onPosted(message: string): void {
    this.successMessage.set(message);
    this.entryOpen.set(false);
    this.editRow.set(null);
    this.load(true);
  }
  onEntryClosed(): void {
    this.entryOpen.set(false);
    this.editRow.set(null);
    // A Submit that failed after its save leaves a persisted draft behind -
    // refresh so the listing always reflects reality.
    this.load(true);
  }

  // --- Submit (from the kebab; confirm states the concrete outcome) ---
  readonly submitOpen = signal(false);
  readonly submitBusy = signal(false);
  readonly submitRow = signal<ArDocListRow | null>(null);
  readonly submitApproval = signal(false);
  askSubmit(row: ArDocListRow): void {
    this.clearMessages();
    this.submitRow.set(row);
    this.submitOpen.set(true);
    // Button label mirrors the dialog: approval chain vs direct post.
    this.service.accountMeta(row.debtor.id).subscribe({
      next: (m) => this.submitApproval.set(m.invoiceApproval === true),
      error: () => this.submitApproval.set(false),
    });
  }
  confirmSubmit(): void {
    const row = this.submitRow();
    if (!row) return;
    this.submitBusy.set(true);
    this.service.submitInvoice(row.id).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.submitBusy.set(false);
        this.submitOpen.set(false);
        this.submitRow.set(null);
        this.load(true);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Submit failed.');
        this.submitBusy.set(false);
        this.submitOpen.set(false);
        this.submitRow.set(null);
      },
    });
  }
  closeSubmit(): void {
    this.submitOpen.set(false);
    this.submitRow.set(null);
  }

  // --- Void (drafts only - audit kept, no reversal) ---
  askVoid(row: ArDocListRow): void {
    this.clearMessages();
    this.voidRow.set(row);
    this.voidOpen.set(true);
  }
  confirmVoid(): void {
    const row = this.voidRow();
    if (!row) return;
    this.voidBusy.set(true);
    this.cfg().void(this.service, row.id).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.voidBusy.set(false);
        this.voidOpen.set(false);
        this.voidRow.set(null);
        this.load(true);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Void failed.');
        this.voidBusy.set(false);
        this.voidOpen.set(false);
        this.voidRow.set(null);
      },
    });
  }
  closeVoid(): void {
    this.voidOpen.set(false);
    this.voidRow.set(null);
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
