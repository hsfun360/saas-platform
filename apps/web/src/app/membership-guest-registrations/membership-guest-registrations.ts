import { Component, Injector, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { CanDirective } from '../shared/can.directive';
import { DialogComponent } from '../shared/dialog/dialog';
import { PhoneInputComponent } from '../shared/phone-input/phone-input';
import { OverflowMenuComponent } from '../shared/overflow-menu/overflow-menu';
import { MenuItemDirective } from '../shared/overflow-menu/menu-item.directive';
import { QrScannerComponent } from '../shared/qr-scanner/qr-scanner';
import { LocalDatePipe, formatLocalDate, localDateOnly } from '../shared/local-date.pipe';
import { onDebounced } from '../shared/debounce';
import { ScrollReturnService } from '../services/scroll-return.service';
import { MembershipStatusOption } from '../models/auth.models';
import {
  MembershipGuestService, GuestRegistration, GuestHostFacts, GuestMatch, GuestPassFacts, GuestRegistrationPayload,
} from '../services/membership-guest.service';

// The guest needs a way to receive the pass: a mobile or an email.
function contactRequired(group: AbstractControl): ValidationErrors | null {
  const mobile = String(group.get('mobile')?.value || '').trim();
  const email = String(group.get('email')?.value || '').trim();
  return mobile || email ? null : { contact: true };
}

// Membership Management -> Guest Registration (/membership/guest-registrations;
// structure approved 2026-11-10). The front desk registers a member's guest
// for a date: the host is checked (status Action control, the month's guest
// allowance), the guest is recognised when they have come before, and the
// guest receives a digital DAY PASS - emailed, or shared from the desk's own
// WhatsApp - that is valid on the visit date only. On the day the desk marks
// the arrival from the row, or by scanning the pass.
// Single-dialog standard: ONE <app-dialog> instance with a mode signal and
// @switch views (form / pass / scan / cancel). Registering a guest moves the
// SAME dialog from the form to the pass view - two instances swapped in one
// tick would have the closing one pop the opening one's Back-trap entry and
// dismiss it at once (see memberships.spec.ts).
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-membership-guest-registrations',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ScreenTitlePipe, ScreenSubtitlePipe, FavStarComponent, CanDirective, DialogComponent,
    PhoneInputComponent, OverflowMenuComponent, MenuItemDirective, QrScannerComponent, LocalDatePipe],
  templateUrl: './membership-guest-registrations.html',
  styleUrls: ['./membership-guest-registrations.css'],
})
export class MembershipGuestRegistrationsComponent implements OnInit {
  private readonly service = inject(MembershipGuestService);
  private readonly fb = inject(FormBuilder);
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private static readonly LIST_PATH = '/membership/guest-registrations';

  readonly loading = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly registrations = signal<GuestRegistration[]>([]);
  readonly statuses = signal<MembershipStatusOption[]>([]);
  // The club's own date - "today" for the pass, whatever the device says.
  readonly today = signal(localDateOnly());
  readonly numberingMode = signal<'auto' | 'manual' | null>('auto');

  // Server-side filters: visit-date range (a week back, a month ahead) +
  // status; client-side search.
  readonly dateFrom = signal(localDateOnly(new Date(Date.now() - 7 * 86400000)));
  readonly dateTo = signal(localDateOnly(new Date(Date.now() + 30 * 86400000)));
  readonly status = signal('');
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
      || (r.host?.name || '').toLowerCase().includes(q)
      || (r.host?.memberNo || '').toLowerCase().includes(q));
  });
  readonly expectedToday = computed(() => this.registrations().filter((r) => r.status === 'registered' && r.passState === 'valid').length);
  readonly arrivedToday = computed(() => this.registrations().filter((r) => r.status === 'arrived' && r.passState === 'valid').length);

  // ---- the ONE dialog: which view it shows, and how it is presented ----
  readonly dialogMode = signal<'form' | 'pass' | 'scan' | 'cancel' | null>(null);
  // Fixed when the dialog opens: the form is a drawer (and stays one when it
  // moves on to the pass), the standalone pass / scan / cancel are centred.
  readonly dialogVariant = signal<'drawer' | 'center'>('drawer');
  readonly saving = signal(false);
  readonly editTarget = signal<GuestRegistration | null>(null);
  readonly dialogTitle = computed(() => {
    switch (this.dialogMode()) {
      case 'pass': return 'Guest pass';
      case 'scan': return 'Scan guest pass';
      case 'cancel': return 'Cancel guest registration';
      default: return this.editTarget() ? 'Edit guest details' : 'New guest registration';
    }
  });

  readonly form = this.fb.nonNullable.group({
    memberNo: ['', [Validators.required, Validators.maxLength(50)]],
    visitDate: ['', [Validators.required]],
    registrationNo: ['', [Validators.maxLength(50)]],
    guest: this.fb.nonNullable.group({
      name: ['', [Validators.required, Validators.maxLength(255)]],
      mobile: [''],
      email: ['', [Validators.email, Validators.maxLength(255)]],
      identityNo: ['', [Validators.maxLength(50)]],
    }, { validators: contactRequired }),
    remarks: ['', [Validators.maxLength(255)]],
    sendEmail: [true],
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
    this.service.list({ dateFrom: this.dateFrom(), dateTo: this.dateTo(), status: this.status() }).subscribe({
      next: (res) => {
        this.registrations.set(res.registrations);
        this.statuses.set(res.statuses);
        this.today.set(res.today);
        this.numberingMode.set(res.numberingMode);
        this.loading.set(false);
        this.returnScroll.consume(MembershipGuestRegistrationsComponent.LIST_PATH, this.injector);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load guest registrations.');
      },
    });
  }

  setDateFrom(v: string): void { if (v) { this.dateFrom.set(v); this.load(); } }
  setDateTo(v: string): void { if (v) { this.dateTo.set(v); this.load(); } }
  setStatus(v: string): void { this.status.set(v); this.load(); }
  clearSearch(): void { this.search.set(''); }

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

  contactLine(r: GuestRegistration): string {
    return [r.guest?.mobile, r.guest?.email].filter(Boolean).join(' · ');
  }

  viaLabel(via: string | null): string {
    return via === 'whatsapp' ? 'WhatsApp' : 'email';
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

  // ---- record ----

  openAdd(): void {
    this.clearMessages();
    this.editTarget.set(null);
    this.form.controls.memberNo.enable();
    this.form.controls.visitDate.enable();
    this.form.reset({
      memberNo: '', visitDate: this.today(), registrationNo: '',
      guest: { name: '', mobile: '', email: '', identityNo: '' }, remarks: '', sendEmail: true,
    });
    this.resetDrawerState();
    this.form.controls.sendEmail.enable();
    this.syncSendEmail();
    this.openDialog('form', 'drawer');
  }

  openEdit(r: GuestRegistration): void {
    this.clearMessages();
    this.editTarget.set(r);
    this.form.reset({
      memberNo: r.host?.memberNo || '', visitDate: r.visitDate, registrationNo: r.registrationNo,
      guest: { name: r.guest?.name || '', mobile: r.guest?.mobile || '', email: r.guest?.email || '', identityNo: r.guest?.identityNo || '' },
      remarks: r.remarks || '', sendEmail: false,
    });
    // The host and the date ARE the registration: display-only on edit.
    this.form.controls.memberNo.disable();
    this.form.controls.visitDate.disable();
    this.resetDrawerState();
    this.openDialog('form', 'drawer');
  }

  private openDialog(mode: 'form' | 'pass' | 'scan' | 'cancel', variant: 'drawer' | 'center'): void {
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
    const guest = {
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
    const payload: GuestRegistrationPayload = {
      memberNo: v.memberNo.trim(),
      visitDate: v.visitDate,
      guest,
      remarks: v.remarks.trim() || null,
      sendEmail: v.sendEmail && !!guest.email,
    };
    if (this.numberingMode() === 'manual' && v.registrationNo.trim()) payload.registrationNo = v.registrationNo.trim();
    const picked = this.pickedGuest();
    if (picked) payload.guestId = picked.id;
    this.service.create(payload).subscribe({
      next: (res) => {
        this.finishSave(res.message, res.registration.id);
        // Hand the pass over at once: the same dialog moves on to the pass.
        this.passTarget.set(res.registration);
        this.passFacts.set(res.pass);
        this.passError.set('');
        this.copied.set(false);
        this.dialogMode.set('pass');
      },
      error: (err) => this.failSave(err),
    });
  }

  private finishSave(message: string, id: string): void {
    this.successMessage.set(message);
    this.saving.set(false);
    this.form.markAsPristine();
    this.returnScroll.remember(MembershipGuestRegistrationsComponent.LIST_PATH, id);
    this.load();
  }

  private failSave(err: { error?: { message?: string } }): void {
    this.errorMessage.set(err.error?.message || 'Failed to save the guest registration.');
    this.saving.set(false);
  }

  // ---- arrival ----

  arrive(r: GuestRegistration, after?: () => void): void {
    this.clearMessages();
    this.workingId.set(r.id);
    this.service.arrive(r.id).subscribe({
      next: (res) => {
        this.workingId.set(null);
        this.successMessage.set(res.message);
        this.returnScroll.remember(MembershipGuestRegistrationsComponent.LIST_PATH, r.id);
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
        this.returnScroll.remember(MembershipGuestRegistrationsComponent.LIST_PATH, target.id);
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

  // What the desk reads off a scanned pass before letting the guest in.
  scanVerdict(r: GuestRegistration): string {
    if (r.status === 'cancelled') return 'This registration was cancelled - the pass is not valid.';
    if (r.status === 'arrived') return `Already marked arrived at ${formatLocalDate(r.arrivedAt, 'datetime')}.`;
    if (r.passState === 'upcoming') return `The pass is for ${formatLocalDate(r.visitDate, 'weekday')} - it is not valid today.`;
    if (r.passState === 'expired') return `The pass was for ${formatLocalDate(r.visitDate, 'weekday')} and has expired.`;
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
