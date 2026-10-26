import { Component, OnDestroy, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AbstractControl, FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { CanDirective } from '../shared/can.directive';
import { DialogComponent } from '../shared/dialog/dialog';
import { ComboboxComponent, ComboOption } from '../shared/combobox/combobox';
import { ConfirmDialogComponent, ConfirmRequest } from '../shared/confirm-dialog/confirm-dialog';
import { LocalDatePipe, localDateOnly } from '../shared/local-date.pipe';
import {
  FacilityStationService,
  StationDay,
  StationGuestLine,
  StationIssue,
  StationMeta,
  StationRegistration,
  StationSlot,
  StationType,
  StationUnit,
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
// Sign out, edit guests), an issue type shows the unit board coloured by
// status or the pieces out (Issue to a member, Return with the condition,
// Clear a parked unit), and End of day signs everyone out and lists the
// overdue issues. Bills open in the bookings screen's one bill drawer.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-facility-station',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, ScreenTitlePipe, ScreenSubtitlePipe, FavStarComponent, CanDirective,
    DialogComponent, ComboboxComponent, ConfirmDialogComponent, LocalDatePipe,
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
  readonly issuesOut = computed(() => (this.current()?.issues || []).filter((i) => i.status === 'issued'));
  readonly issuesDone = computed(() => (this.current()?.issues || []).filter((i) => i.status !== 'issued'));
  readonly overdueCount = computed(() => this.types().reduce((n, t) => n + (t.issues || []).filter((i) => i.overdue).length, 0));
  readonly insideCount = computed(() => this.types().reduce((n, t) => n + (t.liveCount || 0), 0));
  readonly guestTypes = computed(() => this.meta()?.participantTypes || []);
  readonly unitOptions = computed<ComboOption[]>(() => (this.current()?.units || []).filter((u) => u.isActive && u.unitStatus === 'available').map((u) => ({ value: u.id, label: `${u.code} - ${u.name}` })));
  readonly entryUnitOptions = computed<ComboOption[]>(() => (this.current()?.units || []).filter((u) => u.isActive).map((u) => ({ value: u.id, label: `${u.code} - ${u.name}` })));

  // ---- the ONE drawer: 'checkin' | 'register' | 'guests' | 'issue' | 'return' ----
  readonly dlgMode = signal<'checkin' | 'register' | 'guests' | 'issue' | 'return' | null>(null);
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
      case 'issue': return t?.trackUnits ? `Issue a ${t?.code} unit` : `Issue ${t?.code}`;
      case 'return': { const i = this.returnTarget(); return i ? `Return ${i.facility?.code || t?.code}${i.quantity > 1 ? ' x ' + i.quantity : ''}` : 'Return'; }
      default: return '';
    }
  });

  ngOnInit(): void {
    this.service.meta().subscribe({ next: (m) => this.meta.set(m), error: (err) => this.errorMessage.set(err.error?.message || 'Failed to load the station setup.') });
    this.load();
    // The club clock moves the check-in states: refresh each minute.
    this.refreshTimer = setInterval(() => { if (!this.dlgMode()) this.load(true); }, 60000);
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
        if (!d.types.some((t) => t.id === this.typeId())) {
          let remembered = '';
          try { remembered = localStorage.getItem(FacilityStationComponent.TYPE_KEY) || ''; } catch { remembered = ''; }
          const pick = d.types.find((t) => t.id === remembered) || d.types[0];
          this.typeId.set(pick ? pick.id : '');
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load the day.');
      },
    });
  }

  setType(id: string): void {
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
    return mode === 'slot' ? 'Check-in' : mode === 'entry' ? 'Entry' : 'Issue';
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

  openIssue(unit: StationUnit | null = null): void {
    this.clearMessages();
    this.form.reset({ memberNo: '', facilityId: unit?.id || '', quantity: 1, remarks: '', condition: 'good', returnedQuantity: null });
    this.formVersion.update((v) => v + 1);
    this.dlgMode.set('issue');
  }

  submitIssue(): void {
    this.clearMessages();
    const t = this.current();
    if (!t) return;
    if (this.form.controls.memberNo.invalid) { this.form.controls.memberNo.markAsTouched(); return; }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.service.issue({ facilityTypeId: t.id, facilityId: v.facilityId || null, quantity: t.trackUnits ? 1 : Number(v.quantity) || 1, memberNo: v.memberNo.trim(), remarks: v.remarks.trim() || null }).subscribe({
      next: (res) => this.done(res.message, res),
      error: (err) => this.fail(err, 'Failed to issue.'),
    });
  }

  openReturn(i: StationIssue): void {
    this.clearMessages();
    this.returnTarget.set(i);
    this.form.reset({ memberNo: '', facilityId: '', quantity: 1, remarks: '', condition: 'good', returnedQuantity: i.quantity });
    this.formVersion.update((v) => v + 1);
    this.dlgMode.set('return');
  }

  conditionChanged(): void {
    this.formVersion.update((v) => v + 1);
  }

  submitReturn(): void {
    this.clearMessages();
    const i = this.returnTarget();
    const t = this.current();
    if (!i) return;
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.service.returnIssue(i.id, {
      condition: v.condition,
      returnedQuantity: t?.trackUnits ? null : (v.condition === 'lost' ? 0 : v.returnedQuantity),
      remarks: v.remarks.trim() || null,
    }).subscribe({
      next: (res) => this.done(res.message),
      error: (err) => this.fail(err, 'Failed to record the return.'),
    });
  }

  unitClicked(u: StationUnit): void {
    const t = this.current();
    if (!t || !t.trackUnits) return;
    if (u.unitStatus === 'available') { this.openIssue(u); return; }
    if (u.unitStatus === 'issued') {
      const issue = (t.issues || []).find((i) => i.id === u.currentIssueId) || (t.issues || []).find((i) => i.facilityId === u.id && i.status === 'issued');
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
        : `${inside} registration${inside === 1 ? '' : 's'} still in will be signed out at ${this.day()?.clubNow.time || 'now'}. Issues past their due time are listed as overdue; nothing is written off.`,
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

  // ---- dialog plumbing ----

  isDirty(): boolean {
    const mode = this.dlgMode();
    if (mode === 'register' || mode === 'issue' || mode === 'return') return this.form.dirty || this.guestLines.dirty;
    if (mode === 'guests') return this.guestLines.dirty;
    return false;
  }

  closeDialog(): void {
    this.dlgMode.set(null);
    this.guestLines.clear();
    this.guestLines.markAsPristine();
    this.form.markAsPristine();
    this.checkInSlot.set(null);
    this.guestTarget.set(null);
    this.returnTarget.set(null);
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
