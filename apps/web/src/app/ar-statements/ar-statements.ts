import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { DialogComponent } from '../shared/dialog/dialog';
import { CanDirective } from '../shared/can.directive';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { ArService } from '../services/ar.service';
import { ArStatementDetail, ArStatementSummary } from '../models/ar.models';

// Account Receivable → Statements (monthly cutoff run, approved design): one
// frozen Statement per debtor with activity or balance - party name/address
// snapshotted at generation, lines itemized by who incurred them. Re-running a
// period skips debtors already covered; void a statement first to re-issue it.
@Component({
  selector: 'app-ar-statements',
  standalone: true,
  imports: [
    FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule,
    DialogComponent, CanDirective, LocalDatePipe,
  ],
  templateUrl: './ar-statements.html',
  styleUrls: ['../system-setup/system-setup.css', './ar-statements.css'],
})
export class ArStatementsComponent implements OnInit {
  private readonly service = inject(ArService);
  private readonly fb = inject(FormBuilder);

  readonly rows = signal<ArStatementSummary[]>([]);
  readonly loading = signal(false);
  readonly generating = signal(false);
  readonly month = signal('');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly runForm = this.fb.nonNullable.group({
    month: ['', [Validators.required]],
  });

  // Viewer dialog.
  readonly viewOpen = signal(false);
  readonly viewLoading = signal(false);
  readonly view = signal<ArStatementDetail | null>(null);

  ngOnInit(): void {
    const m = this.thisMonth();
    this.month.set(m);
    this.runForm.reset({ month: m });
    this.load();
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  private thisMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  periodOf(month: string): { start: string; end: string } | null {
    const [y, m] = month.split('-').map(Number);
    if (!y || !m) return null;
    const last = new Date(y, m, 0).getDate();
    const mm = String(m).padStart(2, '0');
    return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, '0')}` };
  }

  load(): void {
    this.loading.set(true);
    this.service.listStatements(this.month()).subscribe({
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

  onGenerate(): void {
    this.clearMessages();
    if (this.runForm.invalid) { this.runForm.markAllAsTouched(); return; }
    const period = this.periodOf(this.runForm.getRawValue().month);
    if (!period) return;
    this.generating.set(true);
    this.service.generateStatements({ periodStart: period.start, periodEnd: period.end }).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.generating.set(false);
        this.month.set(this.runForm.getRawValue().month);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to generate statements.');
        this.generating.set(false);
      },
    });
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

  addressLines(v: ArStatementDetail | null): string[] {
    const a = v?.statement?.billAddress;
    if (!a) return [];
    return [a['line1'], a['line2'], a['line3'],
      [a['postcode'], a['city']].filter(Boolean).join(' '),
      a['state'], a['countryCode'] ? String(a['countryCode']).toUpperCase() : null]
      .filter((x): x is string => !!x);
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
