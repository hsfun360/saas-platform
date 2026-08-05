import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { DialogComponent } from '../shared/dialog/dialog';
import { CanDirective } from '../shared/can.directive';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { ArService } from '../services/ar.service';
import { ArInterestDetail, ArInterestGeneration } from '../models/ar.models';

// Account Receivable → Interest Generation (staged run, approved design):
// GENERATE holding headers (one per debtor per month - the holding list IS the
// preview), review each header's overdue-item drill-down, then CONFIRM
// selectively (each confirm posts one summary Debit Note) or cancel to free
// the month. Rate/grace/cutoff are keyed per run; the header freezes them.
@Component({
  selector: 'app-ar-interest',
  standalone: true,
  imports: [
    FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule,
    DialogComponent, CanDirective, LocalDatePipe,
  ],
  templateUrl: './ar-interest.html',
  styleUrls: ['../system-setup/system-setup.css', './ar-interest.css'],
})
export class ArInterestComponent implements OnInit {
  private readonly service = inject(ArService);
  private readonly fb = inject(FormBuilder);

  readonly rows = signal<ArInterestGeneration[]>([]);
  readonly loading = signal(false);
  readonly generating = signal(false);
  readonly confirming = signal(false);
  readonly month = signal('');
  readonly selected = signal<Set<string>>(new Set());
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly runForm = this.fb.nonNullable.group({
    month: ['', [Validators.required]],
    cutoffDate: ['', [Validators.required]],
    ratePercent: [1.5 as number, [Validators.required, Validators.min(0.0001), Validators.max(100)]],
    graceDays: [0, [Validators.required, Validators.min(0), Validators.max(365)]],
  });

  readonly pendingRows = computed(() => this.rows().filter((r) => r.status === 'pending'));
  readonly selectedCount = computed(() => this.selected().size);
  readonly totalSelected = computed(() => {
    let c = 0;
    for (const r of this.rows()) if (this.selected().has(r.id)) c += Math.round(Number(r.interestAmount) * 100);
    return (c / 100).toFixed(2);
  });

  // Detail dialog.
  readonly detailOpen = signal(false);
  readonly detailLoading = signal(false);
  readonly detailGen = signal<ArInterestGeneration | null>(null);
  readonly details = signal<ArInterestDetail[]>([]);

  ngOnInit(): void {
    const m = this.thisMonth();
    this.month.set(m);
    this.runForm.reset({ month: m, cutoffDate: this.lastDayOf(m), ratePercent: 1.5, graceDays: 0 });
    this.load();
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  private thisMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  lastDayOf(month: string): string {
    const [y, m] = month.split('-').map(Number);
    if (!y || !m) return '';
    const last = new Date(y, m, 0).getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  }

  onRunMonthChange(value: string): void {
    this.runForm.controls.month.setValue(value);
    if (value) this.runForm.controls.cutoffDate.setValue(this.lastDayOf(value));
  }

  load(): void {
    this.loading.set(true);
    this.service.listInterest(this.month()).subscribe({
      next: (res) => {
        this.rows.set(res.generations);
        this.selected.set(new Set());
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load interest generations.');
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
    const f = this.runForm.getRawValue();
    this.generating.set(true);
    this.service.generateInterest({
      month: f.month, cutoffDate: f.cutoffDate, ratePercent: f.ratePercent, graceDays: f.graceDays,
    }).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.generating.set(false);
        this.month.set(f.month);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to generate interest.');
        this.generating.set(false);
      },
    });
  }

  isSelected(id: string): boolean {
    return this.selected().has(id);
  }
  toggleSelected(id: string): void {
    const next = new Set(this.selected());
    if (next.has(id)) next.delete(id); else next.add(id);
    this.selected.set(next);
  }
  toggleAll(): void {
    const pending = this.pendingRows();
    const all = pending.length > 0 && pending.every((r) => this.selected().has(r.id));
    this.selected.set(all ? new Set() : new Set(pending.map((r) => r.id)));
  }
  allSelected(): boolean {
    const pending = this.pendingRows();
    return pending.length > 0 && pending.every((r) => this.selected().has(r.id));
  }

  onConfirmSelected(): void {
    this.clearMessages();
    const ids = [...this.selected()];
    if (!ids.length) return;
    this.confirming.set(true);
    this.service.confirmInterest(ids).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.confirming.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to confirm.');
        this.confirming.set(false);
      },
    });
  }

  onCancel(row: ArInterestGeneration): void {
    this.clearMessages();
    this.service.cancelInterest(row.id).subscribe({
      next: (res) => { this.successMessage.set(res.message); this.load(); },
      error: (err) => this.errorMessage.set(err.error?.message || 'Failed to cancel.'),
    });
  }

  openDetail(row: ArInterestGeneration): void {
    this.clearMessages();
    this.detailGen.set(row);
    this.details.set([]);
    this.detailOpen.set(true);
    this.detailLoading.set(true);
    this.service.getInterest(row.id).subscribe({
      next: (res) => { this.details.set(res.details); this.detailLoading.set(false); },
      error: (err) => {
        this.detailLoading.set(false);
        this.detailOpen.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load the drill-down.');
      },
    });
  }
  closeDetail(): void {
    this.detailOpen.set(false);
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
