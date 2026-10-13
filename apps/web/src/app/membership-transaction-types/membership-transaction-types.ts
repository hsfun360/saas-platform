import { Component, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { TransactionTypeService } from '../services/transaction-type.service';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { MembershipTransactionType } from '../models/auth.models';

// Membership Management → Master File Setup → Transaction Type - READ-ONLY
// VIEW since 2026-08-15: the catalog moved to Account Receivable
// (/ar/transaction-types) where every producer module maps into it. This
// screen shows the entries opened to Membership; maintenance happens on the
// AR master only.
//
// The AR-owned catalog row ships the document class as `trxClass` (the
// membership-era model still names its key `chargeType`); the view reads the
// AR shape, so the row type is the service's row plus that one key.
type ViewRow = MembershipTransactionType & { trxClass?: string };

const CLASS_LABELS: Record<string, string> = {
  'invoice': 'Invoice', 'debit-note': 'Debit Note', 'credit-note': 'Credit Note',
  'interest': 'Interest', 'deposit': 'Deposit', 'receipt': 'Receipt', 'forex': 'Forex',
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-membership-transaction-types',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule],
  templateUrl: './membership-transaction-types.html',
  // membership-types.css supplies the shared .mt-chip pill.
  styleUrls: ['../membership-types/membership-types.css'],
})
export class MembershipTransactionTypesComponent implements OnInit {
  private readonly service = inject(TransactionTypeService);

  readonly rows = signal<ViewRow[]>([]);
  readonly loading = signal(false);
  readonly search = signal('');
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
      (t) => t.transactionType.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q),
    );
  });
  readonly activeCount = computed(() => this.rows().filter((t) => t.isActive !== false).length);

  ngOnInit(): void {
    this.load();
  }

  classLabel(key: string | undefined): string {
    return (key && CLASS_LABELS[key]) || key || '';
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

  clearSearch(): void {
    this.search.set('');
  }
}
