import { Component, OnInit, inject, signal, Injector } from '@angular/core';
import { ConfirmDialogComponent, ConfirmRequest } from '../shared/confirm-dialog/confirm-dialog';
import { ScrollReturnService } from '../services/scroll-return.service';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { CanDirective } from '../shared/can.directive';
import { LocalDatePipe, monthYearLabel } from '../shared/local-date.pipe';
import { BillingService } from '../services/billing.service';
import { OverflowMenuComponent, MenuItemDirective } from '../shared/overflow-menu/overflow-menu';
import { ComboboxComponent } from '../shared/combobox/combobox';
import { monthComboOptions } from '../shared/month-options';
import { BillingSchedule } from '../models/billing.models';

// Membership → Billing Schedules (fee runs). Generate the Membership Fee /
// Subscription Fee holding for a month, then open a schedule to review its
// items and post - one AR Invoice per posted item.
@Component({
  selector: 'app-membership-billing',
  standalone: true,
  imports: [ConfirmDialogComponent, 
    FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule,
    RouterLink, CanDirective, LocalDatePipe, OverflowMenuComponent, MenuItemDirective,
    ComboboxComponent,
  ],
  templateUrl: './membership-billing.html',
  styleUrls: ['../system-setup/system-setup.css', './membership-billing.css'],
})
export class MembershipBillingComponent implements OnInit {
  // Month picker options (shared combobox - Firefox has no native month input).
  readonly monthOptions = monthComboOptions();
  private readonly service = inject(BillingService);
  // After-save return-to-row (app-wide listing standard).
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private static readonly LIST_PATH = '/membership/billing';
  private readonly fb = inject(FormBuilder);

  readonly rows = signal<BillingSchedule[]>([]);
  // The "Generate a month" run card folds like every section card (header is a button).
  readonly runOpen = signal(true);
  readonly loading = signal(false);
  readonly generating = signal(false);
  readonly month = signal('');
  readonly successMessage = signal('');
  // Destructive actions confirm through the shared <app-confirm-dialog>.
  readonly confirmAction = signal<ConfirmRequest | null>(null);
  readonly errorMessage = signal('');
  readonly warnings = signal<string[]>([]);

  // The run button names the month it will generate (show-expected-results).
  runMonthLabel(): string {
    const m = this.runForm.controls.month.value;
    return m ? monthYearLabel(m) : '';
  }

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

  rememberRow(id: string): void {
    this.returnScroll.remember(MembershipBillingComponent.LIST_PATH, id);
  }

  load(): void {
    this.loading.set(true);
    this.service.list(this.month()).subscribe({
      next: (res) => { this.rows.set(res.schedules); this.loading.set(false);
        this.returnScroll.consume(MembershipBillingComponent.LIST_PATH, this.injector); },
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
    this.confirmAction.set({
      title: 'Cancel billing schedule',
      message: `Cancel the pending ${this.typeLabel(row.billingType)} schedule for ${monthYearLabel(row.periodMonth)} (${row.itemCount} item${row.itemCount === 1 ? '' : 's'})? No invoices are posted and the month can be generated again.`,
      confirmLabel: 'Cancel schedule',
      run: () => { this.confirmAction.set(null); this.performCancel(row); },
    });
  }

  private performCancel(row: BillingSchedule): void {
    this.returnScroll.remember(MembershipBillingComponent.LIST_PATH, row.id);
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
