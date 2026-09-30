import { Component, Injector, OnInit, computed, inject, signal } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { UnitCourseService } from '../services/unit-course.service';
import { ScrollReturnService } from '../services/scroll-return.service';
import { DialogComponent } from '../shared/dialog/dialog';
import {
  MembershipStatusOption,
  UnitCourse,
  UnitCourseClosureDay,
  UnitCourseClosurePlan,
  UnitCourseHole,
  UnitCourseTeeBox,
  UnitCourseTypeOption,
} from '../models/auth.models';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { OverflowMenuComponent, MenuItemDirective } from '../shared/overflow-menu/overflow-menu';
import { CanDirective } from '../shared/can.directive';

// One editable hole row in the Holes dialog. Inputs bind strings; parsing
// happens on save. Numbering comes from the course type, never the user.
interface HoleRow {
  holeNumber: number;
  par: string;
  handicapIndex: string;
  remarks: string;
}

// Par choices for a hole (spec: 3, 4 or 5).
const PAR_OPTIONS = [3, 4, 5];

// Fallback hole ranges if /meta hasn't loaded - must match unitCourse.constants.
const FALLBACK_RANGES: Record<string, { from: number; to: number }> = {
  out: { from: 1, to: 9 },
  in: { from: 10, to: 18 },
  composite: { from: 1, to: 18 },
};

// Fallback measurement units if /meta hasn't loaded - must match unitCourse.constants.
const FALLBACK_UNITS: MembershipStatusOption[] = [
  { key: 'meter', label: 'Meter' },
  { key: 'yard', label: 'Yard' },
];

// One editable tee box in the Tee boxes dialog. Distances are per hole (the
// scorecard's yardage cells), keyed by hole number, in the row's unit.
interface TeeBoxRow {
  colorCode: string;
  seq: string;
  colorHex: string;
  description: string;
  measurementUnit: string;
  distances: Record<number, string>;
}

// Display-order choices for a tee box.
const SEQ_OPTIONS = [1, 2, 3, 4, 5];

// One editable closure-day row in the day editor (strings from inputs).
interface ClosureDayRow {
  closureDate: string; // 'YYYY-MM-DD'
  dayType?: 'weekday' | 'weekend';
  isHoliday?: boolean;
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

// Golf Management → Master File Setup → Unit Courses.
// Per-company master file: the 9-hole building blocks of golf setup. A full
// 18-hole course is formed later (Course Setup) by pairing two unit courses;
// COMPOSITE nines may sit in either seat. Enable/disable, plus hard DELETE
// for mis-keyed nines no course references (2026-09-28).
// Reuses the System Setup stylesheet for the shared admin-screen look.
//
// Forms use typed Reactive Forms (canonical reference: platform-users): validators
// live on the controls, `form.dirty` feeds the shared dialog's unsaved-changes guard.
@Component({
  selector: 'app-golf-unit-courses',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent,
    OverflowMenuComponent, MenuItemDirective, CanDirective, LocalDatePipe],
  templateUrl: './golf-unit-courses.html',
  styleUrls: ['../system-setup/system-setup.css', './golf-unit-courses.css'],
})
export class GolfUnitCoursesComponent implements OnInit {
  private readonly service = inject(UnitCourseService);
  private readonly fb = inject(FormBuilder);
  // After-save return-to-row (app standard): the list re-sorts on reload, so
  // the saved/toggled card is scrolled back into view and flashed.
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private static readonly LIST_PATH = '/golf/unit-courses';

  readonly courses = signal<UnitCourse[]>([]);
  readonly types = signal<UnitCourseTypeOption[]>([]);
  readonly measurementUnits = signal<MembershipStatusOption[]>(FALLBACK_UNITS);
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);

  // One dialog serves add + edit; editId() decides which.
  readonly dialogOpen = signal(false);
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);
  readonly dialogTitle = computed(() => (this.editId() ? 'Edit unit course' : 'New unit course'));

  readonly form = this.fb.nonNullable.group({
    unitCourseCode: ['', [Validators.required, Validators.maxLength(20)]],
    courseType: ['', [Validators.required]],
    seq: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(9999)]),
    description: ['', [Validators.maxLength(255)]],
    completionMinutes: this.fb.control<number | null>(null, [Validators.min(1), Validators.max(600)]),
    hasFloodlight: [false],
    // Only meaningful on a floodlit nine - enabled by the hasFloodlight toggle.
    floodlightLeadMinutes: this.fb.control<number | null>({ value: null, disabled: true }, [Validators.min(0), Validators.max(600)]),
    remarks: ['', [Validators.maxLength(255)]],
  });

  // Holes dialog (spec 2.2.2). The grid always shows the type's full range -
  // saved rows merged over defaults - and Save replaces the set atomically.
  // Row edits mark the dialog dirty by hand (no FormGroup for the grid).
  readonly holesOpen = signal(false);
  readonly holesLoading = signal(false);
  readonly holesSaving = signal(false);
  readonly holesDirty = signal(false);
  readonly holesCourse = signal<UnitCourse | null>(null);
  readonly holeRows = signal<HoleRow[]>([]);
  readonly holesTitle = computed(() => `Holes — ${this.holesCourse()?.unitCourseCode || ''}`);
  readonly totalPar = computed(() =>
    this.holeRows().reduce((sum, r) => {
      const p = Number(r.par);
      return sum + (Number.isInteger(p) && p > 0 ? p : 0);
    }, 0),
  );

  // Tee boxes dialog (spec 2.2.3). User-defined set: rows can be added/removed;
  // Save replaces headers + per-gender rating rows atomically.
  readonly teesOpen = signal(false);
  readonly teesLoading = signal(false);
  readonly teesSaving = signal(false);
  readonly teesDirty = signal(false);
  readonly teesCourse = signal<UnitCourse | null>(null);
  readonly teeRows = signal<TeeBoxRow[]>([]);
  readonly teesTitle = computed(() => `Tee boxes — ${this.teesCourse()?.unitCourseCode || ''}`);

  // --- Closures (spec 2.2.8, moved here 2026-09-30): a closure is a fact
  // about the PHYSICAL NINE - closing EAST1 blocks every course that tees off
  // on or crosses onto it. ONE dialog with three views (list -> plan form /
  // day editor), the single-dialog pattern. Day rows are GENERATED
  // server-side (dates classified against Company Weekend Days + Public
  // Holidays - holidays count as weekend) and reviewed here before saving.
  readonly dayScopes = signal<MembershipStatusOption[]>(FALLBACK_SCOPES);
  readonly ccOpen = signal(false);
  readonly ccMode = signal<'list' | 'form' | 'days'>('list');
  readonly ccLoading = signal(false);
  readonly ccNine = signal<UnitCourse | null>(null);
  readonly ccPlans = signal<UnitCourseClosurePlan[]>([]);
  readonly ccTogglingId = signal<string | null>(null);

  readonly ccSaving = signal(false);
  readonly ccEditPlanId = signal<string | null>(null);
  readonly ccForm = this.fb.nonNullable.group({
    description: ['', [Validators.required, Validators.maxLength(255)]],
    dayScope: ['all', [Validators.required]],
    dateFrom: ['', [Validators.required]],
    dateTo: ['', [Validators.required]],
    startTime: [''],
    endTime: [''],
  });
  // "Also close" fan-out (create only): the same plan lands on these extra
  // nines too, e.g. tick every nine for a whole-club shutdown keyed once.
  readonly ccAlsoNines = signal<Set<string>>(new Set());

  readonly ccDaysSaving = signal(false);
  readonly ccGenerating = signal(false);
  readonly ccDaysDirty = signal(false);
  readonly ccDayPlan = signal<UnitCourseClosurePlan | null>(null);
  readonly dayRows = signal<ClosureDayRow[]>([]);

  readonly ccTitle = computed(() => {
    const code = this.ccNine()?.unitCourseCode || '';
    if (this.ccMode() === 'form') return this.ccEditPlanId() ? `Edit closure plan — ${code}` : `New closure plan — ${code}`;
    if (this.ccMode() === 'days') {
      const p = this.ccDayPlan();
      return p ? `Closure days — ${p.description}` : 'Closure days';
    }
    return `Closures — ${code}`;
  });
  readonly ccBusy = computed(() => this.ccLoading() || this.ccSaving() || this.ccDaysSaving() || this.ccGenerating());
  ccDirty(): boolean {
    if (this.ccMode() === 'form') return this.ccForm.dirty || this.ccAlsoNines().size > 0;
    if (this.ccMode() === 'days') return this.ccDaysDirty();
    return false;
  }
  // The other active nines offered by the "Also close" fan-out.
  readonly ccOtherNines = computed(() => {
    const current = this.ccNine();
    return this.courses().filter((u) => u.isActive !== false && u.id !== current?.id);
  });

  readonly search = signal('');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    // Active first, then by seq (list is already server-sorted; keep it stable).
    const sorted = [...this.courses()].sort((a, b) => {
      const aActive = a.isActive !== false;
      const bActive = b.isActive !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return 0;
    });
    if (!q) return sorted;
    return sorted.filter(
      (c) =>
        c.unitCourseCode.toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q) ||
        this.typeLabel(c.courseType).toLowerCase().includes(q),
    );
  });
  readonly activeCount = computed(() => this.courses().filter((c) => c.isActive !== false).length);

  constructor() {
    this.form.controls.hasFloodlight.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((on) => this.syncFloodlight(on));
  }

  ngOnInit(): void {
    this.loadMeta();
    this.load();
  }

  // Enable the lead-time field only while the nine is floodlit; clearing the
  // toggle wipes + disables it so a stale value can't be saved.
  private syncFloodlight(on: boolean): void {
    const c = this.form.controls.floodlightLeadMinutes;
    if (on) {
      c.enable({ emitEvent: false });
    } else {
      c.reset(null, { emitEvent: false });
      c.disable({ emitEvent: false });
    }
  }

  // Show a control's validation message once the user has interacted with it
  // (or after a submit attempt marks everything touched).
  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  typeLabel(key: string): string {
    return this.types().find((t) => t.key === key)?.label || key.toUpperCase();
  }

  typeDescription(key: string): string {
    return this.types().find((t) => t.key === key)?.description || '';
  }

  loadMeta(): void {
    this.service.meta().subscribe({
      next: (m) => {
        this.types.set(m.types);
        if (m.measurementUnits?.length) this.measurementUnits.set(m.measurementUnits);
        if (m.dayScopes?.length) this.dayScopes.set(m.dayScopes);
      },
      error: () => {
        /* dropdowns fall back to raw keys / baked-in genders if meta fails */
      },
    });
  }

  load(): void {
    this.loading.set(true);
    this.service.list().subscribe({
      next: (data) => {
        this.courses.set(data);
        this.loading.set(false);
        this.returnScroll.consume(GolfUnitCoursesComponent.LIST_PATH, this.injector);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load unit courses.');
      },
    });
  }

  openAdd(): void {
    this.clearMessages();
    this.editId.set(null);
    this.form.reset({
      unitCourseCode: '',
      courseType: '',
      seq: null,
      description: '',
      completionMinutes: null,
      hasFloodlight: false,
      floodlightLeadMinutes: null,
      remarks: '',
    });
    this.syncFloodlight(false);
    this.dialogOpen.set(true);
  }

  openEdit(c: UnitCourse): void {
    this.clearMessages();
    this.editId.set(c.id);
    this.form.reset({
      unitCourseCode: c.unitCourseCode,
      courseType: c.courseType,
      seq: c.seq ?? null,
      description: c.description || '',
      completionMinutes: c.completionMinutes ?? null,
      hasFloodlight: c.hasFloodlight === true,
      floodlightLeadMinutes: c.floodlightLeadMinutes ?? null,
      remarks: c.remarks || '',
    });
    this.syncFloodlight(c.hasFloodlight === true);
    this.dialogOpen.set(true);
  }

  closeDialog(): void {
    this.dialogOpen.set(false);
  }

  onSave(): void {
    this.clearMessages();
    if (this.form.invalid) {
      this.form.markAllAsTouched(); // reveal every field's error at once
      return;
    }
    const f = this.form.getRawValue();
    const payload: Partial<UnitCourse> = {
      unitCourseCode: f.unitCourseCode.trim(),
      courseType: f.courseType,
      seq: f.seq,
      description: f.description.trim() || null,
      completionMinutes: f.completionMinutes,
      hasFloodlight: f.hasFloodlight,
      floodlightLeadMinutes: f.hasFloodlight ? f.floodlightLeadMinutes : null,
      remarks: f.remarks.trim() || null,
    };

    this.saving.set(true);
    const id = this.editId();
    const request = id ? this.service.update(id, payload) : this.service.create(payload);
    request.subscribe({
      next: (res) => {
        this.successMessage.set(`${payload.unitCourseCode} ${id ? 'updated' : 'added'}.`);
        this.saving.set(false);
        this.dialogOpen.set(false);
        this.returnScroll.remember(GolfUnitCoursesComponent.LIST_PATH, res.unitCourse.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || `Failed to ${id ? 'update' : 'add'} unit course.`);
        this.saving.set(false);
      },
    });
  }

  toggleActive(c: UnitCourse): void {
    this.clearMessages();
    const next = !(c.isActive !== false);
    this.togglingId.set(c.id);
    this.service.update(c.id, { isActive: next }).subscribe({
      next: () => {
        this.successMessage.set(`${c.unitCourseCode} ${next ? 'enabled' : 'disabled'}.`);
        this.togglingId.set(null);
        this.returnScroll.remember(GolfUnitCoursesComponent.LIST_PATH, c.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update unit course.');
        this.togglingId.set(null);
      },
    });
  }

  // --- Delete (mis-keyed nine; refused server-side while a course uses it) ---
  readonly deleteTarget = signal<UnitCourse | null>(null);
  readonly deleting = signal(false);

  askDelete(c: UnitCourse): void {
    this.clearMessages();
    this.deleteTarget.set(c);
  }

  confirmDelete(): void {
    const c = this.deleteTarget();
    if (!c) return;
    this.deleting.set(true);
    this.service.delete(c.id).subscribe({
      next: (res) => {
        this.deleting.set(false);
        this.deleteTarget.set(null);
        this.successMessage.set(res.message);
        this.load();
      },
      error: (err) => {
        this.deleting.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to delete unit course.');
      },
    });
  }

  // --- Holes dialog (spec 2.2.2) ---

  // The hole-number range for a course type - from /meta, falling back to the
  // baked-in copy of the same table if meta hasn't loaded.
  private holeRange(courseType: string): { from: number; to: number } {
    const t = this.types().find((x) => x.key === courseType);
    if (t) return { from: t.holeFrom, to: t.holeTo };
    return FALLBACK_RANGES[courseType] || { from: 1, to: 9 };
  }

  readonly parOptions = PAR_OPTIONS;
  readonly seqOptions = SEQ_OPTIONS;

  holesHint(c: UnitCourse | null): string {
    if (!c) return '';
    const r = this.holeRange(c.courseType);
    return `${this.typeLabel(c.courseType)} unit course — holes ${r.from}–${r.to}. Numbering is fixed by the type; set par, handicap index (HCP) and remarks per hole.`;
  }

  // HCP choices for a hole: front-nine holes (1-9) take the ODD indexes,
  // back-nine holes (10-18) the EVEN ones - so an OUT+IN pairing yields a
  // complete 1-18 set. Mirrors the API's validation.
  hcpOptions(holeNumber: number): number[] {
    const wantOdd = holeNumber <= 9;
    const options: number[] = [];
    for (let n = wantOdd ? 1 : 2; n <= 18; n += 2) options.push(n);
    return options;
  }

  openHoles(c: UnitCourse): void {
    this.clearMessages();
    this.holesCourse.set(c);
    this.holesDirty.set(false);
    this.holeRows.set([]);
    this.holesOpen.set(true);
    this.holesLoading.set(true);
    this.service.holes(c.id).subscribe({
      next: (saved) => {
        const byNumber = new Map(saved.map((h) => [h.holeNumber, h]));
        const r = this.holeRange(c.courseType);
        const rows: HoleRow[] = [];
        for (let n = r.from; n <= r.to; n++) {
          const h = byNumber.get(n);
          rows.push({
            holeNumber: n,
            // New (never-saved) rows default to par 4; saved rows show what's stored.
            par: h ? (h.par != null ? String(h.par) : '') : '4',
            handicapIndex: h && h.handicapIndex != null ? String(h.handicapIndex) : '',
            remarks: h?.remarks || '',
          });
        }
        this.holeRows.set(rows);
        this.holesLoading.set(false);
      },
      error: (err) => {
        this.holesLoading.set(false);
        this.holesOpen.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load holes.');
      },
    });
  }

  closeHoles(): void {
    this.holesOpen.set(false);
  }

  updateHole(index: number, field: 'par' | 'handicapIndex' | 'remarks', value: string): void {
    this.holeRows.update((rows) => rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
    this.holesDirty.set(true);
  }

  onSaveHoles(): void {
    this.clearMessages();
    const course = this.holesCourse();
    if (!course) return;

    // Quick client-side pass for immediate feedback; the API re-validates.
    const holes: UnitCourseHole[] = [];
    for (const r of this.holeRows()) {
      const par = r.par.trim() === '' ? null : Number(r.par);
      if (par !== null && !PAR_OPTIONS.includes(par)) {
        this.errorMessage.set(`Hole ${r.holeNumber}: par must be 3, 4 or 5.`);
        return;
      }
      const handicapIndex = r.handicapIndex.trim() === '' ? null : Number(r.handicapIndex);
      if (handicapIndex !== null && !this.hcpOptions(r.holeNumber).includes(handicapIndex)) {
        this.errorMessage.set(
          `Hole ${r.holeNumber}: handicap index must be ${r.holeNumber <= 9 ? 'an ODD number (1-17)' : 'an EVEN number (2-18)'}.`,
        );
        return;
      }
      holes.push({ holeNumber: r.holeNumber, par, handicapIndex, remarks: r.remarks.trim() || null });
    }

    this.holesSaving.set(true);
    this.service.saveHoles(course.id, holes).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.holesSaving.set(false);
        this.holesDirty.set(false);
        this.holesOpen.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save holes.');
        this.holesSaving.set(false);
      },
    });
  }

  // --- Tee boxes dialog (spec 2.2.3) ---

  private emptyDistanceCells(courseType: string): Record<number, string> {
    const cells: Record<number, string> = {};
    const r = this.holeRange(courseType);
    for (let n = r.from; n <= r.to; n++) cells[n] = '';
    return cells;
  }

  // The dialog's hole numbers, chunked scorecard-style into nines (a COMPOSITE
  // course shows its front and back context as two rows of 9).
  teeHoleChunks(c: UnitCourse | null): number[][] {
    if (!c) return [];
    const r = this.holeRange(c.courseType);
    const all: number[] = [];
    for (let n = r.from; n <= r.to; n++) all.push(n);
    const chunks: number[][] = [];
    for (let i = 0; i < all.length; i += 9) chunks.push(all.slice(i, i + 9));
    return chunks;
  }

  // Sum of a tee's entered distances (the scorecard's out/in/total cell).
  teeTotal(row: TeeBoxRow, holes: number[]): number {
    return holes.reduce((sum, n) => {
      const d = Number(row.distances[n]);
      return sum + (Number.isInteger(d) && d > 0 ? d : 0);
    }, 0);
  }

  // Grand total across every hole (shown when a COMPOSITE tee has two nines).
  teeGrandTotal(row: TeeBoxRow): number {
    return this.teeTotal(row, Object.keys(row.distances).map(Number));
  }

  openTees(c: UnitCourse): void {
    this.clearMessages();
    this.teesCourse.set(c);
    this.teesDirty.set(false);
    this.teeRows.set([]);
    this.teesOpen.set(true);
    this.teesLoading.set(true);
    this.service.teeBoxes(c.id).subscribe({
      next: (saved) => {
        const rows: TeeBoxRow[] = saved.map((b) => {
          const distances = this.emptyDistanceCells(c.courseType);
          for (const d of b.Distances || []) {
            if (d.holeNumber in distances) distances[d.holeNumber] = String(d.distance);
          }
          return {
            colorCode: b.colorCode,
            seq: b.seq != null ? String(b.seq) : '',
            colorHex: b.colorHex || '#000000',
            description: b.description || '',
            measurementUnit: b.measurementUnit || 'meter',
            distances,
          };
        });
        this.teeRows.set(rows);
        this.teesLoading.set(false);
      },
      error: (err) => {
        this.teesLoading.set(false);
        this.teesOpen.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load tee boxes.');
      },
    });
  }

  closeTees(): void {
    this.teesOpen.set(false);
  }

  addTeeRow(): void {
    const courseType = this.teesCourse()?.courseType || 'out';
    this.teeRows.update((rows) => [
      ...rows,
      {
        colorCode: '',
        seq: '',
        colorHex: '#000000',
        description: '',
        measurementUnit: 'meter',
        distances: this.emptyDistanceCells(courseType),
      },
    ]);
    this.teesDirty.set(true);
  }

  removeTeeRow(index: number): void {
    this.teeRows.update((rows) => rows.filter((_, i) => i !== index));
    this.teesDirty.set(true);
  }

  updateTee(index: number, field: 'colorCode' | 'seq' | 'colorHex' | 'description' | 'measurementUnit', value: string): void {
    this.teeRows.update((rows) => rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
    this.teesDirty.set(true);
  }

  updateTeeDistance(index: number, holeNumber: number, value: string): void {
    this.teeRows.update((rows) =>
      rows.map((r, i) => (i === index ? { ...r, distances: { ...r.distances, [holeNumber]: value } } : r)),
    );
    this.teesDirty.set(true);
  }

  onSaveTees(): void {
    this.clearMessages();
    const course = this.teesCourse();
    if (!course) return;

    // Quick client-side pass for immediate feedback; the API re-validates.
    const teeBoxes: UnitCourseTeeBox[] = [];
    const seen = new Set<string>();
    for (const r of this.teeRows()) {
      const colorCode = r.colorCode.trim().toUpperCase();
      if (!colorCode) {
        this.errorMessage.set('Every tee box needs a colour code.');
        return;
      }
      if (seen.has(colorCode)) {
        this.errorMessage.set(`Tee box colour '${colorCode}' appears more than once.`);
        return;
      }
      seen.add(colorCode);

      const seq = r.seq.trim() === '' ? null : Number(r.seq);
      if (seq !== null && !SEQ_OPTIONS.includes(seq)) {
        this.errorMessage.set(`Tee box '${colorCode}': number must be between 1 and 5.`);
        return;
      }

      const distances = [];
      for (const key of Object.keys(r.distances)) {
        const holeNumber = Number(key);
        const raw = r.distances[holeNumber].trim();
        if (raw === '') continue;
        const distance = Number(raw);
        if (!Number.isInteger(distance) || distance < 1 || distance > 2000) {
          this.errorMessage.set(`Tee box '${colorCode}', hole ${holeNumber}: distance must be between 1 and 2000.`);
          return;
        }
        distances.push({ holeNumber, distance });
      }

      teeBoxes.push({
        colorCode,
        seq,
        colorHex: r.colorHex || null,
        description: r.description.trim() || null,
        measurementUnit: r.measurementUnit || 'meter',
        distances,
      });
    }

    this.teesSaving.set(true);
    this.service.saveTeeBoxes(course.id, teeBoxes).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.teesSaving.set(false);
        this.teesDirty.set(false);
        this.teesOpen.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save tee boxes.');
        this.teesSaving.set(false);
      },
    });
  }

  // --- Closure plans (per nine, spec 2.2.8) ---

  // 'HH:MM' from a stored 'HH:MM:SS' (or '' when unset).
  hhmm(t: string | null | undefined): string {
    return t ? String(t).slice(0, 5) : '';
  }

  scopeLabel(key: string): string {
    return this.dayScopes().find((s) => s.key === key)?.label || key;
  }

  // '07:00 – 12:00' for a plan or day row, 'All day' when both times unset.
  closureWindow(startTime: string | null | undefined, endTime: string | null | undefined): string {
    const s = this.hhmm(startTime);
    const e = this.hhmm(endTime);
    return s && e ? `${s} – ${e}` : 'All day';
  }

  openClosures(c: UnitCourse): void {
    this.clearMessages();
    this.ccNine.set(c);
    this.ccPlans.set([]);
    this.ccMode.set('list');
    this.ccOpen.set(true);
    this.reloadPlans();
  }

  closeClosures(): void {
    this.ccOpen.set(false);
    this.ccMode.set('list');
    this.ccDaysDirty.set(false);
    this.ccAlsoNines.set(new Set());
  }

  // Return to the list view inside the open dialog.
  ccBackToList(): void {
    this.ccMode.set('list');
    this.ccDaysDirty.set(false);
    this.ccAlsoNines.set(new Set());
  }

  private reloadPlans(): void {
    const c = this.ccNine();
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

  dayCount(p: UnitCourseClosurePlan): number {
    return p.Days?.length || 0;
  }

  // --- Plan form (a view inside the open dialog) ---

  openPlanForm(p?: UnitCourseClosurePlan): void {
    this.clearMessages();
    this.ccEditPlanId.set(p?.id || null);
    this.ccAlsoNines.set(new Set());
    this.ccForm.reset({
      description: p?.description || '',
      dayScope: p?.dayScope || 'all',
      dateFrom: p?.dateFrom || '',
      dateTo: p?.dateTo || '',
      startTime: this.hhmm(p?.startTime),
      endTime: this.hhmm(p?.endTime),
    });
    this.ccMode.set('form');
  }

  toggleAlsoNine(id: string): void {
    this.ccAlsoNines.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
    const nine = this.ccNine();
    if (!nine) return;

    const payload: Partial<UnitCourseClosurePlan> & { alsoUnitCourseIds?: string[] } = {
      description: f.description.trim(),
      dayScope: f.dayScope,
      dateFrom: f.dateFrom,
      dateTo: f.dateTo,
      startTime: f.startTime || null,
      endTime: f.endTime || null,
    };

    this.ccSaving.set(true);
    const id = this.ccEditPlanId();
    if (!id && this.ccAlsoNines().size) payload.alsoUnitCourseIds = [...this.ccAlsoNines()];
    const request = id
      ? this.service.updateClosurePlan(nine.id, id, payload)
      : this.service.createClosurePlan(nine.id, payload);
    request.subscribe({
      next: (res) => {
        this.successMessage.set(res.message || `Closure plan ${id ? 'updated' : 'added'}.`);
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

  togglePlanActive(p: UnitCourseClosurePlan): void {
    this.clearMessages();
    const nine = this.ccNine();
    if (!nine) return;
    const next = !(p.isActive !== false);
    this.ccTogglingId.set(p.id);
    this.service.updateClosurePlan(nine.id, p.id, { isActive: next }).subscribe({
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

  openDays(p: UnitCourseClosurePlan): void {
    this.clearMessages();
    this.ccDayPlan.set(p);
    this.ccDaysDirty.set(false);
    this.dayRows.set(
      (p.Days || []).map((d) => ({
        closureDate: d.closureDate,
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
    const nine = this.ccNine();
    const plan = this.ccDayPlan();
    if (!nine || !plan) return;
    this.clearMessages();
    this.ccGenerating.set(true);
    this.service.generateClosureDays(nine.id, plan.id).subscribe({
      next: (res) => {
        this.dayRows.set(
          res.days.map((d) => ({
            closureDate: d.closureDate,
            dayType: d.dayType,
            isHoliday: d.isHoliday,
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

  updateDay(index: number, field: 'startTime' | 'endTime', value: string): void {
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
    const nine = this.ccNine();
    const plan = this.ccDayPlan();
    if (!nine || !plan) return;

    // Quick client-side pass for immediate feedback; the API re-validates.
    const days: UnitCourseClosureDay[] = [];
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
        startTime: r.startTime || null,
        endTime: r.endTime || null,
        isActive: r.isActive,
      });
    }

    this.ccDaysSaving.set(true);
    this.service.saveClosureDays(nine.id, plan.id, days).subscribe({
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
