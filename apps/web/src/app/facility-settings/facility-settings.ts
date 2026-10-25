import { Component, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { CanDirective } from '../shared/can.directive';
import { FieldInfoComponent } from '../shared/field-info/field-info';
import { ConfirmDialogComponent, ConfirmRequest } from '../shared/confirm-dialog/confirm-dialog';
import { UnsavedChangesAware } from '../shared/unsaved-changes.guard';
import { FacilitySettingService, FacilitySessionBand } from '../services/facility-setting.service';

// A Facility Session row inside the one specification form (house standard:
// FormArray rows are typed groups; form.dirty alone drives Save).
type SessionGroup = FormGroup<{ name: FormControl<string>; startTime: FormControl<string>; endTime: FormControl<string> }>;

const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || dflt)));

// Facility Management → Facility Specification (/facility/settings; structure
// approved 2026-10-25) - the per-company facility settings singleton (pattern
// of Golf Specification): the booking window, the guest-control master switch
// with its general allow flags, the cancellation / no-show master switch and
// the club's Session bands (the peak / off-peak axis of the slice-2 rate card).
// Section-card standard, settings chrome (switches, field-info, sticky save
// bar, route-leave guard), one Save (PUT upserts the singleton and replaces
// the sessions atomically).
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-facility-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ScreenTitlePipe, ScreenSubtitlePipe, FavStarComponent, CanDirective, FieldInfoComponent, ConfirmDialogComponent],
  templateUrl: './facility-settings.html',
  styleUrls: ['./facility-settings.css'],
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class FacilitySettingsComponent implements OnInit, UnsavedChangesAware {
  private readonly service = inject(FacilitySettingService);
  private readonly fb = inject(FormBuilder);

  // Route-leave guard (unsavedChangesGuard on the route).
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
        message: 'Your facility specification changes have not been saved and will be lost if you leave this screen.',
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

  // Long behavioural explanations live in <app-field-info> popovers.
  readonly hint = {
    window: 'The general rule for every facility type. A type can shorten or lengthen its own window under Facility Types; the early-opening hours always apply club-wide.',
    sameDay: 'When off, bookings start from tomorrow up to the advance window - today\'s slots are taken by registering at the Control Station.',
    lock: 'A selected slot is held this long while the booking is keyed - a countdown shows on the booking screen.',
    guests: 'When off, nothing restricts guests anywhere. When on, these general flags apply to every facility type, each type may tighten them (no guests at the Gym, two guests per badminton booking), and guests count against the member\'s monthly guest allowance from Membership Type.',
    noShow: 'When off, a booking is cancelled at any time without penalty. When on, a cancellation inside the notice window is a late cancellation, and the Control Station\'s no-show review raises the no-show charge and strike set per facility type (the charge and strike rules arrive with the No show slice).',
    sessions: 'The club\'s day parts - e.g. Morning, Afternoon, Evening or Peak. Each facility fee can carry a different price per session (peak / off-peak), and a booking limit can be counted per session. A slot outside every session is unrestricted.',
  };

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  // Collapsible section state (section-card standard; sections start open).
  readonly expanded = signal<Record<string, boolean>>({ booking: true, sessions: true, guests: true, noshow: true });

  readonly form = this.fb.nonNullable.group({
    advanceBookingDays: [7, [Validators.required, Validators.min(0), Validators.max(365)]],
    advanceBookingHours: [0, [Validators.required, Validators.min(0), Validators.max(23)]],
    allowSameDayBooking: [false],
    bookingLockMinutes: [5, [Validators.required, Validators.min(1), Validators.max(60)]],
    guestControlEnabled: [false],
    allowGuestWeekday: [true],
    allowMemberGuestWeekday: [true],
    allowGuestWeekend: [true],
    allowMemberGuestWeekend: [true],
    noShowControlEnabled: [false],
    cancellationNoticeHours: [24, [Validators.required, Validators.min(0), Validators.max(720)]],
    sessions: this.fb.array<SessionGroup>([]),
  });

  get sessions(): FormArray<SessionGroup> {
    return this.form.controls.sessions;
  }

  readonly sessionCount = computed(() => this.sessionsLength());
  // The FormArray length is not a signal; a plain signal mirrors it for the
  // header count so OnPush re-renders on add/remove.
  private readonly sessionsLength = signal(0);

  ngOnInit(): void {
    this.load();
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  toggleSection(key: string): void {
    this.expanded.update((e) => ({ ...e, [key]: !e[key] }));
  }

  isExpanded(key: string): boolean {
    return this.expanded()[key] !== false;
  }

  guestControlOn(): boolean {
    return this.form.controls.guestControlEnabled.value === true;
  }

  noShowControlOn(): boolean {
    return this.form.controls.noShowControlEnabled.value === true;
  }

  // Live preview of the window rule with the current numbers (hidden while a
  // number is out of range - the field errors speak then).
  windowPreview(): string {
    if (this.form.controls.advanceBookingDays.invalid || this.form.controls.advanceBookingHours.invalid) return '';
    const days = Number(this.form.controls.advanceBookingDays.value) || 0;
    const hours = Number(this.form.controls.advanceBookingHours.value) || 0;
    if (hours === 0) return `Bookings for a date open ${days} day(s) before, at 12:00 midnight.`;
    const h = 24 - hours;
    const label = `${h > 12 ? h - 12 : h}:00 ${h >= 12 ? 'pm' : 'am'}`;
    return `Bookings for a date open ${days} day(s) before - and already the previous evening from ${label} (${hours} hour(s) before midnight).`;
  }

  load(): void {
    this.loading.set(true);
    this.service.get().subscribe({
      next: (doc) => {
        this.form.reset({
          advanceBookingDays: doc.advanceBookingDays,
          advanceBookingHours: doc.advanceBookingHours,
          allowSameDayBooking: doc.allowSameDayBooking === true,
          bookingLockMinutes: doc.bookingLockMinutes,
          guestControlEnabled: doc.guestControlEnabled === true,
          allowGuestWeekday: doc.allowGuestWeekday !== false,
          allowMemberGuestWeekday: doc.allowMemberGuestWeekday !== false,
          allowGuestWeekend: doc.allowGuestWeekend !== false,
          allowMemberGuestWeekend: doc.allowMemberGuestWeekend !== false,
          noShowControlEnabled: doc.noShowControlEnabled === true,
          cancellationNoticeHours: doc.cancellationNoticeHours ?? 24,
        });
        this.sessions.clear();
        for (const s of doc.sessions || []) this.sessions.push(this.newSession(s));
        this.sessionsLength.set(this.sessions.length);
        this.form.markAsPristine();
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load the facility specification.');
      },
    });
  }

  private newSession(s: FacilitySessionBand): SessionGroup {
    return this.fb.nonNullable.group({
      name: [s.name, [Validators.required, Validators.maxLength(50)]],
      startTime: [s.startTime || '', [Validators.required]],
      endTime: [s.endTime || '', [Validators.required]],
    });
  }

  addSession(): void {
    this.sessions.push(this.newSession({ name: '', startTime: '', endTime: '' }));
    this.sessions.markAsDirty();
    this.sessionsLength.set(this.sessions.length);
  }

  removeSession(index: number): void {
    this.sessions.removeAt(index);
    this.sessions.markAsDirty();
    this.sessionsLength.set(this.sessions.length);
  }

  // The save bar's "Discard changes": re-load the saved state, pristine.
  discard(): void {
    this.clearMessages();
    this.load();
  }

  onSave(): void {
    this.clearMessages();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const sessions = this.sessions.controls.map((g) => g.getRawValue());
    const seen = new Set<string>();
    for (const s of sessions) {
      const name = s.name.trim();
      if (!name) {
        this.errorMessage.set('Every session needs a name.');
        return;
      }
      if (seen.has(name.toLowerCase())) {
        this.errorMessage.set(`Session '${name}' appears more than once.`);
        return;
      }
      seen.add(name.toLowerCase());
      if (!s.startTime || !s.endTime) {
        this.errorMessage.set(`Session '${name}' needs both From and Until times.`);
        return;
      }
      if (s.startTime >= s.endTime) {
        this.errorMessage.set(`Session '${name}': the From time must be before the Until time.`);
        return;
      }
    }
    const ordered = [...sessions].sort((a, b) => (a.startTime < b.startTime ? -1 : 1));
    for (let i = 1; i < ordered.length; i += 1) {
      if (ordered[i].startTime < ordered[i - 1].endTime) {
        this.errorMessage.set(`Sessions '${ordered[i - 1].name}' and '${ordered[i].name}' overlap.`);
        return;
      }
    }

    const v = this.form.getRawValue();
    this.saving.set(true);
    this.service.save({
      advanceBookingDays: clampInt(v.advanceBookingDays, 0, 365, 7),
      advanceBookingHours: clampInt(v.advanceBookingHours, 0, 23, 0),
      allowSameDayBooking: v.allowSameDayBooking === true,
      bookingLockMinutes: clampInt(v.bookingLockMinutes, 1, 60, 5),
      guestControlEnabled: v.guestControlEnabled === true,
      allowGuestWeekday: v.allowGuestWeekday === true,
      allowMemberGuestWeekday: v.allowMemberGuestWeekday === true,
      allowGuestWeekend: v.allowGuestWeekend === true,
      allowMemberGuestWeekend: v.allowMemberGuestWeekend === true,
      noShowControlEnabled: v.noShowControlEnabled === true,
      cancellationNoticeHours: clampInt(v.cancellationNoticeHours, 0, 720, 24),
      sessions: sessions.map((s) => ({ name: s.name.trim(), startTime: s.startTime, endTime: s.endTime })),
    }).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.saving.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save the facility specification.');
        this.saving.set(false);
      },
    });
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
