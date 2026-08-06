import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { CanDirective } from '../shared/can.directive';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { BillingService } from '../services/billing.service';
import { BillingSchedule } from '../models/billing.models';

// Membership → Billing Schedules (fee runs). Generate the Membership Fee /
// Subscription Fee holding for a month, then open a schedule to review its
// items and post - one AR Invoice per posted item.
@Component({
  selector: 'app-membership-billing',
  standalone: true,
  imports: [
    FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule,
    RouterLink, CanDirective, LocalDatePipe,
  ],
  templateUrl: './membership-billing.html',
  styleUrls: ['../system-setup/system-setup.css', './membership-billing.css'],
})
export class MembershipBillingComponent implements OnInit {
  private readonly service = inject(BillingService);
  private readonly fb = inject(FormBuilder);

  readonly rows = signal<BillingSchedule[]>([]);
  readonly loading = signal(false);
  readonly generating = signal(false);
  readonly month = signal('');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');
  readonly warnings = signal<string[]>([]);

  readonly runForm = this.fb.nonNullable.group({
    billingType: ['membership-fee', [Validators.required]],
    month: ['', [Validators.required]],
    docDate: ['', [Validators.required]],
    trxDate: ['', [Validators.required]],
  });

  ngOnInit(): void {
    const m = this.thisMonth();
    this.month.set(m);
    const end = this.lastDayOf(m);
    this.runForm.reset({ billingType: 'membership-fee', month: m, docDate: end, trxDate: end });
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
    if (value) {
      const end = this.lastDayOf(value);
      this.runForm.controls.docDate.setValue(end);
      this.runForm.controls.trxDate.setValue(end);
    }
  }

  typeLabel(key: string): string {
    return key === 'membership-fee' ? 'Membership Fee' : 'Subscription Fee';
  }

  load(): void {
    this.loading.set(true);
    this.service.list(this.month()).subscribe({
      next: (res) => { this.rows.set(res.schedules); this.loading.set(false); },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load billing schedules.');
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
    this.service.generate(f).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.warnings.set(res.warnings || []);
        this.generating.set(false);
        this.month.set(f.month);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to generate the schedule.');
        this.generating.set(false);
      },
    });
  }

  onCancel(row: BillingSchedule): void {
    this.clearMessages();
    this.service.cancel(row.id).subscribe({
      next: (res) => { this.successMessage.set(res.message); this.load(); },
      error: (err) => this.errorMessage.set(err.error?.message || 'Failed to cancel the schedule.'),
    });
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
    this.warnings.set([]);
  }
}
