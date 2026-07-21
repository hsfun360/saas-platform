import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { GolfCourseService } from '../services/golf-course.service';
import { UnitCourseService } from '../services/unit-course.service';
import { DialogComponent } from '../shared/dialog/dialog';
import {
  CourseClosureDay,
  CourseClosurePlan,
  CourseTeeTimeSet,
  CourseTeeTimeSlot,
  GolfCourse,
  MembershipStatusOption,
  UnitCourse,
} from '../models/auth.models';

// One editable slot row in the slot editor (strings from inputs).
interface SlotRow {
  slotNumber: number;
  teeTime: string; // 'HH:MM'
  maxPlayers: string;
  isFrontDesk: boolean;
}

// One editable closure-day row in the day editor (strings from inputs).
interface ClosureDayRow {
  closureDate: string; // 'YYYY-MM-DD'
  dayType?: 'weekday' | 'weekend';
  isHoliday?: boolean;
  nineScope: string;
  startTime: string; // 'HH:MM' or '' (whole day when both empty)
  endTime: string;
  isActive: boolean;
}

// Fallback day scopes if /meta hasn't loaded - must match courseTeeTime.constants.
const FALLBACK_SCOPES: MembershipStatusOption[] = [
  { key: 'all', label: 'All days' },
  { key: 'weekday', label: 'Weekdays' },
  { key: 'weekend', label: 'Weekends' },
];

// Fallback nine scopes if /meta hasn't loaded - must match courseClosure.constants.
const FALLBACK_NINE_SCOPES: MembershipStatusOption[] = [
  { key: 'first-nine', label: 'First nine' },
  { key: 'second-nine', label: 'Second nine' },
  { key: 'all', label: 'Whole course' },
];

// 'HH:MM' <-> minutes-of-day helpers for slot generation.
function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Golf Management → Master File Setup → Courses (spec 2.2.4).
// An 18-hole course pairs two unit courses - first nine (OUT|COMPOSITE) +
// second nine (IN|COMPOSITE) - with optional alternate and night fallback
// nines, a cross over time and a course picture. Field names match the screen
// labels and DB columns (user's vocabulary). Legacy zone column dropped.
// Enable/disable (no hard delete). Reuses the System Setup stylesheet.
@Component({
  selector: 'app-golf-courses',
  standalone: true,
  imports: [ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent],
  templateUrl: './golf-courses.html',
  styleUrls: ['../system-setup/system-setup.css', './golf-courses.css'],
})
export class GolfCoursesComponent implements OnInit {
  private readonly service = inject(GolfCourseService);
  private readonly unitCourseService = inject(UnitCourseService);
  private readonly fb = inject(FormBuilder);

  readonly courses = signal<GolfCourse[]>([]);
  readonly unitCourses = signal<UnitCourse[]>([]);
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);

  // One dialog serves add + edit; editId() decides which.
  readonly dialogOpen = signal(false);
  readonly saving = signal(false);
  readonly uploading = signal(false);
  readonly editId = signal<string | null>(null);
  readonly dialogTitle = computed(() => (this.editId() ? 'Edit course' : 'New course'));

  readonly form = this.fb.nonNullable.group({
    courseCode: ['', [Validators.required, Validators.maxLength(20)]],
    displaySequence: this.fb.control<number | null>(null, [Validators.min(1), Validators.max(999)]),
    description: ['', [Validators.maxLength(255)]],
    firstNineId: ['', [Validators.required]],
    secondNineId: ['', [Validators.required]],
    alternateNineId: [''],
    nightNineId: [''],
    crossOverMinutes: this.fb.control<number | null>(null, [Validators.min(1), Validators.max(600)]),
    photo: [''],
  });

  // --- Tee times: ONE dialog with three views (list -> form / slot editor).
  // The shared <app-dialog> pushes a history back-trap entry per instance, so
  // swapping between dialog instances races its cleanup history.back() against
  // the next instance's pushState (the new dialog self-closes). Mode-switching
  // inside a single open dialog avoids the history churn entirely.
  readonly dayScopes = signal<MembershipStatusOption[]>(FALLBACK_SCOPES);
  readonly ttOpen = signal(false);
  readonly ttMode = signal<'list' | 'form' | 'slots'>('list');
  readonly ttLoading = signal(false);
  readonly ttCourse = signal<GolfCourse | null>(null);
  readonly ttSets = signal<CourseTeeTimeSet[]>([]);
  readonly ttTogglingId = signal<string | null>(null);

  readonly ttSaving = signal(false);
  readonly ttEditSetId = signal<string | null>(null);
  readonly ttForm = this.fb.nonNullable.group({
    description: ['', [Validators.maxLength(255)]],
    dayScope: ['all', [Validators.required]],
    effectiveDate: ['', [Validators.required]],
    firstTeeTime: ['', [Validators.required]],
    lastTeeTime: ['', [Validators.required]],
    intervalMinutes: this.fb.control<number | null>(null, [Validators.required, Validators.min(1), Validators.max(120)]),
    playersPerFlight: this.fb.control<number | null>(4, [Validators.required, Validators.min(1), Validators.max(10)]),
    mustPlay18Until: [''],
    mustPlay9Until: [''],
    frontDeskFrom: [''],
  });

  readonly ttSlotsSaving = signal(false);
  readonly ttSlotsDirty = signal(false);
  readonly ttSlotSet = signal<CourseTeeTimeSet | null>(null);
  readonly slotRows = signal<SlotRow[]>([]);

  // --- Closures: the same single-dialog pattern as tee times (list -> plan
  // form / day editor). Day rows are GENERATED server-side (the API classifies
  // each date against Company Weekend Days + Public Holidays - holidays count
  // as weekend) and reviewed here before saving.
  readonly nineScopes = signal<MembershipStatusOption[]>(FALLBACK_NINE_SCOPES);
  readonly ccOpen = signal(false);
  readonly ccMode = signal<'list' | 'form' | 'days'>('list');
  readonly ccLoading = signal(false);
  readonly ccCourse = signal<GolfCourse | null>(null);
  readonly ccPlans = signal<CourseClosurePlan[]>([]);
  readonly ccTogglingId = signal<string | null>(null);

  readonly ccSaving = signal(false);
  readonly ccEditPlanId = signal<string | null>(null);
  readonly ccForm = this.fb.nonNullable.group({
    description: ['', [Validators.required, Validators.maxLength(255)]],
    dayScope: ['all', [Validators.required]],
    nineScope: ['all', [Validators.required]],
    dateFrom: ['', [Validators.required]],
    dateTo: ['', [Validators.required]],
    startTime: [''],
    endTime: [''],
  });

  readonly ccDaysSaving = signal(false);
  readonly ccGenerating = signal(false);
  readonly ccDaysDirty = signal(false);
  readonly ccDayPlan = signal<CourseClosurePlan | null>(null);
  readonly dayRows = signal<ClosureDayRow[]>([]);

  // Title / dirty / busy for the single tee-times dialog, per view.
  readonly ttTitle = computed(() => {
    const code = this.ttCourse()?.courseCode || '';
    if (this.ttMode() === 'form') return this.ttEditSetId() ? `Edit tee-time set — ${code}` : `New tee-time set — ${code}`;
    if (this.ttMode() === 'slots') {
      const s = this.ttSlotSet();
      return s ? `Flight times — ${this.scopeLabel(s.dayScope)} from ${s.effectiveDate}` : 'Flight times';
    }
    return `Tee times — ${code}`;
  });
  readonly ttBusy = computed(() => this.ttLoading() || this.ttSaving() || this.ttSlotsSaving());
  // Method (not computed): ttForm.dirty is not a signal, but template bindings
  // re-evaluate every CD pass, which is exactly how the other dialogs bind form.dirty.
  ttDirty(): boolean {
    if (this.ttMode() === 'form') return this.ttForm.dirty;
    if (this.ttMode() === 'slots') return this.ttSlotsDirty();
    return false;
  }
  // Title / dirty / busy for the single closures dialog, per view.
  readonly ccTitle = computed(() => {
    const code = this.ccCourse()?.courseCode || '';
    if (this.ccMode() === 'form') return this.ccEditPlanId() ? `Edit closure plan — ${code}` : `New closure plan — ${code}`;
    if (this.ccMode() === 'days') {
      const p = this.ccDayPlan();
      return p ? `Closure days — ${p.description}` : 'Closure days';
    }
    return `Closures — ${code}`;
  });
  readonly ccBusy = computed(() => this.ccLoading() || this.ccSaving() || this.ccDaysSaving() || this.ccGenerating());
  ccDirty(): boolean {
    if (this.ccMode() === 'form') return this.ccForm.dirty;
    if (this.ccMode() === 'days') return this.ccDaysDirty();
    return false;
  }

  // What "Generate" will produce, from the set's header - shown on the button.
  readonly generateCount = computed(() => {
    const s = this.ttSlotSet();
    if (!s) return 0;
    const first = toMinutes(this.hhmm(s.firstTeeTime));
    const last = toMinutes(this.hhmm(s.lastTeeTime));
    if (!s.intervalMinutes || last < first) return 0;
    return Math.floor((last - first) / s.intervalMinutes) + 1;
  });

  readonly search = signal('');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  // Picker option lists, filtered by the pairing rules (mirrors the API).
  readonly firstNineOptions = computed(() =>
    this.unitCourses().filter((u) => u.isActive !== false && (u.courseType === 'out' || u.courseType === 'composite')),
  );
  readonly secondNineOptions = computed(() =>
    this.unitCourses().filter((u) => u.isActive !== false && (u.courseType === 'in' || u.courseType === 'composite')),
  );
  readonly alternateNineOptions = computed(() => this.unitCourses().filter((u) => u.isActive !== false));
  readonly nightNineOptions = computed(() =>
    this.unitCourses().filter((u) => u.isActive !== false && u.hasFloodlight === true),
  );

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const sorted = [...this.courses()].sort((a, b) => {
      const aActive = a.isActive !== false;
      const bActive = b.isActive !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return 0;
    });
    if (!q) return sorted;
    return sorted.filter(
      (c) =>
        c.courseCode.toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q) ||
        this.nineCode(c.firstNineId).toLowerCase().includes(q) ||
        this.nineCode(c.secondNineId).toLowerCase().includes(q),
    );
  });
  readonly activeCount = computed(() => this.courses().filter((c) => c.isActive !== false).length);

  ngOnInit(): void {
    this.loadUnitCourses();
    this.loadMeta();
    this.load();
  }

  loadMeta(): void {
    this.service.meta().subscribe({
      next: (m) => {
        if (m.dayScopes?.length) this.dayScopes.set(m.dayScopes);
        if (m.nineScopes?.length) this.nineScopes.set(m.nineScopes);
      },
      error: () => {
        /* falls back to the baked-in scopes */
      },
    });
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  // Resolve a unit-course id to its code for display ('' when unset/unknown).
  nineCode(id: string | null | undefined): string {
    if (!id) return '';
    return this.unitCourses().find((u) => u.id === id)?.unitCourseCode || '';
  }

  loadUnitCourses(): void {
    this.unitCourseService.list().subscribe({
      next: (data) => this.unitCourses.set(data),
      error: () => {
        /* pickers stay empty; the API still validates on save */
      },
    });
  }

  load(): void {
    this.loading.set(true);
    this.service.list().subscribe({
      next: (data) => {
        this.courses.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load courses.');
      },
    });
  }

  openAdd(): void {
    this.clearMessages();
    this.editId.set(null);
    this.form.reset({
      courseCode: '',
      displaySequence: null,
      description: '',
      firstNineId: '',
      secondNineId: '',
      alternateNineId: '',
      nightNineId: '',
      crossOverMinutes: null,
      photo: '',
    });
    this.dialogOpen.set(true);
  }

  openEdit(c: GolfCourse): void {
    this.clearMessages();
    this.editId.set(c.id);
    this.form.reset({
      courseCode: c.courseCode,
      displaySequence: c.displaySequence ?? null,
      description: c.description || '',
      firstNineId: c.firstNineId,
      secondNineId: c.secondNineId,
      alternateNineId: c.alternateNineId || '',
      nightNineId: c.nightNineId || '',
      crossOverMinutes: c.crossOverMinutes ?? null,
      photo: c.photo || '',
    });
    this.dialogOpen.set(true);
  }

  closeDialog(): void {
    this.dialogOpen.set(false);
  }

  onPhotoSelected(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = ''; // allow re-selecting the same file
    if (!file) return;
    this.clearMessages();
    this.uploading.set(true);
    this.service.uploadPhoto(file).subscribe({
      next: (res) => {
        this.form.controls.photo.setValue(res.url);
        this.form.controls.photo.markAsDirty(); // uploads count as unsaved changes
        this.uploading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to upload photo.');
        this.uploading.set(false);
      },
    });
  }

  removePhoto(): void {
    this.form.controls.photo.setValue('');
    this.form.controls.photo.markAsDirty();
  }

  onSave(): void {
    this.clearMessages();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const f = this.form.getRawValue();
    if (f.firstNineId && f.firstNineId === f.secondNineId) {
      this.errorMessage.set('First nine and second nine must be two different unit courses.');
      return;
    }
    const payload: Partial<GolfCourse> = {
      courseCode: f.courseCode.trim(),
      displaySequence: f.displaySequence,
      description: f.description.trim() || null,
      firstNineId: f.firstNineId,
      secondNineId: f.secondNineId,
      alternateNineId: f.alternateNineId || null,
      nightNineId: f.nightNineId || null,
      crossOverMinutes: f.crossOverMinutes,
      photo: f.photo || null,
    };

    this.saving.set(true);
    const id = this.editId();
    const request = id ? this.service.update(id, payload) : this.service.create(payload);
    request.subscribe({
      next: () => {
        this.successMessage.set(`${payload.courseCode} ${id ? 'updated' : 'added'}.`);
        this.saving.set(false);
        this.dialogOpen.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || `Failed to ${id ? 'update' : 'add'} course.`);
        this.saving.set(false);
      },
    });
  }

  toggleActive(c: GolfCourse): void {
    this.clearMessages();
    const next = !(c.isActive !== false);
    this.togglingId.set(c.id);
    this.service.update(c.id, { isActive: next }).subscribe({
      next: () => {
        this.successMessage.set(`${c.courseCode} ${next ? 'enabled' : 'disabled'}.`);
        this.togglingId.set(null);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update course.');
        this.togglingId.set(null);
      },
    });
  }

  // --- Tee-time sets (per course) ---

  scopeLabel(key: string): string {
    return this.dayScopes().find((s) => s.key === key)?.label || key;
  }

  // Trim an API 'HH:MM:SS' to 'HH:MM' for display / <input type="time">.
  hhmm(t: string | null | undefined): string {
    return t ? String(t).slice(0, 5) : '';
  }

  openTeeTimes(c: GolfCourse): void {
    this.clearMessages();
    this.ttCourse.set(c);
    this.ttSets.set([]);
    this.ttMode.set('list');
    this.ttOpen.set(true);
    this.reloadSets();
  }

  // Return to the list view inside the open dialog.
  backToList(): void {
    this.ttMode.set('list');
    this.ttSlotsDirty.set(false);
  }

  private reloadSets(): void {
    const c = this.ttCourse();
    if (!c) return;
    this.ttLoading.set(true);
    this.service.teeTimeSets(c.id).subscribe({
      next: (data) => {
        this.ttSets.set(data);
        this.ttLoading.set(false);
      },
      error: (err) => {
        this.ttLoading.set(false);
        this.ttOpen.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load tee-time sets.');
      },
    });
  }

  closeTeeTimes(): void {
    this.ttOpen.set(false);
    this.ttMode.set('list');
    this.ttSlotsDirty.set(false);
  }

  slotCount(s: CourseTeeTimeSet): number {
    return s.Slots?.length || 0;
  }

  // --- Set form (opens on top of the list; list reopens after) ---

  openSetForm(s?: CourseTeeTimeSet): void {
    this.clearMessages();
    this.ttEditSetId.set(s?.id || null);
    this.ttForm.reset({
      description: s?.description || '',
      dayScope: s?.dayScope || 'all',
      effectiveDate: s?.effectiveDate || '',
      firstTeeTime: this.hhmm(s?.firstTeeTime) || '',
      lastTeeTime: this.hhmm(s?.lastTeeTime) || '',
      intervalMinutes: s?.intervalMinutes ?? null,
      playersPerFlight: s?.playersPerFlight ?? 4,
      mustPlay18Until: this.hhmm(s?.mustPlay18Until),
      mustPlay9Until: this.hhmm(s?.mustPlay9Until),
      frontDeskFrom: this.hhmm(s?.frontDeskFrom),
    });
    this.ttMode.set('form');
  }

  onSaveSet(): void {
    this.clearMessages();
    if (this.ttForm.invalid) {
      this.ttForm.markAllAsTouched();
      return;
    }
    const f = this.ttForm.getRawValue();
    if (f.firstTeeTime >= f.lastTeeTime) {
      this.errorMessage.set('Last tee-off time must be after the first tee-off time.');
      return;
    }
    const course = this.ttCourse();
    if (!course) return;

    const payload: Partial<CourseTeeTimeSet> = {
      description: f.description.trim() || null,
      dayScope: f.dayScope,
      effectiveDate: f.effectiveDate,
      firstTeeTime: f.firstTeeTime,
      lastTeeTime: f.lastTeeTime,
      intervalMinutes: f.intervalMinutes ?? undefined,
      playersPerFlight: f.playersPerFlight ?? undefined,
      mustPlay18Until: f.mustPlay18Until || null,
      mustPlay9Until: f.mustPlay9Until || null,
      frontDeskFrom: f.frontDeskFrom || null,
    };

    this.ttSaving.set(true);
    const id = this.ttEditSetId();
    const request = id
      ? this.service.updateTeeTimeSet(course.id, id, payload)
      : this.service.createTeeTimeSet(course.id, payload);
    request.subscribe({
      next: () => {
        this.successMessage.set(`Tee-time set ${id ? 'updated' : 'added'}.`);
        this.ttSaving.set(false);
        this.ttForm.markAsPristine();
        this.backToList();
        this.reloadSets();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || `Failed to ${id ? 'update' : 'add'} tee-time set.`);
        this.ttSaving.set(false);
      },
    });
  }

  toggleSetActive(s: CourseTeeTimeSet): void {
    this.clearMessages();
    const course = this.ttCourse();
    if (!course) return;
    const next = !(s.isActive !== false);
    this.ttTogglingId.set(s.id);
    this.service.updateTeeTimeSet(course.id, s.id, { isActive: next }).subscribe({
      next: () => {
        this.successMessage.set(`Tee-time set ${next ? 'enabled' : 'disabled'}.`);
        this.ttTogglingId.set(null);
        this.reloadSets();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update tee-time set.');
        this.ttTogglingId.set(null);
      },
    });
  }

  // --- Slot editor (opens on top of the list; list reopens after) ---

  openSlots(s: CourseTeeTimeSet): void {
    this.clearMessages();
    this.ttSlotSet.set(s);
    this.ttSlotsDirty.set(false);
    this.slotRows.set(
      (s.Slots || []).map((sl) => ({
        slotNumber: sl.slotNumber,
        teeTime: this.hhmm(sl.teeTime),
        maxPlayers: String(sl.maxPlayers),
        isFrontDesk: sl.isFrontDesk === true,
      })),
    );
    this.ttMode.set('slots');
  }

  // Build the slot list from the set's header (first..last every interval).
  generateSlots(): void {
    const s = this.ttSlotSet();
    if (!s) return;
    const first = toMinutes(this.hhmm(s.firstTeeTime));
    const last = toMinutes(this.hhmm(s.lastTeeTime));
    const fd = s.frontDeskFrom ? toMinutes(this.hhmm(s.frontDeskFrom)) : null;
    const rows: SlotRow[] = [];
    let n = 1;
    for (let t = first; t <= last; t += s.intervalMinutes) {
      rows.push({
        slotNumber: n++,
        teeTime: toHHMM(t),
        maxPlayers: String(s.playersPerFlight),
        isFrontDesk: fd !== null && t >= fd,
      });
    }
    this.slotRows.set(rows);
    this.ttSlotsDirty.set(true);
  }

  updateSlot(index: number, field: 'teeTime' | 'maxPlayers', value: string): void {
    this.slotRows.update((rows) => rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
    this.ttSlotsDirty.set(true);
  }

  toggleSlotFrontDesk(index: number): void {
    this.slotRows.update((rows) => rows.map((r, i) => (i === index ? { ...r, isFrontDesk: !r.isFrontDesk } : r)));
    this.ttSlotsDirty.set(true);
  }

  onSaveSlots(): void {
    this.clearMessages();
    const course = this.ttCourse();
    const set = this.ttSlotSet();
    if (!course || !set) return;

    // Quick client-side pass for immediate feedback; the API re-validates.
    const slots: CourseTeeTimeSlot[] = [];
    for (const r of this.slotRows()) {
      if (!r.teeTime) {
        this.errorMessage.set(`Slot ${r.slotNumber}: tee-off time is required.`);
        return;
      }
      const maxPlayers = Number(r.maxPlayers);
      if (!Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > 10) {
        this.errorMessage.set(`Slot ${r.slotNumber}: players must be between 1 and 10.`);
        return;
      }
      slots.push({ slotNumber: r.slotNumber, teeTime: r.teeTime, maxPlayers, isFrontDesk: r.isFrontDesk });
    }

    this.ttSlotsSaving.set(true);
    this.service.saveTeeTimeSlots(course.id, set.id, slots).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.ttSlotsSaving.set(false);
        this.backToList();
        this.reloadSets();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save flight times.');
        this.ttSlotsSaving.set(false);
      },
    });
  }

  // --- Closure plans (per course, spec 2.2.8) ---

  nineScopeLabel(key: string): string {
    return this.nineScopes().find((s) => s.key === key)?.label || key;
  }

  // 'closed all day' / '07:00 – 12:00' for a plan or day row.
  closureWindow(startTime: string | null | undefined, endTime: string | null | undefined): string {
    const s = this.hhmm(startTime);
    const e = this.hhmm(endTime);
    return s && e ? `${s} – ${e}` : 'All day';
  }

  openClosures(c: GolfCourse): void {
    this.clearMessages();
    this.ccCourse.set(c);
    this.ccPlans.set([]);
    this.ccMode.set('list');
    this.ccOpen.set(true);
    this.reloadPlans();
  }

  closeClosures(): void {
    this.ccOpen.set(false);
    this.ccMode.set('list');
    this.ccDaysDirty.set(false);
  }

  // Return to the list view inside the open dialog.
  ccBackToList(): void {
    this.ccMode.set('list');
    this.ccDaysDirty.set(false);
  }

  private reloadPlans(): void {
    const c = this.ccCourse();
    if (!c) return;
    this.ccLoading.set(true);
    this.service.closurePlans(c.id).subscribe({
      next: (data) => {
        this.ccPlans.set(data);
        this.ccLoading.set(false);
      },
      error: (err) => {
        this.ccLoading.set(false);
        this.ccOpen.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load closure plans.');
      },
    });
  }

  dayCount(p: CourseClosurePlan): number {
    return p.Days?.length || 0;
  }

  // --- Plan form (a view inside the open dialog) ---

  openPlanForm(p?: CourseClosurePlan): void {
    this.clearMessages();
    this.ccEditPlanId.set(p?.id || null);
    this.ccForm.reset({
      description: p?.description || '',
      dayScope: p?.dayScope || 'all',
      nineScope: p?.nineScope || 'all',
      dateFrom: p?.dateFrom || '',
      dateTo: p?.dateTo || '',
      startTime: this.hhmm(p?.startTime),
      endTime: this.hhmm(p?.endTime),
    });
    this.ccMode.set('form');
  }

  onSavePlan(): void {
    this.clearMessages();
    if (this.ccForm.invalid) {
      this.ccForm.markAllAsTouched();
      return;
    }
    const f = this.ccForm.getRawValue();
    if (f.dateTo < f.dateFrom) {
      this.errorMessage.set('End date must not be before the start date.');
      return;
    }
    if (!f.startTime !== !f.endTime) {
      this.errorMessage.set('Set both closure times, or leave both empty for a whole-day closure.');
      return;
    }
    if (f.startTime && f.endTime && f.startTime >= f.endTime) {
      this.errorMessage.set('Closure end time must be after the start time.');
      return;
    }
    const course = this.ccCourse();
    if (!course) return;

    const payload: Partial<CourseClosurePlan> = {
      description: f.description.trim(),
      dayScope: f.dayScope,
      nineScope: f.nineScope,
      dateFrom: f.dateFrom,
      dateTo: f.dateTo,
      startTime: f.startTime || null,
      endTime: f.endTime || null,
    };

    this.ccSaving.set(true);
    const id = this.ccEditPlanId();
    const request = id
      ? this.service.updateClosurePlan(course.id, id, payload)
      : this.service.createClosurePlan(course.id, payload);
    request.subscribe({
      next: () => {
        this.successMessage.set(`Closure plan ${id ? 'updated' : 'added'}.`);
        this.ccSaving.set(false);
        this.ccForm.markAsPristine();
        this.ccBackToList();
        this.reloadPlans();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || `Failed to ${id ? 'update' : 'add'} closure plan.`);
        this.ccSaving.set(false);
      },
    });
  }

  togglePlanActive(p: CourseClosurePlan): void {
    this.clearMessages();
    const course = this.ccCourse();
    if (!course) return;
    const next = !(p.isActive !== false);
    this.ccTogglingId.set(p.id);
    this.service.updateClosurePlan(course.id, p.id, { isActive: next }).subscribe({
      next: () => {
        this.successMessage.set(`Closure plan ${next ? 'enabled' : 'disabled'}.`);
        this.ccTogglingId.set(null);
        this.reloadPlans();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update closure plan.');
        this.ccTogglingId.set(null);
      },
    });
  }

  // --- Day editor (a view inside the open dialog) ---

  openDays(p: CourseClosurePlan): void {
    this.clearMessages();
    this.ccDayPlan.set(p);
    this.ccDaysDirty.set(false);
    this.dayRows.set(
      (p.Days || []).map((d) => ({
        closureDate: d.closureDate,
        nineScope: d.nineScope,
        startTime: this.hhmm(d.startTime),
        endTime: this.hhmm(d.endTime),
        isActive: d.isActive !== false,
      })),
    );
    this.ccMode.set('days');
  }

  // Ask the server to expand the plan into day rows (classified against the
  // company's weekend days + public holidays); fills the grid for review.
  generateDays(): void {
    const course = this.ccCourse();
    const plan = this.ccDayPlan();
    if (!course || !plan) return;
    this.clearMessages();
    this.ccGenerating.set(true);
    this.service.generateClosureDays(course.id, plan.id).subscribe({
      next: (res) => {
        this.dayRows.set(
          res.days.map((d) => ({
            closureDate: d.closureDate,
            dayType: d.dayType,
            isHoliday: d.isHoliday,
            nineScope: d.nineScope,
            startTime: this.hhmm(d.startTime),
            endTime: this.hhmm(d.endTime),
            isActive: true,
          })),
        );
        this.ccGenerating.set(false);
        this.ccDaysDirty.set(true);
        if (!res.days.length) {
          this.errorMessage.set('No days in the period match the plan\'s day scope.');
        }
      },
      error: (err) => {
        this.ccGenerating.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to generate closure days.');
      },
    });
  }

  updateDay(index: number, field: 'startTime' | 'endTime' | 'nineScope', value: string): void {
    this.dayRows.update((rows) => rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
    this.ccDaysDirty.set(true);
  }

  toggleDayActive(index: number): void {
    this.dayRows.update((rows) => rows.map((r, i) => (i === index ? { ...r, isActive: !r.isActive } : r)));
    this.ccDaysDirty.set(true);
  }

  removeDay(index: number): void {
    this.dayRows.update((rows) => rows.filter((_, i) => i !== index));
    this.ccDaysDirty.set(true);
  }

  onSaveDays(): void {
    this.clearMessages();
    const course = this.ccCourse();
    const plan = this.ccDayPlan();
    if (!course || !plan) return;

    // Quick client-side pass for immediate feedback; the API re-validates.
    const days: CourseClosureDay[] = [];
    for (const r of this.dayRows()) {
      if (!r.startTime !== !r.endTime) {
        this.errorMessage.set(`${r.closureDate}: set both closure times, or leave both empty for a whole-day closure.`);
        return;
      }
      if (r.startTime && r.endTime && r.startTime >= r.endTime) {
        this.errorMessage.set(`${r.closureDate}: closure end time must be after the start time.`);
        return;
      }
      days.push({
        closureDate: r.closureDate,
        nineScope: r.nineScope,
        startTime: r.startTime || null,
        endTime: r.endTime || null,
        isActive: r.isActive,
      });
    }

    this.ccDaysSaving.set(true);
    this.service.saveClosureDays(course.id, plan.id, days).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.ccDaysSaving.set(false);
        this.ccBackToList();
        this.reloadPlans();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save closure days.');
        this.ccDaysSaving.set(false);
      },
    });
  }

  clearSearch(): void {
    this.search.set('');
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
