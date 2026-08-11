import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { DialogComponent } from '../shared/dialog/dialog';
import { CanDirective } from '../shared/can.directive';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { ArService } from '../services/ar.service';
import { ArStatementDetail, ArStatementSummary } from '../models/ar.models';

// Account Receivable → Statement Listing (generation split to its own screen
// /ar/statement-generation on 2026-08-06). Pure query surface: month +
// category filters, the frozen-document viewer (print-complete: letterhead,
// contact person, running balance, deposit, aging buckets), and void.
@Component({
  selector: 'app-ar-statements',
  standalone: true,
  imports: [
    FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule,
    DialogComponent, CanDirective, LocalDatePipe,
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

  // Viewer dialog.
  readonly viewOpen = signal(false);
  readonly viewLoading = signal(false);
  readonly view = signal<ArStatementDetail | null>(null);

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
      next: (res) => { this.view.set(res); this.viewLoading.set(false); },
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

  private jsonAddressLines(a: Record<string, string | null> | null): string[] {
    if (!a) return [];
    return [a['line1'], a['line2'], a['line3'],
      [a['postcode'], a['city']].filter(Boolean).join(' '),
      a['state'], a['countryCode'] ? String(a['countryCode']).toUpperCase() : null]
      .filter((x): x is string => !!x);
  }

  addressLines(v: ArStatementDetail | null): string[] {
    return this.jsonAddressLines(v?.statement?.billAddress ?? null);
  }

  companyAddressLines(v: ArStatementDetail | null): string[] {
    return this.jsonAddressLines(v?.statement?.companyAddress ?? null);
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
