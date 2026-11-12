import { Component, ElementRef, OnDestroy, OnInit, computed, inject, signal, viewChild, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AbstractControl, FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { CanDirective } from '../shared/can.directive';
import { DialogComponent } from '../shared/dialog/dialog';
import { ComboboxComponent, ComboOption } from '../shared/combobox/combobox';
import { ConfirmDialogComponent, ConfirmRequest } from '../shared/confirm-dialog/confirm-dialog';
import { ClassRosterComponent } from '../shared/class-roster/class-roster';
import { QrScannerComponent } from '../shared/qr-scanner/qr-scanner';
import { OverflowMenuComponent } from '../shared/overflow-menu/overflow-menu';
import { MenuItemDirective } from '../shared/overflow-menu/menu-item.directive';
import { LocalDatePipe, localDateOnly } from '../shared/local-date.pipe';
import { MoneyPipe } from '../shared/money.pipe';
import {
  FacilityStationService,
  ServePanel,
  ServeRow,
  ServeTile,
  StationClassSession,
  StationDay,
  StationGuestLine,
  StationIssue,
  StationMeta,
  StationRegistration,
  StationSlot,
  StationType,
  StationUtilityItem,
  StationUtilityUnit,
} from '../services/facility-station.service';

// One guest line at the door (typed FormGroup in the FormArray).
type GuestGroup = FormGroup<{
  participantType: FormControl<string>;
  memberNo: FormControl<string>;
  name: FormControl<string>;
}>;

// Facility Management -> Control Station (/facility/station; structures
// approved 2026-10-26, slice 3). ONE screen for the day with the club clock
// and a type strip: a slot type lists today's booked slots to CHECK IN by the
// clock (early / open / closed), an entry type shows the live count against
// the capacity and the register of who is in (Register a member with guests,
// Sign out, edit guests), a UTILITY ITEM (slice 6a: lockers, towels and
// showers have their own master) shows its unit board coloured by status,
// its pieces out or its uses today (Issue to a member, Return with the
// condition, Clear a parked unit), and End of day signs everyone out and
// lists the overdue items. Bills open in the bookings screen's one bill drawer.
// Slice 6b: the desk starts from the PERSON - the scan box on top reads a
// guest's pass (a handheld scanner types it, the camera reads it) or a keyed
// member number and opens the Serve panel, where a tap on a tile issues.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-facility-station',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, ScreenTitlePipe, ScreenSubtitlePipe, FavStarComponent, CanDirective,
    DialogComponent, ComboboxComponent, ConfirmDialogComponent, ClassRosterComponent, LocalDatePipe, MoneyPipe,
    QrScannerComponent, OverflowMenuComponent, MenuItemDirective,
  ],
  templateUrl: './facility-station.html',
  styleUrls: ['./facility-station.css'],
})
export class FacilityStationComponent implements OnInit, OnDestroy {
  private readonly service = inject(FacilityStationService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private static readonly TYPE_KEY = 'facility-station.typeId';

  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly meta = signal<StationMeta | null>(null);
  readonly day = signal<StationDay | null>(null);
  readonly loading = signal(false);
  readonly date = signal(localDateOnly());
  readonly isToday = computed(() => this.date() === localDateOnly());
  readonly typeId = signal('');
  readonly types = computed(() => this.day()?.types || []);
  readonly current = computed<StationType | null>(() => this.types().find((t) => t.id === this.typeId()) || null);
  // Slice 6a: the utility items sit on the same strip as the facility types.
  readonly utilityItems = computed<StationUtilityItem[]>(() => this.day()?.utilityItems || []);
  readonly currentItem = computed<StationUtilityItem | null>(() => this.utilityItems().find((u) => u.id === this.typeId()) || null);
  // Slice 5b: the Classes view - the day's sessions with their seats.
  readonly classesView = computed(() => this.typeId() === 'classes');
  readonly classesEnabled = computed(() => this.day()?.classesEnabled === true);
  readonly classSessions = computed<StationClassSession[]>(() => this.day()?.classSessions || []);
  readonly rosterSession = signal<StationClassSession | null>(null);
  readonly busyId = signal<string | null>(null);
  readonly confirmAction = signal<ConfirmRequest | null>(null);
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  // Derived views of the current type.
  readonly slotsByState = computed(() => {
    const slots = this.current()?.slots || [];
    return {
      open: slots.filter((s) => s.checkInState === 'open'),
      early: slots.filter((s) => s.checkInState === 'early'),
      checkedIn: slots.filter((s) => s.checkInState === 'checked-in'),
      closed: slots.filter((s) => s.checkInState === 'closed'),
    };
  });
  readonly entriesIn = computed(() => (this.current()?.registrations || []).filter((r) => r.status === 'in'));
  readonly entriesOut = computed(() => (this.current()?.registrations || []).filter((r) => r.status === 'out'));
  readonly issuesOut = computed(() => (this.currentItem()?.issues || []).filter((i) => i.status === 'issued'));
  readonly issuesDone = computed(() => (this.currentItem()?.issues || []).filter((i) => i.status !== 'issued'));
  readonly overdueCount = computed(() => this.utilityItems().reduce((n, u) => n + u.issues.filter((i) => i.overdue).length, 0));
  readonly insideCount = computed(() => this.types().reduce((n, t) => n + (t.liveCount || 0), 0));
  readonly guestTypes = computed(() => this.meta()?.participantTypes || []);
  readonly entryUnitOptions = computed<ComboOption[]>(() => (this.current()?.units || []).filter((u) => u.isActive).map((u) => ({ value: u.id, label: `${u.code} - ${u.name}` })));

  // ---- slice 6b: scan and serve ----
  // How many free units a numbered tile shows before "Show all".
  static readonly UNITS_SHOWN = 12;
  private readonly scanBox = viewChild<ElementRef<HTMLInputElement>>('scanBox');
  private readonly scanNext = viewChild<ElementRef<HTMLInputElement>>('scanNext');
  // A desk with a keyboard and a mouse (so, a handheld scanner): the scan
  // fields take the focus by themselves. A phone or a tablet keeps its
  // on-screen keyboard down and scans with the camera.
  readonly deskInput = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  readonly scanForm = this.fb.nonNullable.group({ code: ['', Validators.maxLength(600)] });
  readonly scanning = signal(false);
  // The person in the Serve panel, redrawn after every tap.
  readonly panel = signal<ServePanel | null>(null);
  // The tile, unit or row a call is running for.
  readonly serveBusy = signal<string | null>(null);
  // A free unit tapped on the board: the next scan takes THAT unit first.
  readonly preferredUnit = signal<StationUtilityUnit | null>(null);
  readonly tilesExpanded = signal<Set<string>>(new Set());
  // A return keyed from the panel comes back to the panel.
  private returnToPanel = false;

  // ---- the ONE drawer: 'checkin' | 'register' | 'guests' | 'issue' | 'return' | 'serve' | 'camera' ----
  readonly dlgMode = signal<'checkin' | 'register' | 'guests' | 'issue' | 'return' | 'roster' | 'serve' | 'camera' | null>(null);
  readonly saving = signal(false);
  readonly checkInSlot = signal<StationSlot | null>(null);
  readonly arrived = signal<Set<string>>(new Set());
  readonly guestTarget = signal<StationRegistration | null>(null);
  readonly returnTarget = signal<StationIssue | null>(null);
  readonly guestLines: FormArray<GuestGroup> = this.fb.array<GuestGroup>([]);
  readonly form = this.fb.nonNullable.group({
    memberNo: ['', [Validators.required, Validators.maxLength(50)]],
    facilityId: [''],
    quantity: [1, [Validators.min(1), Validators.max(500)]],
    remarks: ['', Validators.maxLength(255)],
    condition: ['good', Validators.required],
    returnedQuantity: this.fb.control<number | null>(null),
    guests: this.guestLines,
  });
  readonly guestVersion = signal(0);
  readonly formVersion = signal(0);

  readonly dialogTitle = computed(() => {
    const t = this.current();
    switch (this.dlgMode()) {
      case 'checkin': { const s = this.checkInSlot(); return s ? `Check in ${s.facility?.code} ${s.startTime} - ${s.booker?.name || s.bookingNo}` : 'Check in'; }
      case 'register': return `Register on ${t?.code || ''}`;
      case 'guests': { const r = this.guestTarget(); return r ? `Guests - ${r.registrationNo}` : 'Guests'; }
      case 'issue': { const u = this.currentItem(); return u?.behaviour === 'units' ? `Issue a ${u.code} unit` : u?.behaviour === 'use' ? `Record ${u.code}` : `Issue ${u?.code || ''}`; }
      case 'return': { const i = this.returnTarget(); return i ? `Return ${this.rowLabel(i)}` : 'Return'; }
      case 'roster': { const s = this.rosterSession(); return s ? `${s.class?.description || s.class?.code || 'Session'} · ${s.startTime}` : 'Roster'; }
      case 'serve': { const p = this.panel(); return p ? `Serve ${p.person.name}` : 'Serve'; }
      case 'camera': return 'Scan a guest pass';
      default: return '';
    }
  });

  ngOnInit(): void {
    this.service.meta().subscribe({ next: (m) => this.meta.set(m), error: (err) => this.errorMessage.set(err.error?.message || 'Failed to load the station setup.') });
    this.load();
    // The club clock moves the check-in states: refresh each minute.
    this.refreshTimer = setInterval(() => { if (!this.dlgMode()) this.load(true); }, 60000);
    this.focusScan();
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  load(quiet = false): void {
    if (!quiet) this.loading.set(true);
    this.service.today(this.date()).subscribe({
      next: (d) => {
        this.day.set(d);
        this.loading.set(false);
        if (this.typeId() === 'classes' && d.classesEnabled === true) return;
        // The strip holds the facility types and the utility items alike.
        const strip = [...d.types.map((t) => t.id), ...(d.utilityItems || []).map((u) => u.id)];
        if (!strip.includes(this.typeId())) {
          let remembered = '';
          try { remembered = localStorage.getItem(FacilityStationComponent.TYPE_KEY) || ''; } catch { remembered = ''; }
          this.typeId.set(strip.includes(remembered) ? remembered : strip[0] || '');
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load the day.');
      },
    });
  }

  setType(id: string): void {
    // A message about one item must not linger over the next one.
    if (id !== this.typeId()) this.clearMessages();
    this.typeId.set(id);
    try { localStorage.setItem(FacilityStationComponent.TYPE_KEY, id); } catch { /* per-viewer convenience only */ }
  }

  setDate(d: string): void {
    if (!d || d === this.date()) return;
    this.date.set(d);
    this.load();
  }

  today(): void {
    this.setDate(localDateOnly());
  }

  modeLabel(mode: string): string {
    return mode === 'slot' ? 'Check-in' : 'Entry';
  }

  behaviourLabel(u: StationUtilityItem): string {
    return u.behaviour === 'units' ? 'Numbered units' : u.behaviour === 'use' ? 'Use only' : 'By quantity';
  }

  freeUnits(u: StationUtilityItem): number {
    return u.units.filter((x) => x.isActive && x.unitStatus === 'available').length;
  }

  stateLabel(state: string): string {
    switch (state) {
      case 'open': return 'Open';
      case 'early': return 'Not yet';
      case 'closed': return 'Closed';
      default: return 'Checked in';
    }
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  // ---- check-in ----

  openCheckIn(slot: StationSlot): void {
    this.clearMessages();
    this.checkInSlot.set(slot);
    this.arrived.set(new Set(slot.participants.map((p) => p.id)));
    this.dlgMode.set('checkin');
  }

  toggleArrived(id: string): void {
    this.arrived.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  confirmCheckIn(): void {
    const slot = this.checkInSlot();
    if (!slot) return;
    const dropped = slot.participants.filter((p) => !p.isHost && !this.arrived().has(p.id)).map((p) => p.id);
    this.saving.set(true);
    this.service.checkIn(slot.slotId, dropped).subscribe({
      next: (res) => this.done(res.message),
      error: (err) => this.fail(err, 'Failed to check in.'),
    });
  }

  // ---- entry ----

  openRegister(): void {
    this.clearMessages();
    this.guestLines.clear();
    this.form.reset({ memberNo: '', facilityId: '', quantity: 1, remarks: '', condition: 'good', returnedQuantity: null });
    this.guestVersion.update((v) => v + 1);
    this.dlgMode.set('register');
  }

  addGuest(participantType = '', memberNo = '', name = ''): void {
    const code = participantType || this.guestTypes().find((t) => t.baseIdentity === 'guest')?.key || this.guestTypes()[0]?.key || 'guest';
    this.guestLines.push(this.fb.nonNullable.group({
      participantType: [code, Validators.required],
      memberNo: [memberNo, Validators.maxLength(50)],
      name: [name, Validators.maxLength(255)],
    }));
    this.guestLines.markAsDirty();
    this.guestVersion.update((v) => v + 1);
  }

  removeGuest(i: number): void {
    this.guestLines.removeAt(i);
    this.guestLines.markAsDirty();
    this.guestVersion.update((v) => v + 1);
  }

  guestChanged(): void {
    this.guestVersion.update((v) => v + 1);
  }

  needsName(code: string): boolean {
    return this.guestTypes().find((t) => t.key === code)?.baseIdentity === 'guest';
  }

  private guestPayload(): StationGuestLine[] | string {
    const out: StationGuestLine[] = [];
    for (let i = 0; i < this.guestLines.length; i += 1) {
      const v = this.guestLines.at(i).getRawValue();
      if (this.needsName(v.participantType)) {
        if (!v.name.trim()) return `Guest ${i + 1}: key in the guest's name.`;
        out.push({ participantType: v.participantType, name: v.name.trim() });
      } else {
        if (!v.memberNo.trim()) return `Guest ${i + 1}: key in the member number.`;
        out.push({ participantType: v.participantType, memberNo: v.memberNo.trim() });
      }
    }
    return out;
  }

  submitRegister(): void {
    this.clearMessages();
    const t = this.current();
    if (!t) return;
    if (this.form.controls.memberNo.invalid) { this.form.controls.memberNo.markAsTouched(); return; }
    const guests = this.guestPayload();
    if (typeof guests === 'string') { this.errorMessage.set(guests); return; }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.service.register({ facilityTypeId: t.id, facilityId: v.facilityId || null, memberNo: v.memberNo.trim(), guests, remarks: v.remarks.trim() || null }).subscribe({
      next: (res) => this.done(res.message, res),
      error: (err) => this.fail(err, 'Failed to register.'),
    });
  }

  openGuests(r: StationRegistration): void {
    this.clearMessages();
    this.guestTarget.set(r);
    this.guestLines.clear();
    for (const g of r.guests) this.addGuest(g.participantType, g.memberNo || '', g.memberNo ? '' : g.name);
    this.guestLines.markAsPristine();
    this.guestVersion.update((v) => v + 1);
    this.dlgMode.set('guests');
  }

  submitGuests(): void {
    this.clearMessages();
    const r = this.guestTarget();
    if (!r) return;
    const guests = this.guestPayload();
    if (typeof guests === 'string') { this.errorMessage.set(guests); return; }
    this.saving.set(true);
    this.service.saveGuests(r.id, guests).subscribe({
      next: (res) => this.done(res.message),
      error: (err) => this.fail(err, 'Failed to save the guests.'),
    });
  }

  signOut(r: StationRegistration): void {
    this.clearMessages();
    this.busyId.set(r.id);
    this.service.signOut(r.id).subscribe({
      next: (res) => { this.busyId.set(null); this.successMessage.set(res.message); this.load(true); },
      error: (err) => { this.busyId.set(null); this.errorMessage.set(err.error?.message || 'Failed to sign out.'); },
    });
  }

  // ---- issue ----

  openIssue(): void {
    this.clearMessages();
    this.form.reset({ memberNo: '', facilityId: '', quantity: 1, remarks: '', condition: 'good', returnedQuantity: null });
    this.formVersion.update((v) => v + 1);
    this.dlgMode.set('issue');
  }

  // A counted item shows its bar only when the club recorded how many it owns.
  stockShown(t: StationUtilityItem): boolean {
    return t.behaviour === 'quantity' && t.stockQuantity != null && t.stockQuantity > 0;
  }

  stockPercent(t: StationUtilityItem): number {
    return t.stockQuantity ? Math.min(100, (t.outCount / t.stockQuantity) * 100) : 0;
  }

  // What the issue being keyed will bill before tax: the fee by the quantity.
  feeTotal(t: StationUtilityItem): number {
    const qty = t.behaviour === 'quantity' ? Math.max(1, Number(this.form.controls.quantity.value) || 1) : 1;
    return (t.fee?.unitAmount || 0) * qty;
  }

  submitIssue(): void {
    this.clearMessages();
    const t = this.currentItem();
    if (!t) return;
    if (this.form.controls.memberNo.invalid) { this.form.controls.memberNo.markAsTouched(); return; }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.service.issue({ utilityItemId: t.id, utilityUnitId: null, quantity: t.behaviour === 'quantity' ? Number(v.quantity) || 1 : 1, memberNo: v.memberNo.trim(), remarks: v.remarks.trim() || null }).subscribe({
      next: (res) => this.done(res.message, res),
      error: (err) => this.fail(err, 'Failed to issue.'),
    });
  }

  openReturn(i: StationIssue, fromPanel = false): void {
    this.clearMessages();
    this.returnToPanel = fromPanel;
    this.returnTarget.set(i);
    this.form.reset({ memberNo: '', facilityId: '', quantity: 1, remarks: '', condition: 'good', returnedQuantity: i.quantity });
    this.formVersion.update((v) => v + 1);
    this.dlgMode.set('return');
  }

  conditionChanged(): void {
    this.formVersion.update((v) => v + 1);
  }

  // A numbered unit comes back whole; a counted item may come back short.
  readonly returnIsUnit = computed(() => !!this.returnTarget()?.utilityUnitId);

  submitReturn(): void {
    this.clearMessages();
    const i = this.returnTarget();
    if (!i) return;
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.service.returnIssue(i.id, {
      condition: v.condition,
      returnedQuantity: i.utilityUnitId ? null : (v.condition === 'lost' ? 0 : v.returnedQuantity),
      remarks: v.remarks.trim() || null,
      panel: this.returnToPanel,
    }).subscribe({
      next: (res) => {
        if (this.returnToPanel && res.panel) { this.backToPanel(res.message, res.panel); return; }
        this.done(res.message);
      },
      error: (err) => this.fail(err, 'Failed to record the return.'),
    });
  }

  unitClicked(u: StationUtilityUnit): void {
    const t = this.currentItem();
    if (!t || !t.trackUnits) return;
    if (u.unitStatus === 'available') {
      // Slice 6b: a free unit is taken by a PERSON - the scan decides who.
      if (!this.isToday()) return;
      this.clearMessages();
      this.preferredUnit.set(u);
      this.focusScan(true);
      return;
    }
    if (u.unitStatus === 'issued') {
      const issue = t.issues.find((i) => i.id === u.currentIssueId) || t.issues.find((i) => i.utilityUnitId === u.id && i.status === 'issued');
      if (issue) this.openReturn(issue);
      return;
    }
    this.confirmAction.set({
      title: `Clear ${u.code}?`,
      message: `${u.code} is out of service. Clearing it makes it available to issue again.`,
      confirmLabel: 'Clear unit',
      cancelLabel: 'Keep parked',
      danger: false,
      run: () => {
        this.confirmAction.set(null);
        this.service.clearUnit(u.id).subscribe({
          next: (res) => { this.successMessage.set(res.message); this.load(true); },
          error: (err) => this.errorMessage.set(err.error?.message || 'Failed to clear the unit.'),
        });
      },
    });
  }

  // ---- slice 6b: scan and serve ----

  // What a row is of: the unit's number, or the item's code and its count.
  rowLabel(i: StationIssue | ServeRow): string {
    const code = i.unit?.code || (i as ServeRow).item?.code || this.utilityItems().find((u) => u.id === i.utilityItemId)?.code || '';
    return `${code}${i.quantity > 1 ? ' x ' + i.quantity : ''}`;
  }

  // The scan box takes the keyboard on a desk with one (a handheld scanner
  // types into it); a phone keeps its keyboard down until the field is tapped.
  focusScan(force = false): void {
    if (!force && !this.deskInput) return;
    setTimeout(() => { if (!this.dlgMode()) this.scanBox()?.nativeElement.focus(); }, 0);
  }

  // Inside the Serve panel the focus goes back to the "next person" field
  // after every tap: a handheld scanner types where the focus is, and its
  // Enter must never land on a tile button and issue again.
  private focusNext(): void {
    setTimeout(() => this.scanNext()?.nativeElement.focus(), 0);
  }

  submitScan(): void {
    const code = this.scanForm.controls.code.value.trim();
    if (!code || this.scanning()) { if (!code) this.focusScan(true); return; }
    this.readCode(code);
  }

  private readCode(code: string): void {
    this.clearMessages();
    this.scanning.set(true);
    this.service.scan({ code }).subscribe({
      next: (res) => {
        this.scanning.set(false);
        this.scanForm.reset({ code: '' });
        this.tilesExpanded.set(new Set());
        this.panel.set(res.panel);
        this.dlgMode.set('serve');
        if (res.panel.pass?.firstScan) this.successMessage.set(`${res.panel.person.name} arrived - guest of ${res.panel.host.name} (${res.panel.host.memberNo}).`);
      },
      error: (err) => {
        this.scanning.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to read that code.');
        // The refused code stays selected, so the next scan replaces it.
        setTimeout(() => this.scanBox()?.nativeElement.select(), 0);
      },
    });
  }

  openCamera(): void {
    this.clearMessages();
    this.dlgMode.set('camera');
  }

  onCameraScan(code: string): void {
    if (this.scanning()) return;
    this.readCode(code);
  }

  // The free units a numbered tile shows: the unit picked on the board (or
  // the next free one) first, a dozen at a time.
  tileUnits(t: ServeTile): { id: string; code: string; location: string | null }[] {
    const first = this.firstUnitId(t);
    const ordered = first ? [...t.freeUnits.filter((u) => u.id === first), ...t.freeUnits.filter((u) => u.id !== first)] : t.freeUnits;
    return this.tilesExpanded().has(t.utilityItemId) ? ordered : ordered.slice(0, FacilityStationComponent.UNITS_SHOWN);
  }

  firstUnitId(t: ServeTile): string | null {
    const wanted = this.preferredUnit();
    return wanted && t.freeUnits.some((u) => u.id === wanted.id) ? wanted.id : t.suggestedUnitId;
  }

  hiddenUnits(t: ServeTile): number {
    return this.tilesExpanded().has(t.utilityItemId) ? 0 : Math.max(0, t.freeUnits.length - FacilityStationComponent.UNITS_SHOWN);
  }

  showAllUnits(t: ServeTile): void {
    this.tilesExpanded.update((set) => new Set(set).add(t.utilityItemId));
  }

  // The price line of a tile, before it is tapped.
  tilePrice(t: ServeTile, p: ServePanel): string {
    if (!t.fee) return 'Free';
    if (t.fee.unitAmount == null) return `${t.fee.code} - no price today`;
    const amount = t.fee.unitAmount.toFixed(2);
    return p.kind === 'guest' ? `${amount} before tax, on ${p.host.name}'s bill` : `${amount} before tax`;
  }

  // A tap issues: a unit of a numbered item, one piece of a counted item, or
  // one use. The answer redraws the panel.
  serveIssue(t: ServeTile, unitId: string | null = null): void {
    const p = this.panel();
    if (!p || this.serveBusy()) return;
    this.clearMessages();
    this.serveBusy.set(unitId || t.utilityItemId);
    this.service.issue({
      utilityItemId: t.utilityItemId, utilityUnitId: unitId, quantity: 1,
      guestRegistrationId: p.pass?.id || null, memberNo: p.pass ? null : p.host.memberNo, panel: true,
    }).subscribe({
      next: (res) => {
        this.serveBusy.set(null);
        this.preferredUnit.set(null);
        if (res.panel) this.panel.set(res.panel);
        this.successMessage.set([res.message, ...(res.warnings || [])].join(' '));
        this.load(true);
        this.focusNext();
      },
      error: (err) => {
        this.serveBusy.set(null);
        this.errorMessage.set(err.error?.message || 'Failed to issue.');
        this.refreshPanel();
        this.focusNext();
      },
    });
  }

  undoIssue(row: ServeRow): void {
    if (this.serveBusy()) return;
    this.clearMessages();
    this.serveBusy.set(row.id);
    this.service.undoIssue(row.id).subscribe({
      next: (res) => this.afterPanelAction(res.message, res.panel),
      error: (err) => { this.serveBusy.set(null); this.errorMessage.set(err.error?.message || 'Failed to undo.'); this.refreshPanel(); },
    });
  }

  // One tap takes an item back in good condition; damaged or lost goes
  // through the return form.
  returnGood(row: ServeRow): void {
    if (this.serveBusy()) return;
    this.clearMessages();
    this.serveBusy.set(row.id);
    this.service.returnIssue(row.id, { condition: 'good', returnedQuantity: row.utilityUnitId ? null : row.quantity, panel: true }).subscribe({
      next: (res) => this.afterPanelAction(res.message, res.panel),
      error: (err) => { this.serveBusy.set(null); this.errorMessage.set(err.error?.message || 'Failed to record the return.'); this.refreshPanel(); },
    });
  }

  private afterPanelAction(message: string, panel: ServePanel | null | undefined): void {
    this.serveBusy.set(null);
    this.successMessage.set(message);
    if (panel) this.panel.set(panel);
    else this.refreshPanel();
    this.load(true);
    this.focusNext();
  }

  // Redraw the panel of the person being served (after a refusal: another
  // desk may have taken the unit).
  private refreshPanel(): void {
    const p = this.panel();
    if (!p) return;
    this.service.scan(p.pass ? { guestRegistrationId: p.pass.id } : { memberNo: p.host.memberNo }).subscribe({
      next: (res) => { if (this.panel()) this.panel.set(res.panel); },
      error: () => { /* the panel keeps its last picture */ },
    });
  }

  private backToPanel(message: string, panel: ServePanel): void {
    this.saving.set(false);
    this.returnToPanel = false;
    this.returnTarget.set(null);
    this.form.markAsPristine();
    this.successMessage.set(message);
    this.panel.set(panel);
    this.dlgMode.set('serve');
    this.load(true);
  }

  // ---- slice 4: the no-show mark ----

  askNoShow(s: StationSlot): void {
    this.confirmAction.set({
      title: `Record ${s.facility?.code} ${s.startTime} as a no-show?`,
      message: `${s.booker?.name || s.bookingNo} did not check in. The slot is marked no-show; with no-show control on, the charge is raised to the booker${s.booker?.memberNo ? "'s account" : ' (a visitor - it stays pending for the desk)'} and the strike counted where the type counts them.`,
      confirmLabel: 'Record no-show',
      cancelLabel: 'Not yet',
      run: () => {
        this.confirmAction.set(null);
        this.busyId.set(s.slotId);
        this.service.markNoShows([s.slotId]).subscribe({
          next: (res) => { this.busyId.set(null); this.successMessage.set(res.message); this.load(true); },
          error: (err) => { this.busyId.set(null); this.errorMessage.set(err.error?.message || 'Failed to record the no-show.'); },
        });
      },
    });
  }

  // ---- end of day ----

  askEndOfDay(): void {
    const t = this.current();
    const inside = t ? (t.liveCount || 0) : this.insideCount();
    this.confirmAction.set({
      title: t ? `End of day for ${t.code}?` : 'End of day?',
      message: t && t.usageMode === 'slot'
        ? `Every slot on ${t.code} still booked past its end today is recorded as a no-show${this.day()?.noShowControlled ? ' and charged to its booker' : ''}; ${(t.slots || []).filter((s) => s.checkInState === 'closed').length} slot${(t.slots || []).filter((s) => s.checkInState === 'closed').length === 1 ? '' : 's'} qualify now.`
        : `${inside} registration${inside === 1 ? '' : 's'} still in will be signed out at ${this.day()?.clubNow.time || 'now'}. Utility items past their due time are listed as overdue; nothing is written off.`,
      confirmLabel: t && t.usageMode === 'slot' ? 'Record the no-shows' : 'Sign everyone out',
      cancelLabel: 'Not yet',
      danger: false,
      run: () => {
        this.confirmAction.set(null);
        this.service.endOfDay(t ? t.id : null, this.date()).subscribe({
          next: (res) => { this.successMessage.set(res.message); this.load(true); },
          error: (err) => this.errorMessage.set(err.error?.message || 'Failed to run the end of day.'),
        });
      },
    });
  }

  // ---- bills: the bookings screen owns the one bill drawer ----

  openBill(billId: string | null, bookingId: string | null): void {
    if (billId) this.router.navigate(['/facility/bookings'], { queryParams: { billId } });
    else if (bookingId) this.router.navigate(['/facility/bookings'], { queryParams: { openBillFor: bookingId } });
  }

  // ---- slice 5b: the Classes view ----

  openRoster(s: StationClassSession): void {
    this.clearMessages();
    this.rosterSession.set(s);
    this.dlgMode.set('roster');
  }

  rosterMessage(text: string): void {
    this.clearMessages();
    this.successMessage.set(text);
  }

  rosterError(text: string): void {
    this.clearMessages();
    this.errorMessage.set(text);
  }

  rosterChanged(): void {
    this.load(true);
  }

  // ---- dialog plumbing ----

  isDirty(): boolean {
    const mode = this.dlgMode();
    if (mode === 'register' || mode === 'issue' || mode === 'return') return this.form.dirty || this.guestLines.dirty;
    if (mode === 'guests') return this.guestLines.dirty;
    return false;
  }

  closeDialog(): void {
    // A refusal belongs to the form that drew it: it goes when the form does.
    this.errorMessage.set('');
    this.dlgMode.set(null);
    this.guestLines.clear();
    this.guestLines.markAsPristine();
    this.form.markAsPristine();
    this.checkInSlot.set(null);
    this.guestTarget.set(null);
    this.returnTarget.set(null);
    this.returnToPanel = false;
    this.panel.set(null);
    this.preferredUnit.set(null);
    this.serveBusy.set(null);
    // Ready for the next person.
    this.focusScan();
  }

  private done(message: string, res?: { warnings?: string[]; standingWarning?: string | null }): void {
    this.saving.set(false);
    const extra = [...(res?.warnings || []), ...(res?.standingWarning ? [res.standingWarning] : [])];
    this.successMessage.set(extra.length ? `${message} ${extra.join(' ')}` : message);
    this.form.markAsPristine();
    this.guestLines.markAsPristine();
    this.closeDialog();
    this.load(true);
  }

  private fail(err: { error?: { message?: string } }, fallback: string): void {
    this.saving.set(false);
    this.errorMessage.set(err.error?.message || fallback);
  }

  clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
