import { ChangeDetectionStrategy, Component, DestroyRef, Injector, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { CanDirective } from '../shared/can.directive';
import { DialogComponent } from '../shared/dialog/dialog';
import { ComboboxComponent } from '../shared/combobox/combobox';
import { OverflowMenuComponent, MenuItemDirective } from '../shared/overflow-menu/overflow-menu';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { ScrollReturnService } from '../services/scroll-return.service';
import { MembershipStatusOption } from '../models/auth.models';
import { MoneyInputDirective } from '../shared/money-input.directive';
import {
  GolfFolio, GolfFolioDeposit, GolfFolioPaymentLine, GolfFolioRefund, GolfFolioTile, GolfGroupBooking, GolfGroupBookingMeta, GolfGroupBookingRow, GolfGroupBookingService,
  GolfGroupDayPayload, GolfGroupFlight, GolfGroupHeaderPayload, GolfOrganiserKind as GolfGroupOrganiserKind, GolfGroupPlayDay,
  GolfGroupRosterLine, GolfGroupRosterPlayer, GolfStartFormat,
} from '../services/golf-group-booking.service';

// Golf Management → Group Bookings (/golf/group-bookings; user decisions
// 2026-10-07, slice 1). A LISTING of group / tournament bookings and, at
// /golf/group-bookings/:id, the booking's own page: header, play days with
// their reserved flights (four start formats), the roster, and the draw that
// places roster players into a day's flights. Every write refreshes the
// whole booking from the server (one source of truth - the API returns it).

// A play-day line of the create dialog / day dialog.
type DayGroup = FormGroup<{
  playDate: FormControl<string>;
  courseId: FormControl<string>;
  holes: FormControl<number>;
  startFormat: FormControl<GolfStartFormat>;
  startTime: FormControl<string>;
  blockUntil: FormControl<string>;
  startHoles: FormControl<string>;
  waves: FormControl<number>;
  remarks: FormControl<string>;
}>;

type RosterGroup = FormGroup<{
  playerType: FormControl<'member' | 'member-guest' | 'guest'>;
  memberNo: FormControl<string>;
  playerName: FormControl<string>;
  handicap: FormControl<string>;
  teamName: FormControl<string>;
}>;

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

@Component({
  selector: 'app-golf-group-bookings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, ReactiveFormsModule, ScreenTitlePipe, ScreenSubtitlePipe, FavStarComponent, CanDirective,
    DialogComponent, ComboboxComponent, OverflowMenuComponent, MenuItemDirective, LocalDatePipe, MoneyInputDirective,
  ],
  templateUrl: './golf-group-bookings.html',
  styleUrls: ['../system-setup/system-setup.css', './golf-group-bookings.css'],
})
export class GolfGroupBookingsComponent implements OnInit {
  private readonly service = inject(GolfGroupBookingService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private static readonly LIST_PATH = '/golf/group-bookings';

  readonly loading = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');
  readonly meta = signal<GolfGroupBookingMeta | null>(null);

  // ---- listing ----
  readonly bookings = signal<GolfGroupBookingRow[]>([]);
  readonly dateFrom = signal(localDate(new Date(Date.now() - 31 * 86400000)));
  readonly dateTo = signal(localDate(new Date(Date.now() + 180 * 86400000)));
  readonly status = signal('');
  readonly search = signal('');
  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const rows = this.bookings();
    if (!q) return rows;
    return rows.filter((b) => (b.groupName || '').toLowerCase().includes(q)
      || b.bookingNo.toLowerCase().includes(q)
      || (b.organiserName || '').toLowerCase().includes(q)
      || b.courses.join(' ').toLowerCase().includes(q));
  });

  // ---- detail ----
  readonly selectedId = signal<string | null>(null);
  readonly booking = signal<GolfGroupBooking | null>(null);
  readonly detailLoading = signal(false);
  readonly expanded = signal<Record<string, boolean>>({ header: true, days: true, roster: true, draw: true, bill: true, deposits: true, refunds: true });
  readonly working = signal(false);

  // ---- folio (slice 2): group bill + proforma + deposits ----
  readonly folio = signal<GolfFolio | null>(null);
  readonly folioLoading = signal(false);
  readonly folioBusy = signal(false);
  // Add-item line: a combobox over the billing items + quantity (+ a manual
  // price when the item allows it).
  readonly addItemTypeId = signal('');
  readonly addItemQty = signal(1);
  readonly addItemPrice = signal<number | null>(null);
  readonly tileOptions = computed(() => (this.folio()?.tiles || []).map((t) => ({
    value: t.id,
    label: `${t.transactionType}${t.description ? ' - ' + t.description : ''}${t.golferTypeLabel ? ' (' + t.golferTypeLabel + ')' : ''}`,
  })));
  readonly addItemTile = computed<GolfFolioTile | null>(() => (this.folio()?.tiles || []).find((t) => t.id === this.addItemTypeId()) || null);
  // Proforma terms (deposit demanded + pay-by date), edited in place.
  readonly proformaDeposit = signal<number | null>(null);
  readonly proformaDue = signal('');
  readonly proformaDirty = signal(false);
  // Record-deposit dialog.
  readonly depositDialogOpen = signal(false);
  readonly depositForm = this.fb.nonNullable.group({
    amount: [0, [Validators.required, Validators.min(0.01)]],
    paymentTypeId: ['', Validators.required],
    reference: ['', Validators.maxLength(100)],
    remarks: ['', Validators.maxLength(255)],
  });
  readonly tenderOptions = computed(() => (this.folio()?.tenders || []).map((t) => ({ value: t.id, label: `${t.paymentType}${t.description ? ' - ' + t.description : ''}` })));
  readonly depositVoidTarget = signal<GolfFolioDeposit | null>(null);
  readonly depositVoidReason = signal('');

  // ---- final settlement (slice 4): payment lines outside a FormGroup (the
  // house pattern for dynamic rows), Deposit-class lines pick a held deposit.
  readonly settleDialogOpen = signal(false);
  readonly settleLines = signal<{ paymentTypeId: string; amount: number; reference: string; depositBillId: string }[]>([]);
  readonly settleDirty = signal(false);
  readonly settleTenderOptions = computed(() => (this.folio()?.tenders || []).map((t) => ({ value: t.id, label: `${t.paymentType}${t.description ? ' - ' + t.description : ''}` })));
  readonly heldDepositOptions = computed(() => (this.folio()?.deposits || []).filter((d) => d.status === 'settled' && d.unappliedAmount > 0)
    .map((d) => ({ value: d.id, label: `${d.billNo} · holds ${d.unappliedAmount.toFixed(2)}` })));
  readonly settlePaid = computed(() => Math.round(this.settleLines().reduce((s, l) => s + (Number(l.amount) || 0), 0) * 100) / 100);
  readonly settleRemaining = computed(() => {
    const total = this.folio()?.bill?.totalAmount || 0;
    return Math.round((total - this.settlePaid()) * 100) / 100;
  });
  readonly groupBillVoidOpen = signal(false);
  readonly groupBillVoidReason = signal('');

  // ---- refund requests (slice 4) ----
  readonly refundDialogOpen = signal(false);
  readonly refundForm = this.fb.nonNullable.group({
    amount: [0, [Validators.required, Validators.min(0.01)]],
    reason: ['', [Validators.required, Validators.maxLength(255)]],
  });
  readonly refundAction = signal<{ kind: 'pay' | 'decline'; refund: GolfFolioRefund } | null>(null);
  readonly refundPayForm = this.fb.nonNullable.group({
    paidMethod: ['', [Validators.required, Validators.maxLength(100)]],
    paidReference: ['', Validators.maxLength(100)],
  });
  readonly refundDeclineReason = signal('');

  readonly courseOptions = computed(() => (this.meta()?.courses || []).map((c) => ({ value: c.id, label: c.label })));
  readonly debtorOptions = computed(() => (this.meta()?.otherDebtors || []).map((o) => ({ value: o.id, label: `${o.code} - ${o.name}` })));

  // ---- header dialog (create = header + days; edit = header only) ----
  readonly headerDialogOpen = signal(false);
  readonly headerMode = signal<'create' | 'edit'>('create');
  readonly saving = signal(false);
  readonly headerForm = this.fb.nonNullable.group({
    bookingType: ['group' as 'group' | 'tournament', Validators.required],
    groupName: ['', [Validators.required, Validators.maxLength(150)]],
    organiserKind: ['other' as GolfGroupOrganiserKind, Validators.required],
    otherDebtorId: [''],
    memberNo: ['', Validators.maxLength(50)],
    organiserName: ['', Validators.maxLength(150)],
    contactPerson: ['', Validators.maxLength(100)],
    contactMobile: ['', Validators.maxLength(30)],
    expectedPlayers: ['' as string | number],
    remarks: ['', Validators.maxLength(255)],
  });
  readonly dayLines = this.fb.array<DayGroup>([]);

  // ---- day dialog (add / edit one play day) ----
  readonly dayDialogOpen = signal(false);
  readonly dayEditing = signal<GolfGroupPlayDay | null>(null);
  readonly dayForm: DayGroup = this.newDayGroup();

  // ---- flights dialog (reserve flights for a day) ----
  readonly flightsDay = signal<GolfGroupPlayDay | null>(null);
  readonly flightsForm = this.fb.nonNullable.group({
    count: [10, [Validators.min(1), Validators.max(80)]],
    capacity: [4, [Validators.required, Validators.min(1), Validators.max(6)]],
    doubleHoles: [''],
    waveGapMinutes: [120, [Validators.min(30), Validators.max(600)]],
  });

  // ---- roster dialog (add many / edit one) ----
  readonly rosterDialogOpen = signal(false);
  readonly rosterEditing = signal<GolfGroupRosterPlayer | null>(null);
  readonly rosterLines = this.fb.array<RosterGroup>([]);
  readonly rosterForm = this.fb.group({ lines: this.rosterLines });
  readonly rosterStatus = signal<'listed' | 'withdrawn'>('listed');

  // ---- draw ----
  readonly drawDayId = signal<string | null>(null);
  // groupPlayerId -> groupFlightId ('' = not drawn), the EDITED state.
  readonly drawEdits = signal<Record<string, string>>({});
  readonly drawDirty = signal(false);
  readonly drawDay = computed(() => {
    const b = this.booking();
    const id = this.drawDayId();
    return b ? b.days.find((d) => d.id === id) || b.days.find((d) => d.status === 'planned') || null : null;
  });
  readonly drawFlightOptions = computed(() => {
    const day = this.drawDay();
    return (day ? day.flights : []).map((f) => ({ value: f.id, label: this.flightTitle(f, day) }));
  });
  // Seats taken per flight in the EDITED draw.
  readonly drawLoad = computed(() => {
    const load: Record<string, number> = {};
    for (const fid of Object.values(this.drawEdits())) if (fid) load[fid] = (load[fid] || 0) + 1;
    return load;
  });
  readonly drawSummary = computed(() => {
    const day = this.drawDay();
    const b = this.booking();
    if (!day || !b) return { drawn: 0, listed: 0, seats: 0, over: [] as string[] };
    const listed = b.roster.filter((p) => p.status === 'listed').length;
    const drawn = Object.values(this.drawEdits()).filter(Boolean).length;
    const load = this.drawLoad();
    const over = day.flights.filter((f) => (load[f.id] || 0) > f.capacity).map((f) => f.flightLabel);
    return { drawn, listed, seats: day.seatCount, over };
  });

  // ---- cancel dialog ----
  readonly cancelTarget = signal<GolfGroupBookingRow | GolfGroupBooking | null>(null);
  readonly cancelReason = signal('');

  // ---- remove confirms (day / flight / player) ----
  readonly confirmTarget = signal<{ kind: 'day' | 'flight' | 'player'; id: string; label: string; dayId?: string } | null>(null);

  ngOnInit(): void {
    this.service.meta().subscribe({
      next: (m) => this.meta.set(m),
      error: (err) => this.errorMessage.set(err.error?.message || 'Failed to load the group booking setup.'),
    });
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((p) => this.applySelection(p.get('id')));
  }

  private applySelection(id: string | null): void {
    this.selectedId.set(id);
    const flash = (history.state as { flash?: string } | null)?.flash;
    if (flash) this.successMessage.set(flash);
    if (id) {
      this.returnScroll.remember(GolfGroupBookingsComponent.LIST_PATH, id);
      this.loadDetail(id);
    } else {
      this.booking.set(null);
      this.load();
    }
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  // ---------- listing ----------

  load(): void {
    this.loading.set(true);
    this.service.list({ dateFrom: this.dateFrom(), dateTo: this.dateTo(), status: this.status() }).subscribe({
      next: (res) => {
        this.bookings.set(res.bookings);
        this.loading.set(false);
        this.returnScroll.consume(GolfGroupBookingsComponent.LIST_PATH, this.injector);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load group bookings.');
      },
    });
  }

  setDateFrom(v: string): void { if (v) { this.dateFrom.set(v); this.load(); } }
  setDateTo(v: string): void { if (v) { this.dateTo.set(v); this.load(); } }
  setStatus(v: string): void { this.status.set(v); this.load(); }
  clearSearch(): void { this.search.set(''); }

  open(b: GolfGroupBookingRow): void {
    this.router.navigate([GolfGroupBookingsComponent.LIST_PATH, b.id]);
  }

  back(): void {
    this.router.navigate([GolfGroupBookingsComponent.LIST_PATH]);
  }

  typeLabel(key: string): string {
    return this.meta()?.bookingTypes.find((t) => t.key === key)?.label || key;
  }

  formatLabel(key: string): string {
    return this.meta()?.startFormats.find((t) => t.key === key)?.label || key;
  }

  playerTypeLabel(key: string): string {
    return this.meta()?.playerTypes.find((t) => t.key === key)?.label || key;
  }

  isHold(format: string): boolean {
    return (this.meta()?.holdFormats || ['shotgun', 'modified-shotgun']).includes(format);
  }

  statusLabel(status: string): string {
    return status === 'booked' ? 'BOOKED' : 'CANCELLED';
  }

  dateRange(b: GolfGroupBookingRow | GolfGroupBooking): string {
    return b.playDateTo && b.playDateTo !== b.playDate ? `${b.playDate}|${b.playDateTo}` : b.playDate;
  }

  // ---------- detail ----------

  loadDetail(id: string): void {
    this.detailLoading.set(true);
    this.service.get(id).subscribe({
      next: (res) => {
        this.applyBooking(res.booking);
        this.detailLoading.set(false);
      },
      error: (err) => {
        this.detailLoading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load the group booking.');
      },
    });
  }

  // One place every save lands: the server's full booking replaces ours and
  // the draw editor re-seeds from it (the day stays selected).
  private applyBooking(b: GolfGroupBooking): void {
    const first = !this.booking();
    this.booking.set(b);
    const dayId = this.drawDayId();
    if (!dayId || !b.days.some((d) => d.id === dayId)) {
      const firstDay = b.days.find((d) => d.status === 'planned') || b.days[0] || null;
      this.drawDayId.set(firstDay ? firstDay.id : null);
    }
    this.seedDraw();
    if (first) this.loadFolio(b.id);
  }

  // ---------- folio ----------

  loadFolio(id: string): void {
    this.folioLoading.set(true);
    this.service.folio(id).subscribe({
      next: (res) => {
        this.applyFolio(res.folio);
        this.folioLoading.set(false);
      },
      error: (err) => {
        this.folioLoading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load the group bill.');
      },
    });
  }

  private applyFolio(f: GolfFolio): void {
    this.folio.set(f);
    if (!this.proformaDirty()) {
      this.proformaDeposit.set(f.bill ? f.bill.depositRequired : null);
      this.proformaDue.set(f.bill && f.bill.depositDueDate ? f.bill.depositDueDate : '');
    }
  }

  private folioDone = (res: { message?: string; folio: GolfFolio }) => {
    this.folioBusy.set(false);
    if (res.message) this.successMessage.set(res.message);
    this.applyFolio(res.folio);
  };

  private folioFail = (fallback: string) => (err: { error?: { message?: string } }) => {
    this.folioBusy.set(false);
    this.errorMessage.set(err.error?.message || fallback);
  };

  // The folio stays workable on a CANCELLED booking while its group bill is
  // open (a cancellation charge is billed and settled by the deposit); only
  // a booked booking takes new items on an empty folio or new deposits.
  billOpen(): boolean {
    const f = this.folio();
    const b = this.booking();
    if (!b) return false;
    if (f?.bill) return f.bill.status === 'open';
    return b.status === 'booked';
  }

  canDeposit(): boolean {
    const b = this.booking();
    return !!b && b.status === 'booked';
  }

  billSettled(): boolean {
    return this.folio()?.bill?.status === 'settled';
  }

  setAddItemType(id: string): void {
    this.addItemTypeId.set(id);
    this.addItemPrice.set(null);
  }

  addFolioItem(): void {
    const b = this.booking();
    const tile = this.addItemTile();
    if (!b || !tile) { this.errorMessage.set('Pick a billing item.'); return; }
    const qty = Math.max(1, Math.floor(Number(this.addItemQty()) || 1));
    this.clearMessages();
    this.folioBusy.set(true);
    this.service.addFolioItem(b.id, {
      transactionTypeId: tile.id,
      quantity: qty,
      unitAmount: tile.allowPriceOverride && this.addItemPrice() !== null ? this.addItemPrice() : undefined,
    }).subscribe({
      next: (res) => {
        this.folioDone(res);
        this.addItemTypeId.set('');
        this.addItemQty.set(1);
        this.addItemPrice.set(null);
      },
      error: this.folioFail('The item could not be added.'),
    });
  }

  setItemQty(itemId: string, raw: string): void {
    const b = this.booking();
    const qty = Number(raw);
    if (!b || !Number.isInteger(qty) || qty < 1) return;
    this.folioBusy.set(true);
    this.service.updateFolioItem(b.id, itemId, { quantity: qty }).subscribe({ next: this.folioDone, error: this.folioFail('The quantity could not be changed.') });
  }

  setItemPrice(itemId: string, raw: string): void {
    const b = this.booking();
    const price = Number(raw);
    if (!b || !Number.isFinite(price) || price < 0) return;
    this.folioBusy.set(true);
    this.service.updateFolioItem(b.id, itemId, { unitAmount: price }).subscribe({ next: this.folioDone, error: this.folioFail('The price could not be changed.') });
  }

  removeFolioItem(itemId: string): void {
    const b = this.booking();
    if (!b) return;
    this.clearMessages();
    this.folioBusy.set(true);
    this.service.removeFolioItem(b.id, itemId).subscribe({ next: this.folioDone, error: this.folioFail('The item could not be removed.') });
  }

  itemTypeAllowsPrice(item: { transactionTypeId: string; packageGroupId: string | null }): boolean {
    if (item.packageGroupId) return false;
    const t = (this.folio()?.tiles || []).find((x) => x.id === item.transactionTypeId);
    return !!t && t.allowPriceOverride;
  }

  setProformaDeposit(v: number | null): void { this.proformaDeposit.set(v); this.proformaDirty.set(true); }
  setProformaDue(v: string): void { this.proformaDue.set(v); this.proformaDirty.set(true); }

  saveProformaTerms(): void {
    const b = this.booking();
    if (!b) return;
    this.clearMessages();
    this.folioBusy.set(true);
    this.service.setProformaTerms(b.id, { depositRequired: this.proformaDeposit(), depositDueDate: this.proformaDue() || null }).subscribe({
      next: (res) => { this.proformaDirty.set(false); this.folioDone(res); },
      error: this.folioFail('The proforma terms could not be saved.'),
    });
  }

  issueProforma(): void {
    const b = this.booking();
    if (!b) return;
    this.clearMessages();
    this.folioBusy.set(true);
    this.service.issueProforma(b.id).subscribe({
      next: (res) => { this.folioDone(res); this.openProforma(); },
      error: this.folioFail('The proforma could not be issued.'),
    });
  }

  // Printable documents: fetched with the session token and opened in a new
  // tab as a blob (a plain link could not carry the Authorization header).
  private openHtml(html: string): void {
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  openProforma(): void {
    const b = this.booking();
    if (!b) return;
    this.service.proformaHtml(b.id).subscribe({
      next: (html) => this.openHtml(html),
      error: (err) => this.errorMessage.set(err.error?.message || 'The proforma could not be opened.'),
    });
  }

  openDepositDoc(d: GolfFolioDeposit): void {
    const b = this.booking();
    if (!b) return;
    this.service.depositHtml(b.id, d.id).subscribe({
      next: (html) => this.openHtml(html),
      error: (err) => this.errorMessage.set(err.error?.message || 'The deposit bill could not be opened.'),
    });
  }

  openDepositDialog(): void {
    this.clearMessages();
    const f = this.folio();
    const outstanding = f && f.bill && f.bill.depositRequired !== null ? Math.max(0, f.bill.depositRequired - f.depositTotal) : 0;
    this.depositForm.reset({ amount: outstanding > 0 ? outstanding : 0, paymentTypeId: '', reference: '', remarks: '' });
    this.depositDialogOpen.set(true);
  }

  depositTender() {
    const id = this.depositForm.controls.paymentTypeId.value;
    return (this.folio()?.tenders || []).find((t) => t.id === id) || null;
  }

  // The outcome stated before the clerk commits (show expected results).
  depositPreview(): string {
    const f = this.folio();
    const t = this.depositTender();
    const amount = Number(this.depositForm.controls.amount.value) || 0;
    if (!f || !t || amount <= 0) return '';
    const money = amount.toFixed(2);
    if (t.paymentClass === 'member' || t.paymentClass === 'debtor') {
      if (!f.billingParty.hasAccount) return `${t.paymentType} charges an account, but this booking has no billing account - pick a cash-type tender or set the organiser's account first.`;
      return `A deposit bill of ${money} is raised and charged to ${f.billingParty.organiserName}'s account as a normal AR invoice. The folio shows whether it has been paid.`;
    }
    return `A deposit bill of ${money} is raised and settled by ${t.paymentType} - the money is received now.`;
  }

  recordDeposit(): void {
    const b = this.booking();
    if (!b) return;
    if (this.depositForm.invalid) { this.depositForm.markAllAsTouched(); return; }
    this.clearMessages();
    const v = this.depositForm.getRawValue();
    this.folioBusy.set(true);
    this.service.recordDeposit(b.id, {
      amount: Number(v.amount), paymentTypeId: v.paymentTypeId,
      reference: v.reference.trim() || undefined, remarks: v.remarks.trim() || undefined,
    }).subscribe({
      next: (res) => { this.depositDialogOpen.set(false); this.folioDone(res); },
      error: this.folioFail('The deposit could not be recorded.'),
    });
  }

  askVoidDeposit(d: GolfFolioDeposit): void {
    this.clearMessages();
    this.depositVoidTarget.set(d);
    this.depositVoidReason.set('');
  }

  confirmVoidDeposit(): void {
    const b = this.booking();
    const d = this.depositVoidTarget();
    if (!b || !d) return;
    const reason = this.depositVoidReason().trim();
    if (!reason) { this.errorMessage.set('Give a reason for voiding the deposit.'); return; }
    this.folioBusy.set(true);
    this.service.voidDeposit(b.id, d.id, reason).subscribe({
      next: (res) => { this.depositVoidTarget.set(null); this.folioDone(res); },
      error: this.folioFail('The deposit could not be voided.'),
    });
  }

  standingLabel(d: GolfFolioDeposit): string {
    if (d.status === 'voided') return 'Voided';
    if (!d.onAccount) return `Paid · ${d.paymentType}`;
    const s = d.arStanding;
    if (!s) return `On account · ${d.arDocNo}`;
    if (s.status === 'paid') {
      const r = s.settlements.find((x) => x.docNo);
      return `Paid${r ? ' · ' + r.docNo : ''}`;
    }
    if (s.status === 'partial') return `Partially paid · ${s.paidAmount.toFixed(2)} of ${s.grossAmount.toFixed(2)}`;
    return `Outstanding · ${s.outstandingAmount.toFixed(2)} on ${s.docNo}`;
  }

  standingClass(d: GolfFolioDeposit): string {
    if (d.status === 'voided') return 'ggb-standing--off';
    if (!d.onAccount || (d.arStanding && d.arStanding.status === 'paid')) return 'ggb-standing--paid';
    if (d.arStanding && d.arStanding.status === 'partial') return 'ggb-standing--partial';
    return 'ggb-standing--due';
  }

  // ---------- final settlement ----------

  openSettle(): void {
    this.clearMessages();
    this.settleLines.set([]);
    this.settleDirty.set(false);
    this.applyDeposits();
    this.settleDirty.set(false);
    this.settleDialogOpen.set(true);
  }

  tenderOf(id: string) {
    return (this.folio()?.tenders || []).find((t) => t.id === id) || null;
  }

  isDepositTender(id: string): boolean {
    return this.tenderOf(id)?.paymentClass === 'deposit';
  }

  // Pre-fill one Deposit line per held deposit, oldest first, up to the
  // bill total - the clerk only keys the balance.
  applyDeposits(): void {
    const f = this.folio();
    if (!f || !f.bill) return;
    const depositTender = f.tenders.find((t) => t.paymentClass === 'deposit');
    if (!depositTender) { this.errorMessage.set('Set up a payment type of class Deposit first (Golf Management → Payment Type).'); return; }
    const lines = this.settleLines().filter((l) => !this.isDepositTender(l.paymentTypeId));
    let left = Math.round((f.bill.totalAmount - lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)) * 100) / 100;
    for (const d of f.deposits.filter((x) => x.status === 'settled' && x.unappliedAmount > 0)) {
      if (left <= 0) break;
      const take = Math.min(left, d.unappliedAmount);
      lines.push({ paymentTypeId: depositTender.id, amount: Math.round(take * 100) / 100, reference: '', depositBillId: d.id });
      left = Math.round((left - take) * 100) / 100;
    }
    this.settleLines.set(lines);
    this.settleDirty.set(true);
  }

  addSettleLine(): void {
    this.settleLines.update((rows) => [...rows, { paymentTypeId: '', amount: Math.max(0, this.settleRemaining()), reference: '', depositBillId: '' }]);
    this.settleDirty.set(true);
  }

  setSettleLine(i: number, patch: Partial<{ paymentTypeId: string; amount: number; reference: string; depositBillId: string }>): void {
    this.settleLines.update((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    this.settleDirty.set(true);
  }

  removeSettleLine(i: number): void {
    this.settleLines.update((rows) => rows.filter((_, idx) => idx !== i));
    this.settleDirty.set(true);
  }

  // What settling does, before the clerk commits.
  settlePreview(): string {
    const parts: string[] = [];
    const dep = this.settleLines().filter((l) => this.isDepositTender(l.paymentTypeId)).reduce((s, l) => s + (Number(l.amount) || 0), 0);
    if (dep > 0) parts.push(`${dep.toFixed(2)} applied from held deposits`);
    for (const l of this.settleLines()) {
      const t = this.tenderOf(l.paymentTypeId);
      if (!t || !l.amount) continue;
      if (t.paymentClass === 'member' || t.paymentClass === 'debtor') parts.push(`${Number(l.amount).toFixed(2)} charged to ${this.folio()?.billingParty.organiserName || 'the organiser'}'s account as an AR invoice`);
      else if (t.paymentClass !== 'deposit') parts.push(`${Number(l.amount).toFixed(2)} received by ${t.paymentType}`);
    }
    return parts.join(' · ');
  }

  settleGroupBill(): void {
    const b = this.booking();
    if (!b) return;
    this.clearMessages();
    const lines = this.settleLines();
    for (let i = 0; i < lines.length; i += 1) {
      const l = lines[i];
      if (!l.paymentTypeId) { this.errorMessage.set(`Payment ${i + 1}: pick a payment type.`); return; }
      if (!(Number(l.amount) > 0)) { this.errorMessage.set(`Payment ${i + 1}: key in the amount.`); return; }
      if (this.isDepositTender(l.paymentTypeId) && !l.depositBillId) { this.errorMessage.set(`Payment ${i + 1}: pick the deposit this line draws on.`); return; }
    }
    if (this.settleRemaining() !== 0) { this.errorMessage.set(`Payments must equal the bill total - ${this.settleRemaining().toFixed(2)} remaining.`); return; }
    const payments: GolfFolioPaymentLine[] = lines.map((l) => ({
      paymentTypeId: l.paymentTypeId, amount: Number(l.amount), reference: l.reference.trim() || undefined,
      depositBillId: this.isDepositTender(l.paymentTypeId) ? l.depositBillId : null,
    }));
    this.folioBusy.set(true);
    this.service.settleGroupBill(b.id, payments).subscribe({
      next: (res) => { this.settleDialogOpen.set(false); this.settleDirty.set(false); this.folioDone(res); },
      error: this.folioFail('The group bill could not be settled.'),
    });
  }

  confirmVoidGroupBill(): void {
    const b = this.booking();
    if (!b) return;
    const reason = this.groupBillVoidReason().trim();
    if (!reason) { this.errorMessage.set('Give a reason for voiding the group bill.'); return; }
    this.folioBusy.set(true);
    this.service.voidGroupBill(b.id, reason).subscribe({
      next: (res) => { this.groupBillVoidOpen.set(false); this.proformaDirty.set(false); this.folioDone(res); },
      error: this.folioFail('The group bill could not be voided.'),
    });
  }

  // ---------- refund requests ----------

  openRefund(): void {
    this.clearMessages();
    const held = this.folio()?.depositUnapplied || 0;
    this.refundForm.reset({ amount: held, reason: '' });
    this.refundDialogOpen.set(true);
  }

  requestRefund(): void {
    const b = this.booking();
    if (!b) return;
    if (this.refundForm.invalid) { this.refundForm.markAllAsTouched(); return; }
    this.clearMessages();
    const v = this.refundForm.getRawValue();
    this.folioBusy.set(true);
    this.service.requestRefund(b.id, { amount: Number(v.amount), reason: v.reason.trim() }).subscribe({
      next: (res) => { this.refundDialogOpen.set(false); this.folioDone(res); },
      error: this.folioFail('The refund could not be requested.'),
    });
  }

  openRefundAction(kind: 'pay' | 'decline', refund: GolfFolioRefund): void {
    this.clearMessages();
    this.refundPayForm.reset({ paidMethod: '', paidReference: '' });
    this.refundDeclineReason.set('');
    this.refundAction.set({ kind, refund });
  }

  confirmRefundAction(): void {
    const b = this.booking();
    const a = this.refundAction();
    if (!b || !a) return;
    this.clearMessages();
    if (a.kind === 'pay') {
      if (this.refundPayForm.invalid) { this.refundPayForm.markAllAsTouched(); return; }
      const v = this.refundPayForm.getRawValue();
      this.folioBusy.set(true);
      this.service.payRefund(b.id, a.refund.id, { paidMethod: v.paidMethod.trim(), paidReference: v.paidReference.trim() || undefined }).subscribe({
        next: (res) => { this.refundAction.set(null); this.folioDone(res); },
        error: this.folioFail('The refund could not be recorded as paid.'),
      });
    } else {
      const reason = this.refundDeclineReason().trim();
      if (!reason) { this.errorMessage.set('Give the reason for declining.'); return; }
      this.folioBusy.set(true);
      this.service.declineRefund(b.id, a.refund.id, reason).subscribe({
        next: (res) => { this.refundAction.set(null); this.folioDone(res); },
        error: this.folioFail('The refund could not be declined.'),
      });
    }
  }

  refundStatusClass(r: GolfFolioRefund): string {
    return r.status === 'paid' ? 'ggb-standing--paid' : r.status === 'declined' ? 'ggb-standing--off' : 'ggb-standing--partial';
  }

  classLabel(key: string | null): string {
    switch (key) {
      case 'debtor': return 'City ledger';
      case 'member': return 'Member account';
      case 'creditcard': return 'Credit card';
      default: return key ? key.charAt(0).toUpperCase() + key.slice(1) : '';
    }
  }

  toggleSection(key: string): void {
    this.expanded.update((m) => ({ ...m, [key]: !m[key] }));
  }

  isExpanded(key: string): boolean {
    return this.expanded()[key] !== false;
  }

  organiserLine(b: GolfGroupBooking): string {
    const kind = b.debtorType === 'other' ? 'City ledger' : b.debtorType ? 'Member account' : 'Cash only';
    return `${b.organiserName || '-'} · ${kind}${b.bookerMemberNo ? ' (' + b.bookerMemberNo + ')' : ''}`;
  }

  dayWindow(d: GolfGroupPlayDay): string {
    if (this.isHold(d.startFormat)) {
      const holes = d.startHoles && d.startHoles.length ? ` · holes ${d.startHoles.join(', ')}` : '';
      const waves = d.waves > 1 ? ` · ${d.waves} waves` : '';
      return `${d.startTime} - ${d.blockUntil} held${holes}${waves}`;
    }
    return `from ${d.startTime}`;
  }

  flightTitle(f: GolfGroupFlight, day: GolfGroupPlayDay | null): string {
    const nine = day ? this.flightNine(f, day) : null;
    return `${f.flightLabel} · ${f.teeTime}${nine ? ' · ' + nine : ''}`;
  }

  // The nine a flight tees off from, where it is not implied: shotgun holes
  // name their nine, two-tee flights alternate.
  flightNine(f: GolfGroupFlight, day: GolfGroupPlayDay): string | null {
    if (f.startHole) return f.startHole > 9 ? day.secondNineCode : day.firstNineCode;
    if (day.startFormat === 'two-tee') return f.flightLabel.endsWith('T10') ? day.secondNineCode : day.firstNineCode;
    return null;
  }

  // ---------- header dialog ----------

  private newDayGroup(): DayGroup {
    return this.fb.nonNullable.group({
      playDate: ['', Validators.required],
      courseId: ['', Validators.required],
      holes: [18, Validators.required],
      startFormat: ['traditional' as GolfStartFormat, Validators.required],
      startTime: ['07:30', Validators.required],
      blockUntil: ['12:00'],
      startHoles: [''],
      waves: [1, [Validators.min(1), Validators.max(4)]],
      remarks: ['', Validators.maxLength(255)],
    });
  }

  openCreate(): void {
    this.clearMessages();
    this.headerMode.set('create');
    this.headerForm.reset({
      bookingType: 'group', groupName: '', organiserKind: 'other', otherDebtorId: '', memberNo: '', organiserName: '',
      contactPerson: '', contactMobile: '', expectedPlayers: '', remarks: '',
    });
    this.dayLines.clear();
    this.dayLines.push(this.newDayGroup());
    this.dayLines.markAsPristine();
    this.headerDialogOpen.set(true);
  }

  openEdit(b: GolfGroupBooking): void {
    this.clearMessages();
    this.headerMode.set('edit');
    const kind: GolfGroupOrganiserKind = b.debtorType === 'other' ? 'other' : b.bookerMemberNo ? 'member' : 'none';
    this.headerForm.reset({
      bookingType: b.bookingType, groupName: b.groupName || '', organiserKind: kind,
      otherDebtorId: kind === 'other' ? (b.debtorSourceId || '') : '',
      memberNo: b.bookerMemberNo || '', organiserName: kind === 'none' ? (b.organiserName || '') : '',
      contactPerson: b.contactPerson || '', contactMobile: b.contactMobile || '',
      expectedPlayers: b.expectedPlayers === null ? '' : b.expectedPlayers, remarks: b.remarks || '',
    });
    this.dayLines.clear();
    this.headerDialogOpen.set(true);
  }

  addDayLine(): void {
    const last = this.dayLines.at(this.dayLines.length - 1);
    const g = this.newDayGroup();
    if (last) {
      const v = last.getRawValue();
      g.patchValue({ courseId: v.courseId, holes: v.holes, startFormat: v.startFormat, startTime: v.startTime, blockUntil: v.blockUntil, waves: v.waves });
    }
    this.dayLines.push(g);
    this.dayLines.markAsDirty();
  }

  removeDayLine(i: number): void {
    if (this.dayLines.length <= 1) return;
    this.dayLines.removeAt(i);
    this.dayLines.markAsDirty();
  }

  headerDirty(): boolean {
    return this.headerForm.dirty || this.dayLines.dirty;
  }

  private headerPayload(): GolfGroupHeaderPayload {
    const v = this.headerForm.getRawValue();
    return {
      bookingType: v.bookingType,
      groupName: v.groupName.trim(),
      organiserKind: v.organiserKind,
      otherDebtorId: v.organiserKind === 'other' ? v.otherDebtorId : undefined,
      memberNo: v.organiserKind === 'member' ? v.memberNo.trim() : undefined,
      organiserName: v.organiserKind === 'none' ? v.organiserName.trim() : undefined,
      contactPerson: v.contactPerson.trim() || undefined,
      contactMobile: v.contactMobile.trim() || undefined,
      expectedPlayers: v.expectedPlayers === '' || v.expectedPlayers === null ? null : Number(v.expectedPlayers),
      remarks: v.remarks.trim() || undefined,
    };
  }

  private dayPayload(g: DayGroup): GolfGroupDayPayload {
    const v = g.getRawValue();
    const hold = this.isHold(v.startFormat);
    return {
      playDate: v.playDate,
      courseId: v.courseId,
      holes: Number(v.holes),
      startFormat: v.startFormat,
      startTime: v.startTime,
      blockUntil: hold ? v.blockUntil : null,
      startHoles: v.startFormat === 'modified-shotgun'
        ? v.startHoles.split(/[\s,]+/).map((s) => Number(s)).filter((n) => Number.isInteger(n) && n > 0)
        : null,
      waves: hold ? Number(v.waves) : 1,
      remarks: v.remarks.trim() || null,
    };
  }

  saveHeader(): void {
    this.clearMessages();
    if (this.headerForm.invalid || (this.headerMode() === 'create' && this.dayLines.invalid)) {
      this.headerForm.markAllAsTouched();
      this.dayLines.markAllAsTouched();
      return;
    }
    const v = this.headerForm.getRawValue();
    if (v.organiserKind === 'other' && !v.otherDebtorId) { this.errorMessage.set('Pick the organiser\'s Other Debtor account.'); return; }
    if (v.organiserKind === 'member' && !v.memberNo.trim()) { this.errorMessage.set('Key in the organising member\'s number.'); return; }
    if (v.organiserKind === 'none' && !v.organiserName.trim()) { this.errorMessage.set('Key in the organiser\'s name.'); return; }
    this.saving.set(true);
    const done = (res: { message: string; booking: GolfGroupBooking }) => {
      this.saving.set(false);
      if (this.headerMode() === 'create') {
        // Navigate WITHOUT closing the drawer first: the route change recreates
        // this component (and so the drawer) as a forward navigation, which the
        // drawer's Back trap leaves alone. Closing it first would pop a history
        // entry and undo the navigation. The message rides the navigation state.
        this.router.navigate([GolfGroupBookingsComponent.LIST_PATH, res.booking.id], { state: { flash: res.message } });
        return;
      }
      this.headerDialogOpen.set(false);
      this.successMessage.set(res.message);
      this.applyBooking(res.booking);
    };
    const fail = (err: { error?: { message?: string } }) => {
      this.saving.set(false);
      this.errorMessage.set(err.error?.message || 'Failed to save the group booking.');
    };
    if (this.headerMode() === 'create') {
      this.service.create({ ...this.headerPayload(), days: this.dayLines.controls.map((g) => this.dayPayload(g)) }).subscribe({ next: done, error: fail });
    } else {
      const b = this.booking();
      if (!b) return;
      this.service.update(b.id, this.headerPayload()).subscribe({ next: done, error: fail });
    }
  }

  // ---------- cancel ----------

  openCancel(b: GolfGroupBookingRow | GolfGroupBooking): void {
    this.clearMessages();
    this.cancelTarget.set(b);
    this.cancelReason.set('');
  }

  confirmCancel(): void {
    const target = this.cancelTarget();
    if (!target) return;
    this.working.set(true);
    this.service.cancel(target.id, this.cancelReason().trim()).subscribe({
      next: (res) => {
        this.working.set(false);
        this.cancelTarget.set(null);
        this.successMessage.set(res.message);
        if (this.selectedId()) this.loadDetail(target.id); else this.load();
      },
      error: (err) => {
        this.working.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to cancel the booking.');
      },
    });
  }

  // ---------- play days ----------

  openAddDay(): void {
    this.clearMessages();
    this.dayEditing.set(null);
    const b = this.booking();
    const last = b && b.days.length ? b.days[b.days.length - 1] : null;
    this.dayForm.reset({
      playDate: '', courseId: last ? last.courseId : '', holes: last ? last.holes : 18,
      startFormat: last ? last.startFormat : 'traditional', startTime: last ? last.startTime : '07:30',
      blockUntil: last && last.blockUntil ? last.blockUntil : '12:00', startHoles: '', waves: last ? last.waves : 1, remarks: '',
    });
    this.dayDialogOpen.set(true);
  }

  openEditDay(d: GolfGroupPlayDay): void {
    this.clearMessages();
    this.dayEditing.set(d);
    this.dayForm.reset({
      playDate: d.playDate, courseId: d.courseId, holes: d.holes, startFormat: d.startFormat, startTime: d.startTime,
      blockUntil: d.blockUntil || '12:00', startHoles: d.startHoles ? d.startHoles.join(', ') : '', waves: d.waves, remarks: d.remarks || '',
    });
    this.dayDialogOpen.set(true);
  }

  saveDay(): void {
    this.clearMessages();
    const b = this.booking();
    if (!b) return;
    if (this.dayForm.invalid) { this.dayForm.markAllAsTouched(); return; }
    const payload = this.dayPayload(this.dayForm);
    const editing = this.dayEditing();
    this.saving.set(true);
    const req = editing ? this.service.updateDay(b.id, editing.id, payload) : this.service.addDay(b.id, payload);
    req.subscribe({
      next: (res) => {
        this.saving.set(false);
        this.dayDialogOpen.set(false);
        this.successMessage.set(res.message);
        this.applyBooking(res.booking);
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to save the play day.');
      },
    });
  }

  askRemoveDay(d: GolfGroupPlayDay): void {
    this.confirmTarget.set({ kind: 'day', id: d.id, label: d.playDate });
  }

  askRemoveFlight(d: GolfGroupPlayDay, f: GolfGroupFlight): void {
    this.confirmTarget.set({ kind: 'flight', id: f.id, dayId: d.id, label: `${f.flightLabel} (${f.teeTime})` });
  }

  askRemovePlayer(p: GolfGroupRosterPlayer): void {
    this.confirmTarget.set({ kind: 'player', id: p.id, label: p.playerName });
  }

  confirmRemove(): void {
    const t = this.confirmTarget();
    const b = this.booking();
    if (!t || !b) return;
    this.working.set(true);
    const req = t.kind === 'day' ? this.service.removeDay(b.id, t.id)
      : t.kind === 'flight' ? this.service.removeFlight(b.id, t.dayId!, t.id)
        : this.service.removePlayer(b.id, t.id);
    req.subscribe({
      next: (res) => {
        this.working.set(false);
        this.confirmTarget.set(null);
        this.successMessage.set(res.message);
        this.applyBooking(res.booking);
      },
      error: (err) => {
        this.working.set(false);
        this.errorMessage.set(err.error?.message || 'The removal was refused.');
      },
    });
  }

  // ---------- flights ----------

  openFlights(d: GolfGroupPlayDay): void {
    this.clearMessages();
    this.flightsDay.set(d);
    const b = this.booking();
    const listed = b ? b.roster.filter((p) => p.status === 'listed').length : 0;
    const want = Math.max(1, Math.ceil((listed || b?.expectedPlayers || 16) / (this.meta()?.defaultCapacity || 4)));
    this.flightsForm.reset({ count: Math.min(want, 80), capacity: this.meta()?.defaultCapacity || 4, doubleHoles: '', waveGapMinutes: 120 });
  }

  flightsPreview(): string {
    const d = this.flightsDay();
    if (!d) return '';
    const v = this.flightsForm.getRawValue();
    if (!this.isHold(d.startFormat)) return `${v.count} flight(s) × ${v.capacity} seats = ${Number(v.count) * Number(v.capacity)} seats`;
    const holes = d.startFormat === 'modified-shotgun' && d.startHoles ? d.startHoles.length : (d.holes === 9 ? 9 : 18);
    const doubles = this.parseHoles(v.doubleHoles).length;
    const perWave = holes + doubles;
    return `${perWave} flight(s) per wave × ${d.waves} wave(s) = ${perWave * d.waves} flights · ${perWave * d.waves * Number(v.capacity)} seats`;
  }

  private parseHoles(s: string): number[] {
    return [...new Set(s.split(/[\s,]+/).map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0))];
  }

  reserveFlights(): void {
    this.clearMessages();
    const d = this.flightsDay();
    const b = this.booking();
    if (!d || !b) return;
    const v = this.flightsForm.getRawValue();
    const payload = this.isHold(d.startFormat)
      ? { capacity: Number(v.capacity), doubleHoles: this.parseHoles(v.doubleHoles), waveGapMinutes: Number(v.waveGapMinutes) }
      : { capacity: Number(v.capacity), count: Number(v.count) };
    this.saving.set(true);
    this.service.generateFlights(b.id, d.id, payload).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.flightsDay.set(null);
        this.successMessage.set(res.message);
        this.applyBooking(res.booking);
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err.error?.message || 'The flights could not be reserved.');
      },
    });
  }

  // ---------- roster ----------

  private newRosterGroup(): RosterGroup {
    return this.fb.nonNullable.group({
      playerType: ['guest' as 'member' | 'member-guest' | 'guest', Validators.required],
      memberNo: ['', Validators.maxLength(50)],
      playerName: ['', Validators.maxLength(255)],
      handicap: [''],
      teamName: ['', Validators.maxLength(100)],
    });
  }

  openAddPlayers(): void {
    this.clearMessages();
    this.rosterEditing.set(null);
    this.rosterLines.clear();
    for (let i = 0; i < 4; i += 1) this.rosterLines.push(this.newRosterGroup());
    this.rosterLines.markAsPristine();
    this.rosterDialogOpen.set(true);
  }

  openEditPlayer(p: GolfGroupRosterPlayer): void {
    this.clearMessages();
    this.rosterEditing.set(p);
    this.rosterLines.clear();
    const g = this.newRosterGroup();
    g.reset({ playerType: p.playerType, memberNo: p.memberNo || '', playerName: p.playerName, handicap: p.handicap === null ? '' : String(p.handicap), teamName: p.teamName || '' });
    this.rosterLines.push(g);
    this.rosterStatus.set(p.status);
    this.rosterLines.markAsPristine();
    this.rosterDialogOpen.set(true);
  }

  addRosterLine(): void {
    this.rosterLines.push(this.newRosterGroup());
    this.rosterLines.markAsDirty();
  }

  removeRosterLine(i: number): void {
    this.rosterLines.removeAt(i);
    this.rosterLines.markAsDirty();
  }

  private rosterLinePayload(g: RosterGroup): GolfGroupRosterLine | null {
    const v = g.getRawValue();
    const hasIdentity = v.playerType === 'guest' ? !!v.playerName.trim() : !!v.memberNo.trim();
    if (!hasIdentity) return null;
    return {
      playerType: v.playerType,
      memberNo: v.playerType === 'guest' ? undefined : v.memberNo.trim(),
      playerName: v.playerType === 'guest' ? v.playerName.trim() : undefined,
      handicap: v.handicap.trim() === '' ? null : Number(v.handicap),
      teamName: v.teamName.trim() || undefined,
    };
  }

  savePlayers(): void {
    this.clearMessages();
    const b = this.booking();
    if (!b) return;
    const lines = this.rosterLines.controls.map((g) => this.rosterLinePayload(g)).filter((l): l is GolfGroupRosterLine => !!l);
    if (!lines.length) { this.errorMessage.set('Key in at least one player (member number or guest name).'); return; }
    this.saving.set(true);
    const editing = this.rosterEditing();
    const req = editing
      ? this.service.updatePlayer(b.id, editing.id, { ...lines[0], status: this.rosterStatus() })
      : this.service.addPlayers(b.id, lines);
    req.subscribe({
      next: (res) => {
        this.saving.set(false);
        this.rosterDialogOpen.set(false);
        this.successMessage.set(res.message);
        this.applyBooking(res.booking);
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to save the roster.');
      },
    });
  }

  withdraw(p: GolfGroupRosterPlayer, status: 'listed' | 'withdrawn'): void {
    const b = this.booking();
    if (!b) return;
    this.clearMessages();
    this.working.set(true);
    this.service.updatePlayer(b.id, p.id, {
      playerType: p.playerType, memberNo: p.memberNo || undefined, playerName: p.playerName,
      handicap: p.handicap, teamName: p.teamName || undefined, contactMobile: p.contactMobile || undefined, remarks: p.remarks || undefined, status,
    }).subscribe({
      next: (res) => {
        this.working.set(false);
        this.successMessage.set(status === 'withdrawn' ? `${p.playerName} withdrawn.` : `${p.playerName} listed again.`);
        this.applyBooking(res.booking);
      },
      error: (err) => {
        this.working.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to update the player.');
      },
    });
  }

  drawnSummary(p: GolfGroupRosterPlayer): string {
    const entries = Object.entries(p.drawn || {});
    if (!entries.length) return 'Not drawn';
    return entries.map(([date, label]) => `${date.slice(5)} ${label}`).join(' · ');
  }

  // ---------- draw ----------

  selectDrawDay(id: string): void {
    this.drawDayId.set(id);
    this.seedDraw();
  }

  private seedDraw(): void {
    const b = this.booking();
    const day = this.drawDay();
    const edits: Record<string, string> = {};
    if (b && day) {
      for (const f of day.flights) for (const p of f.players) if (p.groupPlayerId) edits[p.groupPlayerId] = f.id;
    }
    this.drawEdits.set(edits);
    this.drawDirty.set(false);
  }

  setDraw(groupPlayerId: string, flightId: string): void {
    this.drawEdits.update((m) => ({ ...m, [groupPlayerId]: flightId }));
    this.drawDirty.set(true);
  }

  isRegistered(p: GolfGroupRosterPlayer): boolean {
    const day = this.drawDay();
    if (!day) return false;
    return day.flights.some((f) => f.players.some((x) => x.groupPlayerId === p.id && x.status !== 'booked'));
  }

  registeredFlightLabel(p: GolfGroupRosterPlayer): string {
    const day = this.drawDay();
    const f = day ? day.flights.find((x) => x.players.some((y) => y.groupPlayerId === p.id)) : null;
    return f && day ? this.flightTitle(f, day) : '';
  }

  autoFill(): void {
    const b = this.booking();
    const day = this.drawDay();
    if (!b || !day) return;
    const edits = { ...this.drawEdits() };
    const left: Record<string, number> = {};
    for (const f of day.flights) left[f.id] = f.capacity;
    for (const fid of Object.values(edits)) if (fid && left[fid] !== undefined) left[fid] -= 1;
    let fi = 0;
    for (const p of b.roster) {
      if (p.status !== 'listed' || edits[p.id]) continue;
      while (fi < day.flights.length && left[day.flights[fi].id] <= 0) fi += 1;
      if (fi >= day.flights.length) break;
      edits[p.id] = day.flights[fi].id;
      left[day.flights[fi].id] -= 1;
    }
    this.drawEdits.set(edits);
    this.drawDirty.set(true);
  }

  clearDraw(): void {
    const b = this.booking();
    if (!b) return;
    const edits: Record<string, string> = {};
    for (const p of b.roster) if (this.isRegistered(p)) edits[p.id] = this.drawEdits()[p.id] || '';
    this.drawEdits.set(edits);
    this.drawDirty.set(true);
  }

  saveDraw(): void {
    this.clearMessages();
    const b = this.booking();
    const day = this.drawDay();
    if (!b || !day) return;
    if (this.drawSummary().over.length) { this.errorMessage.set(`Over capacity: ${this.drawSummary().over.join(', ')}.`); return; }
    const assignments = b.roster.map((p) => ({ groupPlayerId: p.id, groupFlightId: this.drawEdits()[p.id] || null }));
    this.saving.set(true);
    this.service.draw(b.id, day.id, { assignments }).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.successMessage.set(res.message);
        this.applyBooking(res.booking);
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err.error?.message || 'The draw could not be saved.');
      },
    });
  }

  flightPlayersText(f: GolfGroupFlight): string {
    return f.players.map((p) => p.playerName).join(', ');
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }

  // Template helpers for the Day form.
  get dayFormHold(): boolean {
    return this.isHold(this.dayForm.controls.startFormat.value);
  }

  dayLineHold(g: DayGroup): boolean {
    return this.isHold(g.controls.startFormat.value);
  }

  option(list: MembershipStatusOption[] | undefined): MembershipStatusOption[] {
    return list || [];
  }
}
