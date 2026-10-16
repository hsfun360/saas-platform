import { Component, OnDestroy, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { CanDirective } from '../shared/can.directive';
import { DialogComponent } from '../shared/dialog/dialog';
import { ComboboxComponent } from '../shared/combobox/combobox';
import { OverflowMenuComponent } from '../shared/overflow-menu/overflow-menu';
import { MenuItemDirective } from '../shared/overflow-menu/menu-item.directive';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { PhoneInputComponent } from '../shared/phone-input/phone-input';
import { ScrollReturnService } from '../services/scroll-return.service';
import { GolfPlayerTypeOption, playerTypeNeedsGuestName, playerTypeLabel } from '../services/golf-player-type.service';
import { Injector } from '@angular/core';
import {
  GolfBookingService,
  GolfBookingContext,
  GolfBookingRow,
  GolfFlightGroup,
  GolfFlightLock,
  GolfBookingPlayerLine,
  GolfCancelPreview,
  GolfChangeLine,
  GolfChangePayload,
  GolfChangePreview,
  GolfBookingChange,
} from '../services/golf-booking.service';

// Golf Management → Booking (/golf/bookings) - the make-booking flow against
// the DYNAMIC tee sheet (user decisions 2026-09-20, modeled on the 2006 SRS
// screens): a day listing of bookings + a single drawer dialog whose views
// follow the wizard - Search (member no first: standing + window resolve) →
// Available flights (5 nearest per course) → Players (flight LOCKED with a
// live countdown; Member vs Guest / Member-as-Guest lines) → confirm. Every
// rule is re-validated server-side at save; the screen only mirrors them.
// One player line: a typed FormGroup inside the players form's FormArray (house
// standard - the form's own dirty state feeds the unsaved-changes guard).
//
// CHANGE BOOKING (2026-10-14) reuses the same drawer in 'change' mode: it
// opens on the Players view showing the CURRENT flight and roster (existing
// lines keep their playerId and can be dropped; new lines are added), "Move
// flight" walks the Search → Flights steps with the booking's own seats
// excluded and locks the new flight, and "Review change" shows the server's
// preview (what moves, who is added or dropped, the notice-window verdict and
// any late-change charge) as the 'review' view before the change is applied.
// A player-type code of the club's catalog (the listing ships the pickable
// ones with their base identity; the three system codes are the defaults).
type PlayerType = string;
type PlayerLineGroup = FormGroup<{
  playerId: FormControl<string>;
  playerType: FormControl<PlayerType>;
  memberNo: FormControl<string>;
  guestName: FormControl<string>;
  playerName: FormControl<string>;
  status: FormControl<string>;
}>;

// The DEVICE-local calendar date as 'YYYY-MM-DD'. toISOString() would give
// the UTC date - in Malaysia that is yesterday until 8am.
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-golf-bookings',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, ScreenTitlePipe, ScreenSubtitlePipe, FavStarComponent,
    CanDirective, DialogComponent, ComboboxComponent, OverflowMenuComponent, MenuItemDirective, LocalDatePipe,
    PhoneInputComponent,
  ],
  templateUrl: './golf-bookings.html',
  styleUrls: ['./golf-bookings.css'],
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
  readonly listDate = signal(localToday());
  readonly bookings = signal<GolfBookingRow[]>([]);

  // ---- wizard dialog ----
  readonly dialogOpen = signal(false);
  readonly mode = signal<'new' | 'change'>('new');
  readonly changeTarget = signal<GolfBookingRow | null>(null);
  readonly step = signal<'search' | 'flights' | 'players' | 'review'>('search');
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

  // Step 3 form: the player lines (row 0 = the booker, its type and member no
  // are DISABLED controls - getRawValue still carries them) + contact + remarks.
  readonly playerLines: FormArray<PlayerLineGroup> = this.fb.array<PlayerLineGroup>([]);
  readonly playersForm = this.fb.nonNullable.group({
    lines: this.playerLines,
    contactMobile: ['', [Validators.maxLength(30)]],
    remarks: ['', [Validators.maxLength(255)]],
  });

  // ---- change review (the server's preview, shown before the change applies) ----
  readonly changePreview = signal<GolfChangePreview | null>(null);
  readonly changeReason = signal('');
  readonly changeWaive = signal(false);
  readonly changeWaiveReason = signal('');

  // ---- change history viewer ----
  readonly historyTarget = signal<GolfBookingRow | null>(null);
  readonly historyRows = signal<GolfBookingChange[]>([]);
  readonly historyLoading = signal(false);

  // ---- cancel dialog ----
  readonly cancelTarget = signal<GolfBookingRow | null>(null);
  readonly cancelReason = signal('');
  readonly cancelling = signal(false);
  // Cancellation-notice preview (show expected results): fetched when the
  // dialog opens so the confirm states whether this cancel is late, what the
  // booker will be charged, or that it is refused.
  readonly cancelPreview = signal<GolfCancelPreview | null>(null);
  readonly previewLoading = signal(false);
  readonly waiveCharge = signal(false);
  readonly waiveReason = signal('');
  readonly cancelRefused = computed(() => {
    const p = this.cancelPreview();
    return !!p && p.late && p.action === 'refuse';
  });
  readonly cancelCharged = computed(() => {
    const p = this.cancelPreview();
    return !!p && p.late && p.action === 'charge';
  });

  readonly courseOptions = computed(() => {
    const ctx = this.context();
    return (ctx ? ctx.courses : []).map((c) => ({
      value: c.id,
      label: `${c.courseCode}${c.description ? ' - ' + c.description : ''}`,
    }));
  });

  readonly isChange = computed(() => this.mode() === 'change');

  readonly dialogTitle = computed(() => {
    const target = this.changeTarget();
    if (this.isChange() && target) {
      switch (this.step()) {
        case 'search': return 'Move flight';
        case 'flights': return 'Available flights';
        case 'review': return 'Confirm change';
        default: return `Change booking ${target.bookingNo}`;
      }
    }
    switch (this.step()) {
      case 'flights': return 'Available flights';
      case 'players': return 'Key in players';
      default: return 'New booking';
    }
  });

  // The flight the booking occupies right now (change mode, before any move).
  readonly currentFlight = computed(() => {
    const b = this.changeTarget();
    if (!b) return '';
    return `${b.courseCode}${b.courseDescription ? ' - ' + b.courseDescription : ''} · ${b.startTime}${b.crossTime ? ' (cross over ' + b.crossTime + ')' : ''} · ${b.holes} holes`;
  });

  // The seats the roster may grow to: a locked flight's free seats (the
  // booking's own seats excluded on a change), else the wizard ceiling.
  readonly seatCap = computed(() => {
    const lock = this.lock();
    return lock ? lock.seatsLeft : 10;
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
        this.playerTypes.set(res.playerTypes || []);
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
    this.mode.set('new');
    this.changeTarget.set(null);
    this.searchForm.reset({ memberNo: '', playDate: '', time: '08:00', players: 4, holes: 18 });
    this.courseId.set('');
    this.context.set(null);
    this.memberWarning.set('');
    this.groups.set([]);
    this.lock.set(null);
    this.playerLines.clear();
    this.playersForm.reset({ lines: [], contactMobile: '', remarks: '' });
    this.changePreview.set(null);
    this.step.set('search');
    this.dialogOpen.set(true);
  }

  closeDialog(): void {
    const lock = this.lock();
    if (lock) this.service.releaseLock(lock.groupId).subscribe({ next: () => {}, error: () => {} });
    this.stopCountdown();
    this.lock.set(null);
    this.dialogOpen.set(false);
    this.mode.set('new');
    this.changeTarget.set(null);
  }

  isDirty(): boolean {
    if (this.isChange()) return this.playersForm.dirty || !!this.lock();
    return this.searchForm.dirty || this.playersForm.dirty;
  }

  // Member No keyed → resolve standing + window; the Date and Course fields
  // depend on it (2006 flow: filter eligible dates/courses per member).
  loadContext(afterLoad?: () => void): void {
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
        if (afterLoad) afterLoad();
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
    const target = this.changeTarget();
    return {
      memberNo: v.memberNo.trim(),
      playDate: v.playDate,
      courseId: this.courseId() || null,
      time: v.time,
      players: Number(v.players),
      holes: Number(v.holes),
      excludeBookingId: this.isChange() && target ? target.id : undefined,
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
        if (!this.isChange()) {
          const count = Math.min(Number(this.searchForm.controls.players.value) || 1, lock.seatsLeft);
          const booker = this.context();
          this.playerLines.clear();
          for (let i = 0; i < count; i += 1) {
            this.playerLines.push(this.newLineGroup(i === 0 ? (booker ? booker.member.memberNo : '') : '', i === 0));
          }
          this.playersForm.markAsPristine();
        }
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

  private newLineGroup(memberNo: string, booker: boolean): PlayerLineGroup {
    const g: PlayerLineGroup = this.fb.nonNullable.group({
      playerId: [''],
      playerType: ['member' as PlayerType],
      memberNo: [memberNo],
      guestName: [''],
      playerName: [''],
      status: ['booked'],
    });
    if (booker) {
      // Player 1 is the booker: identity fixed by the search step.
      g.controls.playerType.disable();
      g.controls.memberNo.disable();
    }
    return g;
  }

  // An EXISTING player of the booking being changed: identity fixed (drop
  // and re-add to change it), shown read-only with its status.
  private existingLineGroup(p: GolfBookingRow['players'][number]): PlayerLineGroup {
    const g: PlayerLineGroup = this.fb.nonNullable.group({
      playerId: [p.playerId],
      playerType: [p.playerType as PlayerType],
      memberNo: [p.memberNo || ''],
      guestName: [this.needsGuestName(p.playerType) ? p.playerName : ''],
      playerName: [p.playerName],
      status: [p.status],
    });
    g.controls.playerType.disable();
    g.controls.memberNo.disable();
    g.controls.guestName.disable();
    return g;
  }

  addLine(): void {
    if (this.playerLines.length >= this.seatCap()) return;
    this.playerLines.push(this.newLineGroup('', false));
    this.playerLines.markAsDirty();
  }

  removeLine(index: number): void {
    const line = this.playerLines.at(index);
    if (!line) return;
    if (!this.isChange() && index === 0) return; // player 1 is the booker
    if (line.controls.status.value === 'registered') return; // the desk already processed them
    this.playerLines.removeAt(index);
    this.playerLines.markAsDirty();
  }

  // The club's pickable player types (from the listing); a guest-base or
  // affiliate-base type takes a name, the member bases a member number.
  readonly playerTypes = signal<GolfPlayerTypeOption[]>([]);
  needsGuestName(code: string): boolean {
    return playerTypeNeedsGuestName(this.playerTypes(), code);
  }
  playerTypeLabel(code: string): string {
    return playerTypeLabel(this.playerTypes(), code);
  }

  isExistingLine(g: PlayerLineGroup): boolean {
    return !!g.controls.playerId.value;
  }

  private validateLines(): GolfBookingPlayerLine[] | null {
    const lines = this.playerLines.controls.map((g) => g.getRawValue());
    for (let i = 0; i < lines.length; i += 1) {
      const l = lines[i];
      if (l.playerId) continue;
      if (this.needsGuestName(l.playerType)) {
        if (!l.guestName.trim()) {
          this.errorMessage.set(`Player ${i + 1}: key in the guest name (or 'Guest').`);
          return null;
        }
      } else if (!l.memberNo.trim()) {
        this.errorMessage.set(`Player ${i + 1}: key in the member number.`);
        return null;
      }
    }
    return lines.map((l) => (this.needsGuestName(l.playerType)
      ? { playerType: l.playerType, guestName: l.guestName.trim() }
      : { playerType: l.playerType, memberNo: l.memberNo.trim() }));
  }

  confirm(): void {
    if (this.isChange()) {
      this.reviewChange();
      return;
    }
    this.clearMessages();
    const lock = this.lock();
    if (!lock) return;
    const players = this.validateLines();
    if (!players) return;
    this.saving.set(true);
    this.service.create({
      lockGroupId: lock.groupId,
      memberNo: this.searchForm.controls.memberNo.value.trim(),
      holes: Number(this.searchForm.controls.holes.value),
      players,
      contactMobile: this.playersForm.controls.contactMobile.value.trim() || undefined,
      remarks: this.playersForm.controls.remarks.value.trim() || undefined,
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

  // ---------- change booking ----------

  openChange(b: GolfBookingRow): void {
    this.clearMessages();
    this.mode.set('change');
    this.changeTarget.set(b);
    this.searchForm.reset({
      memberNo: b.bookerMemberNo || (b.players[0] ? b.players[0].memberNo || '' : ''),
      playDate: b.playDate,
      time: b.startTime,
      players: b.players.length,
      holes: b.holes,
    });
    this.searchForm.markAsPristine();
    this.courseId.set('');
    this.context.set(null);
    this.memberWarning.set('');
    this.groups.set([]);
    this.lock.set(null);
    this.lockedGroup.set(null);
    this.playerLines.clear();
    for (const p of b.players) this.playerLines.push(this.existingLineGroup(p));
    this.playersForm.reset({ lines: [], contactMobile: b.contactMobile || '', remarks: b.remarks || '' });
    this.playersForm.markAsPristine();
    this.changePreview.set(null);
    this.changeReason.set('');
    this.changeWaive.set(false);
    this.changeWaiveReason.set('');
    this.step.set('players');
    this.dialogOpen.set(true);
  }

  // "Move flight": walk the search → flights steps as the booker, the
  // booking's own seats and day-limit evidence excluded server-side.
  moveFlight(): void {
    this.clearMessages();
    const go = () => {
      this.searchForm.controls.players.setValue(this.playerLines.length);
      this.step.set('search');
    };
    if (this.context()) go();
    else this.loadContext(go);
  }

  // Back on the Players view without moving: release the held flight.
  keepCurrentFlight(): void {
    const lock = this.lock();
    if (lock) this.service.releaseLock(lock.groupId).subscribe({ next: () => {}, error: () => {} });
    this.lock.set(null);
    this.lockedGroup.set(null);
    this.stopCountdown();
    this.step.set('players');
  }

  private changePayload(): GolfChangePayload | null {
    const lines = this.validateLines();
    if (!lines) return null;
    const raw = this.playerLines.controls.map((g) => g.getRawValue());
    const players: GolfChangeLine[] = raw.map((l, i) => (l.playerId ? { playerId: l.playerId } : lines[i]));
    const lock = this.lock();
    return {
      lockGroupId: lock ? lock.groupId : null,
      players,
      contactMobile: this.playersForm.controls.contactMobile.value.trim() || null,
      remarks: this.playersForm.controls.remarks.value.trim() || null,
      reason: this.changeReason().trim() || undefined,
      waiveCharge: this.changeWaive(),
      waiveReason: this.changeWaive() ? this.changeWaiveReason().trim() : undefined,
    };
  }

  reviewChange(): void {
    this.clearMessages();
    const target = this.changeTarget();
    const payload = this.changePayload();
    if (!target || !payload) return;
    this.saving.set(true);
    this.service.changePreview(target.id, payload).subscribe({
      next: (p) => {
        this.saving.set(false);
        this.changePreview.set(p);
        this.step.set('review');
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to review the change.');
      },
    });
  }

  backToPlayers(): void {
    this.step.set('players');
  }

  confirmChange(): void {
    this.clearMessages();
    const target = this.changeTarget();
    const preview = this.changePreview();
    const payload = this.changePayload();
    if (!target || !preview || !payload) return;
    if (preview.charge && this.changeWaive() && !this.changeWaiveReason().trim()) {
      this.errorMessage.set('Give a reason for waiving the late-change charge.');
      return;
    }
    this.saving.set(true);
    this.service.change(target.id, payload).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.lock.set(null);
        this.stopCountdown();
        this.dialogOpen.set(false);
        this.mode.set('new');
        this.successMessage.set(res.message);
        this.listDate.set(preview.after.playDate);
        this.returnScroll.remember('/golf/bookings', target.id);
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to change the booking.');
        if (err.status === 409) this.step.set('players');
      },
    });
  }

  changeConfirmLabel(): string {
    const p = this.changePreview();
    if (!p) return 'Confirm change';
    if (p.charge && !this.changeWaive()) return `Change and charge ${p.charge.totalAmount.toFixed(2)}`;
    if (p.charge && this.changeWaive()) return 'Change and waive charge';
    return p.moved ? 'Move booking' : 'Confirm change';
  }

  changeTypeLabel(t: string): string {
    switch (t) {
      case 'move': return 'Flight moved';
      case 'roster': return 'Players changed';
      case 'header': return 'Details updated';
      default: return 'Flight and players changed';
    }
  }

  // ---------- change history ----------

  openHistory(b: GolfBookingRow): void {
    this.clearMessages();
    this.historyTarget.set(b);
    this.historyRows.set([]);
    this.historyLoading.set(true);
    this.service.changes(b.id).subscribe({
      next: (res) => {
        this.historyRows.set(res.changes);
        this.historyLoading.set(false);
      },
      error: (err) => {
        this.historyLoading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load the change history.');
      },
    });
  }

  // ---------- cancel ----------

  openCancel(b: GolfBookingRow): void {
    this.clearMessages();
    this.cancelTarget.set(b);
    this.cancelReason.set('');
    this.cancelPreview.set(null);
    this.waiveCharge.set(false);
    this.waiveReason.set('');
    this.previewLoading.set(true);
    this.service.cancelPreview(b.id).subscribe({
      next: (p) => {
        this.cancelPreview.set(p);
        this.previewLoading.set(false);
      },
      error: (err) => {
        this.previewLoading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to check the cancellation notice.');
      },
    });
  }

  statusLabel(status: string): string {
    switch (status) {
      case 'booked': return 'BOOKED';
      case 'no-show': return 'NO SHOW';
      default: return 'CANCELLED';
    }
  }

  confirmCancel(): void {
    const target = this.cancelTarget();
    if (!target || this.cancelRefused()) return;
    const waive = this.cancelCharged() && this.waiveCharge();
    if (waive && !this.waiveReason().trim()) {
      this.errorMessage.set('Give a reason for waiving the late-cancellation charge.');
      return;
    }
    this.cancelling.set(true);
    this.service.cancel(target.id, this.cancelReason().trim(), waive ? { waiveReason: this.waiveReason().trim() } : undefined).subscribe({
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
