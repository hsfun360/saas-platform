import { Component, Injector, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { CanDirective } from '../shared/can.directive';
import { DialogComponent } from '../shared/dialog/dialog';
import { OverflowMenuComponent } from '../shared/overflow-menu/overflow-menu';
import { MenuItemDirective } from '../shared/overflow-menu/menu-item.directive';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { ScrollReturnService } from '../services/scroll-return.service';
import { MembershipStatusOption } from '../models/auth.models';
import { GolfRainCheckService } from '../services/golf-rain-check.service';
import { GolfRainCheck } from '../services/golf-frontdesk.service';

// The DEVICE-local calendar date as 'YYYY-MM-DD' (toISOString would be UTC).
function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Golf Management → Front Desk → Rain Checks (/golf/rain-checks; STANDALONE
// MENU, user decisions 2026-10-15). Every rain check the club has issued for
// an abandoned paid round: issued (open), redeemed (which bill, how much,
// what was forfeited), expired or cancelled. Rain checks are ISSUED and
// REDEEMED on the Tee Time Sheet, never here; this listing follows them up
// and cancels an issued one with a reason.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-golf-rain-checks',
  standalone: true,
  imports: [CommonModule, ScreenTitlePipe, ScreenSubtitlePipe, FavStarComponent, CanDirective, DialogComponent,
    OverflowMenuComponent, MenuItemDirective, LocalDatePipe],
  templateUrl: './golf-rain-checks.html',
  styleUrls: ['./golf-rain-checks.css'],
})
export class GolfRainChecksComponent implements OnInit {
  private readonly service = inject(GolfRainCheckService);
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private static readonly LIST_PATH = '/golf/rain-checks';

  readonly loading = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly rainChecks = signal<GolfRainCheck[]>([]);
  readonly statuses = signal<MembershipStatusOption[]>([]);

  // Server-side filters: play-date range (the abandoned round) + status. The
  // default range reaches 180 days back - a rain check outlives its round by
  // the validity period, so a short window would hide the open ones.
  readonly dateFrom = signal(localDate(new Date(Date.now() - 180 * 86400000)));
  readonly dateTo = signal(localDate(new Date()));
  readonly status = signal('');
  // Client-side search over the loaded rows.
  readonly search = signal('');

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const rows = this.rainChecks();
    if (!q) return rows;
    return rows.filter((r) =>
      r.rainCheckNo.toLowerCase().includes(q)
      || r.golferName.toLowerCase().includes(q)
      || (r.memberNo || '').toLowerCase().includes(q)
      || r.billNo.toLowerCase().includes(q)
      || (r.redeemedBillNo || '').toLowerCase().includes(q));
  });
  readonly openCount = computed(() => this.rainChecks().filter((r) => r.status === 'issued').length);
  readonly openTotal = computed(() => Math.round(this.rainChecks().filter((r) => r.status === 'issued').reduce((s, r) => s + r.amount, 0) * 100) / 100);

  // Centred confirm: cancel an issued rain check (reason required).
  readonly cancelTarget = signal<GolfRainCheck | null>(null);
  readonly cancelReason = signal('');
  readonly working = signal(false);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.service.list({ dateFrom: this.dateFrom(), dateTo: this.dateTo(), status: this.status() }).subscribe({
      next: (res) => {
        this.rainChecks.set(res.rainChecks);
        this.statuses.set(res.statuses);
        this.loading.set(false);
        this.returnScroll.consume(GolfRainChecksComponent.LIST_PATH, this.injector);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load rain checks.');
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

  openCancel(r: GolfRainCheck): void {
    this.clearMessages();
    this.cancelTarget.set(r);
    this.cancelReason.set('');
  }

  confirmCancel(): void {
    const target = this.cancelTarget();
    if (!target) return;
    const reason = this.cancelReason().trim();
    if (!reason) {
      this.errorMessage.set('Give a reason for cancelling the rain check.');
      return;
    }
    this.working.set(true);
    this.service.cancel(target.id, reason).subscribe({
      next: (res) => {
        this.working.set(false);
        this.cancelTarget.set(null);
        this.successMessage.set(res.message);
        this.returnScroll.remember(GolfRainChecksComponent.LIST_PATH, target.id);
        this.load();
      },
      error: (err) => {
        this.working.set(false);
        this.errorMessage.set(err.error?.message || 'The rain check could not be cancelled.');
      },
    });
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
