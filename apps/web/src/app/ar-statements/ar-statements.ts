import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { DialogComponent } from '../shared/dialog/dialog';
import { CanDirective } from '../shared/can.directive';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { OverflowMenuComponent, MenuItemDirective } from '../shared/overflow-menu/overflow-menu';
import { addressLines } from '../shared/address';
import { ArService } from '../services/ar.service';
import { ArStatementColumn, ArStatementColumnKey, ArStatementDetail, ArStatementSummary } from '../models/ar.models';

// Lines-table column catalogue (mirrors the PDF renderer's BASE_COLS: default
// label, relative width, alignment).
interface ViewColumn {
  key: ArStatementColumnKey;
  label: string;
  weight: number;
  right: boolean;
}

const VIEW_COL_CATALOG: Record<ArStatementColumnKey, { label: string; weight: number; right: boolean }> = {
  date: { label: 'Date', weight: 62, right: false },
  docNo: { label: 'Document', weight: 92, right: false },
  details: { label: 'Details', weight: 155, right: false },
  debit: { label: 'Debit', weight: 60, right: true },
  credit: { label: 'Credit', weight: 60, right: true },
  balance: { label: 'Balance', weight: 70, right: true },
};
const VIEW_COL_ORDER: ArStatementColumnKey[] = ['date', 'docNo', 'details', 'debit', 'credit', 'balance'];

// Account Receivable → Statement Listing (generation split to its own screen
// /ar/statement-generation on 2026-08-06). Pure query surface: month +
// category filters, the frozen-document viewer (print-complete: letterhead,
// contact person, running balance, deposit, aging buckets), and void.
@Component({
  selector: 'app-ar-statements',
  standalone: true,
  imports: [
    FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule,
    DialogComponent, CanDirective, LocalDatePipe, OverflowMenuComponent, MenuItemDirective,
  ],
  templateUrl: './ar-statements.html',
  styleUrls: ['../system-setup/system-setup.css', './ar-statements.css'],
})
export class ArStatementsComponent implements OnInit {
  private readonly service = inject(ArService);

  readonly rows = signal<ArStatementSummary[]>([]);
  readonly loading = signal(false);
  readonly month = signal('');
  readonly category = signal('');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly categoryLabels: Record<string, string> = {
    individual: 'Individual', corporate: 'Corporate', nominee: 'Nominee', other: 'Other Debtor',
  };

  // Viewer dialog. Columns mirror the company's layout (order/hide/rename),
  // shipped with the statement response.
  readonly viewOpen = signal(false);
  readonly viewLoading = signal(false);
  readonly view = signal<ArStatementDetail | null>(null);
  readonly viewCols = signal<ViewColumn[]>([]);

  readonly gridCols = computed(() =>
    this.viewCols().map((c) => `minmax(0, ${c.weight}fr)`).join(' '));

  // Where the Opening/Closing caption and amount anchor when columns are
  // hidden (same rule as the PDF renderer).
  readonly captionKey = computed<ArStatementColumnKey>(() => {
    const cols = this.viewCols();
    return (cols.find((c) => c.key === 'docNo') || cols.find((c) => c.key === 'details') || cols[0])?.key ?? 'docNo';
  });
  readonly totalKey = computed<ArStatementColumnKey>(() => {
    const cols = this.viewCols();
    return (cols.find((c) => c.key === 'balance') || [...cols].reverse().find((c) => c.right) || cols[cols.length - 1])?.key ?? 'balance';
  });

  private applyViewColumns(cols: ArStatementColumn[] | null): void {
    const spec = cols && cols.length
      ? cols.filter((c) => VIEW_COL_CATALOG[c.key])
      : VIEW_COL_ORDER.map((key) => ({ key }) as ArStatementColumn);
    const resolved = (spec.length ? spec : VIEW_COL_ORDER.map((key) => ({ key }) as ArStatementColumn))
      .map((c) => ({
        key: c.key,
        label: c.label || VIEW_COL_CATALOG[c.key].label,
        weight: VIEW_COL_CATALOG[c.key].weight,
        right: VIEW_COL_CATALOG[c.key].right,
      }));
    this.viewCols.set(resolved);
  }

  ngOnInit(): void {
    this.month.set(this.thisMonth());
    this.load();
  }

  private thisMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  load(): void {
    this.loading.set(true);
    this.service.listStatements(this.month(), this.category()).subscribe({
      next: (res) => { this.rows.set(res.statements); this.loading.set(false); },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load statements.');
      },
    });
  }

  setMonth(value: string): void {
    this.month.set(value);
    this.load();
  }

  setCategory(value: string): void {
    this.category.set(value);
    this.load();
  }

  openView(row: ArStatementSummary): void {
    this.clearMessages();
    this.view.set(null);
    this.viewOpen.set(true);
    this.viewLoading.set(true);
    this.service.getStatement(row.id).subscribe({
      next: (res) => {
        this.applyViewColumns(res.columns);
        this.view.set(res);
        this.viewLoading.set(false);
      },
      error: (err) => {
        this.viewLoading.set(false);
        this.viewOpen.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load the statement.');
      },
    });
  }
  closeView(): void {
    this.viewOpen.set(false);
  }

  // Both blocks follow the app-wide address standard (shared/address.ts):
  // postcode+city+state on one line, country full name from the API.
  addressLines(v: ArStatementDetail | null): string[] {
    return addressLines(v?.statement?.billAddress ?? null);
  }

  companyAddressLines(v: ArStatementDetail | null): string[] {
    return addressLines(v?.statement?.companyAddress ?? null);
  }

  // The printed aging buckets: labels derive from the boundaries snapshotted
  // at generation (never from today's setting). [30,60,90] -> <=30, 31-60,
  // 61-90, >90 across aging1..aging4.
  agingBuckets(v: ArStatementDetail | null): { label: string; amount: string }[] {
    const s = v?.statement;
    const b = s?.agingBoundaries;
    if (!s || !b || !b.length) return [];
    const amounts = [s.aging1, s.aging2, s.aging3, s.aging4, s.aging5, s.aging6, s.aging7];
    const out: { label: string; amount: string }[] = [];
    for (let i = 0; i < b.length && i < 6; i += 1) {
      out.push({ label: i === 0 ? `<=${b[0]}` : `${b[i - 1] + 1}-${b[i]}`, amount: amounts[i] });
    }
    out.push({ label: `>${b[Math.min(b.length, 6) - 1]}`, amount: amounts[Math.min(b.length, 6)] });
    return out;
  }

  // Download the server-rendered PDF of the statement open in the viewer.
  readonly pdfDownloading = signal(false);
  onDownloadPdf(): void {
    const st = this.view()?.statement;
    if (!st || this.pdfDownloading()) return;
    this.pdfDownloading.set(true);
    this.service.downloadStatementPdf(st.id).subscribe({
      next: (blob) => {
        this.pdfDownloading.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Statement-${st.statementNo.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => {
        this.pdfDownloading.set(false);
        this.errorMessage.set('Failed to download the statement PDF.');
      },
    });
  }

  // Accounting presentation: negatives in brackets, e.g. (100.00).
  bracketAmount(s: string | null | undefined): string {
    const str = String(s ?? '0.00');
    return str.startsWith('-') ? `(${str.slice(1)})` : str;
  }

  onVoid(row: ArStatementSummary): void {
    this.clearMessages();
    this.service.voidStatement(row.id).subscribe({
      next: (res) => { this.successMessage.set(res.message); this.load(); },
      error: (err) => this.errorMessage.set(err.error?.message || 'Failed to void the statement.'),
    });
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
