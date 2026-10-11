import { ChangeDetectionStrategy, Component, DestroyRef, Injector, OnInit, computed, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { ConfirmDialogComponent, ConfirmRequest } from '../shared/confirm-dialog/confirm-dialog';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormArray, FormBuilder, FormControl, FormGroup, FormRecord, ReactiveFormsModule, Validators } from '@angular/forms';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { CanDirective } from '../shared/can.directive';
import { DialogComponent } from '../shared/dialog/dialog';
import { ComboboxComponent } from '../shared/combobox/combobox';
import { OverflowMenuComponent, MenuItemDirective } from '../shared/overflow-menu/overflow-menu';
import { SortMenuComponent, SortOption, SortValue } from '../shared/sort-menu/sort-menu';
import { LocalDatePipe, formatLocalDate } from '../shared/local-date.pipe';
import { PhoneInputComponent } from '../shared/phone-input/phone-input';
import { ScrollReturnService } from '../services/scroll-return.service';
import { MembershipStatusOption } from '../models/auth.models';
import { MoneyInputDirective } from '../shared/money-input.directive';
import { MoneyPipe } from '../shared/money.pipe';
import {
  GolfFolio, GolfFolioDeposit, GolfFolioPaymentLine, GolfFolioRefund, GolfFolioTile, GolfGroupBooking, GolfGroupBookingMeta, GolfGroupBookingRow, GolfGroupBookingService,
  GolfGroupDayPayload, GolfGroupFlight, GolfGroupHeaderPayload, GolfOrganiserKind as GolfGroupOrganiserKind, GolfGroupPlayDay,
  GolfGroupRosterLine, GolfGroupRosterPlayer, GolfStartFormat, GolfGroupAbilities, GolfGroupSubmitPreview, GolfGroupDayShare,
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

// One payment line in the final-settlement dialog.
interface SettleLineValue { paymentTypeId: string; amount: number; reference: string; depositBillId: string }
type SettleLineGroup = FormGroup<{
  paymentTypeId: FormControl<string>;
  amount: FormControl<number>;
  reference: FormControl<string>;
  depositBillId: FormControl<string>;
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
  imports: [ConfirmDialogComponent, 
    CommonModule, ReactiveFormsModule, ScreenTitlePipe, ScreenSubtitlePipe, FavStarComponent, CanDirective,
    DialogComponent, ComboboxComponent, OverflowMenuComponent, MenuItemDirective, LocalDatePipe, MoneyInputDirective, MoneyPipe,
    PhoneInputComponent, SortMenuComponent,
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
  // Destructive actions confirm through the shared <app-confirm-dialog>.
  readonly confirmAction = signal<ConfirmRequest | null>(null);
  readonly errorMessage = signal('');
  readonly meta = signal<GolfGroupBookingMeta | null>(null);

  // ---- listing ----
  readonly bookings = signal<GolfGroupBookingRow[]>([]);
  readonly dateFrom = signal(localDate(new Date(Date.now() - 31 * 86400000)));
  readonly dateTo = signal(localDate(new Date(Date.now() + 180 * 86400000)));
  readonly status = signal('');
  readonly search = signal('');
  // The pipeline (2026-10-11): a sales club reads the list by URGENCY - the
  // booking whose hold or deposit clock runs out first comes first, then the
  // ones awaiting approval, then everything else by play date. The sort menu
  // sits beside the search (listing standard); play date is the committee
  // club's natural order and the default when the control is off.
  readonly controlOnList = signal(false);
  readonly sortOptions: SortOption[] = [
    { key: 'urgency', label: 'Urgency', defaultDir: 'asc' },
    { key: 'playDate', label: 'Play date', defaultDir: 'desc' },
    { key: 'groupName', label: 'Group', defaultDir: 'asc' },
  ];
  readonly sort = signal<SortValue>({ key: 'playDate', dir: 'desc' });
  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const rows = this.bookings();
    const hit = q ? rows.filter((b) => (b.groupName || '').toLowerCase().includes(q)
      || b.bookingNo.toLowerCase().includes(q)
      || (b.organiserName || '').toLowerCase().includes(q)
      || b.courses.join(' ').toLowerCase().includes(q)) : rows.slice();
    const { key, dir } = this.sort();
    const sign = dir === 'asc' ? 1 : -1;
    const cmp = (a: GolfGroupBookingRow, b: GolfGroupBookingRow): number => {
      if (key === 'groupName') return (a.groupName || '').localeCompare(b.groupName || '');
      if (key === 'urgency') {
        const ua = this.deadlineOf(a);
        const ub = this.deadlineOf(b);
        if (ua !== ub) return ua - ub;
        return a.playDate.localeCompare(b.playDate);
      }
      return a.playDate.localeCompare(b.playDate) || a.bookingNo.localeCompare(b.bookingNo);
    };
    return hit.sort((a, b) => sign * cmp(a, b));
  });

  // The instant a booking's running clock ends (hold expiry or deposit due);
  // pending approvals sit after every clock, the rest at the end.
  private deadlineOf(b: GolfGroupBookingRow): number {
    const l = b.lifecycle;
    if (!l) return Number.MAX_SAFE_INTEGER;
    if (b.status === 'tentative' && l.holdExpiresAt) return new Date(l.holdExpiresAt).getTime();
    if (b.status === 'approved' && l.depositDueAt) return new Date(l.depositDueAt).getTime();
    if (b.status === 'pending-approval') return Number.MAX_SAFE_INTEGER - 2;
    if (b.status === 'tentative') return Number.MAX_SAFE_INTEGER - 1;
    return Number.MAX_SAFE_INTEGER;
  }

  setSort(value: SortValue): void {
    this.sort.set(value);
  }

  // "in 5h" / "in 3 days" / "overdue" for the listing's countdown.
  relative(iso: string | null): string {
    if (!iso) return '';
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return 'now';
    const h = Math.round(ms / 3600000);
    if (h < 1) return `in ${Math.max(1, Math.round(ms / 60000))} min`;
    if (h < 48) return `in ${h} h`;
    return `in ${Math.round(h / 24)} days`;
  }

  // The urgency class of a listing card: a clock inside 24 hours is danger,
  // inside 72 hours is a warning.
  urgencyClass(b: GolfGroupBookingRow): string {
    const at = this.deadlineOf(b);
    if (at >= Number.MAX_SAFE_INTEGER - 2) return '';
    const ms = at - Date.now();
    if (ms <= 24 * 3600000) return 'ggb-urgent--due';
    if (ms <= 72 * 3600000) return 'ggb-urgent--soon';
    return '';
  }

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
  // Proforma terms (deposit demanded + pay-by date), edited in place - a
  // reactive group (house standard): its dirty state gates Save terms and
  // Issue, and a folio refresh only re-seeds it while it is pristine.
  readonly proformaForm = this.fb.nonNullable.group({
    depositRequired: [0],
    depositDueDate: [''],
  });
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

  // ---- final settlement (slice 4): payment lines as a reactive FormArray
  // (house standard - its dirty state feeds the guard); a Deposit-class line
  // picks a held deposit instead of carrying a reference.
  readonly settleDialogOpen = signal(false);
  readonly settleLines: FormArray<SettleLineGroup> = this.fb.array<SettleLineGroup>([]);
  readonly settleForm = this.fb.group({ lines: this.settleLines });
  readonly settleTenderOptions = computed(() => (this.folio()?.tenders || []).map((t) => ({ value: t.id, label: `${t.paymentType}${t.description ? ' - ' + t.description : ''}` })));
  readonly heldDepositOptions = computed(() => (this.folio()?.deposits || []).filter((d) => d.status === 'settled' && d.unappliedAmount > 0)
    .map((d) => ({ value: d.id, label: `${d.billNo} · holds ${d.unappliedAmount.toFixed(2)}` })));
  // Methods, not computed: form values are not signals; templates re-evaluate
  // them every CD pass (the same way the dialogs bind form.dirty).
  settlePaid(): number {
    return Math.round(this.settleLines.controls.reduce((s, g) => s + (Number(g.controls.amount.value) || 0), 0) * 100) / 100;
  }
  settleRemaining(): number {
    const total = this.folio()?.bill?.totalAmount || 0;
    return Math.round((total - this.settlePaid()) * 100) / 100;
  }
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
    contactEmail: ['', [Validators.email, Validators.maxLength(255)]],
    expectedPlayers: ['' as string | number],
    remarks: ['', Validators.maxLength(255)],
    // The club's own event (Golf Specification holders only): exempt from
    // the share caps and the approval chain.
    isClubEvent: [false],
  });
  readonly dayLines = this.fb.array<DayGroup>([]);

  // ---- day dialog (add / edit one play day) ----
  readonly dayDialogOpen = signal(false);
  readonly dayEditing = signal<GolfGroupPlayDay | null>(null);
  readonly dayForm: DayGroup = this.newDayGroup();

  // ---- flights dialog (reserve flights for a day) ----
  readonly flightsDay = signal<GolfGroupPlayDay | null>(null);
  // The day's share picture (what other groups hold, the cap) - loaded when
  // the dialog opens so the preview can say whether the reservation fits.
  readonly flightShare = signal<GolfGroupDayShare | null>(null);
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
  // groupPlayerId -> groupFlightId ('' = not drawn), the EDITED state - a
  // reactive group keyed by roster player (house standard); its dirty state
  // gates Save, and it is disabled unless the day can still be drawn.
  readonly drawForm = new FormRecord<FormControl<string>>({});
  readonly drawDay = computed(() => {
    const b = this.booking();
    const id = this.drawDayId();
    return b ? b.days.find((d) => d.id === id) || b.days.find((d) => d.status === 'planned') || null : null;
  });
  // Seats taken per flight in the EDITED draw. Methods, not computeds: they
  // read form controls, which signals cannot track.
  drawLoad(): Record<string, number> {
    const load: Record<string, number> = {};
    for (const fid of Object.values(this.drawForm.getRawValue())) if (fid) load[fid] = (load[fid] || 0) + 1;
    return load;
  }
  drawSummary(): { drawn: number; listed: number; seats: number; over: string[] } {
    const day = this.drawDay();
    const b = this.booking();
    if (!day || !b) return { drawn: 0, listed: 0, seats: 0, over: [] };
    const listed = b.roster.filter((p) => p.status === 'listed').length;
    const drawn = Object.values(this.drawForm.getRawValue()).filter(Boolean).length;
    const load = this.drawLoad();
    const over = day.flights.filter((f) => (load[f.id] || 0) > f.capacity).map((f) => f.flightLabel);
    return { drawn, listed, seats: day.seatCount, over };
  }

  // ---- cancel dialog ----
  readonly cancelTarget = signal<GolfGroupBookingRow | GolfGroupBooking | null>(null);
  readonly cancelReason = signal('');

  // ---- lifecycle (2026-10-11): submit for approval (with its preview),
  // recall, reopen, extend the deposit deadline ----
  readonly submitOpen = signal(false);
  readonly submitPreview = signal<GolfGroupSubmitPreview | null>(null);
  readonly submitLoading = signal(false);
  readonly extendOpen = signal(false);
  readonly extendForm = this.fb.nonNullable.group({
    depositDueDate: ['', Validators.required],
    reason: ['', [Validators.required, Validators.maxLength(255)]],
  });

  // The server's policy for the open booking's status (groupLifecycle.service
  // abilities). A booking served before the lifecycle shipped has no block:
  // fall back to the old "booked" rule.
  can(key: keyof GolfGroupAbilities, b: { status: string; lifecycle?: { can: GolfGroupAbilities } } | null = this.booking()): boolean {
    if (!b) return false;
    if (b.lifecycle) return b.lifecycle.can[key];
    return b.status === 'booked';
  }

  controlOn(): boolean {
    return this.booking()?.lifecycle?.controlOn === true;
  }

  // ---- remove confirms (day / flight / player) ----

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
        // A sales club lands on the pipeline order; set once, the user's pick wins after.
        if (res.controlOn && !this.controlOnList()) this.sort.set({ key: 'urgency', dir: 'asc' });
        this.controlOnList.set(res.controlOn === true);
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
    const found = this.meta()?.statuses.find((s) => s.key === status);
    return (found ? found.label : status).toUpperCase();
  }

  // Chip colour by lifecycle state: confirmed is on; the deposit-pending
  // approval is the one outstanding demand (danger, like an unpaid deposit);
  // tentative and pending are in flight (info); lapsed and cancelled are off.
  statusClass(status: string): string {
    switch (status) {
      case 'booked': return 'status-chip--on';
      case 'approved': return 'status-chip--danger';
      case 'tentative':
      case 'pending-approval': return 'status-chip--info';
      default: return 'status-chip--off';
    }
  }

  // One line that says where the booking stands in its lifecycle.
  lifecycleLine(b: GolfGroupBookingRow | GolfGroupBooking): string {
    const l = b.lifecycle;
    if (!l) return '';
    switch (b.status) {
      case 'tentative': {
        if (l.holdExpiresAt) return `Tentative - the reserved flights are held until ${formatLocalDate(l.holdExpiresAt, 'datetime')} unless submitted for approval.`;
        if (!l.controlOn) return 'Tentative - submit to confirm.';
        const hasFlights = 'days' in b && b.days.some((d) => d.flights.length > 0);
        return hasFlights
          ? 'Tentative - the reserved flights are held without expiry (a deposit is held); submit for approval when ready.'
          : 'Tentative - reserve the flights and submit for approval.';
      }
      case 'pending-approval':
        return `Awaiting approval since ${formatLocalDate(l.submittedAt, 'datetime')} - the flights stay held while the approvers decide.`;
      case 'approved': {
        const due = l.depositDueAt ? ` by ${formatLocalDate(l.depositDueAt, 'datetime')}` : '';
        const ext = l.depositDueExtendedAt ? ` (deadline extended: ${l.depositDueExtensionReason})` : '';
        return `Approved ${formatLocalDate(l.approvedAt, 'datetime')} - deposit of ${(l.depositRequiredAmount || 0).toFixed(2)} due${due}; the booking confirms when it is received${ext}.`;
      }
      case 'booked':
        return l.confirmedAt ? `Confirmed ${formatLocalDate(l.confirmedAt, 'datetime')}.` : 'Confirmed.';
      case 'lapsed':
        return `Lapsed ${formatLocalDate(l.lapsedAt, 'datetime')}: ${l.lapseReason || 'the deposit was not received in time'}`;
      default:
        return '';
    }
  }

  // The short countdown on a listing card ("Hold expires in 5 h · 14 Oct, 09:00").
  lifecycleShort(b: GolfGroupBookingRow): string {
    const l = b.lifecycle;
    if (!l || !l.controlOn) return '';
    if (b.status === 'tentative' && l.holdExpiresAt) return `Hold expires ${this.relative(l.holdExpiresAt)} · ${formatLocalDate(l.holdExpiresAt, 'datetime')}${l.holdWarnedAt ? ' · warned' : ''}`;
    if (b.status === 'approved' && l.depositDueAt) return `Deposit ${(l.depositRequiredAmount || 0).toFixed(2)} due ${this.relative(l.depositDueAt)} · ${formatLocalDate(l.depositDueAt, 'datetime')}${l.depositWarnedAt ? ' · warned' : ''}`;
    if (b.status === 'pending-approval') return `Awaiting approval since ${formatLocalDate(l.submittedAt, 'datetime')}`;
    if (b.status === 'tentative') return 'Tentative - no flights held';
    return '';
  }

  // ---------- lifecycle actions ----------

  openSubmit(): void {
    const b = this.booking();
    if (!b) return;
    this.clearMessages();
    this.submitPreview.set(null);
    this.submitOpen.set(true);
    this.submitLoading.set(true);
    this.service.submitPreview(b.id).subscribe({
      next: (res) => { this.submitPreview.set(res.preview); this.submitLoading.set(false); },
      error: (err) => { this.submitLoading.set(false); this.submitOpen.set(false); this.errorMessage.set(err.error?.message || 'The submission could not be prepared.'); },
    });
  }

  // What pressing Submit does, stated before it happens.
  submitOutcome(): string {
    const p = this.submitPreview();
    if (!p) return '';
    if (p.missingFlights.length) return `Reserve flights for ${p.missingFlights.map((d) => formatLocalDate(d)).join(', ')} first - the approver decides on the tee sheet the booking takes.`;
    if (!p.controlOn) return 'Group booking control is off for this club - submitting confirms the booking at once.';
    if (p.clubEvent) return 'A club event needs no approval - it is approved as soon as you submit' + (p.depositRequired > p.depositHeld ? `, with a deposit of ${p.depositRequired.toFixed(2)} due ${p.depositDueDays} day(s) later.` : ' and confirmed at once.');
    const deposit = p.depositRequired > p.depositHeld
      ? `A deposit of ${p.depositRequired.toFixed(2)} (${p.depositHeld.toFixed(2)} already held) will be due ${p.depositDueDays} day(s) after approval; the booking confirms when it is received.`
      : 'No deposit is outstanding, so approval confirms the booking at once.';
    if (!p.chain || !p.chain.steps.length) return `No approval chain applies - the booking is approved as soon as you submit. ${deposit}`;
    return `The booking goes to ${p.chain.steps.length} approval step(s); its flights stay held meanwhile. ${deposit}`;
  }

  submitLabel(): string {
    const p = this.submitPreview();
    if (!p || !p.controlOn) return 'Submit';
    return p.chain && p.chain.steps.length ? 'Submit for approval' : (p.depositRequired > p.depositHeld ? 'Approve and demand deposit' : 'Approve and confirm');
  }

  confirmSubmit(): void {
    const b = this.booking();
    if (!b) return;
    this.working.set(true);
    this.service.submit(b.id).subscribe({
      next: (res) => { this.working.set(false); this.submitOpen.set(false); this.successMessage.set(res.message); this.applyBooking(res.booking); this.loadFolio(b.id); },
      error: (err) => { this.working.set(false); this.errorMessage.set(err.error?.message || 'The booking could not be submitted.'); },
    });
  }

  askRecall(): void {
    const b = this.booking();
    if (!b) return;
    this.confirmAction.set({
      title: 'Recall from approval',
      message: `Take ${b.groupName} (${b.bookingNo}) back from the approvers? It becomes tentative again with everything kept, and the hold clock on its flights restarts.`,
      confirmLabel: 'Recall booking',
      danger: false,
      run: () => { this.confirmAction.set(null); this.performLifecycle(this.service.recall(b.id)); },
    });
  }

  askReopen(): void {
    const b = this.booking();
    if (!b) return;
    const lapsed = b.status === 'lapsed';
    this.confirmAction.set({
      title: lapsed ? 'Reopen lapsed booking' : 'Reopen for amendment',
      message: lapsed
        ? `Reopen ${b.groupName} (${b.bookingNo})? It becomes tentative with no flights - reserve them again and submit it for approval.`
        : `Reopen ${b.groupName} (${b.bookingNo})? Its days, flights and charges become editable again and it must be submitted for approval once more. Any held deposit keeps the flights from expiring.`,
      confirmLabel: 'Reopen booking',
      danger: false,
      run: () => { this.confirmAction.set(null); this.performLifecycle(this.service.reopen(b.id)); },
    });
  }

  openExtend(): void {
    const b = this.booking();
    if (!b) return;
    this.clearMessages();
    const current = b.lifecycle?.depositDueAt ? new Date(b.lifecycle.depositDueAt) : new Date();
    const next = new Date(current.getTime() + 7 * 86400000);
    this.extendForm.reset({ depositDueDate: localDate(next), reason: '' });
    this.extendOpen.set(true);
  }

  confirmExtend(): void {
    const b = this.booking();
    if (!b) return;
    if (this.extendForm.invalid) { this.extendForm.markAllAsTouched(); return; }
    const v = this.extendForm.getRawValue();
    this.working.set(true);
    this.service.extendDeposit(b.id, { depositDueDate: v.depositDueDate, reason: v.reason.trim() }).subscribe({
      next: (res) => { this.working.set(false); this.extendOpen.set(false); this.successMessage.set(res.message); this.applyBooking(res.booking); this.loadFolio(b.id); },
      error: (err) => { this.working.set(false); this.errorMessage.set(err.error?.message || 'The deadline could not be extended.'); },
    });
  }

  private performLifecycle(req: Observable<{ message: string; booking: GolfGroupBooking }>): void {
    const b = this.booking();
    if (!b) return;
    this.working.set(true);
    req.subscribe({
      next: (res) => { this.working.set(false); this.successMessage.set(res.message); this.applyBooking(res.booking); this.loadFolio(b.id); },
      error: (err) => { this.working.set(false); this.errorMessage.set(err.error?.message || 'The action was refused.'); },
    });
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
    if (!this.proformaForm.dirty) {
      this.proformaForm.reset({
        depositRequired: f.bill?.depositRequired ?? 0,
        depositDueDate: f.bill && f.bill.depositDueDate ? f.bill.depositDueDate : '',
      });
    }
    // Terms are editable only while the group bill is open AND the booking's
    // shape may still change (reactive-forms way: disable the controls, never
    // the DOM attribute).
    if (this.itemsEditable()) this.proformaForm.enable({ emitEvent: false });
    else this.proformaForm.disable({ emitEvent: false });
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

  // The group bill is open (or does not exist yet). Every folio action also
  // needs the lifecycle's say-so (groupLifecycle.service abilities): items
  // and terms change while the shape may still change; the proforma issues
  // and deposits land once approved; the final bill, voids and refunds run
  // once confirmed - and on a cancelled or lapsed booking whose deposit money
  // still has to go somewhere.
  readonly billOpen = computed(() => {
    const f = this.folio();
    if (!this.booking()) return false;
    return f?.bill ? f.bill.status === 'open' : true;
  });
  readonly itemsEditable = computed(() => this.billOpen() && this.can('editStructure'));
  readonly canIssueProforma = computed(() => this.billOpen() && this.can('issueProforma'));
  readonly canSettle = computed(() => this.billOpen() && this.can('settle'));
  readonly canDeposit = computed(() => this.can('deposit'));

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

  saveProformaTerms(): void {
    const b = this.booking();
    if (!b) return;
    this.clearMessages();
    this.folioBusy.set(true);
    // 0.00 = no deposit demanded (the API stores null for "none").
    const v = this.proformaForm.getRawValue();
    this.service.setProformaTerms(b.id, { depositRequired: v.depositRequired > 0 ? v.depositRequired : null, depositDueDate: v.depositDueDate || null }).subscribe({
      next: (res) => { this.proformaForm.markAsPristine(); this.folioDone(res); },
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
      // A deposit that meets the demand CONFIRMS an approved booking (the
      // lifecycle flips on the server), so the booking reloads with the folio.
      next: (res) => { this.depositDialogOpen.set(false); this.folioDone(res); this.loadDetail(b.id); },
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
    if (d.status === 'voided') return 'status-chip--off';
    if (!d.onAccount || (d.arStanding && d.arStanding.status === 'paid')) return 'status-chip--on';
    if (d.arStanding && d.arStanding.status === 'partial') return 'status-chip--info';
    return 'status-chip--danger';
  }

  // ---------- final settlement ----------

  openSettle(): void {
    this.clearMessages();
    this.settleLines.clear();
    this.applyDeposits();
    this.settleLines.markAsPristine();
    this.settleDialogOpen.set(true);
  }

  private newSettleGroup(l: SettleLineValue): SettleLineGroup {
    const g: SettleLineGroup = this.fb.nonNullable.group({
      paymentTypeId: [l.paymentTypeId],
      amount: [l.amount],
      reference: [l.reference],
      depositBillId: [l.depositBillId],
    });
    // Switching the tender clears the deposit pick (a Deposit-class line
    // chooses which held deposit it draws on; any other tender carries none).
    g.controls.paymentTypeId.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => g.controls.depositBillId.setValue('', { emitEvent: false }));
    return g;
  }

  private settleRows(): SettleLineValue[] {
    return this.settleLines.controls.map((g) => g.getRawValue());
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
    const lines = this.settleRows().filter((l) => !this.isDepositTender(l.paymentTypeId));
    let left = Math.round((f.bill.totalAmount - lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)) * 100) / 100;
    for (const d of f.deposits.filter((x) => x.status === 'settled' && x.unappliedAmount > 0)) {
      if (left <= 0) break;
      const take = Math.min(left, d.unappliedAmount);
      lines.push({ paymentTypeId: depositTender.id, amount: Math.round(take * 100) / 100, reference: '', depositBillId: d.id });
      left = Math.round((left - take) * 100) / 100;
    }
    this.settleLines.clear();
    for (const l of lines) this.settleLines.push(this.newSettleGroup(l));
    this.settleLines.markAsDirty();
  }

  addSettleLine(): void {
    this.settleLines.push(this.newSettleGroup({ paymentTypeId: '', amount: Math.max(0, this.settleRemaining()), reference: '', depositBillId: '' }));
    this.settleLines.markAsDirty();
  }

  removeSettleLine(i: number): void {
    this.settleLines.removeAt(i);
    this.settleLines.markAsDirty();
  }

  // What settling does, before the clerk commits.
  settlePreview(): string {
    const parts: string[] = [];
    const rows = this.settleRows();
    const dep = rows.filter((l) => this.isDepositTender(l.paymentTypeId)).reduce((s, l) => s + (Number(l.amount) || 0), 0);
    if (dep > 0) parts.push(`${dep.toFixed(2)} applied from held deposits`);
    for (const l of rows) {
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
    const lines = this.settleRows();
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
      next: (res) => { this.settleDialogOpen.set(false); this.settleLines.markAsPristine(); this.folioDone(res); },
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
      next: (res) => { this.groupBillVoidOpen.set(false); this.proformaForm.markAsPristine(); this.folioDone(res); },
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
    return r.status === 'paid' ? 'status-chip--on' : r.status === 'declined' ? 'status-chip--off' : 'status-chip--info';
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
      contactPerson: '', contactMobile: '', contactEmail: '', expectedPlayers: '', remarks: '', isClubEvent: false,
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
      contactPerson: b.contactPerson || '', contactMobile: b.contactMobile || '', contactEmail: b.contactEmail || '',
      expectedPlayers: b.expectedPlayers === null ? '' : b.expectedPlayers, remarks: b.remarks || '', isClubEvent: b.isClubEvent === true,
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
      contactEmail: v.contactEmail.trim() || null,
      expectedPlayers: v.expectedPlayers === '' || v.expectedPlayers === null ? null : Number(v.expectedPlayers),
      remarks: v.remarks.trim() || undefined,
      // Sent only when this user may set it; otherwise the server keeps the flag.
      isClubEvent: this.meta()?.clubEventAllowed ? v.isClubEvent : undefined,
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
    const label = formatLocalDate(d.playDate);
    this.confirmAction.set({
      title: 'Remove play day',
      message: `Remove play day ${label} and its reserved flights? Only a day with no drawn players can be removed.`,
      confirmLabel: 'Remove play day',
      run: () => { this.confirmAction.set(null); this.performRemove(this.service.removeDay(this.booking()!.id, d.id)); },
    });
  }

  askRemoveFlight(d: GolfGroupPlayDay, f: GolfGroupFlight): void {
    this.confirmAction.set({
      title: 'Release flight',
      message: `Release flight ${f.flightLabel} (${f.teeTime})? Its seats go back to the tee sheet.`,
      confirmLabel: 'Release flight',
      run: () => { this.confirmAction.set(null); this.performRemove(this.service.removeFlight(this.booking()!.id, d.id, f.id)); },
    });
  }

  askRemovePlayer(p: GolfGroupRosterPlayer): void {
    this.confirmAction.set({
      title: 'Remove player',
      message: `Remove ${p.playerName} from the roster? Any flight they were drawn into frees the seat.`,
      confirmLabel: 'Remove player',
      run: () => { this.confirmAction.set(null); this.performRemove(this.service.removePlayer(this.booking()!.id, p.id)); },
    });
  }

  private performRemove(req: Observable<{ message: string; booking: GolfGroupBooking }>): void {
    if (!this.booking()) return;
    this.working.set(true);
    req.subscribe({
      next: (res) => {
        this.working.set(false);
        this.successMessage.set(res.message);
        this.applyBooking(res.booking);
      },
      error: (err) => {
        this.working.set(false);
        this.errorMessage.set(err.error?.message || 'The removal was refused.');
      },
    });
  }

  // ---------- waitlist ----------

  // The queue line under a play day: this booking's place, a live offer to
  // it, or the other group's offer that blocks reserving.
  waitlistLine(d: GolfGroupPlayDay): { text: string; tone: 'offer' | 'wait' | 'blocked' } | null {
    const w = d.waitlist;
    if (!w) return null;
    if (w.status === 'offered' && w.offerExpiresAt) return { text: `Next in line: this course and date are yours to reserve until ${formatLocalDate(w.offerExpiresAt, 'datetime')} - no other group can take them meanwhile.`, tone: 'offer' };
    if (w.status === 'waiting') return { text: `On the waitlist - position ${w.position} of ${w.waiting}. You are told when the day frees up.`, tone: 'wait' };
    if (w.blockedUntil) return { text: `Another group is next in line for this course and date until ${formatLocalDate(w.blockedUntil, 'datetime')}; join the waitlist to be offered it next.`, tone: 'blocked' };
    if (w.status === 'expired') return { text: 'Your next-in-line offer passed unanswered; join the waitlist again if you still want the day.', tone: 'wait' };
    return null;
  }

  canJoinWaitlist(d: GolfGroupPlayDay): boolean {
    const b = this.booking();
    return !!b && this.controlOn() && b.status === 'tentative' && d.status === 'planned' && d.flights.length === 0
      && !(d.waitlist && (d.waitlist.status === 'waiting' || d.waitlist.status === 'offered'));
  }

  canLeaveWaitlist(d: GolfGroupPlayDay): boolean {
    return !!(d.waitlist && (d.waitlist.status === 'waiting' || d.waitlist.status === 'offered'));
  }

  joinWaitlist(d: GolfGroupPlayDay): void {
    const b = this.booking();
    if (!b) return;
    this.clearMessages();
    this.performLifecycle(this.service.joinWaitlist(b.id, d.id));
  }

  askLeaveWaitlist(d: GolfGroupPlayDay): void {
    const b = this.booking();
    if (!b) return;
    const offered = d.waitlist?.status === 'offered';
    this.confirmAction.set({
      title: 'Leave waitlist',
      message: offered
        ? `Give up your next-in-line offer for ${formatLocalDate(d.playDate)}? The day is offered to the next group at once.`
        : `Leave the waitlist for ${formatLocalDate(d.playDate)}? Your place in the queue is lost.`,
      confirmLabel: 'Leave waitlist',
      danger: false,
      run: () => { this.confirmAction.set(null); this.performLifecycle(this.service.leaveWaitlist(b.id, d.id)); },
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
    this.flightShare.set(null);
    if (b) this.service.dayShare(b.id, d.id).subscribe({ next: (res) => this.flightShare.set(res.share), error: () => this.flightShare.set(null) });
  }

  // How many flights the dialog's numbers produce.
  private flightsCount(): number {
    const d = this.flightsDay();
    if (!d) return 0;
    const v = this.flightsForm.getRawValue();
    if (!this.isHold(d.startFormat)) return Number(v.count) || 0;
    const holes = d.startFormat === 'modified-shotgun' && d.startHoles ? d.startHoles.length : (d.holes === 9 ? 9 : 18);
    return (holes + this.parseHoles(v.doubleHoles).length) * d.waves;
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

  // The share line of the Reserve dialog: what other groups hold of the
  // course that day, what this reservation adds, and the cap it meets. A
  // shotgun day's share is its hold window, not its flight count, so only
  // the sequential case can be previewed exactly.
  sharePreview(): { text: string; over: boolean } | null {
    const s = this.flightShare();
    const d = this.flightsDay();
    if (!s || !d || !s.slots) return null;
    const dayLabel = s.dayType === 'weekend' ? 'weekend / holiday' : 'weekday';
    const held = `Other groups hold ${s.groupSharePct}% of this course's ${s.slots} tee times (${dayLabel})`;
    if (s.clubEvent) return { text: `${held}. A club event is exempt from the cap.`, over: false };
    const capText = s.cap > 0 ? `; the cap is ${s.cap}%` : '; no cap applies';
    if (this.isHold(d.startFormat)) return { text: `${held}${capText}. A shotgun day counts its whole hold window.`, over: false };
    const after = Math.min(100, Math.round(((s.groupCells + this.flightsCount()) / s.slots) * 100));
    const over = s.cap > 0 && after > s.cap;
    return { text: `${held}${capText}. After this reservation: ${after}%${over ? ' - over the cap, the reservation will be refused' : ''}.`, over };
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
    return entries.map(([date, label]) => `${formatLocalDate(date, 'dayMonth')} ${label}`).join(' · ');
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
    // Rebuild the group: one control per roster player (registered players
    // keep their flight so Save sends the whole picture).
    for (const k of Object.keys(this.drawForm.controls)) this.drawForm.removeControl(k, { emitEvent: false });
    if (b) for (const p of b.roster) this.drawForm.addControl(p.id, new FormControl(edits[p.id] || '', { nonNullable: true }), { emitEvent: false });
    if (b && day && this.can('draw', b) && day.status === 'planned') this.drawForm.enable({ emitEvent: false });
    else this.drawForm.disable({ emitEvent: false });
    this.drawForm.markAsPristine();
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
    const edits = { ...this.drawForm.getRawValue() };
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
    this.drawForm.patchValue(edits);
    this.drawForm.markAsDirty();
  }

  clearDraw(): void {
    const b = this.booking();
    if (!b) return;
    const current = this.drawForm.getRawValue();
    const edits: Record<string, string> = {};
    for (const p of b.roster) edits[p.id] = this.isRegistered(p) ? current[p.id] || '' : '';
    this.drawForm.patchValue(edits);
    this.drawForm.markAsDirty();
  }

  saveDraw(): void {
    this.clearMessages();
    const b = this.booking();
    const day = this.drawDay();
    if (!b || !day) return;
    if (this.drawSummary().over.length) { this.errorMessage.set(`Over capacity: ${this.drawSummary().over.join(', ')}.`); return; }
    const raw = this.drawForm.getRawValue();
    const assignments = b.roster.map((p) => ({ groupPlayerId: p.id, groupFlightId: raw[p.id] || null }));
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
