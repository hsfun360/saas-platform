import { Component, Injector, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { CanDirective } from '../shared/can.directive';
import { DialogComponent } from '../shared/dialog/dialog';
import { OverflowMenuComponent } from '../shared/overflow-menu/overflow-menu';
import { MenuItemDirective } from '../shared/overflow-menu/menu-item.directive';
import { ConfirmDialogComponent, ConfirmRequest } from '../shared/confirm-dialog/confirm-dialog';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { ScrollReturnService } from '../services/scroll-return.service';
import { FacilityNoShowCharge, FacilityNoShowService } from '../services/facility-noshow.service';

// Facility Management -> No-show Charges (/facility/no-show-charges;
// structures approved 2026-10-26, slice 4). The penalties raised by the
// station's no-show mark, the end-of-day sweep and late cancellations: a
// status filter and a search, each card the booking, the reason, the amount
// and tax, the status chip and the AR document or the pending reason; Post
// retries the AR posting, Waive takes a reason and may clear the strike,
// Re-price prices an unpriced row once the item is set up.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-facility-no-show-charges',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ScreenTitlePipe, ScreenSubtitlePipe, FavStarComponent, CanDirective, DialogComponent,
    OverflowMenuComponent, MenuItemDirective, ConfirmDialogComponent, LocalDatePipe],
  templateUrl: './facility-no-show-charges.html',
  styleUrls: ['./facility-no-show-charges.css'],
})
export class FacilityNoShowChargesComponent implements OnInit {
  private readonly service = inject(FacilityNoShowService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private static readonly LIST_PATH = '/facility/no-show-charges';

  readonly charges = signal<FacilityNoShowCharge[]>([]);
  readonly controlled = signal(true);
  readonly loading = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');
  readonly status = signal<'' | 'pending' | 'posted' | 'waived'>('pending');
  readonly search = signal('');
  readonly busyId = signal<string | null>(null);
  readonly confirmAction = signal<ConfirmRequest | null>(null);

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const list = this.charges();
    if (!q) return list;
    return list.filter((c) => c.bookingNo.toLowerCase().includes(q) || c.bookerName.toLowerCase().includes(q) || (c.bookerMemberNo || '').toLowerCase().includes(q) || c.slotSummary.toLowerCase().includes(q));
  });
  readonly pendingTotal = computed(() => this.charges().filter((c) => c.status === 'pending').reduce((s, c) => s + c.totalAmount, 0));

  // The waive drawer.
  readonly waiveTarget = signal<FacilityNoShowCharge | null>(null);
  readonly saving = signal(false);
  readonly form = this.fb.nonNullable.group({
    reason: ['', [Validators.required, Validators.maxLength(255)]],
    clearStrike: [false],
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.service.listCharges({ status: this.status() || undefined }).subscribe({
      next: (res) => {
        this.charges.set(res.charges);
        this.controlled.set(res.controlled);
        this.loading.set(false);
        this.returnScroll.consume(FacilityNoShowChargesComponent.LIST_PATH, this.injector);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load the charges.');
      },
    });
  }

  setStatus(s: string): void {
    this.status.set((['pending', 'posted', 'waived'].includes(s) ? s : '') as '' | 'pending' | 'posted' | 'waived');
    this.load();
  }

  clearSearch(): void {
    this.search.set('');
  }

  reasonLabel(c: FacilityNoShowCharge): string {
    return c.chargeReason === 'late-cancel' ? 'Late cancellation' : 'No show';
  }

  statusClass(c: FacilityNoShowCharge): string {
    if (c.status === 'posted') return 'status-chip--on';
    if (c.status === 'pending') return 'status-chip--info';
    return 'status-chip--off';
  }

  openBooking(c: FacilityNoShowCharge): void {
    this.router.navigate(['/facility/bookings'], { queryParams: { openBooking: c.bookingId } });
  }

  post(c: FacilityNoShowCharge): void {
    this.clearMessages();
    this.busyId.set(c.id);
    this.service.postCharge(c.id).subscribe({
      next: (res) => { this.busyId.set(null); this.successMessage.set(res.message); this.returnScroll.remember(FacilityNoShowChargesComponent.LIST_PATH, c.id); this.load(); },
      error: (err) => { this.busyId.set(null); this.errorMessage.set(err.error?.message || 'The charge could not be posted.'); this.load(); },
    });
  }

  reprice(c: FacilityNoShowCharge): void {
    this.clearMessages();
    this.busyId.set(c.id);
    this.service.repriceCharge(c.id).subscribe({
      next: (res) => { this.busyId.set(null); this.successMessage.set(res.message); this.returnScroll.remember(FacilityNoShowChargesComponent.LIST_PATH, c.id); this.load(); },
      error: (err) => { this.busyId.set(null); this.errorMessage.set(err.error?.message || 'The charge could not be re-priced.'); },
    });
  }

  openWaive(c: FacilityNoShowCharge): void {
    this.clearMessages();
    this.waiveTarget.set(c);
    this.form.reset({ reason: '', clearStrike: false });
  }

  closeWaive(): void {
    this.waiveTarget.set(null);
    this.form.markAsPristine();
  }

  submitWaive(): void {
    const c = this.waiveTarget();
    if (!c) return;
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.service.waiveCharge(c.id, v.reason.trim(), v.clearStrike === true).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.successMessage.set(res.message);
        this.form.markAsPristine();
        this.closeWaive();
        this.returnScroll.remember(FacilityNoShowChargesComponent.LIST_PATH, c.id);
        this.load();
      },
      error: (err) => { this.saving.set(false); this.errorMessage.set(err.error?.message || 'Failed to waive the charge.'); },
    });
  }

  clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
