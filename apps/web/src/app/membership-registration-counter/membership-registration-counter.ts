import { Component, Injector, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { CanDirective } from '../shared/can.directive';
import { DialogComponent } from '../shared/dialog/dialog';
import { PhoneInputComponent } from '../shared/phone-input/phone-input';
import { ComboboxComponent } from '../shared/combobox/combobox';
import { OverflowMenuComponent } from '../shared/overflow-menu/overflow-menu';
import { MenuItemDirective } from '../shared/overflow-menu/menu-item.directive';
import { QrScannerComponent } from '../shared/qr-scanner/qr-scanner';
import { LocalDatePipe, formatLocalDate, localDateOnly } from '../shared/local-date.pipe';
import { onDebounced } from '../shared/debounce';
import { ScrollReturnService } from '../services/scroll-return.service';
import { MembershipStatusOption } from '../models/auth.models';
import {
  MembershipGuestService, GuestRegistration, GuestHostFacts, GuestMatch, GuestPassFacts, GuestRegistrationPayload,
  ExpectedVisit, WalkUpClub, PatronGroup, GuestDetailsPayload,
} from '../services/membership-guest.service';

type DialogMode = 'pick' | 'visit' | 'form' | 'receive' | 'walkup' | 'pass' | 'scan' | 'cancel';

// Membership Management -> Registration Counter (/membership/registration-counter;
// structures approved 2026-11-10 and 2026-11-14). The club's ONE counter for
// everyone who is not a member, and every one of them leaves with the same
// thing - a DAY PASS (QR code), valid on its date only:
//   - a member's GUEST: the host is checked (status Action control, the
//     month's guest allowance), the guest is recognised when they have come
//     before, and the pass is emailed or shared from the desk's own WhatsApp;
//   - a VISITING MEMBER of an affiliated or reciprocal club: the letter of
//     introduction (the office's file, Affiliated Visits) is received HERE on
//     each day the visitor comes - letter and ID sighted the first time, the
//     ID after - and that day's pass is issued; a walk-up with no letter on
//     file is keyed and, where the arrangement needs no approval, received at
//     once; the guests the visitor brings get a pass each.
// Single-dialog standard: ONE <app-dialog> instance with a mode signal and
// @switch views (pick / visit / form / receive / walkup / pass / scan /
// cancel). Issuing a pass moves the SAME dialog on to the pass view - two
// instances swapped in one tick would have the closing one pop the opening
// one's Back-trap entry and dismiss it at once (see memberships.spec.ts).
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-membership-registration-counter',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ScreenTitlePipe, ScreenSubtitlePipe, FavStarComponent, CanDirective, DialogComponent,
    PhoneInputComponent, ComboboxComponent, OverflowMenuComponent, MenuItemDirective, QrScannerComponent, LocalDatePipe],
  templateUrl: './membership-registration-counter.html',
  styleUrls: ['./membership-registration-counter.css'],
})
export class MembershipRegistrationCounterComponent implements OnInit {
  private readonly service = inject(MembershipGuestService);
  private readonly fb = inject(FormBuilder);
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private static readonly LIST_PATH = '/membership/registration-counter';

  readonly loading = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly registrations = signal<GuestRegistration[]>([]);
  readonly statuses = signal<MembershipStatusOption[]>([]);
  readonly groups = signal<{ key: PatronGroup; label: string }[]>([]);
  // The visiting members the counter may receive today, and the clubs a
  // walk-up may come from.
  readonly expectedVisits = signal<ExpectedVisit[]>([]);
  readonly clubs = signal<WalkUpClub[]>([]);
  // The club's own date - "today" for the pass, whatever the device says.
  readonly today = signal(localDateOnly());
  readonly numberingMode = signal<'auto' | 'manual' | null>('auto');

  // Server-side filters: visit-date range (a week back, a month ahead),
  // status and patron group; client-side search.
  readonly dateFrom = signal(localDateOnly(new Date(Date.now() - 7 * 86400000)));
  readonly dateTo = signal(localDateOnly(new Date(Date.now() + 30 * 86400000)));
  readonly status = signal('');
  readonly group = signal('');
  readonly search = signal('');

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const rows = this.registrations();
    if (!q) return rows;
    return rows.filter((r) =>
      r.registrationNo.toLowerCase().includes(q)
      || (r.guest?.name || '').toLowerCase().includes(q)
      || (r.guest?.mobile || '').toLowerCase().includes(q)
      || (r.guest?.email || '').toLowerCase().includes(q)
      || (r.relation || '').toLowerCase().includes(q)
      || (r.visit?.visitNo || '').toLowerCase().includes(q));
  });
  // Expected today: the members' guests registered ahead for today plus the
  // visiting members whose letter is valid today.
  readonly expectedToday = computed(() => this.registrations().filter((r) => r.status === 'registered' && r.passState === 'valid').length + this.expectedVisits().length);
  readonly arrivedToday = computed(() => this.registrations().filter((r) => r.status === 'arrived' && r.passState === 'valid').length);

  // ---- the ONE dialog: which view it shows, and how it is presented ----
  readonly dialogMode = signal<DialogMode | null>(null);
  // Fixed when the dialog opens: a registration is a drawer (and stays one
  // when it moves on to the pass), the standalone pass / scan / cancel are
  // centred.
  readonly dialogVariant = signal<'drawer' | 'center'>('drawer');
  readonly saving = signal(false);
  readonly editTarget = signal<GuestRegistration | null>(null);
  // The visiting member whose guest the form registers (their row of today).
  readonly guestOf = signal<GuestRegistration | null>(null);
  readonly dialogTitle = computed(() => {
    switch (this.dialogMode()) {
      case 'pick': return 'New registration';
      case 'visit': return 'Visiting member';
      case 'receive': return 'Receive visiting member';
      case 'walkup': return 'Walk-up - letter not on file';
      case 'pass': return 'Day pass';
      case 'scan': return 'Scan pass';
      case 'cancel': return 'Cancel registration';
      default:
        if (this.editTarget()) return 'Edit details';
        return this.guestOf() ? 'Guest of a visiting member' : 'New guest registration';
    }
  });

  // The person needs a way to receive the pass - a mobile or an email -
  // except the visiting member a letter names, whose pass can simply be
  // shown at the counter.
  private contactOptional = false;
  private readonly contactRequired = (group: AbstractControl): ValidationErrors | null => {
    if (this.contactOptional) return null;
    const mobile = String(group.get('mobile')?.value || '').trim();
    const email = String(group.get('email')?.value || '').trim();
    return mobile || email ? null : { contact: true };
  };

  readonly form = this.fb.nonNullable.group({
    memberNo: ['', [Validators.required, Validators.maxLength(50)]],
    visitDate: ['', [Validators.required]],
    registrationNo: ['', [Validators.maxLength(50)]],
    guest: this.fb.nonNullable.group({
      name: ['', [Validators.required, Validators.maxLength(255)]],
      mobile: [''],
      email: ['', [Validators.email, Validators.maxLength(255)]],
      identityNo: ['', [Validators.maxLength(50)]],
    }, { validators: this.contactRequired }),
    remarks: ['', [Validators.maxLength(255)]],
    sendEmail: [true],
  });

  // Receiving a visiting member for today: what the counter sighted.
  readonly receiveTarget = signal<ExpectedVisit | null>(null);
  readonly receiveForm = this.fb.nonNullable.group({
    letterSighted: [false],
    idSighted: [false],
    registrationNo: ['', [Validators.maxLength(50)]],
    remarks: ['', [Validators.maxLength(255)]],
  });

  // A walk-up: the letter is keyed at the counter.
  readonly walkForm = this.fb.nonNullable.group({
    affiliatedClubId: ['', [Validators.required]],
    visitorName: ['', [Validators.required, Validators.maxLength(255)]],
    visitorMemberNo: ['', [Validators.required, Validators.maxLength(50)]],
    visitorIdentityNo: ['', [Validators.maxLength(50)]],
    visitorMobile: [''],
    visitorEmail: ['', [Validators.email, Validators.maxLength(255)]],
    loiReference: ['', [Validators.maxLength(100)]],
    visitDateTo: [''],
    sports: ['', [Validators.maxLength(255)]],
    dining: ['', [Validators.maxLength(255)]],
    other: ['', [Validators.maxLength(255)]],
    remarks: ['', [Validators.maxLength(255)]],
    registrationNo: ['', [Validators.maxLength(50)]],
    letterSighted: [false],
    idSighted: [false],
  });
  readonly clubOptions = computed(() => this.clubs().map((c) => ({ value: c.id, label: `${c.code} - ${c.name} (${this.kindLabel(c.kind)})` })));
  // Mirrors the picked club so the note and the button follow it.
  readonly walkClubId = signal('');
  readonly walkClub = computed(() => this.clubs().find((c) => c.id === this.walkClubId()) || null);

  // Picking the visiting member among today's letters.
  readonly visitQuery = signal('');
  readonly visitMatches = computed(() => {
    const q = this.visitQuery().trim().toLowerCase();
    const rows = this.expectedVisits();
    if (!q) return rows;
    return rows.filter((v) =>
      v.visitorName.toLowerCase().includes(q)
      || v.visitorMemberNo.toLowerCase().includes(q)
      || v.visitNo.toLowerCase().includes(q)
      || (v.club?.name || '').toLowerCase().includes(q)
      || (v.club?.code || '').toLowerCase().includes(q));
  });

  // The host as looked up for the drawer (show the expected result).
  readonly hostFacts = signal<GuestHostFacts | null>(null);
  readonly hostError = signal('');
  readonly hostLoading = signal(false);

  // Returning-guest search inside the drawer.
  readonly guestQuery = signal('');
  readonly guestMatches = signal<GuestMatch[]>([]);
  readonly guestSearching = signal(false);
  readonly pickedGuest = signal<GuestMatch | null>(null);

  // ---- the pass / cancel / scan views ----
  readonly passTarget = signal<GuestRegistration | null>(null);
  readonly passFacts = signal<GuestPassFacts | null>(null);
  readonly passError = signal('');
  readonly copied = signal(false);
  readonly cancelTarget = signal<GuestRegistration | null>(null);
  readonly cancelReason = signal('');
  readonly scanCode = signal('');
  readonly scanResult = signal<GuestRegistration | null>(null);
  readonly scanError = signal('');
  readonly working = signal(false);
  readonly workingId = signal<string | null>(null);

  constructor() {
    onDebounced(() => this.guestQuery(), 300, () => this.runGuestSearch());
  }

  ngOnInit(): void {
    this.load();
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  // The contact rule belongs to the pair, shown once either field was visited.
  showContactError(): boolean {
    const g = this.form.controls.guest;
    return g.hasError('contact') && (g.controls.mobile.touched || g.controls.email.touched);
  }

  load(): void {
    this.loading.set(true);
    this.service.list({ dateFrom: this.dateFrom(), dateTo: this.dateTo(), status: this.status(), group: this.group() }).subscribe({
      next: (res) => {
        this.registrations.set(res.registrations);
        this.statuses.set(res.statuses);
        this.groups.set(res.groups || []);
        this.expectedVisits.set(res.expectedVisits || []);
        this.clubs.set(res.clubs || []);
        this.today.set(res.today);
        this.numberingMode.set(res.numberingMode);
        this.loading.set(false);
        this.returnScroll.consume(MembershipRegistrationCounterComponent.LIST_PATH, this.injector);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load the registrations.');
      },
    });
  }

  setDateFrom(v: string): void { if (v) { this.dateFrom.set(v); this.load(); } }
  setDateTo(v: string): void { if (v) { this.dateTo.set(v); this.load(); } }
  setStatus(v: string): void { this.status.set(v); this.load(); }
  setGroup(v: string): void { this.group.set(v); this.load(); }
  clearSearch(): void { this.search.set(''); }

  kindLabel(kind: string | undefined): string {
    return kind === 'reciprocal' ? 'reciprocal club' : 'affiliated club';
  }

  // One chip per row: the stored status read against the pass date.
  chipLabel(r: GuestRegistration): string {
    if (r.status === 'cancelled') return 'Cancelled';
    if (r.status === 'arrived') return 'Arrived';
    if (r.passState === 'valid') return 'Expected today';
    if (r.passState === 'expired') return 'Did not arrive';
    return 'Registered';
  }

  chipClass(r: GuestRegistration): string {
    if (r.status === 'arrived') return 'status-chip--on';
    if (r.status === 'registered' && r.passState !== 'expired') return 'status-chip--info';
    return 'status-chip--off';
  }

  // The pass still works: not cancelled and its date has not passed.
  passLive(r: GuestRegistration): boolean {
    return r.passState === 'valid' || r.passState === 'upcoming';
  }

  canArrive(r: GuestRegistration): boolean {
    return r.status === 'registered' && r.passState === 'valid';
  }

  // The visiting member a letter names (not a guest they brought).
  isVisitor(r: GuestRegistration | null): boolean {
    return !!r && !!r.visit && !r.accompanying;
  }

  contactLine(r: GuestRegistration): string {
    return [r.guest?.mobile, r.guest?.email].filter(Boolean).join(' · ');
  }

  // "guest of Ahmad Faizal (A0018)" inside a sentence.
  relationInline(r: GuestRegistration): string {
    const text = r.relation || '';
    return text ? text.charAt(0).toLowerCase() + text.slice(1) : '';
  }

  viaLabel(via: string | null): string {
    return via === 'whatsapp' ? 'WhatsApp' : 'email';
  }

  // "Day 2 of the letter - letter sighted on Sat, 14 Nov 2026."
  visitDayLine(v: ExpectedVisit): string {
    if (v.firstDay) return 'First time at the counter - sight the letter of introduction and the ID.';
    return `Day ${v.daysAttended + 1} at the counter - the letter was sighted on ${formatLocalDate(v.letterSightedOn, 'weekday')}; sight the ID.`;
  }

  // ---- host lookup (drawer) ----

  lookupHost(): void {
    const memberNo = this.form.controls.memberNo.value.trim();
    const visitDate = this.form.controls.visitDate.value;
    this.hostError.set('');
    if (!memberNo || !visitDate) {
      this.hostFacts.set(null);
      return;
    }
    this.hostLoading.set(true);
    this.service.host(memberNo, visitDate).subscribe({
      next: (facts) => {
        this.hostFacts.set(facts);
        this.hostLoading.set(false);
      },
      error: (err) => {
        this.hostFacts.set(null);
        this.hostLoading.set(false);
        this.hostError.set(err.error?.message || 'The member could not be checked.');
      },
    });
  }

  hostBarred(): boolean {
    return this.hostFacts()?.host.actionControl === 'barred';
  }

  // "2 of 4 guest visits used in November 2026 - 2 left" / "No monthly limit".
  allowanceLine(): string {
    const facts = this.hostFacts();
    if (!facts || !facts.allowance) return '';
    const a = facts.allowance;
    const month = formatLocalDate(facts.visitDate, 'monthYear');
    if (a.allowance === null) return `No monthly guest limit - ${a.used} guest visit${a.used === 1 ? '' : 's'} so far in ${month}.`;
    if (a.allowance === 0) return 'This membership type may not bring guests.';
    return `${a.used} of ${a.allowance} guest visits used in ${month} - ${a.remaining} left.`;
  }

  allowanceExhausted(): boolean {
    const a = this.hostFacts()?.allowance;
    return !!a && a.allowance !== null && (a.remaining ?? 0) < 1;
  }

  // ---- returning guests (drawer) ----

  private runGuestSearch(): void {
    const q = this.guestQuery().trim();
    if (q.length < 2) {
      this.guestMatches.set([]);
      return;
    }
    this.guestSearching.set(true);
    this.service.searchGuests(q).subscribe({
      next: (res) => {
        this.guestMatches.set(res.guests);
        this.guestSearching.set(false);
      },
      error: () => {
        this.guestMatches.set([]);
        this.guestSearching.set(false);
      },
    });
  }

  pickGuest(g: GuestMatch): void {
    this.pickedGuest.set(g);
    this.form.controls.guest.setValue({ name: g.name, mobile: g.mobile || '', email: g.email || '', identityNo: g.identityNo || '' });
    this.form.controls.guest.markAsDirty();
    this.guestQuery.set('');
    this.guestMatches.set([]);
    this.syncSendEmail();
  }

  clearPickedGuest(): void {
    this.pickedGuest.set(null);
    this.form.controls.guest.reset({ name: '', mobile: '', email: '', identityNo: '' });
  }

  matchLine(g: GuestMatch): string {
    const parts = [g.mobile, g.email].filter(Boolean);
    parts.push(g.visits ? `${g.visits} visit${g.visits === 1 ? '' : 's'}, last ${formatLocalDate(g.lastVisit)}` : 'no visits yet');
    return parts.join(' · ');
  }

  hasEmail(): boolean {
    const c = this.form.controls.guest.controls.email;
    return !!c.value.trim() && c.valid;
  }

  // Emailing the pass needs an address: without one the switch is off and
  // inert; once an address is keyed in it comes back on (unless the desk
  // already switched it off by hand).
  syncSendEmail(): void {
    const c = this.form.controls.sendEmail;
    if (!this.hasEmail()) {
      c.setValue(false);
      c.disable();
      return;
    }
    if (c.disabled) {
      c.enable();
      if (!this.editTarget() && c.pristine) c.setValue(true);
    }
  }

  // ---- open: the class first, then the form of that class ----

  // "New registration": who is at the counter?
  openNew(): void {
    this.clearMessages();
    this.editTarget.set(null);
    this.guestOf.set(null);
    this.openDialog('pick', 'drawer');
  }

  // A member's guest.
  pickGuestClass(): void {
    this.prepareGuestForm(null);
    this.dialogMode.set('form');
  }

  // A visiting member: today's letters, or a walk-up.
  pickVisitorClass(): void {
    this.visitQuery.set('');
    this.dialogMode.set('visit');
  }

  backToPick(): void {
    this.dialogMode.set('pick');
  }

  private prepareGuestForm(guestOf: GuestRegistration | null): void {
    this.editTarget.set(null);
    this.guestOf.set(guestOf);
    this.setContactOptional(false);
    this.form.controls.guest.controls.name.enable();
    this.form.reset({
      memberNo: '', visitDate: this.today(), registrationNo: '',
      guest: { name: '', mobile: '', email: '', identityNo: '' }, remarks: '', sendEmail: true,
    });
    // A visiting member's guest has no host member and is registered for
    // today: those two controls take no part in the form.
    if (guestOf) {
      this.form.controls.memberNo.disable();
      this.form.controls.visitDate.disable();
    } else {
      this.form.controls.memberNo.enable();
      this.form.controls.visitDate.enable();
    }
    this.resetDrawerState();
    this.form.controls.sendEmail.enable();
    this.syncSendEmail();
  }

  // A guest the visiting member brought (from the visitor's row of today).
  openGuestOf(r: GuestRegistration): void {
    this.clearMessages();
    this.prepareGuestForm(r);
    this.openDialog('form', 'drawer');
  }

  openEdit(r: GuestRegistration): void {
    this.clearMessages();
    this.editTarget.set(r);
    this.guestOf.set(null);
    this.form.reset({
      memberNo: r.host?.memberNo || '', visitDate: r.visitDate, registrationNo: r.registrationNo,
      guest: { name: r.guest?.name || '', mobile: r.guest?.mobile || '', email: r.guest?.email || '', identityNo: r.guest?.identityNo || '' },
      remarks: r.remarks || '', sendEmail: false,
    });
    // Who they come with and the date ARE the registration: display-only on
    // edit. A visiting member also keeps the name of the letter, and needs no
    // contact detail (the pass can be shown at the counter).
    this.form.controls.memberNo.disable();
    this.form.controls.visitDate.disable();
    if (this.isVisitor(r)) this.form.controls.guest.controls.name.disable();
    else this.form.controls.guest.controls.name.enable();
    this.setContactOptional(this.isVisitor(r));
    this.resetDrawerState();
    this.openDialog('form', 'drawer');
  }

  private setContactOptional(optional: boolean): void {
    this.contactOptional = optional;
    this.form.controls.guest.updateValueAndValidity();
  }

  private openDialog(mode: DialogMode, variant: 'drawer' | 'center'): void {
    this.dialogVariant.set(variant);
    this.dialogMode.set(mode);
  }

  private resetDrawerState(): void {
    this.hostFacts.set(null);
    this.hostError.set('');
    this.guestQuery.set('');
    this.guestMatches.set([]);
    this.pickedGuest.set(null);
  }

  closeDialog(): void {
    this.dialogMode.set(null);
    this.passTarget.set(null);
    this.passFacts.set(null);
    this.passError.set('');
    this.cancelTarget.set(null);
    this.cancelReason.set('');
    this.scanResult.set(null);
    this.scanError.set('');
    this.receiveTarget.set(null);
    this.guestOf.set(null);
  }

  // The unsaved-changes guard follows the form the dialog is showing.
  dialogDirty(): boolean {
    switch (this.dialogMode()) {
      case 'form': return this.form.dirty;
      case 'receive': return this.receiveForm.dirty;
      case 'walkup': return this.walkForm.dirty;
      default: return false;
    }
  }

  saveLabel(): string {
    if (this.saving()) return 'Saving…';
    if (this.editTarget()) return 'Save';
    return this.form.controls.sendEmail.value && this.hasEmail() ? 'Register and email pass' : 'Register guest';
  }

  onSave(): void {
    this.clearMessages();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const guest: GuestDetailsPayload = {
      name: v.guest.name.trim(),
      mobile: v.guest.mobile || null,
      email: v.guest.email.trim() || null,
      identityNo: v.guest.identityNo.trim() || null,
    };
    const target = this.editTarget();
    this.saving.set(true);
    if (target) {
      this.service.update(target.id, { guest, remarks: v.remarks.trim() || null }).subscribe({
        next: (res) => {
          this.finishSave(res.message, res.registration.id);
          this.closeDialog();
        },
        error: (err) => this.failSave(err),
      });
      return;
    }
    const manualNo = this.numberingMode() === 'manual' && v.registrationNo.trim() ? v.registrationNo.trim() : undefined;
    const picked = this.pickedGuest();
    const visitor = this.guestOf();
    if (visitor) {
      this.service.addVisitorGuest(visitor.id, {
        guest, remarks: v.remarks.trim() || null, sendEmail: v.sendEmail && !!guest.email,
        ...(picked ? { guestId: picked.id } : {}), ...(manualNo ? { registrationNo: manualNo } : {}),
      }).subscribe({
        next: (res) => this.handOver(res.message, res.registration, res.pass),
        error: (err) => this.failSave(err),
      });
      return;
    }
    const payload: GuestRegistrationPayload = {
      memberNo: v.memberNo.trim(),
      visitDate: v.visitDate,
      guest,
      remarks: v.remarks.trim() || null,
      sendEmail: v.sendEmail && !!guest.email,
    };
    if (manualNo) payload.registrationNo = manualNo;
    if (picked) payload.guestId = picked.id;
    this.service.create(payload).subscribe({
      next: (res) => this.handOver(res.message, res.registration, res.pass),
      error: (err) => this.failSave(err),
    });
  }

  // A pass was issued: hand it over at once - the same dialog moves on to
  // the pass view.
  private handOver(message: string, registration: GuestRegistration, pass: GuestPassFacts): void {
    this.finishSave(message, registration.id);
    this.form.markAsPristine();
    this.receiveForm.markAsPristine();
    this.walkForm.markAsPristine();
    this.passTarget.set(registration);
    this.passFacts.set(pass);
    this.passError.set('');
    this.copied.set(false);
    this.dialogMode.set('pass');
  }

  private finishSave(message: string, id: string): void {
    this.successMessage.set(message);
    this.saving.set(false);
    this.form.markAsPristine();
    this.returnScroll.remember(MembershipRegistrationCounterComponent.LIST_PATH, id);
    this.load();
  }

  private failSave(err: { error?: { message?: string } }): void {
    this.errorMessage.set(err.error?.message || 'Failed to save the registration.');
    this.saving.set(false);
  }

  // ---- a visiting member: receive for today ----

  // From the "expected today" card (opens the dialog) or from the visiting-
  // member view of the dialog already open (moves it on).
  openReceive(v: ExpectedVisit): void {
    this.clearMessages();
    this.receiveTarget.set(v);
    this.receiveForm.reset({ letterSighted: false, idSighted: false, registrationNo: '', remarks: '' });
    if (this.dialogMode()) this.dialogMode.set('receive');
    else this.openDialog('receive', 'drawer');
  }

  receiveReady(): boolean {
    const v = this.receiveTarget();
    const f = this.receiveForm.getRawValue();
    return !!v && f.idSighted && (!v.firstDay || f.letterSighted);
  }

  onReceive(): void {
    const v = this.receiveTarget();
    if (!v) return;
    this.clearMessages();
    if (!this.receiveReady()) {
      this.errorMessage.set(v.firstDay ? 'Tick that the letter of introduction and the ID were sighted.' : 'Tick that the home club card and ID were sighted.');
      return;
    }
    const f = this.receiveForm.getRawValue();
    this.saving.set(true);
    this.service.receiveVisit(v.id, {
      letterSighted: f.letterSighted, idSighted: f.idSighted, remarks: f.remarks.trim() || null,
      ...(this.numberingMode() === 'manual' && f.registrationNo.trim() ? { registrationNo: f.registrationNo.trim() } : {}),
    }).subscribe({
      next: (res) => this.handOver(res.message, res.registration, res.pass),
      error: (err) => this.failSave(err),
    });
  }

  // ---- a visiting member: walk-up, no letter on file ----

  openWalkUp(): void {
    this.clearMessages();
    this.walkForm.reset({
      affiliatedClubId: '', visitorName: '', visitorMemberNo: '', visitorIdentityNo: '', visitorMobile: '', visitorEmail: '',
      loiReference: '', visitDateTo: '', sports: '', dining: '', other: '', remarks: '', registrationNo: '',
      letterSighted: false, idSighted: false,
    });
    this.walkClubId.set('');
    this.dialogMode.set('walkup');
  }

  onWalkClubChange(): void {
    this.walkClubId.set(this.walkForm.controls.affiliatedClubId.value);
  }

  walkSaveLabel(): string {
    if (this.saving()) return 'Saving…';
    return this.walkClub()?.needsApproval ? 'Record and submit for approval' : 'Record and issue day pass';
  }

  onWalkUp(): void {
    this.clearMessages();
    if (this.walkForm.invalid) {
      this.walkForm.markAllAsTouched();
      return;
    }
    const f = this.walkForm.getRawValue();
    if (!f.letterSighted || !f.idSighted) {
      this.errorMessage.set('Tick that the letter of introduction and the ID were sighted.');
      return;
    }
    this.saving.set(true);
    this.service.walkUp({
      affiliatedClubId: f.affiliatedClubId,
      visitorName: f.visitorName.trim(),
      visitorMemberNo: f.visitorMemberNo.trim(),
      visitorIdentityNo: f.visitorIdentityNo.trim() || null,
      visitorMobile: f.visitorMobile || null,
      visitorEmail: f.visitorEmail.trim() || null,
      loiReference: f.loiReference.trim() || null,
      visitDateTo: f.visitDateTo || null,
      sports: f.sports.trim() || null,
      dining: f.dining.trim() || null,
      other: f.other.trim() || null,
      remarks: f.remarks.trim() || null,
      letterSighted: true,
      idSighted: true,
      ...(this.numberingMode() === 'manual' && f.registrationNo.trim() ? { registrationNo: f.registrationNo.trim() } : {}),
    }).subscribe({
      next: (res) => {
        if (res.issued && res.registration && res.pass) {
          this.handOver(res.message, res.registration, res.pass);
          return;
        }
        // Recorded only (approval needed, or the letter could not be
        // confirmed): nothing to hand over.
        this.saving.set(false);
        this.walkForm.markAsPristine();
        this.closeDialog();
        this.successMessage.set(res.message);
        this.load();
      },
      error: (err) => this.failSave(err),
    });
  }

  // ---- arrival ----

  arrive(r: GuestRegistration, after?: () => void): void {
    this.clearMessages();
    this.workingId.set(r.id);
    this.service.arrive(r.id).subscribe({
      next: (res) => {
        this.workingId.set(null);
        this.successMessage.set(res.message);
        this.returnScroll.remember(MembershipRegistrationCounterComponent.LIST_PATH, r.id);
        if (after) after();
        this.load();
      },
      error: (err) => {
        this.workingId.set(null);
        this.errorMessage.set(err.error?.message || 'The arrival could not be recorded.');
      },
    });
  }

  // ---- the pass ----

  openPass(r: GuestRegistration): void {
    this.clearMessages();
    this.passTarget.set(r);
    this.passFacts.set(null);
    this.passError.set('');
    this.copied.set(false);
    this.openDialog('pass', 'center');
    this.service.pass(r.id).subscribe({
      next: (res) => {
        this.passTarget.set(res.registration);
        this.passFacts.set(res.pass);
      },
      error: (err) => this.passError.set(err.error?.message || 'The pass could not be loaded.'),
    });
  }

  emailPass(): void {
    const target = this.passTarget();
    if (!target) return;
    this.working.set(true);
    this.service.sendPass(target.id, 'email').subscribe({
      next: (res) => {
        this.working.set(false);
        this.passTarget.set(res.registration);
        this.successMessage.set(res.message);
        this.load();
      },
      error: (err) => {
        this.working.set(false);
        this.errorMessage.set(err.error?.message || 'The pass could not be emailed.');
      },
    });
  }

  // The WhatsApp link itself opens in a new tab (a plain anchor); this only
  // records that the desk shared the pass that way.
  recordWhatsapp(): void {
    const target = this.passTarget();
    if (!target) return;
    this.service.sendPass(target.id, 'whatsapp').subscribe({
      next: (res) => {
        this.passTarget.set(res.registration);
        this.load();
      },
      error: () => {},
    });
  }

  copyLink(): void {
    const facts = this.passFacts();
    if (!facts || !navigator.clipboard) return;
    navigator.clipboard.writeText(facts.passUrl).then(() => this.copied.set(true), () => this.errorMessage.set('The link could not be copied - select and copy it instead.'));
  }

  // ---- cancel (reason required) ----

  openCancel(r: GuestRegistration): void {
    this.clearMessages();
    this.cancelTarget.set(r);
    this.cancelReason.set('');
    this.openDialog('cancel', 'center');
  }

  // What cancelling this registration does, by who it is for.
  cancelConsequence(r: GuestRegistration): string {
    if (this.isVisitor(r)) return 'The pass stops working, the day no longer counts as a visit, and the passes of the guests they brought that day are cancelled with it.';
    if (r.accompanying) return 'The pass stops working.';
    return `The pass stops working and the visit no longer counts against ${r.host?.name || 'the host'}'s guest allowance.`;
  }

  runCancel(): void {
    const target = this.cancelTarget();
    if (!target) return;
    const reason = this.cancelReason().trim();
    if (!reason) {
      this.errorMessage.set('Give the reason for cancelling the registration.');
      return;
    }
    this.working.set(true);
    this.service.cancel(target.id, reason).subscribe({
      next: (res) => {
        this.working.set(false);
        this.closeDialog();
        this.successMessage.set(res.message);
        this.returnScroll.remember(MembershipRegistrationCounterComponent.LIST_PATH, target.id);
        this.load();
      },
      error: (err) => {
        this.working.set(false);
        this.errorMessage.set(err.error?.message || 'The registration could not be cancelled.');
      },
    });
  }

  // ---- scan a pass ----

  openScan(): void {
    this.clearMessages();
    this.scanCode.set('');
    this.scanResult.set(null);
    this.scanError.set('');
    this.openDialog('scan', 'center');
  }

  onScanned(code: string): void {
    const value = code.trim();
    if (!value || this.working()) return;
    this.scanError.set('');
    this.working.set(true);
    this.service.scan(value).subscribe({
      next: (res) => {
        this.working.set(false);
        this.scanResult.set(res.registration);
      },
      error: (err) => {
        this.working.set(false);
        this.scanError.set(err.error?.message || 'That pass could not be read.');
      },
    });
  }

  scanAgain(): void {
    this.scanResult.set(null);
    this.scanError.set('');
    this.scanCode.set('');
  }

  // A scanned pass that is good today: still to be marked arrived, or already in.
  scanGood(r: GuestRegistration): boolean {
    return r.status !== 'cancelled' && r.passState === 'valid';
  }

  // What the desk reads off a scanned pass before letting the person in.
  scanVerdict(r: GuestRegistration): string {
    if (r.status === 'cancelled') return 'This registration was cancelled - the pass is not valid.';
    if (r.passState === 'upcoming') return `The pass is for ${formatLocalDate(r.visitDate, 'weekday')} - it is not valid today.`;
    if (r.passState === 'expired') return `The pass was for ${formatLocalDate(r.visitDate, 'weekday')} and has expired.`;
    if (r.status === 'arrived') return `Valid today - arrived at ${formatLocalDate(r.arrivedAt, 'datetime')}.`;
    return 'Valid today.';
  }

  arriveScanned(): void {
    const r = this.scanResult();
    if (!r) return;
    this.arrive(r, () => this.closeDialog());
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
