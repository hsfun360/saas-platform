import { Component, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import {
  ClassInstructorOption,
  ClassVenueOption,
  FacilityClassService,
  FacilityClassSession,
  SessionListing,
  SessionPayload,
} from '../services/facility-class.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { CanDirective } from '../shared/can.directive';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { ComboboxComponent } from '../shared/combobox/combobox';
import { LocalDatePipe, formatLocalDate, localDateOnly } from '../shared/local-date.pipe';

const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || dflt)));
const optInt = (v: unknown, lo: number, hi: number): number | null => (v === null || v === undefined || v === '' ? null : clampInt(v, lo, hi, lo));

// 'YYYY-MM-DD' arithmetic in local time.
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
// The Monday on or before a date (ISO week).
function mondayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay(); // 0 = Sunday
  return addDays(iso, dow === 0 ? -6 : 1 - dow);
}

type DlgMode = 'session' | 'cancel' | 'add' | null;

interface DayGroup {
  date: string;
  sessions: FacilityClassSession[];
}

// Facility Management → Class Schedule (/facility/class-schedule; slice 5a,
// structures approved 2026-10-26). The timetable: one week of sessions per
// day, filtered by class, instructor or venue; a session opens its drawer
// (move it, swap the instructor, change the seats, cancel it with a reason),
// and a one-off session is added from the FAB. The roster, attendance and
// Hold arrive with slice 5b. ONE drawer dialog with three views.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-facility-class-schedule',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent, CanDirective, ComboboxComponent, LocalDatePipe],
  templateUrl: './facility-class-schedule.html',
  styleUrls: ['../membership-types/membership-types.css', './facility-class-schedule.css'],
})
export class FacilityClassScheduleComponent implements OnInit {
  private readonly service = inject(FacilityClassService);
  private readonly fb = inject(FormBuilder);

  readonly weekStart = signal(mondayOf(localDateOnly()));
  readonly listing = signal<SessionListing | null>(null);
  readonly loading = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');
  readonly classFilter = signal('');
  readonly instructorFilter = signal('');
  readonly venueFilter = signal('');
  readonly showCancelled = signal(false);

  readonly weekEnd = computed(() => addDays(this.weekStart(), 6));
  readonly today = computed(() => this.listing()?.clubNow.date || localDateOnly());
  readonly isThisWeek = computed(() => this.weekStart() === mondayOf(this.today()));
  readonly weekLabel = computed(() => `${formatLocalDate(this.weekStart(), 'dayMonth')} to ${formatLocalDate(this.weekEnd())}`);

  readonly classes = computed(() => this.listing()?.classes || []);
  readonly venues = computed<ClassVenueOption[]>(() => this.listing()?.venues || []);
  readonly instructors = computed<ClassInstructorOption[]>(() => this.listing()?.instructors || []);
  readonly classOptions = computed(() => this.classes().filter((c) => c.isActive).map((c) => ({ value: c.id, label: `${c.code} - ${c.description}` })));
  readonly venueOptions = computed(() => this.venues().filter((v) => v.isActive).map((v) => ({ value: v.id, label: `${v.code} - ${v.name} (${v.capacity} seats)` })));
  readonly instructorOptions = computed(() => this.instructors().filter((i) => i.isActive).map((i) => ({ value: i.id, label: `${i.code} - ${i.name}` })));

  // The week as seven day groups, the filtered sessions in time order.
  readonly days = computed<DayGroup[]>(() => {
    const all = this.listing()?.sessions || [];
    const show = this.showCancelled();
    const start = this.weekStart();
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, i);
      return { date, sessions: all.filter((s) => s.sessionDate === date && (show || s.status !== 'cancelled')) };
    });
  });
  readonly sessionCount = computed(() => this.days().reduce((n, d) => n + d.sessions.length, 0));
  readonly cancelledCount = computed(() => (this.listing()?.sessions || []).filter((s) => s.status === 'cancelled').length);

  // --- The ONE drawer dialog ---
  readonly dlgMode = signal<DlgMode>(null);
  readonly saving = signal(false);
  readonly current = signal<FacilityClassSession | null>(null);

  readonly form = this.fb.nonNullable.group({
    startTime: ['', [Validators.required]],
    endTime: ['', [Validators.required]],
    venueId: ['', [Validators.required]],
    instructorId: ['', [Validators.required]],
    capacity: [1, [Validators.required, Validators.min(1), Validators.max(500)]],
    remarks: ['', [Validators.maxLength(255)]],
  });
  readonly addForm = this.fb.nonNullable.group({
    classId: ['', [Validators.required]],
    sessionDate: ['', [Validators.required]],
    startTime: ['', [Validators.required]],
    endTime: ['', [Validators.required]],
    venueId: [''],
    instructorId: [''],
    capacity: this.fb.control<number | null>(null, [Validators.min(1), Validators.max(500)]),
    remarks: ['', [Validators.maxLength(255)]],
  });
  readonly cancelForm = this.fb.nonNullable.group({ reason: ['', [Validators.required, Validators.maxLength(255)]] });

  readonly dialogTitle = computed(() => {
    const s = this.current();
    switch (this.dlgMode()) {
      case 'session': return s ? `${s.class?.code || 'Session'} · ${formatLocalDate(s.sessionDate, 'dayMonth')} ${s.startTime}` : 'Session';
      case 'cancel': return s ? `Cancel ${s.class?.code || 'session'} on ${formatLocalDate(s.sessionDate, 'dayMonth')}` : 'Cancel session';
      case 'add': return 'Add a one-off session';
      default: return '';
    }
  });

  isDirty(): boolean {
    switch (this.dlgMode()) {
      case 'session': return this.form.dirty;
      case 'add': return this.addForm.dirty;
      case 'cancel': return this.cancelForm.dirty;
      default: return false;
    }
  }

  ngOnInit(): void {
    this.load();
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  load(): void {
    this.loading.set(true);
    this.service.sessionsBetween(this.weekStart(), this.weekEnd(), {
      classId: this.classFilter() || null, instructorId: this.instructorFilter() || null, venueId: this.venueFilter() || null,
    }).subscribe({
      next: (res) => {
        this.listing.set(res);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load the timetable.');
      },
    });
  }

  shiftWeek(n: number): void {
    this.weekStart.set(addDays(this.weekStart(), 7 * n));
    this.load();
  }

  goToday(): void {
    this.weekStart.set(mondayOf(this.today()));
    this.load();
  }

  setFilter(kind: 'class' | 'instructor' | 'venue', value: string | null): void {
    const v = value || '';
    if (kind === 'class') this.classFilter.set(v);
    else if (kind === 'instructor') this.instructorFilter.set(v);
    else this.venueFilter.set(v);
    this.load();
  }

  isPastDay(date: string): boolean {
    return date < this.today();
  }

  isToday(date: string): boolean {
    return date === this.today();
  }

  // Whether a scheduled session may still be edited (not past, scheduled).
  editable(s: FacilityClassSession): boolean {
    return s.status === 'scheduled' && s.canModify !== false;
  }

  // --- Session drawer ---

  openSession(s: FacilityClassSession): void {
    this.clearMessages();
    this.current.set(s);
    this.form.reset({ startTime: s.startTime, endTime: s.endTime, venueId: s.venueId, instructorId: s.instructorId, capacity: s.capacity, remarks: s.remarks || '' });
    if (this.editable(s)) this.form.enable();
    else this.form.disable();
    this.dlgMode.set('session');
  }

  closeDialog(): void {
    this.dlgMode.set(null);
    this.current.set(null);
    this.form.markAsPristine();
    this.addForm.markAsPristine();
    this.cancelForm.markAsPristine();
  }

  saveSession(): void {
    this.clearMessages();
    const s = this.current();
    if (!s) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    if (v.startTime >= v.endTime) {
      this.errorMessage.set('The end time must be after the start time.');
      return;
    }
    const payload: SessionPayload = { startTime: v.startTime, endTime: v.endTime, venueId: v.venueId, instructorId: v.instructorId, capacity: clampInt(v.capacity, 1, 500, 1), remarks: v.remarks.trim() || null };
    this.saving.set(true);
    this.service.updateSession(s.id, payload).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.saving.set(false);
        this.form.markAsPristine();
        this.closeDialog();
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update the session.');
        this.saving.set(false);
      },
    });
  }

  openCancel(): void {
    this.clearMessages();
    this.cancelForm.reset({ reason: '' });
    this.dlgMode.set('cancel');
  }

  backToSession(): void {
    this.cancelForm.markAsPristine();
    this.dlgMode.set('session');
  }

  submitCancel(): void {
    this.clearMessages();
    const s = this.current();
    if (!s) return;
    if (this.cancelForm.invalid) {
      this.cancelForm.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.service.cancelSession(s.id, this.cancelForm.getRawValue().reason.trim()).subscribe({
      next: () => {
        this.successMessage.set(`${s.class?.code || 'Session'} on ${formatLocalDate(s.sessionDate, 'weekday')} ${s.startTime} cancelled.`);
        this.saving.set(false);
        this.cancelForm.markAsPristine();
        this.closeDialog();
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to cancel the session.');
        this.saving.set(false);
      },
    });
  }

  // --- One-off session ---

  openAdd(date?: string): void {
    this.clearMessages();
    this.current.set(null);
    const defaultDate = date && date >= this.today() ? date : (this.weekStart() >= this.today() ? this.weekStart() : this.today());
    this.addForm.reset({ classId: this.classFilter() || '', sessionDate: defaultDate, startTime: '', endTime: '', venueId: '', instructorId: '', capacity: null, remarks: '' });
    this.dlgMode.set('add');
  }

  // The defaults the picked class carries, shown as the empty labels.
  addClassDefaults(): { venue: string; instructor: string; capacity: string } {
    const id = this.addForm.controls.classId.value;
    const c = id ? this.classes().find((x) => x.id === id) : null;
    const venue = c?.venueId ? this.venues().find((v) => v.id === c.venueId) : null;
    const instructor = c?.instructorId ? this.instructors().find((i) => i.id === c.instructorId) : null;
    return {
      venue: venue ? `Class default - ${venue.code}` : 'Pick a venue',
      instructor: instructor ? `Class default - ${instructor.name}` : 'Pick an instructor',
      capacity: c?.capacity != null ? `Class default - ${c.capacity}` : (venue ? `Venue's ${venue.capacity}` : 'Venue\'s capacity'),
    };
  }

  submitAdd(): void {
    this.clearMessages();
    if (this.addForm.invalid) {
      this.addForm.markAllAsTouched();
      return;
    }
    const v = this.addForm.getRawValue();
    if (v.startTime >= v.endTime) {
      this.errorMessage.set('The end time must be after the start time.');
      return;
    }
    const payload: SessionPayload = {
      classId: v.classId, sessionDate: v.sessionDate, startTime: v.startTime, endTime: v.endTime,
      venueId: v.venueId || null, instructorId: v.instructorId || null, capacity: optInt(v.capacity, 1, 500), remarks: v.remarks.trim() || null,
    };
    this.saving.set(true);
    this.service.createSession(payload).subscribe({
      next: (res) => {
        this.successMessage.set(`${res.session.class?.code || 'Session'} added on ${formatLocalDate(res.session.sessionDate, 'weekday')} ${res.session.startTime} at ${res.session.venue?.code || 'the venue'}.`);
        this.saving.set(false);
        this.addForm.markAsPristine();
        this.closeDialog();
        if (res.session.sessionDate < this.weekStart() || res.session.sessionDate > this.weekEnd()) this.weekStart.set(mondayOf(res.session.sessionDate));
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to add the session.');
        this.saving.set(false);
      },
    });
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
