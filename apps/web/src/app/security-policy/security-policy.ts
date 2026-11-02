import { Component, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { ConfirmDialogComponent, ConfirmRequest } from '../shared/confirm-dialog/confirm-dialog';
import { DialogComponent } from '../shared/dialog/dialog';
import { UnsavedChangesAware } from '../shared/unsaved-changes.guard';
import { FieldInfoComponent } from '../shared/field-info/field-info';
import { CanDirective } from '../shared/can.directive';
import { LocalDatePipe, formatLocalDate, localDateOnly } from '../shared/local-date.pipe';
import { SecurityPolicyService } from '../services/security-policy.service';
import { RegisteredWorkstation, SecurityPolicyState } from '../models/auth.models';

// System Setup -> Security Policy (approved 2026-10-30). The subscriber's
// account-wide security settings: whether two-factor authentication is
// required for EVERY user of the subscription, optionally from a date so staff
// can be told first (administrator roles are forced regardless - this extends
// the same login gate to everyone else), and the trusted-device rule
// (2026-11-01): whether "Don't ask again on this device" is offered and for
// how many days a device stays trusted.
//
// Registered workstations (approved 2026-11-01): a second card. A shared
// front-desk browser is nobody's device, so "don't ask again" is the wrong
// tool there; instead an administrator registers the station for the
// ORGANISATION, and staff signing in from it give their password only
// (administrators still confirm a code; enrolment is never skipped, so a
// clerk sent home still has an authenticator). The switch is part of the
// policy form; registering and revoking stations are immediate actions.
//
// Show-expected-results: the card states how many users have not enrolled
// and exactly what will happen to them, before Save.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-security-policy',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ScreenTitlePipe, ScreenSubtitlePipe, FavStarComponent, ConfirmDialogComponent, DialogComponent, FieldInfoComponent, CanDirective, LocalDatePipe],
  templateUrl: './security-policy.html',
  styleUrl: './security-policy.css',
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class SecurityPolicyComponent implements OnInit, UnsavedChangesAware {
  private readonly service = inject(SecurityPolicyService);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');
  readonly state = signal<SecurityPolicyState | null>(null);
  readonly collapsedSections = signal<Record<string, boolean>>({});

  readonly today = localDateOnly();

  readonly form = this.fb.nonNullable.group({
    mfaRequired: [false],
    mfaRequiredFrom: [''],
    trustedDevicesAllowed: [true],
    trustedDeviceDays: [30],
    workstationTrustEnabled: [false],
    remoteAccessGrantMaxDays: [30],
  });
  static readonly GRANT_DAYS = { min: 1, max: 90 };
  static readonly TRUST_DAYS = { min: 1, max: 90 };
  readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  // The long explanation behind the (i); the inline hint stays one line.
  readonly hint = {
    required: 'When on, every user of your subscription must set up an authenticator app: anyone without it is taken to the setup screen at their next sign-in (password or single sign-on alike, and when they switch into one of your companies) and cannot turn it off afterwards. Administrator roles are always required, whatever this switch says. Give a start date to announce the change first; leave it blank to start now.',
    trusted: 'When on, a user who enters their two-factor code may tick "Don\'t ask again on this device"; that browser then skips the code for the number of days set here, while the password is still required at every sign-in. Turning it off hides the option and every device already trusted is asked for a code again at its next sign-in. Shortening the days also applies to devices already trusted: any device trusted longer ago than the new window is asked again. Users see and remove their own trusted devices under Profile, Security.',
    grants: 'A person whose role signs in only from registered workstations may ask, from the sign-in screen, to sign in from somewhere else; whoever holds the Access Requests screen approves it for a number of days, declines, or grants access in advance. This number is the longest window an approver may give. A grant lifts only the workstation rule: the password and the two-factor code still apply. Shortening it does not cut grants already in force.',
    workstations: 'A registered workstation is a shared browser, such as a front-desk computer, that an administrator registered for your organisation from that very browser. When this switch is on, staff who sign in from a registered workstation give their password only; the two-factor code is skipped because the workstation itself, standing on your premises, is the second factor. Administrators (the Tenant Admin role and the platform\'s system administrators) still confirm a code everywhere, and nobody is excused from setting up an authenticator: a staff member who signs in from home or a phone is asked for the code as usual. A registered workstation never offers "Don\'t ask again on this device". Registrations last one year, can be revoked here at any time, and are kept while the switch is off. A role can also be locked to registered workstations under Role Management, so its holders cannot sign in from anywhere else; that lock works whether or not this switch is on.',
  };

  // What Save will do, stated before it is pressed.
  readonly expected = computed(() => {
    const s = this.state();
    const v = this.formValue();
    if (!s) return '';
    if (!v.mfaRequired) {
      return `${s.enrolled} of ${s.users} users have two-factor authentication on. With the policy off they keep it as a personal choice; administrators are required regardless.`;
    }
    const starts = v.mfaRequiredFrom && v.mfaRequiredFrom > this.today ? ` from ${formatLocalDate(v.mfaRequiredFrom)}` : '';
    if (s.notEnrolled === 0) {
      return `All ${s.users} users already have two-factor authentication on - nobody will be interrupted${starts ? ', and the policy takes effect' + starts : ''}.`;
    }
    return `${s.notEnrolled} of ${s.users} users have not set up two-factor authentication. Each will be asked to set it up at their next sign-in${starts}, and none can turn it off while the policy is on.`;
  });

  // The trusted-device window as typed; NaN when blank or not a whole number.
  private trustDays(): number {
    const raw = this.formValue().trustedDeviceDays;
    const n = Number(raw);
    return Number.isInteger(n) ? n : NaN;
  }

  trustDaysInvalid(): boolean {
    if (!this.formValue().trustedDevicesAllowed) return false;
    const n = this.trustDays();
    return !(n >= SecurityPolicyComponent.TRUST_DAYS.min && n <= SecurityPolicyComponent.TRUST_DAYS.max);
  }

  // Who the code-related settings reach while two-factor is optional: only the
  // users who sign in with a code (administrators always do). Stated in front
  // of the trusted-device and workstation notes so neither reads as if it
  // covered staff who never set up an authenticator.
  private optionalScope(): string {
    const s = this.state();
    if (!s || this.formValue().mfaRequired) return '';
    const n = s.enrolled;
    if (!n) return 'Two-factor is optional and nobody signs in with a code yet, so this takes effect as users set it up (administrators always must).';
    return `Two-factor is optional, so this covers only the ${n} ${n === 1 ? 'user' : 'users'} who ${n === 1 ? 'signs' : 'sign'} in with a code (administrators always do).`;
  }

  // What Save will do to trusted devices, stated before it is pressed.
  readonly expectedTrust = computed(() => {
    const outcome = this.trustOutcome();
    if (!outcome || this.trustDaysInvalid()) return outcome;
    const scope = this.optionalScope();
    return scope ? `${scope} ${outcome}` : outcome;
  });

  private trustOutcome(): string {
    const s = this.state();
    const v = this.formValue();
    if (!s) return '';
    const n = s.trustedDevices;
    const devices = `${n} trusted ${n === 1 ? 'device' : 'devices'}`;
    const skipVerb = n === 1 ? 'skips' : 'skip';
    if (!v.trustedDevicesAllowed) {
      if (!s.trustedDevicesAllowed) return 'Trusted devices are off: every sign-in asks for a code.';
      return n
        ? `Users will no longer be offered "Don't ask again on this device", and the ${devices} currently skipping the code will be asked for one at their next sign-in.`
        : 'Users will no longer be offered "Don\'t ask again on this device". No device skips the code today.';
    }
    const days = Number(v.trustedDeviceDays);
    if (!Number.isInteger(days) || days < SecurityPolicyComponent.TRUST_DAYS.min || days > SecurityPolicyComponent.TRUST_DAYS.max) {
      return `Enter a whole number of days from ${SecurityPolicyComponent.TRUST_DAYS.min} to ${SecurityPolicyComponent.TRUST_DAYS.max}.`;
    }
    const dayWord = days === 1 ? 'day' : 'days';
    if (!s.trustedDevicesAllowed) return `Users who enter their code may skip it on that browser for ${days} ${dayWord}; the password is still required every time.`;
    if (days < s.trustedDeviceDays) {
      return `${devices} currently ${skipVerb} the code. Any device trusted more than ${days} ${dayWord} ago will be asked for a code at its next sign-in; devices trusted from now on skip it for ${days} ${dayWord}.`;
    }
    if (days > s.trustedDeviceDays) {
      return `${devices} currently ${skipVerb} the code and keep their ${s.trustedDeviceDays}-day window; devices trusted from now on skip it for ${days} ${dayWord}.`;
    }
    return `${devices} currently ${skipVerb} the code, each for ${days} ${dayWord} after being trusted.`;
  }

  // ---- Registered workstations ----
  readonly workstations = signal<RegisteredWorkstation[]>([]);
  readonly workstationsBusy = signal(false);
  readonly confirmAction = signal<ConfirmRequest | null>(null);
  readonly registerOpen = signal(false);
  readonly registering = signal(false);
  readonly registerForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
  });

  // What Save will do to registered workstations, stated before it is pressed.
  readonly expectedWorkstations = computed(() => {
    const outcome = this.workstationOutcome();
    if (!outcome || this.formValue().mfaRequired) return outcome;
    return `${outcome} Staff without two-factor are not affected, since there is no code to skip; roles locked to workstations and remote access apply regardless.`;
  });

  private workstationOutcome(): string {
    const s = this.state();
    const v = this.formValue();
    if (!s) return '';
    const n = this.workstations().length;
    const stations = `${n} registered ${n === 1 ? 'workstation' : 'workstations'}`;
    if (!v.workstationTrustEnabled) {
      if (!s.workstationTrustEnabled) {
        return n
          ? `Registered workstations are off: staff are asked for a code wherever they sign in. The ${stations} below ${n === 1 ? 'is' : 'are'} kept and ${n === 1 ? 'starts' : 'start'} skipping the code when you switch this on.`
          : 'Registered workstations are off: staff are asked for a code wherever they sign in.';
      }
      return n
        ? `Staff signing in from the ${stations} will be asked for a code again at their next sign-in; the ${n === 1 ? 'registration is' : 'registrations are'} kept.`
        : 'Registered workstations will be off. None is registered today.';
    }
    if (!n) return 'No workstation is registered yet. Use "Register this workstation" below from the browser you want to register; staff who sign in from it then give their password only.';
    return `Staff signing in from the ${stations} give their password only; everyone still confirms a code from any other device, and administrators confirm one everywhere.`;
  }

  // The remote-access ceiling as typed; NaN when blank or not a whole number.
  private grantDays(): number {
    const n = Number(this.formValue().remoteAccessGrantMaxDays);
    return Number.isInteger(n) ? n : NaN;
  }

  grantDaysInvalid(): boolean {
    const n = this.grantDays();
    return !(n >= SecurityPolicyComponent.GRANT_DAYS.min && n <= SecurityPolicyComponent.GRANT_DAYS.max);
  }

  // What Save will do to remote-access grants, stated before it is pressed.
  readonly expectedGrants = computed(() => {
    const s = this.state();
    if (!s) return '';
    const n = this.grantDays();
    if (!(n >= SecurityPolicyComponent.GRANT_DAYS.min && n <= SecurityPolicyComponent.GRANT_DAYS.max)) {
      return `Enter a whole number of days from ${SecurityPolicyComponent.GRANT_DAYS.min} to ${SecurityPolicyComponent.GRANT_DAYS.max}.`;
    }
    const grants = `${s.activeGrants} ${s.activeGrants === 1 ? 'grant is' : 'grants are'} in force`;
    const waiting = s.pendingRequests ? `, ${s.pendingRequests} ${s.pendingRequests === 1 ? 'request waits' : 'requests wait'} for a decision` : '';
    const ceiling = `an approver may give at most ${n} ${n === 1 ? 'day' : 'days'}`;
    if (n < s.remoteAccessGrantMaxDays && s.activeGrants) {
      return `${grants}${waiting}; they keep their windows. From now on ${ceiling}.`;
    }
    return `${grants}${waiting}; ${ceiling}.`;
  });

  // Roles locked to registered workstations (Role Management), stated beside
  // the station list so an administrator revoking the last station knows who
  // it shuts out.
  readonly lockedRolesNote = computed(() => {
    const s = this.state();
    if (!s || !s.lockedRoles) return '';
    const n = s.lockedRoles;
    return `${n} ${n === 1 ? 'role signs' : 'roles sign'} in only from a registered workstation. Revoking every station would shut ${n === 1 ? 'that role' : 'those roles'} out until a station is registered again.`;
  });

  loadWorkstations(): void {
    this.service.listWorkstations().subscribe({
      next: (res) => this.workstations.set(res.workstations || []),
      error: (err) => this.errorMessage.set(err?.error?.message || 'Failed to load the registered workstations.'),
    });
  }

  stationIcon(w: RegisteredWorkstation): string {
    if (/iPhone|Android/.test(w.device)) return 'smartphone';
    if (/iPad/.test(w.device)) return 'tablet_mac';
    return 'desktop_windows';
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && (control.touched || control.dirty);
  }

  openRegister(): void {
    this.registerForm.reset({ name: '' });
    this.registerOpen.set(true);
  }

  closeRegister(): void {
    this.registerOpen.set(false);
  }

  register(): void {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }
    this.successMessage.set('');
    this.errorMessage.set('');
    this.registering.set(true);
    this.service.registerWorkstation(this.registerForm.getRawValue().name.trim()).subscribe({
      next: (res) => {
        this.registering.set(false);
        this.registerOpen.set(false);
        this.workstations.set(res.workstations || []);
        this.successMessage.set(res.message || 'This browser is now a registered workstation.');
      },
      error: (err) => {
        this.registering.set(false);
        this.errorMessage.set(err?.error?.message || 'Failed to register this workstation.');
      },
    });
  }

  askRevoke(w: RegisteredWorkstation): void {
    this.confirmAction.set({
      title: 'Revoke this workstation?',
      message: `Revoke "${w.name}"? Staff signing in from it are asked for a two-factor code again at their next sign-in.${w.current ? ' This is the browser you are using now.' : ''}`,
      confirmLabel: 'Revoke',
      run: () => this.performRevoke(w.id),
    });
  }

  private performRevoke(id: string): void {
    this.confirmAction.set(null);
    this.successMessage.set('');
    this.errorMessage.set('');
    this.workstationsBusy.set(true);
    this.service.revokeWorkstation(id).subscribe({
      next: (res) => {
        this.workstationsBusy.set(false);
        this.workstations.set(res.workstations || []);
        this.successMessage.set(res.message || 'Workstation revoked.');
      },
      error: (err) => {
        this.workstationsBusy.set(false);
        this.errorMessage.set(err?.error?.message || 'Failed to revoke the workstation.');
        this.loadWorkstations();
      },
    });
  }

  // ---- Route-leave guard (unsavedChangesGuard on the route) ----
  readonly leaveConfirm = signal<ConfirmRequest | null>(null);
  private leaveResolve: ((leave: boolean) => void) | null = null;

  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.saving();
  }

  confirmLeave(): Promise<boolean> {
    return new Promise((resolve) => {
      this.leaveResolve = resolve;
      this.leaveConfirm.set({
        title: 'Discard unsaved changes?',
        message: 'Your security policy changes have not been saved and will be lost if you leave this screen.',
        confirmLabel: 'Discard changes',
        cancelLabel: 'Keep editing',
        run: () => this.resolveLeave(true),
      });
    });
  }

  cancelLeave(): void {
    this.resolveLeave(false);
  }

  private resolveLeave(leave: boolean): void {
    this.leaveConfirm.set(null);
    this.leaveResolve?.(leave);
    this.leaveResolve = null;
  }

  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  toggleSection(id: string): void {
    this.collapsedSections.update((c) => ({ ...c, [id]: !c[id] }));
  }

  isExpanded(id: string): boolean {
    return !this.collapsedSections()[id];
  }

  ngOnInit(): void {
    this.load();
    this.loadWorkstations();
  }

  load(): void {
    this.loading.set(true);
    this.service.get().subscribe({
      next: (s) => {
        this.applyState(s);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err?.error?.message || 'Failed to load the security policy.');
      },
    });
  }

  // The save bar's "Discard changes": re-load resets everything pristine.
  discard(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
    this.load();
  }

  save(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
    const v = this.form.getRawValue();
    if (this.trustDaysInvalid()) {
      this.errorMessage.set(`Days a device stays trusted must be a whole number from ${SecurityPolicyComponent.TRUST_DAYS.min} to ${SecurityPolicyComponent.TRUST_DAYS.max}.`);
      return;
    }
    if (this.grantDaysInvalid()) {
      this.errorMessage.set(`The longest remote-access grant must be a whole number of days from ${SecurityPolicyComponent.GRANT_DAYS.min} to ${SecurityPolicyComponent.GRANT_DAYS.max}.`);
      return;
    }
    this.saving.set(true);
    this.service.update({
      mfaPolicy: v.mfaRequired ? 'required' : 'optional',
      mfaRequiredFrom: v.mfaRequired && v.mfaRequiredFrom ? v.mfaRequiredFrom : null,
      trustedDevicesAllowed: v.trustedDevicesAllowed,
      // The window is kept while the switch is off, so turning it back on
      // restores the chosen days; a blank field while off falls back to stored.
      trustedDeviceDays: v.trustedDevicesAllowed ? Number(v.trustedDeviceDays) : (this.state()?.trustedDeviceDays ?? 30),
      workstationTrustEnabled: v.workstationTrustEnabled,
      remoteAccessGrantMaxDays: Number(v.remoteAccessGrantMaxDays),
    }).subscribe({
      next: (s) => {
        this.applyState(s);
        this.successMessage.set(s.message || 'Security policy updated.');
        this.saving.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err?.error?.message || 'Failed to update the security policy.');
        this.saving.set(false);
      },
    });
  }

  private applyState(s: SecurityPolicyState): void {
    this.state.set(s);
    this.form.reset({
      mfaRequired: s.mfaPolicy === 'required',
      mfaRequiredFrom: s.mfaRequiredFrom || '',
      trustedDevicesAllowed: s.trustedDevicesAllowed,
      trustedDeviceDays: s.trustedDeviceDays,
      workstationTrustEnabled: s.workstationTrustEnabled === true,
      remoteAccessGrantMaxDays: s.remoteAccessGrantMaxDays ?? 30,
    });
  }
}
