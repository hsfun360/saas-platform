import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { CanDirective } from '../shared/can.directive';
import { DialogComponent } from '../shared/dialog/dialog';
import { ComboboxComponent } from '../shared/combobox/combobox';
import { OverflowMenuComponent, MenuItemDirective } from '../shared/overflow-menu/overflow-menu';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { ScrollReturnService } from '../services/scroll-return.service';
import { Injector } from '@angular/core';
import {
  GolfBookingService,
  GolfBookingContext,
  GolfBookingRow,
  GolfFlightGroup,
  GolfFlightLock,
  GolfBookingPlayerLine,
} from '../services/golf-booking.service';

// Golf Management → Booking (/golf/bookings) - the make-booking flow against
// the DYNAMIC tee sheet (user decisions 2026-09-20, modeled on the 2006 SRS
// screens): a day listing of bookings + a single drawer dialog whose views
// follow the wizard - Search (member no first: standing + window resolve) →
// Available flights (5 nearest per course) → Players (flight LOCKED with a
// live countdown; Member vs Guest / Member-as-Guest lines) → confirm. Every
// rule is re-validated server-side at save; the screen only mirrors them.
interface PlayerLine {
  playerType: 'member' | 'member-guest' | 'guest';
  memberNo: string;
  guestName: string;
}

@Component({
  selector: 'app-golf-bookings',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, ScreenTitlePipe, ScreenSubtitlePipe, FavStarComponent,
    CanDirective, DialogComponent, ComboboxComponent, OverflowMenuComponent, MenuItemDirective, LocalDatePipe,
  ],
  templateUrl: './golf-bookings.html',
  styleUrls: ['../system-setup/system-setup.css', '../membership-types/membership-types.css', './golf-bookings.css'],
})
export class GolfBookingsComponent implements OnInit, OnDestroy {
  private readonly service = inject(GolfBookingService);
  private readonly fb = inject(FormBuilder);
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);

  readonly loading = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  // ---- listing ----
  readonly listDate = signal(new Date().toISOString().slice(0, 10));
  readonly bookings = signal<GolfBookingRow[]>([]);

  // ---- wizard dialog ----
  readonly dialogOpen = signal(false);
  readonly step = signal<'search' | 'flights' | 'players'>('search');
  readonly saving = signal(false);
  readonly searching = signal(false);

  readonly searchForm = this.fb.nonNullable.group({
    memberNo: ['', [Validators.required, Validators.maxLength(50)]],
    playDate: ['', Validators.required],
    time: ['08:00', Validators.required],
    players: [4, [Validators.required, Validators.min(1), Validators.max(10)]],
    holes: [18, Validators.required],
  });
  readonly courseId = signal(''); // '' = all courses
  readonly context = signal<GolfBookingContext | null>(null);
  readonly contextLoading = signal(false);
  readonly memberWarning = signal('');

  readonly groups = signal<GolfFlightGroup[]>([]);
  readonly lock = signal<GolfFlightLock | null>(null);
  readonly lockedGroup = signal<GolfFlightGroup | null>(null);
  readonly countdown = signal('');
  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  readonly playerLines = signal<PlayerLine[]>([]);
  readonly linesDirty = signal(false);
  readonly contactMobile = signal('');
  readonly remarks = signal('');

  // ---- cancel dialog ----
  readonly cancelTarget = signal<GolfBookingRow | null>(null);
  readonly cancelReason = signal('');
  readonly cancelling = signal(false);

  readonly courseOptions = computed(() => {
    const ctx = this.context();
    return (ctx ? ctx.courses : []).map((c) => ({
      value: c.id,
      label: `${c.courseCode}${c.description ? ' — ' + c.description : ''}`,
    }));
  });

  readonly dialogTitle = computed(() => {
    switch (this.step()) {
      case 'flights': return 'Available flights';
      case 'players': return 'Key in players';
      default: return 'New booking';
    }
  });

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.stopCountdown();
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  // ---------- listing ----------

  setListDate(value: string): void {
    if (!value) return;
    this.listDate.set(value);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.service.list(this.listDate()).subscribe({
      next: (res) => {
        this.bookings.set(res.bookings);
        this.loading.set(false);
        this.returnScroll.consume('/golf/bookings', this.injector);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load bookings.');
      },
    });
  }

  playerSummary(b: GolfBookingRow): string {
    return b.players.map((p) => p.playerName).join(', ');
  }

  // ---------- wizard: search ----------

  openDialog(): void {
    this.clearMessages();
    this.searchForm.reset({ memberNo: '', playDate: '', time: '08:00', players: 4, holes: 18 });
    this.courseId.set('');
    this.context.set(null);
    this.memberWarning.set('');
    this.groups.set([]);
    this.lock.set(null);
    this.playerLines.set([]);
    this.linesDirty.set(false);
    this.contactMobile.set('');
    this.remarks.set('');
    this.step.set('search');
    this.dialogOpen.set(true);
  }

  closeDialog(): void {
    const lock = this.lock();
    if (lock) this.service.releaseLock(lock.groupId).subscribe({ next: () => {}, error: () => {} });
    this.stopCountdown();
    this.dialogOpen.set(false);
  }

  isDirty(): boolean {
    return this.searchForm.dirty || this.linesDirty();
  }

  // Member No keyed → resolve standing + window; the Date and Course fields
  // depend on it (2006 flow: filter eligible dates/courses per member).
  loadContext(): void {
    const memberNo = this.searchForm.controls.memberNo.value.trim();
    if (!memberNo) {
      this.searchForm.controls.memberNo.markAsTouched();
      return;
    }
    this.contextLoading.set(true);
    this.memberWarning.set('');
    this.service.context(memberNo).subscribe({
      next: (ctx) => {
        this.contextLoading.set(false);
        this.context.set(ctx);
        if (!this.searchForm.controls.playDate.value) {
          this.searchForm.controls.playDate.setValue(ctx.window.dateTo);
        }
        if (ctx.member.actionControl === 'barred') {
          this.errorMessage.set(`Member ${ctx.member.memberNo} (${ctx.member.statusLabel || 'status'}) is barred from booking.`);
        } else if (ctx.member.actionControl === 'warning') {
          this.memberWarning.set(`Member status '${ctx.member.statusLabel}' carries a warning - proceed with care.`);
        }
      },
      error: (err) => {
        this.contextLoading.set(false);
        this.context.set(null);
        this.errorMessage.set(err.error?.message || 'Failed to resolve the member.');
      },
    });
  }

  private searchPayload() {
    const v = this.searchForm.getRawValue();
    return {
      memberNo: v.memberNo.trim(),
      playDate: v.playDate,
      courseId: this.courseId() || null,
      time: v.time,
      players: Number(v.players),
      holes: Number(v.holes),
    };
  }

  search(): void {
    this.clearMessages();
    if (this.searchForm.invalid) {
      this.searchForm.markAllAsTouched();
      return;
    }
    if (!this.context()) {
      this.loadContext();
      return;
    }
    this.searching.set(true);
    this.service.availability(this.searchPayload()).subscribe({
      next: (res) => {
        this.searching.set(false);
        this.groups.set(res.groups);
        if (res.memberWarning) this.memberWarning.set(res.memberWarning);
        this.step.set('flights');
      },
      error: (err) => {
        this.searching.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to search available flights.');
      },
    });
  }

  hasFlights(): boolean {
    return this.groups().some((g) => g.flights.length > 0);
  }

  backToSearch(): void {
    this.step.set('search');
  }

  // ---------- wizard: lock + players ----------

  pickFlight(group: GolfFlightGroup, teeTime: string): void {
    this.clearMessages();
    this.searching.set(true);
    this.service.lock({ ...this.searchPayload(), courseId: group.courseId, teeTime }).subscribe({
      next: (lock) => {
        this.searching.set(false);
        this.lock.set(lock);
        this.lockedGroup.set(group);
        const count = Math.min(Number(this.searchForm.controls.players.value) || 1, lock.seatsLeft);
        const booker = this.context();
        const lines: PlayerLine[] = [];
        for (let i = 0; i < count; i += 1) {
          lines.push(i === 0
            ? { playerType: 'member', memberNo: booker ? booker.member.memberNo : '', guestName: '' }
            : { playerType: 'member', memberNo: '', guestName: '' });
        }
        this.playerLines.set(lines);
        this.linesDirty.set(false);
        this.startCountdown(lock);
        this.step.set('players');
      },
      error: (err) => {
        this.searching.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to lock the flight.');
        if (err.status === 409) this.search();
      },
    });
  }

  private startCountdown(lock: GolfFlightLock): void {
    this.stopCountdown();
    const tick = () => {
      const left = Math.floor((new Date(lock.expiresAt).getTime() - Date.now()) / 1000);
      if (left <= 0) {
        this.stopCountdown();
        this.countdown.set('0:00');
        this.lock.set(null);
        this.errorMessage.set('The flight lock expired - pick a flight again.');
        this.step.set('flights');
        this.search();
        return;
      }
      const m = Math.floor(left / 60);
      const s = left % 60;
      this.countdown.set(`${m}:${String(s).padStart(2, '0')}`);
    };
    tick();
    this.countdownTimer = setInterval(tick, 1000);
  }

  private stopCountdown(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  backToFlights(): void {
    const lock = this.lock();
    if (lock) this.service.releaseLock(lock.groupId).subscribe({ next: () => {}, error: () => {} });
    this.lock.set(null);
    this.stopCountdown();
    this.step.set('flights');
    this.search();
  }

  setLine(index: number, patch: Partial<PlayerLine>): void {
    this.playerLines.update((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    this.linesDirty.set(true);
  }

  addLine(): void {
    const lock = this.lock();
    if (lock && this.playerLines().length >= lock.seatsLeft) return;
    this.playerLines.update((rows) => [...rows, { playerType: 'member', memberNo: '', guestName: '' }]);
    this.linesDirty.set(true);
  }

  removeLine(index: number): void {
    if (index === 0) return; // player 1 is the booker
    this.playerLines.update((rows) => rows.filter((_, i) => i !== index));
    this.linesDirty.set(true);
  }

  confirm(): void {
    this.clearMessages();
    const lock = this.lock();
    if (!lock) return;
    const lines = this.playerLines();
    for (let i = 0; i < lines.length; i += 1) {
      const l = lines[i];
      if (l.playerType === 'guest') {
        if (!l.guestName.trim()) {
          this.errorMessage.set(`Player ${i + 1}: key in the guest name (or 'Guest').`);
          return;
        }
      } else if (!l.memberNo.trim()) {
        this.errorMessage.set(`Player ${i + 1}: key in the member number.`);
        return;
      }
    }
    const players: GolfBookingPlayerLine[] = lines.map((l) => (l.playerType === 'guest'
      ? { playerType: l.playerType, guestName: l.guestName.trim() }
      : { playerType: l.playerType, memberNo: l.memberNo.trim() }));
    this.saving.set(true);
    this.service.create({
      lockGroupId: lock.groupId,
      memberNo: this.searchForm.controls.memberNo.value.trim(),
      holes: Number(this.searchForm.controls.holes.value),
      players,
      contactMobile: this.contactMobile().trim() || undefined,
      remarks: this.remarks().trim() || undefined,
    }).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.lock.set(null);
        this.stopCountdown();
        this.dialogOpen.set(false);
        this.successMessage.set(res.message);
        this.listDate.set(res.booking.playDate);
        this.returnScroll.remember('/golf/bookings', res.booking.id);
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to confirm the booking.');
        if (err.status === 409) {
          this.lock.set(null);
          this.stopCountdown();
          this.step.set('flights');
          this.search();
        }
      },
    });
  }

  // ---------- cancel ----------

  openCancel(b: GolfBookingRow): void {
    this.clearMessages();
    this.cancelTarget.set(b);
    this.cancelReason.set('');
  }

  confirmCancel(): void {
    const target = this.cancelTarget();
    if (!target) return;
    this.cancelling.set(true);
    this.service.cancel(target.id, this.cancelReason().trim()).subscribe({
      next: (res) => {
        this.cancelling.set(false);
        this.cancelTarget.set(null);
        this.successMessage.set(res.message);
        this.returnScroll.remember('/golf/bookings', target.id);
        this.load();
      },
      error: (err) => {
        this.cancelling.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to cancel the booking.');
      },
    });
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
