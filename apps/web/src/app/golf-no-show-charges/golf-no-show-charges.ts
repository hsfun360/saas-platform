import { Component, Injector, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { CanDirective } from '../shared/can.directive';
import { DialogComponent } from '../shared/dialog/dialog';
import { OverflowMenuComponent, MenuItemDirective } from '../shared/overflow-menu/overflow-menu';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { ScrollReturnService } from '../services/scroll-return.service';
import { MembershipStatusOption } from '../models/auth.models';
import { GolfNoShowChargeService, GolfNoShowChargeRow } from '../services/golf-no-show-charge.service';

// The DEVICE-local calendar date as 'YYYY-MM-DD' (toISOString would be UTC).
function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Golf Management → No-show Charges (/golf/no-show-charges; STANDALONE
// MENU, user decisions 2026-10-06). Every cancellation-notice / no-show
// penalty raised against a booker in one listing - pending rows (public
// booker, posting error) can be posted again or waived with a reason;
// posted rows show the AR invoice. Rows are raised by the Bookings cancel
// and the Front Desk's no-show review, never here. Grantable on its own so
// finance can hold it without the tee-sheet or booking screens.
@Component({
  selector: 'app-golf-no-show-charges',
  standalone: true,
  imports: [CommonModule, ScreenTitlePipe, ScreenSubtitlePipe, FavStarComponent, CanDirective, DialogComponent,
    OverflowMenuComponent, MenuItemDirective, LocalDatePipe],
  templateUrl: './golf-no-show-charges.html',
  styleUrls: ['../system-setup/system-setup.css', './golf-no-show-charges.css'],
})
export class GolfNoShowChargesComponent implements OnInit {
  private readonly service = inject(GolfNoShowChargeService);
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private static readonly LIST_PATH = '/golf/no-show-charges';

  readonly loading = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly charges = signal<GolfNoShowChargeRow[]>([]);
  readonly statuses = signal<MembershipStatusOption[]>([]);
  readonly reasons = signal<MembershipStatusOption[]>([]);

  // Server-side filters: play-date range (default the last 31 days) + status.
  readonly dateFrom = signal(localDate(new Date(Date.now() - 31 * 86400000)));
  readonly dateTo = signal(localDate(new Date()));
  readonly status = signal('');
  // Client-side search over the loaded rows.
  readonly search = signal('');

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const rows = this.charges();
    if (!q) return rows;
    return rows.filter((c) =>
      c.bookingNo.toLowerCase().includes(q)
      || c.bookerName.toLowerCase().includes(q)
      || (c.bookerMemberNo || '').toLowerCase().includes(q)
      || (c.playerNames || '').toLowerCase().includes(q)
      || (c.arDocNo || '').toLowerCase().includes(q));
  });
  readonly pendingCount = computed(() => this.charges().filter((c) => c.status === 'pending').length);
  readonly postedTotal = computed(() => Math.round(this.charges().filter((c) => c.status === 'posted').reduce((s, c) => s + c.totalAmount, 0) * 100) / 100);

  // Centred confirm: waive a pending charge (reason required).
  readonly waiveTarget = signal<GolfNoShowChargeRow | null>(null);
  readonly waiveReason = signal('');
  readonly working = signal(false);
  readonly postingId = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.service.list({ dateFrom: this.dateFrom(), dateTo: this.dateTo(), status: this.status() }).subscribe({
      next: (res) => {
        this.charges.set(res.charges);
        this.statuses.set(res.statuses);
        this.reasons.set(res.reasons);
        this.loading.set(false);
        this.returnScroll.consume(GolfNoShowChargesComponent.LIST_PATH, this.injector);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load no-show charges.');
      },
    });
  }

  setDateFrom(v: string): void { if (v) { this.dateFrom.set(v); this.load(); } }
  setDateTo(v: string): void { if (v) { this.dateTo.set(v); this.load(); } }
  setStatus(v: string): void { this.status.set(v); this.load(); }
  clearSearch(): void { this.search.set(''); }

  statusLabel(key: string): string {
    return this.statuses().find((s) => s.key === key)?.label || key;
  }

  reasonLabel(key: string): string {
    return this.reasons().find((r) => r.key === key)?.label || key;
  }

  post(c: GolfNoShowChargeRow): void {
    this.clearMessages();
    this.postingId.set(c.id);
    this.service.post(c.id).subscribe({
      next: (res) => {
        this.postingId.set(null);
        this.successMessage.set(res.message);
        this.returnScroll.remember(GolfNoShowChargesComponent.LIST_PATH, c.id);
        this.load();
      },
      error: (err) => {
        this.postingId.set(null);
        this.errorMessage.set(err.error?.message || 'The charge could not be posted.');
        // The server records why in `remarks` - refresh so the card shows it.
        this.returnScroll.remember(GolfNoShowChargesComponent.LIST_PATH, c.id);
        this.load();
      },
    });
  }

  openWaive(c: GolfNoShowChargeRow): void {
    this.clearMessages();
    this.waiveTarget.set(c);
    this.waiveReason.set('');
  }

  confirmWaive(): void {
    const target = this.waiveTarget();
    if (!target) return;
    const reason = this.waiveReason().trim();
    if (!reason) {
      this.errorMessage.set('Give a reason for waiving the charge.');
      return;
    }
    this.working.set(true);
    this.service.waive(target.id, reason).subscribe({
      next: (res) => {
        this.working.set(false);
        this.waiveTarget.set(null);
        this.successMessage.set(res.message);
        this.returnScroll.remember(GolfNoShowChargesComponent.LIST_PATH, target.id);
        this.load();
      },
      error: (err) => {
        this.working.set(false);
        this.errorMessage.set(err.error?.message || 'The charge could not be waived.');
      },
    });
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
