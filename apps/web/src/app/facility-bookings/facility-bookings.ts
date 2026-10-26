import { Component, Injector, OnDestroy, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AbstractControl, FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { CanDirective } from '../shared/can.directive';
import { DialogComponent } from '../shared/dialog/dialog';
import { ComboboxComponent, ComboOption } from '../shared/combobox/combobox';
import { OverflowMenuComponent } from '../shared/overflow-menu/overflow-menu';
import { MenuItemDirective } from '../shared/overflow-menu/menu-item.directive';
import { PhoneInputComponent } from '../shared/phone-input/phone-input';
import { ConfirmDialogComponent, ConfirmRequest } from '../shared/confirm-dialog/confirm-dialog';
import { LocalDatePipe, formatLocalDate, localDateOnly } from '../shared/local-date.pipe';
import { MoneyInputDirective } from '../shared/money-input.directive';
import { ScrollReturnService } from '../services/scroll-return.service';
import { onDebounced } from '../shared/debounce';
import {
  FacilityAvailability,
  FacilityBookingContext,
  FacilityBookingMeta,
  FacilityBookingRow,
  FacilityBookingService,
  FacilityBookingTypeFacts,
  FacilityBillDoc,
  FacilityBillScreen,
  FacilityPaymentLine,
  FacilityGridCell,
  FacilityGridColumn,
  FacilityParticipantLine,
  FacilityParticipantTypeOption,
  FacilitySlotClaim,
} from '../services/facility-booking.service';

// One roster line (house standard: a typed FormGroup inside the FormArray so
// the form's own dirty state feeds the drawer's unsaved-changes guard).
type RosterGroup = FormGroup<{
  participantType: FormControl<string>;
  memberNo: FormControl<string>;
  name: FormControl<string>;
}>;

// One tender line of a settlement (typed FormGroup in the FormArray).
type PayGroup = FormGroup<{
  paymentTypeId: FormControl<string>;
  amount: FormControl<number>;
  reference: FormControl<string>;
  otherDebtorId: FormControl<string>;
}>;

// A rule check mirrored on the screen before confirm (show expected results);
// the server re-validates every one of them at save.
interface RuleCheck {
  level: 'ok' | 'warn' | 'fail' | 'info';
  text: string;
}

// Facility Management -> Facility Bookings (/facility/bookings; structures
// approved 2026-10-25, sub-slice 2b). The DESK flow against the day grid of
// ONE slot-booked facility type: pick the type and the date -> the grid
// (facilities across, slots down; closed, front-desk, past, locked and booked
// cells distinguished) -> click a run of slots on one facility to CLAIM them
// (a lock group with a countdown; every click re-claims the whole selection
// so the server's consecutive rule speaks at once) -> "Book" opens the ONE
// drawer: the booker (member by number with standing, window, allowance and
// held slots resolved, or a visitor), the roster, the contact, and the rule
// checks the server will apply -> confirm. The same drawer shows a booking's
// detail (slots, roster, cancel) and edits the roster. The day's bookings
// list under the grid, with a search by number or booker over every date.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-facility-bookings',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, ScreenTitlePipe, ScreenSubtitlePipe, FavStarComponent, CanDirective,
    DialogComponent, ComboboxComponent, OverflowMenuComponent, MenuItemDirective, PhoneInputComponent,
    ConfirmDialogComponent, LocalDatePipe, MoneyInputDirective,
  ],
  templateUrl: './facility-bookings.html',
  styleUrls: ['./facility-bookings.css'],
})
export class FacilityBookingsComponent implements OnInit, OnDestroy {
  private readonly service = inject(FacilityBookingService);
  private readonly fb = inject(FormBuilder);
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private static readonly LIST_PATH = '/facility/bookings';
  private static readonly TYPE_KEY = 'facility-bookings.typeId';

  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  // ---- meta + filters ----
  readonly meta = signal<FacilityBookingMeta | null>(null);
  readonly typeId = signal('');
  readonly date = signal(localDateOnly());
  readonly typeOptions = computed<ComboOption[]>(() => (this.meta()?.facilityTypes || []).map((t) => ({ value: t.id, label: `${t.code} - ${t.description}` })));
  readonly participantTypes = computed<FacilityParticipantTypeOption[]>(() => this.meta()?.participantTypes || []);

  // ---- the day grid ----
  readonly grid = signal<FacilityAvailability | null>(null);
  readonly gridLoading = signal(false);
  readonly currentType = computed<FacilityBookingTypeFacts | null>(() => this.grid()?.facilityType || this.meta()?.facilityTypes.find((t) => t.id === this.typeId()) || null);
  readonly gridColumnsStyle = computed(() => `72px repeat(${Math.max(this.grid()?.columns.length || 0, 1)}, minmax(104px, 1fr))`);
  readonly isToday = computed(() => this.date() === localDateOnly());

  // ---- the selection (a run of slots on ONE facility) and its claim ----
  readonly selFacilityId = signal<string | null>(null);
  readonly selStarts = signal<string[]>([]);
  readonly claim = signal<FacilitySlotClaim | null>(null);
  readonly claiming = signal(false);
  readonly countdown = signal('');
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  readonly selectedColumn = computed<FacilityGridColumn | null>(() => this.grid()?.columns.find((c) => c.id === this.selFacilityId()) || null);
  readonly selectionSummary = computed(() => {
    const col = this.selectedColumn();
    const starts = [...this.selStarts()].sort();
    if (!col || !starts.length) return '';
    const cells = starts.map((s) => col.cells.find((c) => c.startTime === s)).filter((c): c is FacilityGridCell => !!c);
    if (!cells.length) return '';
    return `${col.code} · ${cells[0].startTime} - ${cells[cells.length - 1].endTime} · ${cells.length} slot${cells.length === 1 ? '' : 's'}`;
  });

  // ---- the day's bookings + search ----
  readonly bookings = signal<FacilityBookingRow[]>([]);
  readonly listLoading = signal(false);
  readonly search = signal('');
  readonly searchResults = signal<FacilityBookingRow[] | null>(null);
  readonly searching = signal(false);
  readonly shownBookings = computed(() => this.searchResults() ?? this.bookings());
  readonly liveCount = computed(() => this.bookings().filter((b) => b.status !== 'cancelled').length);

  // ---- the ONE drawer: 'book' | 'detail' | 'participants' ----
  readonly dlgMode = signal<'book' | 'detail' | 'participants' | 'bill' | 'settle' | null>(null);
  readonly saving = signal(false);
  readonly detail = signal<FacilityBookingRow | null>(null);
  readonly detailLoading = signal(false);
  readonly confirmAction = signal<ConfirmRequest | null>(null);
  readonly cancellingId = signal<string | null>(null);

  // ---- the bill on the booking (slice 2c): items, tiles, tenders ----
  readonly billScreen = signal<FacilityBillScreen | null>(null);
  readonly billBusy = signal(false);
  readonly billWarnings = signal<string[]>([]);
  readonly payLines: FormArray<PayGroup> = this.fb.array<PayGroup>([]);
  readonly settleForm = this.fb.group({ lines: this.payLines });
  readonly payVersion = signal(0);
  readonly billOpen = computed(() => this.billScreen()?.bill.status === 'open');
  readonly tenderOptions = computed<ComboOption[]>(() => (this.billScreen()?.tenders || []).map((t) => ({ value: t.id, label: t.description ? `${t.paymentType} - ${t.description}` : t.paymentType })));
  readonly otherDebtorOptions = computed<ComboOption[]>(() => (this.billScreen()?.otherDebtors || []).map((d) => ({ value: d.id, label: `${d.code ? d.code + ' - ' : ''}${d.name}` })));
  readonly remaining = computed(() => {
    this.payVersion();
    const total = this.billScreen()?.bill.totalAmount || 0;
    const sum = this.payLines.controls.reduce((s, g) => s + (Number(g.controls.amount.value) || 0), 0);
    return Math.round((total - sum) * 100) / 100;
  });

  readonly rosterLines: FormArray<RosterGroup> = this.fb.array<RosterGroup>([]);
  readonly form = this.fb.nonNullable.group({
    bookerKind: ['member' as 'member' | 'visitor', Validators.required],
    memberNo: ['', Validators.maxLength(50)],
    visitorName: ['', Validators.maxLength(255)],
    visitorIdentityNo: ['', Validators.maxLength(50)],
    visitorMobile: [''],
    visitorEmail: ['', [Validators.email, Validators.maxLength(255)]],
    hostMemberNo: ['', Validators.maxLength(50)],
    contactMobile: [''],
    contactEmail: ['', [Validators.email, Validators.maxLength(255)]],
    remarks: ['', Validators.maxLength(255)],
    bookingNo: ['', Validators.maxLength(50)],
    roster: this.rosterLines,
  });
  // The booker kind and the roster shape are mirrored into signals from the
  // form events so the template re-renders zonelessly.
  readonly bookerKind = signal<'member' | 'visitor'>('member');
  readonly rosterVersion = signal(0);

  // The member standing resolved for the keyed number (context endpoint).
  readonly context = signal<FacilityBookingContext | null>(null);
  readonly contextLoading = signal(false);
  readonly contextFor = signal('');

  readonly dialogTitle = computed(() => {
    const mode = this.dlgMode();
    const d = this.detail();
    if (mode === 'book') return `New booking - ${this.selectionSummary()}`;
    if (mode === 'participants') return d ? `Participants - ${d.bookingNo}` : 'Participants';
    const bs = this.billScreen();
    if (mode === 'bill') return bs ? `Bill ${bs.bill.billNo} - ${this.billSourceLabel()}` : 'Bill';
    if (mode === 'settle') return bs ? `Settle bill ${bs.bill.billNo}` : 'Settle';
    return d ? `Booking ${d.bookingNo}` : 'Booking';
  });

  // The rule checks the server will apply, mirrored from the context and the
  // type facts so the desk sees the expected result before confirming.
  readonly checks = computed<RuleCheck[]>(() => {
    this.rosterVersion();
    const out: RuleCheck[] = [];
    const type = this.currentType();
    const claim = this.claim();
    const ctx = this.context();
    const meta = this.meta();
    const kind = this.bookerKind();
    if (!type || !claim) return out;
    const slots = claim.slots.length;
    const lines = this.rosterLines.controls.map((g) => g.getRawValue());
    const guestLines = lines.filter((l) => this.baseOf(l.participantType) === 'guest');
    const memberGuestLines = lines.filter((l) => this.baseOf(l.participantType) === 'member-guest');
    if (kind === 'member') {
      if (!ctx) out.push({ level: 'info', text: 'Key the member number and press Check to resolve the standing and the booking window.' });
      else {
        if (ctx.barred) out.push({ level: 'fail', text: `Member ${ctx.member.memberNo} (${ctx.member.statusLabel || 'status'}) is barred from booking.` });
        else if (ctx.warning) out.push({ level: 'warn', text: ctx.warning });
        const date = claim.bookingDate;
        if (date < ctx.window.dateFrom) out.push({ level: 'fail', text: meta?.setting.allowSameDayBooking ? `${formatLocalDate(date)} is in the past.` : 'Same-day booking is off - today is front-desk registration only.' });
        else if (date > ctx.window.dateTo) out.push({ level: 'fail', text: `${formatLocalDate(date)} is outside the member's window (bookable up to ${formatLocalDate(ctx.window.dateTo)}, ${ctx.window.effectiveDays} days ahead).` });
        else out.push({ level: 'ok', text: `Inside the booking window (${ctx.window.effectiveDays} days ahead, up to ${formatLocalDate(ctx.window.dateTo)}).` });
        const limit = claim.dayType === 'weekend' ? type.maxSlotsPerDayWeekend : type.maxSlotsPerDayWeekday;
        if (limit > 0) {
          const total = ctx.heldSlots + slots;
          out.push(total > limit
            ? { level: 'fail', text: `${ctx.member.name} would hold ${total} ${type.code} slots that day - the ${claim.dayType} limit is ${limit}${ctx.heldSlots ? ` (already holding ${ctx.heldSlots})` : ''}.` }
            : { level: 'ok', text: `${total} of ${limit} ${type.code} slots that day for ${ctx.member.name}${ctx.heldSlots ? ` (${ctx.heldSlots} already held)` : ''}.` });
        }
      }
    } else {
      out.push({ level: 'info', text: `Visitor booking - the general window (${meta?.setting.advanceBookingDays ?? ''} days) applies and a member must host any guests.` });
    }
    if (type.minParticipants > 0 || type.maxParticipants != null) {
      const n = lines.length;
      if (type.minParticipants > 0 && n < type.minParticipants) out.push({ level: 'fail', text: `At least ${type.minParticipants} participant${type.minParticipants === 1 ? '' : 's'} per slot - ${n} keyed.` });
      else if (type.maxParticipants != null && n > type.maxParticipants) out.push({ level: 'fail', text: `At most ${type.maxParticipants} participant${type.maxParticipants === 1 ? '' : 's'} per slot - ${n} keyed.` });
      else out.push({ level: 'ok', text: `${n} participant${n === 1 ? '' : 's'} per slot (${type.minParticipants} to ${type.maxParticipants ?? 'any'}).` });
    }
    const guestLike = guestLines.length + memberGuestLines.length;
    if (guestLike > 0) {
      if (type.maxGuestsPerBooking != null && guestLines.length > type.maxGuestsPerBooking) out.push({ level: 'fail', text: `At most ${type.maxGuestsPerBooking} visitor guest${type.maxGuestsPerBooking === 1 ? '' : 's'} per booking on ${type.code}.` });
      const host = kind === 'member' ? ctx : null;
      const hostNo = this.form.controls.hostMemberNo.value.trim();
      if (!host && !hostNo) out.push({ level: 'fail', text: 'Name the host member whose guest allowance the guests draw on.' });
      else if (host && host.guestAllowance && host.guestAllowance.allowance != null) {
        const a = host.guestAllowance;
        out.push((a.remaining ?? 0) < guestLike
          ? { level: 'fail', text: `${host.member.name} has ${a.remaining} of ${a.allowance} monthly guest visits left - this booking needs ${guestLike}.` }
          : { level: 'ok', text: `${guestLike} of ${a.remaining} remaining monthly guest visits for ${host.member.name} (${a.allowance} per month).` });
      } else if (host) out.push({ level: 'ok', text: `${guestLike} guest visit${guestLike === 1 ? '' : 's'} on ${host.member.name} - no monthly cap on this membership type.` });
      if (type.hostMustBePresent) out.push({ level: 'info', text: `${type.code} requires the host to take part - keep the host on the roster.` });
      if (meta?.setting.guestControlEnabled) out.push({ level: 'info', text: 'Guest control is on - the day\'s guest rule for this type is checked at confirm.' });
    }
    const approvalCodes = lines.map((l) => this.participantTypes().find((t) => t.key === l.participantType)).filter((t) => t && t.requiresApproval).map((t) => t!.label);
    if (type.requiresApproval || approvalCodes.length) {
      out.push({ level: 'info', text: `Submitted for approval (${[type.requiresApproval ? `${type.code} bookings` : '', ...approvalCodes].filter(Boolean).join(', ')}) - the slots are held while the club decides.` });
    }
    return out;
  });
  readonly hasFailingCheck = computed(() => this.checks().some((c) => c.level === 'fail'));

  constructor() {
    onDebounced(this.search, 300, () => this.runSearch(this.search()));
  }

  ngOnInit(): void {
    this.service.meta().subscribe({
      next: (m) => {
        this.meta.set(m);
        let remembered = '';
        try { remembered = localStorage.getItem(FacilityBookingsComponent.TYPE_KEY) || ''; } catch { remembered = ''; }
        const first = m.facilityTypes.find((t) => t.id === remembered) || m.facilityTypes[0];
        if (first) {
          this.typeId.set(first.id);
          this.loadDay();
        }
        // Deep links from the Control Station: open a bill by id, or the bill
        // of a booking, in this screen's one bill drawer.
        const qp = this.route.snapshot.queryParamMap;
        const billId = qp.get('billId');
        const openBillFor = qp.get('openBillFor');
        if (billId || openBillFor) {
          this.router.navigate([], { queryParams: {}, replaceUrl: true });
          if (billId) this.showBill(billId);
          else if (openBillFor) this.openBill(openBillFor);
        }
      },
      error: (err) => this.errorMessage.set(err.error?.message || 'Failed to load the booking setup.'),
    });
  }

  ngOnDestroy(): void {
    this.stopCountdown();
    const c = this.claim();
    if (c) this.service.release(c.groupId).subscribe({ error: () => undefined });
  }

  // ---- filters ----

  setType(id: string): void {
    if (id === this.typeId()) return;
    this.clearSelection();
    this.typeId.set(id);
    try { localStorage.setItem(FacilityBookingsComponent.TYPE_KEY, id); } catch { /* per-viewer convenience only */ }
    this.loadDay();
  }

  setDate(d: string): void {
    if (!d || d === this.date()) return;
    this.clearSelection();
    this.date.set(d);
    this.loadDay();
  }

  shiftDate(days: number): void {
    const cur = new Date(`${this.date()}T00:00:00`);
    cur.setDate(cur.getDate() + days);
    this.setDate(localDateOnly(cur));
  }

  today(): void {
    this.setDate(localDateOnly());
  }

  loadDay(): void {
    const typeId = this.typeId();
    const date = this.date();
    if (!typeId || !date) return;
    this.gridLoading.set(true);
    this.service.availability(typeId, date).subscribe({
      next: (g) => {
        this.grid.set(g);
        this.gridLoading.set(false);
      },
      error: (err) => {
        this.gridLoading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load the day grid.');
      },
    });
    this.listLoading.set(true);
    this.service.list(date, typeId).subscribe({
      next: (res) => {
        this.bookings.set(res.bookings);
        this.listLoading.set(false);
        this.returnScroll.consume(FacilityBookingsComponent.LIST_PATH, this.injector);
      },
      error: (err) => {
        this.listLoading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load the day\'s bookings.');
      },
    });
  }

  refreshGrid(): void {
    const typeId = this.typeId();
    const date = this.date();
    if (!typeId || !date) return;
    this.service.availability(typeId, date).subscribe({ next: (g) => this.grid.set(g), error: () => undefined });
  }

  // ---- the grid ----

  cellAt(col: FacilityGridColumn, index: number): FacilityGridCell | null {
    return col.cells[index] || null;
  }

  isSelected(col: FacilityGridColumn, cell: FacilityGridCell): boolean {
    return this.selFacilityId() === col.id && this.selStarts().includes(cell.startTime);
  }

  cellDisabled(col: FacilityGridColumn, cell: FacilityGridCell): boolean {
    if (cell.state === 'booked') return false;
    if (cell.state === 'mine') return !this.isSelected(col, cell);
    return !['open', 'front-desk'].includes(cell.state) || this.claiming();
  }

  cellLabel(col: FacilityGridColumn, cell: FacilityGridCell): string {
    const base = `${col.code} ${cell.startTime} to ${cell.endTime}`;
    switch (cell.state) {
      case 'booked': return `${base} - booked by ${cell.bookerName || cell.bookingNo || 'a member'}, open the booking`;
      case 'closed': return `${base} - closed`;
      case 'past': return `${base} - already started`;
      case 'locked': return `${base} - being booked at another desk`;
      case 'front-desk': return `${base} - front-desk slot${this.isSelected(col, cell) ? ', selected' : ''}`;
      default: return `${base}${this.isSelected(col, cell) ? ' - selected' : ' - available'}`;
    }
  }

  cellClick(col: FacilityGridColumn, cell: FacilityGridCell): void {
    this.clearMessages();
    if (cell.state === 'booked') {
      if (cell.bookingId) this.openDetail(cell.bookingId);
      return;
    }
    if (cell.state === 'mine' && !this.isSelected(col, cell)) return;
    let starts: string[];
    if (this.selFacilityId() !== col.id) {
      starts = [cell.startTime];
    } else {
      starts = this.selStarts().includes(cell.startTime)
        ? this.selStarts().filter((s) => s !== cell.startTime)
        : [...this.selStarts(), cell.startTime];
    }
    this.selFacilityId.set(col.id);
    this.selStarts.set(starts.sort());
    if (!starts.length) {
      this.clearSelection();
      return;
    }
    this.claimSelection();
  }

  private claimSelection(): void {
    const facilityId = this.selFacilityId();
    const starts = this.selStarts();
    if (!facilityId || !starts.length) return;
    this.claiming.set(true);
    const previous = this.claim();
    this.service.claim({ facilityId, bookingDate: this.date(), startTimes: starts, groupId: previous?.groupId || null }).subscribe({
      next: (c) => {
        this.claiming.set(false);
        this.claim.set(c);
        this.startCountdown(c);
        this.refreshGrid();
      },
      error: (err) => {
        this.claiming.set(false);
        this.errorMessage.set(err.error?.message || 'Could not claim that slot.');
        // The server kept (or released) the previous group: fall back to it.
        if (previous) {
          this.selFacilityId.set(previous.facility.id);
          this.selStarts.set(previous.slots.map((s) => s.startTime));
        } else {
          this.selFacilityId.set(null);
          this.selStarts.set([]);
        }
        this.refreshGrid();
      },
    });
  }

  clearSelection(): void {
    const c = this.claim();
    this.stopCountdown();
    this.claim.set(null);
    this.selFacilityId.set(null);
    this.selStarts.set([]);
    if (c) this.service.release(c.groupId).subscribe({ next: () => this.refreshGrid(), error: () => this.refreshGrid() });
  }

  private startCountdown(claim: FacilitySlotClaim): void {
    this.stopCountdown();
    const tick = () => {
      const left = Math.floor((new Date(claim.expiresAt).getTime() - Date.now()) / 1000);
      if (left <= 0) {
        this.stopCountdown();
        this.countdown.set('0:00');
        this.claim.set(null);
        this.selFacilityId.set(null);
        this.selStarts.set([]);
        if (this.dlgMode() === 'book') this.dlgMode.set(null);
        this.errorMessage.set('The slot claim expired - pick the slots again.');
        this.refreshGrid();
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

  // ---- the booking drawer ----

  openBook(): void {
    if (!this.claim()) return;
    this.clearMessages();
    this.context.set(null);
    this.contextFor.set('');
    this.rosterLines.clear();
    this.form.reset({
      bookerKind: 'member', memberNo: '', visitorName: '', visitorIdentityNo: '', visitorMobile: '', visitorEmail: '',
      hostMemberNo: '', contactMobile: '', contactEmail: '', remarks: '', bookingNo: '',
    });
    this.bookerKind.set('member');
    this.rosterVersion.update((v) => v + 1);
    this.detail.set(null);
    this.dlgMode.set('book');
  }

  setBookerKind(kind: 'member' | 'visitor'): void {
    this.form.controls.bookerKind.setValue(kind);
    this.form.controls.bookerKind.markAsDirty();
    this.bookerKind.set(kind);
    if (kind === 'visitor') {
      this.context.set(null);
      this.contextFor.set('');
    }
  }

  // Resolve the keyed member: standing, window, allowance and held slots.
  checkMember(): void {
    const no = this.form.controls.memberNo.value.trim();
    const claim = this.claim();
    if (!no || !claim) return;
    this.contextLoading.set(true);
    this.service.context(no, claim.facilityType.id, claim.bookingDate).subscribe({
      next: (ctx) => {
        this.contextLoading.set(false);
        this.context.set(ctx);
        this.contextFor.set(no);
        if (ctx.barred) this.errorMessage.set(`Member ${ctx.member.memberNo} (${ctx.member.statusLabel || 'status'}) is barred from booking.`);
        // Seed the roster with the booker as the first member line.
        if (!this.rosterLines.length) this.addLine('member', ctx.member.memberNo);
        else {
          const first = this.rosterLines.at(0);
          if (first && this.baseOf(first.controls.participantType.value) === 'member' && !first.controls.memberNo.value) first.controls.memberNo.setValue(ctx.member.memberNo);
        }
        if (!this.form.controls.contactEmail.value && ctx.member.email) this.form.controls.contactEmail.setValue(ctx.member.email);
        this.rosterVersion.update((v) => v + 1);
      },
      error: (err) => {
        this.contextLoading.set(false);
        this.context.set(null);
        this.contextFor.set('');
        this.errorMessage.set(err.error?.message || 'Member not found.');
      },
    });
  }

  memberChanged(): void {
    if (this.contextFor() && this.contextFor() !== this.form.controls.memberNo.value.trim()) {
      this.context.set(null);
      this.contextFor.set('');
    }
  }

  // ---- roster ----

  baseOf(code: string): 'member' | 'member-guest' | 'guest' | null {
    return this.participantTypes().find((t) => t.key === code)?.baseIdentity || null;
  }

  needsName(code: string): boolean {
    return this.baseOf(code) === 'guest';
  }

  typeLabel(code: string): string {
    return this.participantTypes().find((t) => t.key === code)?.label || code;
  }

  addLine(participantType = 'member', memberNo = '', name = ''): void {
    const code = this.participantTypes().some((t) => t.key === participantType) ? participantType : (this.participantTypes()[0]?.key || 'member');
    this.rosterLines.push(this.fb.nonNullable.group({
      participantType: [code, Validators.required],
      memberNo: [memberNo, Validators.maxLength(50)],
      name: [name, Validators.maxLength(255)],
    }));
    this.rosterLines.markAsDirty();
    this.rosterVersion.update((v) => v + 1);
  }

  removeLine(i: number): void {
    this.rosterLines.removeAt(i);
    this.rosterLines.markAsDirty();
    this.rosterVersion.update((v) => v + 1);
  }

  lineChanged(): void {
    this.rosterVersion.update((v) => v + 1);
  }

  private rosterPayload(): FacilityParticipantLine[] | string {
    const lines: FacilityParticipantLine[] = [];
    for (let i = 0; i < this.rosterLines.length; i += 1) {
      const v = this.rosterLines.at(i).getRawValue();
      if (this.needsName(v.participantType)) {
        if (!v.name.trim()) return `Participant ${i + 1}: key in the guest's name.`;
        lines.push({ participantType: v.participantType, name: v.name.trim() });
      } else {
        if (!v.memberNo.trim()) return `Participant ${i + 1}: key in the member number.`;
        lines.push({ participantType: v.participantType, memberNo: v.memberNo.trim() });
      }
    }
    return lines;
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  confirmBooking(): void {
    this.clearMessages();
    const claim = this.claim();
    if (!claim) {
      this.errorMessage.set('The slot claim is gone - pick the slots again.');
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const f = this.form.getRawValue();
    if (f.bookerKind === 'member' && !f.memberNo.trim()) {
      this.errorMessage.set('Key in the booker\'s member number.');
      return;
    }
    if (f.bookerKind === 'visitor' && !f.visitorName.trim()) {
      this.errorMessage.set('Key in the visitor\'s name.');
      return;
    }
    const roster = this.rosterPayload();
    if (typeof roster === 'string') {
      this.errorMessage.set(roster);
      return;
    }
    this.saving.set(true);
    this.service.create({
      lockGroupId: claim.groupId,
      booker: f.bookerKind === 'member'
        ? { kind: 'member', memberNo: f.memberNo.trim() }
        : { kind: 'visitor', name: f.visitorName.trim(), identityNo: f.visitorIdentityNo.trim() || null, mobile: f.visitorMobile || null, email: f.visitorEmail.trim() || null },
      participants: roster,
      hostMemberNo: f.hostMemberNo.trim() || null,
      contactMobile: f.contactMobile || null,
      contactEmail: f.contactEmail.trim() || null,
      remarks: f.remarks.trim() || null,
      bookingNo: f.bookingNo.trim() || null,
    }).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.successMessage.set(res.message);
        this.form.markAsPristine();
        this.rosterLines.markAsPristine();
        // The claim converted into the booking - nothing to release.
        this.stopCountdown();
        this.claim.set(null);
        this.selFacilityId.set(null);
        this.selStarts.set([]);
        this.dlgMode.set(null);
        this.returnScroll.remember(FacilityBookingsComponent.LIST_PATH, res.booking.id);
        this.loadDay();
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to confirm the booking.');
        if (err.status === 409) {
          this.stopCountdown();
          this.claim.set(null);
          this.selFacilityId.set(null);
          this.selStarts.set([]);
          this.dlgMode.set(null);
          this.refreshGrid();
        }
      },
    });
  }

  // ---- detail / participants ----

  openDetail(id: string): void {
    this.clearMessages();
    this.detailLoading.set(true);
    this.detail.set(null);
    this.dlgMode.set('detail');
    this.service.get(id).subscribe({
      next: (b) => {
        this.detail.set(b);
        this.detailLoading.set(false);
      },
      error: (err) => {
        this.detailLoading.set(false);
        this.dlgMode.set(null);
        this.errorMessage.set(err.error?.message || 'Failed to load the booking.');
      },
    });
  }

  openParticipants(): void {
    const d = this.detail();
    if (!d) return;
    this.rosterLines.clear();
    for (const p of d.participants) this.addLine(p.participantType, p.memberNo || '', p.memberNo ? '' : p.name);
    this.rosterLines.markAsPristine();
    this.form.controls.hostMemberNo.setValue(d.participants.find((p) => p.isHost)?.memberNo || '');
    this.form.controls.hostMemberNo.markAsPristine();
    this.rosterVersion.update((v) => v + 1);
    this.dlgMode.set('participants');
  }

  saveParticipants(): void {
    this.clearMessages();
    const d = this.detail();
    if (!d) return;
    const roster = this.rosterPayload();
    if (typeof roster === 'string') {
      this.errorMessage.set(roster);
      return;
    }
    this.saving.set(true);
    this.service.saveParticipants(d.id, { participants: roster, hostMemberNo: this.form.controls.hostMemberNo.value.trim() || null }).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.successMessage.set(res.message);
        this.rosterLines.markAsPristine();
        this.form.controls.hostMemberNo.markAsPristine();
        this.detail.set({ ...res.booking, canModify: d.canModify, cancelVerdict: d.cancelVerdict });
        this.dlgMode.set('detail');
        this.loadDay();
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to save the participants.');
      },
    });
  }

  askCancel(b: FacilityBookingRow): void {
    this.clearMessages();
    this.service.cancelPreview(b.id).subscribe({
      next: (p) => {
        const when = `${b.bookingDate ? formatLocalDate(b.bookingDate) : ''} ${b.startTime || ''}`.trim();
        const lines = [`Booking ${b.bookingNo} (${b.facilities.join(', ')} ${when}) will be cancelled and its ${p.slots} slot${p.slots === 1 ? '' : 's'} released.`];
        if (p.guestVisits) lines.push(`${p.guestVisits} guest visit${p.guestVisits === 1 ? '' : 's'} on the host's monthly allowance will be voided.`);
        if (p.pending) lines.push('The pending approval is withdrawn.');
        else if (p.late) lines.push(`This is inside the ${p.noticeHours}-hour notice - it is recorded as a LATE cancellation.`);
        else if (p.controlled) lines.push(`Outside the ${p.noticeHours}-hour notice - no late-cancellation record.`);
        this.confirmAction.set({
          title: 'Cancel this booking?',
          message: lines.join(' '),
          confirmLabel: p.late ? 'Cancel booking (late)' : 'Cancel booking',
          cancelLabel: 'Keep booking',
          run: () => this.cancelBooking(b),
        });
      },
      error: (err) => this.errorMessage.set(err.error?.message || 'Failed to check the cancellation.'),
    });
  }

  private cancelBooking(b: FacilityBookingRow): void {
    this.confirmAction.set(null);
    this.cancellingId.set(b.id);
    this.service.cancel(b.id, null).subscribe({
      next: (res) => {
        this.cancellingId.set(null);
        this.successMessage.set(res.message);
        if (this.detail()?.id === b.id) this.detail.set({ ...res.booking, canModify: b.canModify });
        this.returnScroll.remember(FacilityBookingsComponent.LIST_PATH, b.id);
        this.loadDay();
      },
      error: (err) => {
        this.cancellingId.set(null);
        this.errorMessage.set(err.error?.message || 'Failed to cancel the booking.');
      },
    });
  }

  closeDialog(): void {
    const mode = this.dlgMode();
    this.dlgMode.set(null);
    this.rosterLines.clear();
    this.rosterLines.markAsPristine();
    this.form.markAsPristine();
    this.payLines.clear();
    this.payLines.markAsPristine();
    this.billScreen.set(null);
    if (mode === 'book') this.clearSelection();
  }

  // ---- the bill ----

  // Open the booking's bill (the default fees auto-charge) or show the live one.
  openBill(bookingId: string): void {
    this.clearMessages();
    this.billBusy.set(true);
    this.service.openBill(bookingId).subscribe({
      next: (res) => {
        this.billBusy.set(false);
        this.billScreen.set(res);
        this.billWarnings.set(res.warnings || []);
        if (res.message) this.successMessage.set(res.message);
        this.dlgMode.set('bill');
        if (res.message) this.loadDay();
      },
      error: (err) => {
        this.billBusy.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to open the bill.');
      },
    });
  }

  // Show an existing bill by id (a station bill on an entry or an issue, or a booking's).
  showBill(billId: string): void {
    this.clearMessages();
    this.billBusy.set(true);
    this.service.getBill(billId).subscribe({
      next: (res) => {
        this.billBusy.set(false);
        this.billScreen.set(res);
        this.billWarnings.set([]);
        this.dlgMode.set('bill');
      },
      error: (err) => {
        this.billBusy.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load the bill.');
      },
    });
  }

  // What the bill hangs off, for the drawer title.
  billSourceLabel(): string {
    const bs = this.billScreen();
    if (!bs) return '';
    const kind = bs.booking.kind || 'booking';
    if (kind === 'registration') return `entry ${bs.booking.bookingNo || ''}`;
    if (kind === 'issue') return `${bs.booking.facilityType?.code || ''} issue`;
    return `booking ${bs.booking.bookingNo || ''}`;
  }

  private applyBill(bill: FacilityBillDoc): void {
    const bs = this.billScreen();
    if (bs) this.billScreen.set({ ...bs, bill });
  }

  tileAllowsOverride(transactionTypeId: string): boolean {
    return !!this.billScreen()?.tiles.find((t) => t.id === transactionTypeId)?.allowPriceOverride;
  }

  addTile(transactionTypeId: string): void {
    const bs = this.billScreen();
    if (!bs) return;
    this.clearMessages();
    this.billBusy.set(true);
    this.service.addBillItem(bs.bill.id, transactionTypeId, 1).subscribe({
      next: (res) => { this.billBusy.set(false); this.applyBill(res.bill); },
      error: (err) => { this.billBusy.set(false); this.errorMessage.set(err.error?.message || 'Failed to add the item.'); },
    });
  }

  setItemQuantity(itemId: string, raw: string): void {
    const bs = this.billScreen();
    const quantity = Number(raw);
    if (!bs || !Number.isInteger(quantity) || quantity < 1) return;
    this.clearMessages();
    this.service.updateBillItem(bs.bill.id, itemId, { quantity }).subscribe({
      next: (res) => this.applyBill(res.bill),
      error: (err) => this.errorMessage.set(err.error?.message || 'Failed to amend the item.'),
    });
  }

  setItemPrice(itemId: string, raw: string): void {
    const bs = this.billScreen();
    const unitAmount = Number(raw);
    if (!bs || !Number.isFinite(unitAmount) || unitAmount < 0) return;
    this.clearMessages();
    this.service.updateBillItem(bs.bill.id, itemId, { unitAmount }).subscribe({
      next: (res) => this.applyBill(res.bill),
      error: (err) => this.errorMessage.set(err.error?.message || 'Failed to amend the price.'),
    });
  }

  removeBillItem(itemId: string): void {
    const bs = this.billScreen();
    if (!bs) return;
    this.clearMessages();
    this.service.removeBillItem(bs.bill.id, itemId).subscribe({
      next: (res) => this.applyBill(res.bill),
      error: (err) => this.errorMessage.set(err.error?.message || 'Failed to remove the item.'),
    });
  }

  private newPayGroup(v: { paymentTypeId: string; amount: number; reference: string; otherDebtorId: string }): PayGroup {
    return this.fb.nonNullable.group({
      paymentTypeId: [v.paymentTypeId, Validators.required],
      amount: [v.amount, [Validators.required, Validators.min(0.01)]],
      reference: [v.reference, Validators.maxLength(100)],
      otherDebtorId: [v.otherDebtorId],
    });
  }

  openSettle(): void {
    const bs = this.billScreen();
    if (!bs || bs.bill.status !== 'open') return;
    this.clearMessages();
    this.payLines.clear({ emitEvent: false });
    this.payLines.push(this.newPayGroup({ paymentTypeId: '', amount: bs.bill.totalAmount, reference: '', otherDebtorId: '' }), { emitEvent: false });
    this.payLines.markAsPristine();
    this.payVersion.update((v) => v + 1);
    this.dlgMode.set('settle');
  }

  addPayment(): void {
    this.payLines.push(this.newPayGroup({ paymentTypeId: '', amount: Math.max(this.remaining(), 0), reference: '', otherDebtorId: '' }));
    this.payLines.markAsDirty();
    this.payVersion.update((v) => v + 1);
  }

  removePayment(i: number): void {
    this.payLines.removeAt(i);
    this.payLines.markAsDirty();
    this.payVersion.update((v) => v + 1);
  }

  payChanged(): void {
    this.payVersion.update((v) => v + 1);
  }

  tenderClass(paymentTypeId: string): string {
    return this.billScreen()?.tenders.find((t) => t.id === paymentTypeId)?.paymentClass || '';
  }

  isDebtorLine(i: number): boolean {
    return this.tenderClass(this.payLines.at(i).controls.paymentTypeId.value) === 'debtor';
  }

  onTenderPicked(i: number, id: string): void {
    this.payLines.at(i).controls.paymentTypeId.setValue(id);
    this.payLines.at(i).controls.paymentTypeId.markAsDirty();
    this.payVersion.update((v) => v + 1);
  }

  onOtherDebtorPicked(i: number, id: string): void {
    this.payLines.at(i).controls.otherDebtorId.setValue(id);
    this.payLines.at(i).controls.otherDebtorId.markAsDirty();
    this.payVersion.update((v) => v + 1);
  }

  settle(): void {
    this.clearMessages();
    const bs = this.billScreen();
    if (!bs) return;
    const rows = this.payLines.controls.map((g) => g.getRawValue());
    if (rows.some((r) => !r.paymentTypeId)) { this.errorMessage.set('Every payment line needs a payment type.'); return; }
    if (rows.some((r) => this.tenderClass(r.paymentTypeId) === 'debtor' && !r.otherDebtorId)) { this.errorMessage.set('Pick the Other Debtor to charge on the Debtor payment line.'); return; }
    if (this.remaining() !== 0) { this.errorMessage.set('Payments must equal the bill total.'); return; }
    const payments: FacilityPaymentLine[] = rows.map((r) => ({
      paymentTypeId: r.paymentTypeId,
      amount: Number(r.amount) || 0,
      reference: r.reference.trim() || null,
      otherDebtorId: this.tenderClass(r.paymentTypeId) === 'debtor' ? r.otherDebtorId : null,
    }));
    this.billBusy.set(true);
    this.service.settleBill(bs.bill.id, payments).subscribe({
      next: (res) => {
        this.billBusy.set(false);
        this.successMessage.set(res.message);
        this.payLines.markAsPristine();
        this.applyBill(res.bill);
        this.dlgMode.set('bill');
        this.loadDay();
      },
      error: (err) => {
        this.billBusy.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to settle the bill.');
      },
    });
  }

  askVoidBill(): void {
    const bs = this.billScreen();
    if (!bs) return;
    this.confirmAction.set({
      title: 'Void this bill?',
      message: `Bill ${bs.bill.billNo} (${bs.bill.items.length} line${bs.bill.items.length === 1 ? '' : 's'}, total ${bs.bill.totalAmount.toFixed(2)}) will be voided. The booking stays and can be billed again.`,
      confirmLabel: 'Void bill',
      cancelLabel: 'Keep bill',
      run: () => {
        this.confirmAction.set(null);
        this.billBusy.set(true);
        this.service.voidBill(bs.bill.id, null).subscribe({
          next: (res) => {
            this.billBusy.set(false);
            this.successMessage.set(res.message);
            this.applyBill(res.bill);
            this.loadDay();
          },
          error: (err) => {
            this.billBusy.set(false);
            this.errorMessage.set(err.error?.message || 'Failed to void the bill.');
          },
        });
      },
    });
  }

  // Back from the bill to the booking detail (refreshed, so its bill chip is current).
  backToDetail(): void {
    const bs = this.billScreen();
    const d = this.detail();
    // A station bill (entry or issue) has no booking detail to return to.
    if (bs && bs.booking.kind && bs.booking.kind !== 'booking') { this.closeDialog(); return; }
    const id = d?.id || bs?.booking.id;
    if (!id) { this.dlgMode.set(null); return; }
    this.openDetail(id);
  }

  billStatusClass(status: string): string {
    if (status === 'settled') return 'status-chip--on';
    if (status === 'open') return 'status-chip--info';
    return 'status-chip--off';
  }

  isDirty(): boolean {
    const mode = this.dlgMode();
    if (mode === 'book') return this.form.dirty || this.rosterLines.dirty;
    if (mode === 'participants') return this.rosterLines.dirty || this.form.controls.hostMemberNo.dirty;
    if (mode === 'settle') return this.payLines.dirty;
    return false;
  }

  // ---- list + search ----

  private runSearch(q: string): void {
    const term = q.trim();
    if (term.length < 2) {
      this.searchResults.set(null);
      this.searching.set(false);
      return;
    }
    this.searching.set(true);
    this.service.search(term).subscribe({
      next: (res) => {
        this.searchResults.set(res.bookings);
        this.searching.set(false);
      },
      error: (err) => {
        this.searching.set(false);
        this.errorMessage.set(err.error?.message || 'Search failed.');
      },
    });
  }

  clearSearch(): void {
    this.search.set('');
    this.searchResults.set(null);
  }

  statusLabel(key: string): string {
    return this.meta()?.statuses.find((s) => s.key === key)?.label || key;
  }

  statusClass(key: string): string {
    if (key === 'booked') return 'status-chip--on';
    if (key === 'pending-approval') return 'status-chip--info';
    return 'status-chip--off';
  }

  rosterSummary(b: FacilityBookingRow): string {
    if (!b.participants.length) return 'No participants keyed';
    const names = b.participants.slice(0, 3).map((p) => p.name);
    return names.join(', ') + (b.participants.length > 3 ? ` +${b.participants.length - 3}` : '');
  }

  clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
