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
  FrontDeskRegistration,
  GolfBillDoc,
  WalkInPayload,
} from '../services/golf-frontdesk.service';

// Golf Management → Front Desk (/golf/front-desk) - the day-of-play cycle
// (user decisions 2026-09-26): register booked players and WALK-INS (per
// player, own Registration No.), bill per player (green fee auto-charged by
// the golfer category on the green-fee transaction type; billing tiles add
// items; packages explode), settle with multiple tenders (member class posts
// to the member's AR account). ONE drawer dialog hosts the flows as @switch
// views (guest identity → n/a, walk-in, bill items, settle); the centred
// confirm dialog covers cancel-registration / void-bill.
interface PaymentLine {
  paymentTypeId: string;
  amount: number;
  reference: string;
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

@Component({
  selector: 'app-golf-front-desk',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, ScreenTitlePipe, ScreenSubtitlePipe, FavStarComponent,
    CanDirective, DialogComponent, ComboboxComponent, OverflowMenuComponent, MenuItemDirective,
    MoneyInputDirective, LocalDatePipe,
  ],
  templateUrl: './golf-front-desk.html',
  styleUrls: ['../system-setup/system-setup.css', '../membership-types/membership-types.css', './golf-front-desk.css'],
})
export class GolfFrontDeskComponent implements OnInit {
  private readonly service = inject(GolfFrontDeskService);
  private readonly fb = inject(FormBuilder);
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);

  readonly loading = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly listDate = signal(localToday());
  readonly meta = signal<FrontDeskMeta | null>(null);

  // ---- the tee sheet (user request 2026-09-27): rows = tee times, one
  // column per course; search highlights the matching flights. ----
  readonly sheet = signal<FrontDeskCourseSheet[]>([]);
  readonly search = signal('');

  // The row axis: the union of every course's tee times, sorted.
  readonly rows = computed(() => {
    const times = new Set<string>();
    for (const c of this.sheet()) for (const f of c.flights) times.add(f.teeTime);
    return [...times].sort((a, b) => a.localeCompare(b));
  });

  private readonly cellMap = computed(() => {
    const map = new Map<string, FrontDeskFlight>();
    for (const c of this.sheet()) for (const f of c.flights) map.set(`${c.courseId}|${f.teeTime}`, f);
    return map;
  });

  cellFor(courseId: string, teeTime: string): FrontDeskFlight | null {
    return this.cellMap().get(`${courseId}|${teeTime}`) || null;
  }

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

  isHit(courseId: string, teeTime: string): boolean {
    return this.matchKeys().has(`${courseId}|${teeTime}`);
  }

  onSearch(value: string): void {
    this.search.set(value);
    // Bring the first matching flight into view once the classes render.
    setTimeout(() => {
      const el = document.querySelector('.fd-cell--hit');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    });
  }

  seatDots(f: FrontDeskFlight): boolean[] {
    const max = f.maxPlayers || 0;
    return Array.from({ length: max }, (_, i) => i < f.seatsTaken);
  }

  unregistered(f: FrontDeskFlight): number {
    return f.entries.filter((e) => e.kind === 'booked' && !e.registration).length;
  }

  // Distinct bookings in a cell with their unregistered counts - per-booking
  // register-all only matters when merged bookings share the flight.
  bookingGroups(f: FrontDeskFlight): { bookingProfileId: string; bookingNo: string; unregistered: number }[] {
    const groups = new Map<string, { bookingProfileId: string; bookingNo: string; unregistered: number }>();
    for (const e of f.entries) {
      if (e.kind !== 'booked' || !e.bookingProfileId) continue;
      const g = groups.get(e.bookingProfileId) || { bookingProfileId: e.bookingProfileId, bookingNo: e.bookingNo || '', unregistered: 0 };
      if (!e.registration) g.unregistered += 1;
      groups.set(e.bookingProfileId, g);
    }
    return [...groups.values()];
  }

  // ---- the one drawer dialog: mode + per-mode state ----
  readonly dlgMode = signal<'guest' | 'walkin' | 'bill' | 'settle' | null>(null);
  readonly busy = signal(false);

  // Guest identity capture when registering a booked guest line.
  readonly guestTarget = signal<FrontDeskEntry | null>(null);
  readonly guestForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    identityNo: ['', [Validators.maxLength(50)]],
    mobile: ['', [Validators.maxLength(30)]],
    email: ['', [Validators.email, Validators.maxLength(100)]],
  });

  // Walk-in registration.
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

  // Billing drawer.
  readonly bill = signal<GolfBillDoc | null>(null);
  readonly billRegistration = signal<FrontDeskRegistration | null>(null);
  readonly billEntryName = signal('');

  // Settlement lines (dynamic rows outside the FormGroup, house pattern).
  readonly payments = signal<PaymentLine[]>([]);
  readonly paymentsDirty = signal(false);

  // Centred confirm dialog: cancel a registration or void a bill.
  readonly confirmKind = signal<'cancel-registration' | 'void-bill' | null>(null);
  readonly confirmTarget = signal<FrontDeskEntry | null>(null);
  readonly confirmReason = signal('');
  readonly confirming = signal(false);

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
      case 'guest': return 'Guest identity';
      case 'walkin': return 'Walk-in registration';
      case 'settle': return `Settle bill ${this.bill()?.billNo || ''}`;
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
        this.returnScroll.consume('/golf/front-desk', this.injector);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load the day.');
      },
    });
  }

  // ---------- registration ----------

  // Bulk register a whole flight (or one booking in it) - guests go in
  // name-only, skips are reported in the result message.
  registerAll(courseId: string, teeTime: string, bookingProfileId?: string): void {
    this.clearMessages();
    this.busy.set(true);
    this.service.registerFlight({ playDate: this.listDate(), courseId, teeTime, bookingProfileId }).subscribe({
      next: (res) => {
        this.busy.set(false);
        if (res.skipped.length) this.errorMessage.set(res.message);
        else this.successMessage.set(res.message);
        this.load();
      },
      error: (err) => {
        this.busy.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to register the flight.');
      },
    });
  }

  register(entry: FrontDeskEntry): void {
    this.clearMessages();
    if (!entry.playerId || entry.kind !== 'booked') return;
    if (entry.playerType === 'guest') {
      this.guestTarget.set(entry);
      this.guestForm.reset({ name: entry.playerName === 'Guest' ? '' : entry.playerName, identityNo: '', mobile: '', email: '' });
      this.dlgMode.set('guest');
      return;
    }
    this.busy.set(true);
    this.service.registerBooked(entry.playerId).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.successMessage.set(res.message);
        this.load();
      },
      error: (err) => {
        this.busy.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to register.');
      },
    });
  }

  submitGuestRegistration(): void {
    this.clearMessages();
    const entry = this.guestTarget();
    if (!entry || !entry.playerId) return;
    if (this.guestForm.invalid) {
      this.guestForm.markAllAsTouched();
      return;
    }
    const v = this.guestForm.getRawValue();
    this.busy.set(true);
    this.service.registerBooked(entry.playerId, {
      name: v.name.trim(),
      identityNo: v.identityNo.trim() || undefined,
      mobile: v.mobile.trim() || undefined,
      email: v.email.trim() || undefined,
    }).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.dlgMode.set(null);
        this.successMessage.set(res.message);
        this.load();
      },
      error: (err) => {
        this.busy.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to register.');
      },
    });
  }

  // Clicking an available flight on the sheet pre-fills its course + time.
  openWalkIn(courseId?: string, teeTime?: string): void {
    this.clearMessages();
    const m = this.meta();
    this.walkinForm.reset({
      courseId: courseId || (m && m.courses.length === 1 ? m.courses[0].id : ''),
      teeTime: teeTime || '',
      holes: 18,
      playerType: 'member',
      memberNo: '',
      guestName: '',
      guestIdentityNo: '',
      guestMobile: '',
    });
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
    this.busy.set(true);
    this.service.openBill(entry.registration.id).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.bill.set(res.bill);
        this.billRegistration.set(entry.registration);
        for (const w of res.warnings || []) this.errorMessage.set(w);
        this.payments.set([]);
        this.paymentsDirty.set(false);
        this.dlgMode.set('bill');
      },
      error: (err) => {
        this.busy.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to open the bill.');
      },
    });
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
        this.dlgMode.set(null);
        this.successMessage.set(res.message);
        this.paymentsDirty.set(false);
        this.load();
      },
      error: (err) => {
        this.busy.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to settle the bill.');
      },
    });
  }

  // ---------- confirmations ----------

  askCancelRegistration(entry: FrontDeskEntry): void {
    this.clearMessages();
    this.confirmKind.set('cancel-registration');
    this.confirmTarget.set(entry);
    this.confirmReason.set('');
  }

  askVoidBill(entry: FrontDeskEntry): void {
    this.clearMessages();
    this.confirmKind.set('void-bill');
    this.confirmTarget.set(entry);
    this.confirmReason.set('');
  }

  confirmAction(): void {
    const entry = this.confirmTarget();
    const kind = this.confirmKind();
    if (!entry || !kind) return;
    this.confirming.set(true);
    const done = (message: string) => {
      this.confirming.set(false);
      this.confirmKind.set(null);
      this.confirmTarget.set(null);
      this.successMessage.set(message);
      this.load();
    };
    const fail = (err: { error?: { message?: string } }) => {
      this.confirming.set(false);
      this.errorMessage.set(err.error?.message || 'The action failed.');
    };
    if (kind === 'cancel-registration' && entry.registration) {
      this.service.cancelRegistration(entry.registration.id, this.confirmReason().trim()).subscribe({ next: (r) => done(r.message), error: fail });
    } else if (kind === 'void-bill' && entry.bill) {
      this.service.voidBill(entry.bill.id, this.confirmReason().trim()).subscribe({ next: (r) => done(r.message), error: fail });
    }
  }

  closeDialog(): void {
    this.dlgMode.set(null);
    this.bill.set(null);
    this.billRegistration.set(null);
    this.payments.set([]);
    this.paymentsDirty.set(false);
    this.load();
  }

  isDirty(): boolean {
    switch (this.dlgMode()) {
      case 'guest': return this.guestForm.dirty;
      case 'walkin': return this.walkinForm.dirty;
      case 'settle': return this.paymentsDirty();
      default: return false; // bill items save immediately
    }
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
