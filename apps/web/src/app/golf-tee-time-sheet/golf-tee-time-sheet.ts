import { Component, Injector, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { CanDirective } from '../shared/can.directive';
import { DialogComponent } from '../shared/dialog/dialog';
import { ComboboxComponent } from '../shared/combobox/combobox';
import { OverflowMenuComponent, MenuItemDirective } from '../shared/overflow-menu/overflow-menu';
import { MoneyInputDirective } from '../shared/money-input.directive';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { ScrollReturnService } from '../services/scroll-return.service';
import {
  GolfFrontDeskService,
  FrontDeskCourseSheet,
  FrontDeskFlight,
  FrontDeskEntry,
  FrontDeskMeta,
  GolfBillDoc,
  WalkInPayload,
  FrontDeskNoShowReview,
} from '../services/golf-frontdesk.service';

// Per-booking decision in the no-show review: include it, charge the
// booker (default) or waive with a reason.
interface NoShowDecision {
  include: boolean;
  charge: boolean;
  waiveReason: string;
}

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
  selector: 'app-golf-tee-time-sheet',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, ScreenTitlePipe, ScreenSubtitlePipe, FavStarComponent,
    CanDirective, DialogComponent, ComboboxComponent, OverflowMenuComponent, MenuItemDirective,
    MoneyInputDirective, LocalDatePipe,
  ],
  templateUrl: './golf-tee-time-sheet.html',
  styleUrls: ['../system-setup/system-setup.css', '../membership-types/membership-types.css', './golf-tee-time-sheet.css'],
})
export class GolfTeeTimeSheetComponent implements OnInit {
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

  // The flight's dots: a colour per player, null per free seat.
  dots(f: FrontDeskFlight): (PlayerDayStatus | null)[] {
    const max = f.maxPlayers ?? f.entries.length;
    return Array.from({ length: Math.max(max, f.entries.length) }, (_, i) =>
      i < f.entries.length ? this.statusOf(f.entries[i]) : null);
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
  readonly flightRef = signal<{ courseId: string; teeTime: string } | null>(null);
  readonly flightCourse = computed(() => {
    const ref = this.flightRef();
    return ref ? this.sheet().find((c) => c.courseId === ref.courseId) || null : null;
  });
  readonly flight = computed(() => {
    const ref = this.flightRef();
    const course = this.flightCourse();
    return ref && course ? course.flights.find((f) => f.teeTime === ref.teeTime) || null : null;
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

  // Settlement lines (dynamic rows outside the FormGroup, house pattern).
  readonly payments = signal<PaymentLine[]>([]);
  readonly paymentsDirty = signal(false);

  // In-dialog confirm view: cancel a registration or void a bill.
  readonly confirmKind = signal<'cancel-registration' | 'void-bill' | null>(null);
  readonly confirmTarget = signal<FrontDeskEntry | null>(null);
  readonly confirmReason = signal('');

  // No-show review (desk-confirmed, 2026-10-06): the day's still-booked
  // players past their tee time grouped by booking, with the charge the
  // booker will be posted; the clerk ticks bookings and confirms.
  readonly noShowReview = signal<FrontDeskNoShowReview | null>(null);
  readonly noShowDecisions = signal<Record<string, NoShowDecision>>({});
  readonly noShowDirty = signal(false);
  readonly noShowIncluded = computed(() => {
    const r = this.noShowReview();
    const d = this.noShowDecisions();
    return r ? r.bookings.filter((b) => d[b.bookingProfileId]?.include !== false) : [];
  });
  readonly noShowPlayerCount = computed(() => this.noShowIncluded().reduce((s, b) => s + b.players.length, 0));
  readonly noShowChargeTotal = computed(() => {
    const d = this.noShowDecisions();
    return Math.round(this.noShowIncluded().reduce((s, b) => s + (b.charge && d[b.bookingProfileId]?.charge !== false ? b.charge.totalAmount : 0), 0) * 100) / 100;
  });
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

  readonly paidTotal = computed(() => Math.round(this.payments().reduce((s, p) => s + (Number(p.amount) || 0), 0) * 100) / 100);
  readonly remaining = computed(() => {
    const b = this.bill();
    return Math.round(((b ? b.totalAmount : 0) - this.paidTotal()) * 100) / 100;
  });

  readonly dialogTitle = computed(() => {
    switch (this.dlgMode()) {
      case 'flight': {
        const c = this.flightCourse();
        const ref = this.flightRef();
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
        this.payments.set([]);
        this.paymentsDirty.set(false);
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
    this.payments.set([]);
    this.paymentsDirty.set(false);
    this.dlgMode.set('flight');
    this.load();
  }

  billOpen(): boolean {
    const b = this.bill();
    return !!b && b.status === 'open';
  }

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
    if (this.payments().length === 0) {
      this.payments.set([{ paymentTypeId: '', amount: b.totalAmount, reference: '' }]);
    }
    this.dlgMode.set('settle');
  }

  backToBill(): void {
    this.dlgMode.set('bill');
  }

  addPayment(): void {
    this.payments.update((rows) => [...rows, { paymentTypeId: '', amount: Math.max(this.remaining(), 0), reference: '' }]);
    this.paymentsDirty.set(true);
  }

  removePayment(index: number): void {
    this.payments.update((rows) => rows.filter((_, i) => i !== index));
    this.paymentsDirty.set(true);
  }

  setPayment(index: number, patch: Partial<PaymentLine>): void {
    this.payments.update((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    this.paymentsDirty.set(true);
  }

  settle(): void {
    this.clearMessages();
    const b = this.bill();
    if (!b) return;
    const rows = this.payments();
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
        this.paymentsDirty.set(false);
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
    this.noShowDecisions.set({});
    this.noShowDirty.set(false);
    this.flightRef.set(null);
    this.dlgMode.set('noshows');
    this.busy.set(true);
    this.service.noShows(this.listDate()).subscribe({
      next: (r) => {
        this.noShowReview.set(r);
        const d: Record<string, NoShowDecision> = {};
        for (const b of r.bookings) d[b.bookingProfileId] = { include: true, charge: !b.chargeError, waiveReason: '' };
        this.noShowDecisions.set(d);
        this.busy.set(false);
      },
      error: (err) => {
        this.busy.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load the no-show review.');
      },
    });
  }

  decisionOf(bookingProfileId: string): NoShowDecision {
    return this.noShowDecisions()[bookingProfileId] || { include: true, charge: true, waiveReason: '' };
  }

  setDecision(bookingProfileId: string, patch: Partial<NoShowDecision>): void {
    this.noShowDecisions.update((d) => ({ ...d, [bookingProfileId]: { ...this.decisionOf(bookingProfileId), ...patch } }));
    this.noShowDirty.set(true);
  }

  confirmNoShows(): void {
    const review = this.noShowReview();
    if (!review) return;
    this.clearMessages();
    const d = this.noShowDecisions();
    const lines = this.noShowIncluded().map((b) => ({
      bookingProfileId: b.bookingProfileId,
      charge: review.controlled && d[b.bookingProfileId]?.charge !== false,
      waiveReason: d[b.bookingProfileId]?.waiveReason?.trim() || undefined,
    }));
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
        this.noShowDirty.set(false);
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
    if (ref) this.returnScroll.remember('/golf/tee-time-sheet', `${ref.courseId}|${ref.teeTime}`);
    this.dlgMode.set(null);
    this.flightRef.set(null);
    this.fromFlight.set(false);
    this.bill.set(null);
    this.payments.set([]);
    this.paymentsDirty.set(false);
    this.confirmKind.set(null);
    this.confirmTarget.set(null);
    this.slotWalkinOpen.set(false);
    this.selected.set(new Set());
    this.noShowReview.set(null);
    this.noShowDirty.set(false);
    this.load();
  }

  isDirty(): boolean {
    switch (this.dlgMode()) {
      case 'flight': return this.slotWalkinOpen() && this.slotWalkinForm.dirty;
      case 'walkin': return this.walkinForm.dirty;
      case 'settle': return this.paymentsDirty();
      case 'noshows': return this.noShowDirty();
      default: return false; // bill items save immediately
    }
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
