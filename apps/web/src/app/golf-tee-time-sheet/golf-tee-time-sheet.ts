import { Component, Injector, OnInit, computed, inject, signal, DestroyRef, ChangeDetectionStrategy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { CanDirective } from '../shared/can.directive';
import { DialogComponent } from '../shared/dialog/dialog';
import { ComboboxComponent } from '../shared/combobox/combobox';
import { OverflowMenuComponent, MenuItemDirective } from '../shared/overflow-menu/overflow-menu';
import { MoneyInputDirective } from '../shared/money-input.directive';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { PhoneInputComponent } from '../shared/phone-input/phone-input';
import { ScrollReturnService } from '../services/scroll-return.service';
import {
  GolfFrontDeskService,
  FrontDeskCourseSheet,
  FrontDeskFlight,
  FrontDeskEntry,
  FrontDeskGroupBlock,
  FrontDeskGroupFlight,
  FrontDeskMeta,
  GolfBillDoc,
  WalkInPayload,
  FrontDeskNoShowReview,
} from '../services/golf-frontdesk.service';

// Per-booking decision in the no-show review: include it, charge the
// booker (default) or waive with a reason.
// One review row per booking: ticked = recorded as a no-show; waive = the
// booker is NOT charged (reason required).
type NoShowGroup = FormGroup<{
  bookingProfileId: FormControl<string>;
  include: FormControl<boolean>;
  waive: FormControl<boolean>;
  waiveReason: FormControl<string>;
}>;

// Golf Management → Front Desk → Tee Time Sheet (/golf/tee-time-sheet; the
// menu was renamed from Front Desk 2026-10-06 - Front Desk is now the GROUP,
// the counter where golfers register and pay; this is its tee sheet) - the
// day-of-play cycle.
// Tee sheet redesign (user decisions 2026-09-29): each COURSE is its own
// CARD with its own timeline (courses may run different grids), a flight
// row shows the tee time + one status-coloured seat dot per player (colours
// from Golf Specification; blank outline = free seat) + the player names,
// and CLICKING THE FLIGHT opens the one drawer in 'flight' mode - the
// flight workspace with all seats as slots: booked players multi-select to
// register, registered players bill from their row, free slots take a
// walk-in directly. Billing/settlement stay as further views of the same
// dialog; cancel-registration / void-bill are an in-dialog confirm view
// (single-dialog standard). The FAB keeps free-form walk-in entry.
interface PaymentLine {
  paymentTypeId: string;
  amount: number;
  reference: string;
}
type PayGroup = FormGroup<{
  paymentTypeId: FormControl<string>;
  amount: FormControl<number>;
  reference: FormControl<string>;
}>;

type PlayerDayStatus = 'booked' | 'registered' | 'billed' | 'settled';

const DEFAULT_DOT_COLORS: Record<PlayerDayStatus, string> = {
  booked: '#2563eb',
  registered: '#f59e0b',
  billed: '#8b5cf6',
  settled: '#16a34a',
};

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-golf-tee-time-sheet',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, ScreenTitlePipe, ScreenSubtitlePipe, FavStarComponent,
    CanDirective, DialogComponent, ComboboxComponent, OverflowMenuComponent, MenuItemDirective,
    MoneyInputDirective, LocalDatePipe, PhoneInputComponent,
  ],
  templateUrl: './golf-tee-time-sheet.html',
  styleUrls: ['../system-setup/system-setup.css', '../membership-types/membership-types.css', './golf-tee-time-sheet.css'],
})
export class GolfTeeTimeSheetComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(GolfFrontDeskService);
  private readonly fb = inject(FormBuilder);
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);

  readonly loading = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly listDate = signal(localToday());
  readonly meta = signal<FrontDeskMeta | null>(null);

  // ---- the tee sheet: one card per course, each with its own timeline ----
  readonly sheet = signal<FrontDeskCourseSheet[]>([]);
  readonly search = signal('');

  // Flights whose players match the search (name, member no, booking no or
  // registration no) - matches highlight, the rest dim.
  readonly matchKeys = computed(() => {
    const q = this.search().trim().toLowerCase();
    const hits = new Set<string>();
    if (!q) return hits;
    for (const c of this.sheet()) {
      for (const f of c.flights) {
        const hit = f.entries.some((e) =>
          e.playerName.toLowerCase().includes(q)
          || (e.memberNo || '').toLowerCase().includes(q)
          || (e.bookingNo || '').toLowerCase().includes(q)
          || (e.registration?.registrationNo || '').toLowerCase().includes(q));
        if (hit) hits.add(`${c.courseId}|${f.teeTime}`);
      }
    }
    return hits;
  });

  readonly searchActive = computed(() => this.search().trim().length > 0);

  // Collapsible course cards (user request 2026-09-30): each card's header
  // toggles its flight list - most useful on mobile where the cards stack
  // into one long scroll. State is per course id and an ACTIVE SEARCH
  // auto-expands every card so matches are never hidden behind a fold.
  readonly collapsedCourses = signal<Set<string>>(new Set());

  cardCollapsed(courseId: string): boolean {
    return this.collapsedCourses().has(courseId) && !this.searchActive();
  }

  toggleCourse(courseId: string): void {
    this.collapsedCourses.update((set) => {
      const next = new Set(set);
      if (next.has(courseId)) next.delete(courseId);
      else next.add(courseId);
      return next;
    });
  }

  isHit(courseId: string, teeTime: string): boolean {
    return this.matchKeys().has(`${courseId}|${teeTime}`);
  }

  onSearch(value: string): void {
    this.search.set(value);
    // Bring the first matching flight into view once the classes render.
    setTimeout(() => {
      const el = document.querySelector('.fd-flight--hit');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    });
  }

  // ---- seat dots: one per player, coloured by day status ----

  statusOf(e: FrontDeskEntry): PlayerDayStatus {
    if (e.bill?.status === 'settled') return 'settled';
    if (e.bill) return 'billed';
    if (e.registration) return 'registered';
    return 'booked';
  }

  colorFor(status: PlayerDayStatus): string {
    const colors = this.meta()?.teeSheetColors;
    return (colors && colors[status]) || DEFAULT_DOT_COLORS[status];
  }

  statusLabel(status: PlayerDayStatus): string {
    return status === 'booked' ? 'Booked' : status === 'registered' ? 'Registered' : status === 'billed' ? 'Billed' : 'Settled';
  }

  readonly legend: PlayerDayStatus[] = ['booked', 'registered', 'billed', 'settled'];

  // The flight's dots: a colour per player, 'reserved' per seat a group
  // flight holds without a drawn player yet, null per free seat.
  dots(f: FrontDeskFlight): (PlayerDayStatus | 'reserved' | null)[] {
    const max = f.maxPlayers ?? f.entries.length;
    const reserved = f.reserved || 0;
    return Array.from({ length: Math.max(max, f.entries.length + reserved) }, (_, i) =>
      i < f.entries.length ? this.statusOf(f.entries[i]) : i < f.entries.length + reserved ? 'reserved' : null);
  }

  dotColor(s: PlayerDayStatus | 'reserved' | null): string | null {
    return s === null || s === 'reserved' ? null : this.colorFor(s);
  }

  dotTitle(s: PlayerDayStatus | 'reserved' | null, f: FrontDeskFlight): string {
    if (s === null) return 'Available';
    if (s === 'reserved') return `Reserved for ${f.reservedBy || 'a group'}`;
    return this.statusLabel(s);
  }

  // A flight opens the drawer when there is anything to do there.
  flightOpenable(f: FrontDeskFlight): boolean {
    if (f.closed || f.crossoverOnly) return false;
    return f.entries.length > 0 || (!f.offGrid && (f.seatsLeft > 0 || f.maxPlayers !== null));
  }

  // ---- the one drawer dialog: mode + per-mode state ----
  readonly dlgMode = signal<'flight' | 'walkin' | 'bill' | 'settle' | 'confirm' | 'noshows' | null>(null);
  readonly busy = signal(false);

  // The open flight, tracked by reference so a reload refreshes it in place.
  // A GROUP flight (shotgun-format play day, 2026-10-07) is referenced by
  // its reserved-flight id and projected onto the same flight shape, so the
  // drawer works unchanged: register selected, bill, cancel, void.
  readonly flightRef = signal<{ courseId: string; teeTime: string; groupFlightId?: string } | null>(null);
  readonly flightCourse = computed(() => {
    const ref = this.flightRef();
    return ref ? this.sheet().find((c) => c.courseId === ref.courseId) || null : null;
  });
  readonly groupFlight = computed<{ block: FrontDeskGroupBlock; gf: FrontDeskGroupFlight } | null>(() => {
    const ref = this.flightRef();
    const course = this.flightCourse();
    if (!ref || !ref.groupFlightId || !course) return null;
    for (const block of course.groups || []) {
      const gf = block.flights.find((f) => f.id === ref.groupFlightId);
      if (gf) return { block, gf };
    }
    return null;
  });
  readonly flight = computed<FrontDeskFlight | null>(() => {
    const ref = this.flightRef();
    const course = this.flightCourse();
    if (!ref || !course) return null;
    if (ref.groupFlightId) {
      const g = this.groupFlight();
      if (!g) return null;
      // maxPlayers null: a group flight takes no walk-ins (no free slots).
      return {
        teeTime: g.gf.teeTime, maxPlayers: null, isFrontDesk: false, crossoverOnly: false, closed: false,
        seatsTaken: g.gf.entries.length, seatsLeft: 0, crossCount: 0, entries: g.gf.entries,
      };
    }
    return course.flights.find((f) => f.teeTime === ref.teeTime) || null;
  });

  // Free-seat slots of the open flight (drawer shows every seat).
  readonly freeSlots = computed(() => {
    const f = this.flight();
    if (!f || f.offGrid || f.maxPlayers === null) return [];
    return Array.from({ length: Math.max(0, f.maxPlayers - f.entries.length) }, (_, i) => i);
  });

  // Multi-select of still-booked players for registration.
  readonly selected = signal<Set<string>>(new Set());

  toggleSelected(playerId: string): void {
    this.selected.update((s) => {
      const next = new Set(s);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }

  readonly selectableCount = computed(() => {
    const f = this.flight();
    return f ? f.entries.filter((e) => !e.registration).length : 0;
  });

  // Inline walk-in form inside a free slot of the flight drawer.
  readonly slotWalkinOpen = signal(false);
  readonly slotWalkinForm = this.fb.nonNullable.group({
    playerType: ['member', [Validators.required]],
    memberNo: [''],
    guestName: [''],
    guestIdentityNo: [''],
    guestMobile: [''],
    holes: [18, [Validators.required]],
  });

  // Free-form walk-in (the FAB).
  readonly walkinForm = this.fb.nonNullable.group({
    courseId: ['', [Validators.required]],
    teeTime: ['', [Validators.required]],
    holes: [18, [Validators.required]],
    playerType: ['member', [Validators.required]],
    memberNo: [''],
    guestName: [''],
    guestIdentityNo: [''],
    guestMobile: [''],
  });

  // Billing drawer (reached from a flight row - Back returns to the flight).
  readonly bill = signal<GolfBillDoc | null>(null);
  readonly billEntryName = signal('');
  // The billed player's category - a golfer-typed tile (green fee / buggy /
  // caddy default) shows only to its own category; untyped tiles to everyone
  // (2026-10-06). The server refuses a mismatched tile regardless.
  readonly billPlayerType = signal('');
  // Package eligibility (2026-10-06): tiles the billed golfer does not
  // qualify for, with the reason - rendered disabled, never hidden.
  readonly ineligible = signal<Record<string, string>>({});
  readonly visibleTiles = computed(() => {
    const m = this.meta();
    const cat = this.billPlayerType();
    return (m ? m.tiles : []).filter((t) => !t.golferType || t.golferType === cat);
  });
  readonly fromFlight = signal(false);

  // Settlement lines - a reactive FormArray (house standard): its dirty state
  // feeds the unsaved-changes guard and Enter submits the settle form.
  readonly payLines = this.fb.array<PayGroup>([]);
  readonly settleForm = this.fb.group({ lines: this.payLines });

  // In-dialog confirm view: cancel a registration or void a bill.
  readonly confirmKind = signal<'cancel-registration' | 'void-bill' | null>(null);
  readonly confirmTarget = signal<FrontDeskEntry | null>(null);
  readonly confirmReason = signal('');

  // No-show review (desk-confirmed, 2026-10-06): the day's still-booked
  // players past their tee time grouped by booking, with the charge the
  // booker will be posted; the clerk ticks bookings and confirms.
  readonly noShowReview = signal<FrontDeskNoShowReview | null>(null);
  // One group per booking, index-aligned with the review's bookings - a
  // reactive FormArray (house standard); its dirty state feeds the guard.
  readonly noShowLines = this.fb.array<NoShowGroup>([]);
  readonly noShowForm = this.fb.group({ lines: this.noShowLines });
  // Methods, not computeds: they read form controls, which signals cannot track.
  noShowIncluded(): FrontDeskNoShowReview['bookings'] {
    const r = this.noShowReview();
    return r ? r.bookings.filter((_, i) => this.noShowLines.at(i)?.controls.include.value !== false) : [];
  }
  noShowPlayerCount(): number {
    return this.noShowIncluded().reduce((s, b) => s + b.players.length, 0);
  }
  noShowChargeTotal(): number {
    const r = this.noShowReview();
    if (!r) return 0;
    return Math.round(r.bookings.reduce((s, b, i) => {
      const g = this.noShowLines.at(i);
      return s + (b.charge && g && g.controls.include.value && !g.controls.waive.value ? b.charge.totalAmount : 0);
    }, 0) * 100) / 100;
  }
  // Today or a past date: the review only makes sense once tee times pass.
  readonly noShowAvailable = computed(() => this.listDate() <= localToday());

  readonly courseOptions = computed(() => {
    const m = this.meta();
    return (m ? m.courses : []).map((c) => ({
      value: c.id,
      label: `${c.courseCode}${c.description ? ' — ' + c.description : ''}`,
    }));
  });

  readonly tenderOptions = computed(() => {
    const m = this.meta();
    return (m ? m.paymentTypes : []).map((t) => ({
      value: t.id,
      label: `${t.paymentType}${t.description ? ' — ' + t.description : ''}`,
    }));
  });

  // Methods, not computeds: they read form controls, which signals cannot track.
  paidTotal(): number {
    return Math.round(this.payLines.controls.reduce((s, g) => s + (Number(g.controls.amount.value) || 0), 0) * 100) / 100;
  }
  remaining(): number {
    const b = this.bill();
    return Math.round(((b ? b.totalAmount : 0) - this.paidTotal()) * 100) / 100;
  }

  readonly dialogTitle = computed(() => {
    switch (this.dlgMode()) {
      case 'flight': {
        const c = this.flightCourse();
        const ref = this.flightRef();
        const g = this.groupFlight();
        if (g) return `${g.block.groupName} · ${g.gf.flightLabel} ${g.gf.teeTime}`;
        return c && ref ? `${c.courseCode} · ${ref.teeTime}` : 'Flight';
      }
      case 'walkin': return 'Walk-in registration';
      case 'noshows': return 'No-shows';
      case 'settle': return `Settle bill ${this.bill()?.billNo || ''}`;
      case 'confirm': return this.confirmKind() === 'void-bill' ? 'Void bill' : 'Cancel registration';
      default: return `Bill ${this.bill()?.billNo || ''}`;
    }
  });

  ngOnInit(): void {
    this.load();
    this.service.meta().subscribe({ next: (m) => this.meta.set(m), error: () => {} });
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  playerTypeLabel(key: string): string {
    const m = this.meta();
    const t = m ? m.playerTypes.find((p) => p.key === key) : null;
    return t ? t.label : key;
  }

  setListDate(value: string): void {
    if (!value) return;
    this.listDate.set(value);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.service.day(this.listDate()).subscribe({
      next: (res) => {
        this.sheet.set(res.courses);
        this.loading.set(false);
        this.returnScroll.consume('/golf/tee-time-sheet', this.injector);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load the day.');
      },
    });
  }

  // ---------- the flight drawer ----------

  openFlight(course: FrontDeskCourseSheet, f: FrontDeskFlight): void {
    if (!this.flightOpenable(f)) return;
    this.clearMessages();
    this.flightRef.set({ courseId: course.courseId, teeTime: f.teeTime });
    // Preselect every still-booked player - "register the flight" is one click.
    this.selected.set(new Set(f.entries.filter((e) => !e.registration).map((e) => e.playerId)));
    this.slotWalkinOpen.set(false);
    this.resetSlotWalkin();
    this.fromFlight.set(false);
    this.dlgMode.set('flight');
  }

  // ---- group blocks (2026-10-07) ----

  openGroupFlight(course: FrontDeskCourseSheet, gf: FrontDeskGroupFlight): void {
    this.clearMessages();
    this.flightRef.set({ courseId: course.courseId, teeTime: gf.teeTime, groupFlightId: gf.id });
    this.selected.set(new Set(gf.entries.filter((e) => !e.registration).map((e) => e.playerId)));
    this.slotWalkinOpen.set(false);
    this.fromFlight.set(false);
    this.dlgMode.set('flight');
  }

  readonly registeringGroup = signal<string | null>(null);

  // Register every still-booked player of the group on this date in one go
  // (the server reports registered vs skipped).
  registerGroup(block: FrontDeskGroupBlock): void {
    this.clearMessages();
    this.registeringGroup.set(block.bookingProfileId);
    this.service.registerGroup(block.bookingProfileId, this.listDate()).subscribe({
      next: (res) => {
        this.registeringGroup.set(null);
        if (res.skipped.length) this.errorMessage.set(res.message);
        else this.successMessage.set(res.message);
        this.load();
      },
      error: (err) => {
        this.registeringGroup.set(null);
        this.errorMessage.set(err.error?.message || 'The group could not be registered.');
      },
    });
  }

  formatLabel(key: string): string {
    switch (key) {
      case 'two-tee': return 'Two-tee start';
      case 'shotgun': return 'Shotgun';
      case 'modified-shotgun': return 'Modified shotgun';
      default: return 'Traditional';
    }
  }

  groupFlightDots(gf: FrontDeskGroupFlight): (PlayerDayStatus | null)[] {
    return Array.from({ length: Math.max(gf.capacity, gf.entries.length) }, (_, i) =>
      i < gf.entries.length ? this.statusOf(gf.entries[i]) : null);
  }

  private resetSlotWalkin(): void {
    // A 9-holes-only flight (crossover closed / day ends first) seeds 9 -
    // its 18-hole option is disabled in the select.
    this.slotWalkinForm.reset({
      playerType: 'member', memberNo: '', guestName: '', guestIdentityNo: '', guestMobile: '',
      holes: this.flight()?.nineHolesOnly === true ? 9 : 18,
    });
  }

  registerSelected(): void {
    this.clearMessages();
    const f = this.flight();
    const ids = [...this.selected()].filter((id) => f?.entries.some((e) => e.playerId === id && !e.registration));
    if (!ids.length) return;
    this.busy.set(true);
    const entriesById = new Map((f?.entries || []).map((e) => [e.playerId, e]));
    const messages: string[] = [];
    const failures: string[] = [];
    const step = (i: number) => {
      if (i >= ids.length) {
        this.busy.set(false);
        this.selected.set(new Set());
        if (failures.length) this.errorMessage.set(failures.join(' '));
        if (messages.length) this.successMessage.set(messages.join(' '));
        this.load();
        return;
      }
      this.service.registerBooked(ids[i]).subscribe({
        next: (res) => {
          messages.push(res.message);
          step(i + 1);
        },
        error: (err) => {
          const name = entriesById.get(ids[i])?.playerName || 'player';
          failures.push(`${name}: ${err.error?.message || 'registration failed'}`);
          step(i + 1);
        },
      });
    };
    step(0);
  }

  openSlotWalkin(): void {
    this.resetSlotWalkin();
    this.slotWalkinOpen.set(true);
  }

  submitSlotWalkin(): void {
    this.clearMessages();
    const ref = this.flightRef();
    if (!ref) return;
    const v = this.slotWalkinForm.getRawValue();
    const payload: WalkInPayload = {
      playDate: this.listDate(),
      courseId: ref.courseId,
      teeTime: ref.teeTime,
      holes: Number(v.holes),
      playerType: v.playerType,
    };
    if (v.playerType === 'guest') {
      if (!v.guestName.trim()) {
        this.errorMessage.set("Key in the guest name (or 'Guest').");
        return;
      }
      payload.guest = {
        name: v.guestName.trim(),
        identityNo: v.guestIdentityNo.trim() || undefined,
        mobile: v.guestMobile.trim() || undefined,
      };
    } else {
      if (!v.memberNo.trim()) {
        this.errorMessage.set('Key in the member number.');
        return;
      }
      payload.memberNo = v.memberNo.trim();
    }
    this.busy.set(true);
    this.service.registerWalkIn(payload).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.slotWalkinOpen.set(false);
        this.resetSlotWalkin();
        this.successMessage.set(res.message);
        this.load();
      },
      error: (err) => {
        this.busy.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to register the walk-in.');
      },
    });
  }

  // ---------- free-form walk-in (the FAB) ----------

  openWalkIn(): void {
    this.clearMessages();
    const m = this.meta();
    this.walkinForm.reset({
      courseId: m && m.courses.length === 1 ? m.courses[0].id : '',
      teeTime: '',
      holes: 18,
      playerType: 'member',
      memberNo: '',
      guestName: '',
      guestIdentityNo: '',
      guestMobile: '',
    });
    this.flightRef.set(null);
    this.dlgMode.set('walkin');
  }

  submitWalkIn(): void {
    this.clearMessages();
    if (this.walkinForm.invalid) {
      this.walkinForm.markAllAsTouched();
      return;
    }
    const v = this.walkinForm.getRawValue();
    const payload: WalkInPayload = {
      playDate: this.listDate(),
      courseId: v.courseId,
      teeTime: v.teeTime,
      holes: Number(v.holes),
      playerType: v.playerType,
    };
    if (v.playerType === 'guest') {
      if (!v.guestName.trim()) {
        this.errorMessage.set("Key in the guest name (or 'Guest').");
        return;
      }
      payload.guest = {
        name: v.guestName.trim(),
        identityNo: v.guestIdentityNo.trim() || undefined,
        mobile: v.guestMobile.trim() || undefined,
      };
    } else {
      if (!v.memberNo.trim()) {
        this.errorMessage.set('Key in the member number.');
        return;
      }
      payload.memberNo = v.memberNo.trim();
    }
    this.busy.set(true);
    this.service.registerWalkIn(payload).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.dlgMode.set(null);
        this.successMessage.set(res.message);
        // Return-to-row: scroll the flight the walk-in just joined into view.
        this.returnScroll.remember('/golf/tee-time-sheet', `${payload.courseId}|${payload.teeTime}`);
        this.load();
      },
      error: (err) => {
        this.busy.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to register the walk-in.');
      },
    });
  }

  // ---------- billing ----------

  openBill(entry: FrontDeskEntry): void {
    this.clearMessages();
    if (!entry.registration) return;
    this.billEntryName.set(entry.playerName);
    this.billPlayerType.set(entry.playerType);
    this.busy.set(true);
    this.service.openBill(entry.registration.id).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.bill.set(res.bill);
        this.ineligible.set(res.ineligible || {});
        for (const w of res.warnings || []) this.errorMessage.set(w);
        this.resetPayLines();
        this.fromFlight.set(this.dlgMode() === 'flight');
        this.dlgMode.set('bill');
      },
      error: (err) => {
        this.busy.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to open the bill.');
      },
    });
  }

  backToFlight(): void {
    this.bill.set(null);
    this.resetPayLines();
    this.dlgMode.set('flight');
    this.load();
  }

  readonly billOpen = computed(() => {
    const b = this.bill();
    return !!b && b.status === 'open';
  });

  addTile(transactionTypeId: string): void {
    const b = this.bill();
    if (!b || !this.billOpen()) return;
    this.busy.set(true);
    this.service.addItem(b.id, transactionTypeId, 1).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.bill.set(res.bill);
      },
      error: (err) => {
        this.busy.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to add the item.');
      },
    });
  }

  setItemQuantity(itemId: string, value: string): void {
    const b = this.bill();
    const quantity = Math.max(1, Math.min(99, Math.floor(Number(value) || 1)));
    if (!b) return;
    this.service.updateItem(b.id, itemId, { quantity }).subscribe({
      next: (res) => this.bill.set(res.bill),
      error: (err) => this.errorMessage.set(err.error?.message || 'Failed to update the item.'),
    });
  }

  setItemPrice(itemId: string, value: string): void {
    const b = this.bill();
    const unitAmount = Number(value);
    if (!b || !Number.isFinite(unitAmount) || unitAmount < 0) return;
    this.service.updateItem(b.id, itemId, { unitAmount }).subscribe({
      next: (res) => this.bill.set(res.bill),
      error: (err) => this.errorMessage.set(err.error?.message || 'Failed to update the price.'),
    });
  }

  removeItem(itemId: string): void {
    const b = this.bill();
    if (!b) return;
    this.service.removeItem(b.id, itemId).subscribe({
      next: (res) => this.bill.set(res.bill),
      error: (err) => this.errorMessage.set(err.error?.message || 'Failed to remove the item.'),
    });
  }

  tileAllowsOverride(transactionTypeId: string): boolean {
    const m = this.meta();
    const tile = m ? m.tiles.find((t) => t.id === transactionTypeId) : null;
    return !!tile && tile.allowPriceOverride;
  }

  // ---------- settlement ----------

  toSettle(): void {
    const b = this.bill();
    if (!b || !this.billOpen() || b.items.length === 0) return;
    // Seed one line for the whole total (pristine: the guard only engages once the clerk edits).
    if (this.payLines.length === 0) {
      this.payLines.push(this.newPayGroup({ paymentTypeId: '', amount: b.totalAmount, reference: '' }), { emitEvent: false });
      this.payLines.markAsPristine();
    }
    this.dlgMode.set('settle');
  }

  backToBill(): void {
    this.dlgMode.set('bill');
  }

  private newPayGroup(l: PaymentLine): PayGroup {
    return this.fb.nonNullable.group({
      paymentTypeId: [l.paymentTypeId],
      amount: [l.amount],
      reference: [l.reference],
    });
  }

  private resetPayLines(): void {
    this.payLines.clear({ emitEvent: false });
    this.payLines.markAsPristine();
  }

  addPayment(): void {
    this.payLines.push(this.newPayGroup({ paymentTypeId: '', amount: Math.max(this.remaining(), 0), reference: '' }));
    this.payLines.markAsDirty();
  }

  removePayment(index: number): void {
    this.payLines.removeAt(index);
    this.payLines.markAsDirty();
  }

  settle(): void {
    this.clearMessages();
    const b = this.bill();
    if (!b) return;
    const rows: PaymentLine[] = this.payLines.controls.map((g) => g.getRawValue());
    if (rows.some((r) => !r.paymentTypeId)) {
      this.errorMessage.set('Every payment line needs a payment type.');
      return;
    }
    if (this.remaining() !== 0) {
      this.errorMessage.set('Payments must equal the bill total.');
      return;
    }
    this.busy.set(true);
    this.service.settle(b.id, rows.map((r) => ({
      paymentTypeId: r.paymentTypeId,
      amount: Number(r.amount) || 0,
      reference: r.reference.trim() || undefined,
    }))).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.successMessage.set(res.message);
        this.payLines.markAsPristine();
        if (this.fromFlight()) {
          this.backToFlight();
        } else {
          this.dlgMode.set(null);
          this.load();
        }
      },
      error: (err) => {
        this.busy.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to settle the bill.');
      },
    });
  }

  // ---------- in-dialog confirmations ----------

  askCancelRegistration(entry: FrontDeskEntry): void {
    this.clearMessages();
    this.confirmKind.set('cancel-registration');
    this.confirmTarget.set(entry);
    this.confirmReason.set('');
    this.dlgMode.set('confirm');
  }

  askVoidBill(entry: FrontDeskEntry): void {
    this.clearMessages();
    this.confirmKind.set('void-bill');
    this.confirmTarget.set(entry);
    this.confirmReason.set('');
    this.dlgMode.set('confirm');
  }

  keepConfirm(): void {
    this.confirmKind.set(null);
    this.confirmTarget.set(null);
    this.dlgMode.set('flight');
  }

  confirmAction(): void {
    const entry = this.confirmTarget();
    const kind = this.confirmKind();
    if (!entry || !kind) return;
    this.busy.set(true);
    const done = (message: string) => {
      this.busy.set(false);
      this.confirmKind.set(null);
      this.confirmTarget.set(null);
      this.successMessage.set(message);
      this.dlgMode.set('flight');
      this.load();
    };
    const fail = (err: { error?: { message?: string } }) => {
      this.busy.set(false);
      this.errorMessage.set(err.error?.message || 'The action failed.');
    };
    if (kind === 'cancel-registration' && entry.registration) {
      this.service.cancelRegistration(entry.registration.id, this.confirmReason().trim()).subscribe({ next: (r) => done(r.message), error: fail });
    } else if (kind === 'void-bill' && entry.bill) {
      this.service.voidBill(entry.bill.id, this.confirmReason().trim()).subscribe({ next: (r) => done(r.message), error: fail });
    }
  }

  // ---------- no-show review ----------

  openNoShows(): void {
    this.clearMessages();
    this.noShowReview.set(null);
    this.resetNoShowLines();
    this.flightRef.set(null);
    this.dlgMode.set('noshows');
    this.busy.set(true);
    this.service.noShows(this.listDate()).subscribe({
      next: (r) => {
        this.noShowReview.set(r);
        this.resetNoShowLines();
        for (const b of r.bookings) this.noShowLines.push(this.newNoShowGroup(b.bookingProfileId, !!b.chargeError), { emitEvent: false });
        this.noShowLines.markAsPristine();
        this.busy.set(false);
      },
      error: (err) => {
        this.busy.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load the no-show review.');
      },
    });
  }

  private newNoShowGroup(bookingProfileId: string, waive: boolean): NoShowGroup {
    const g: NoShowGroup = this.fb.nonNullable.group({
      bookingProfileId: [bookingProfileId],
      include: [true],
      waive: [waive],
      waiveReason: [''],
    });
    // Waiving only applies to an included booking (reactive-forms way: the
    // control is disabled, never the DOM attribute).
    g.controls.include.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((inc) => {
      if (inc) g.controls.waive.enable({ emitEvent: false });
      else g.controls.waive.disable({ emitEvent: false });
    });
    return g;
  }

  private resetNoShowLines(): void {
    this.noShowLines.clear({ emitEvent: false });
    this.noShowLines.markAsPristine();
  }

  confirmNoShows(): void {
    const review = this.noShowReview();
    if (!review) return;
    this.clearMessages();
    const lines = review.bookings.flatMap((b, i) => {
      const g = this.noShowLines.at(i);
      if (!g || !g.controls.include.value) return [];
      return [{
        bookingProfileId: b.bookingProfileId,
        charge: review.controlled && !g.controls.waive.value,
        waiveReason: g.controls.waiveReason.value.trim() || undefined,
      }];
    });
    if (!lines.length) return;
    if (review.controlled) {
      for (const l of lines) {
        if (!l.charge && !l.waiveReason) {
          const b = review.bookings.find((x) => x.bookingProfileId === l.bookingProfileId);
          this.errorMessage.set(`Give a reason for waiving the charge on booking ${b?.bookingNo || ''}.`);
          return;
        }
      }
    }
    this.busy.set(true);
    this.service.confirmNoShows(review.playDate, lines).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.noShowLines.markAsPristine();
        this.successMessage.set(r.message);
        this.dlgMode.set(null);
        this.noShowReview.set(null);
        this.load();
      },
      error: (err) => {
        this.busy.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to record the no-shows.');
      },
    });
  }

  closeDialog(): void {
    // Return-to-row (user request 2026-10-01): leaving the drawer scrolls the
    // clicked flight back into view (load() swaps the sheet for a spinner, so
    // the scroll position is lost without this). Remembered HERE, not at
    // open, so mid-drawer reloads (register/bill refresh the sheet) cannot
    // consume the memory early.
    const ref = this.flightRef();
    if (ref) this.returnScroll.remember('/golf/tee-time-sheet', `${ref.courseId}|${ref.groupFlightId || ref.teeTime}`);
    this.dlgMode.set(null);
    this.flightRef.set(null);
    this.fromFlight.set(false);
    this.bill.set(null);
    this.resetPayLines();
    this.confirmKind.set(null);
    this.confirmTarget.set(null);
    this.slotWalkinOpen.set(false);
    this.selected.set(new Set());
    this.noShowReview.set(null);
    this.resetNoShowLines();
    this.load();
  }

  isDirty(): boolean {
    switch (this.dlgMode()) {
      case 'flight': return this.slotWalkinOpen() && this.slotWalkinForm.dirty;
      case 'walkin': return this.walkinForm.dirty;
      case 'settle': return this.payLines.dirty;
      case 'noshows': return this.noShowLines.dirty;
      default: return false; // bill items save immediately
    }
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
