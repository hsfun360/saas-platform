import { Component, Injector, OnInit, computed, inject, signal } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { GolfClosureService, ClosureNineOption } from '../services/golf-closure.service';
import { ScrollReturnService } from '../services/scroll-return.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { LocalDatePipe, formatLocalDate } from '../shared/local-date.pipe';
import { MembershipStatusOption, UnitCourseClosureDay, UnitCourseClosurePlan } from '../models/auth.models';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { OverflowMenuComponent, MenuItemDirective } from '../shared/overflow-menu/overflow-menu';
import { CanDirective } from '../shared/can.directive';

// One closure-day row in the day editor: a typed FormGroup inside the
// `dayLines` FormArray (house standard - the array's own dirty/pristine state
// feeds the dialog's unsaved-changes guard, no hand-kept flag).
type ClosureDayGroup = FormGroup<{
  closureDate: FormControl<string>; // 'YYYY-MM-DD'
  dayType: FormControl<'weekday' | 'weekend' | ''>;
  isHoliday: FormControl<boolean>;
  startTime: FormControl<string>; // 'HH:MM' or '' (whole day when both empty)
  endTime: FormControl<string>;
  isActive: FormControl<boolean>;
}>;

// Day scopes are a short FIXED vocabulary (courseTeeTime.constants).
const DAY_SCOPES: MembershipStatusOption[] = [
  { key: 'all', label: 'All days' },
  { key: 'weekday', label: 'Weekdays' },
  { key: 'weekend', label: 'Weekends' },
];

// Golf Management → Course Closure (spec 2.2.8; STANDALONE MENU 2026-09-30).
// One listing of every closure plan across ALL nines - grantable on its own,
// so maintenance schedulers never need the Unit Course setup screen. A plan
// closes ONE physical nine (every course that tees off on or crosses onto it
// is blocked); the create dialog's nine multi-select fans the same header
// out, one plan per ticked nine. ONE drawer dialog with two views (plan form
// / generated-day editor), the single-dialog pattern.
@Component({
  selector: 'app-golf-closures',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent,
    OverflowMenuComponent, MenuItemDirective, CanDirective, LocalDatePipe],
  templateUrl: './golf-closures.html',
  styleUrls: ['../system-setup/system-setup.css', './golf-closures.css'],
})
export class GolfClosuresComponent implements OnInit {
  private readonly service = inject(GolfClosureService);
  private readonly fb = inject(FormBuilder);
  // After-save return-to-row (app standard): the list re-sorts on reload, so
  // the saved/toggled card is scrolled back into view and flashed.
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private static readonly LIST_PATH = '/golf/closures';

  readonly plans = signal<UnitCourseClosurePlan[]>([]);
  readonly nines = signal<ClosureNineOption[]>([]);
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);

  readonly dayScopes = DAY_SCOPES;

  readonly search = signal('');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    // Active first; the server already orders by period (newest first).
    const sorted = [...this.plans()].sort((a, b) => {
      const aActive = a.isActive !== false;
      const bActive = b.isActive !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return 0;
    });
    if (!q) return sorted;
    return sorted.filter(
      (p) =>
        p.description.toLowerCase().includes(q) ||
        (p.UnitCourse?.unitCourseCode || '').toLowerCase().includes(q) ||
        (p.UnitCourse?.description || '').toLowerCase().includes(q) ||
        p.dateFrom.includes(q) || p.dateTo.includes(q),
    );
  });
  readonly activeCount = computed(() => this.plans().filter((p) => p.isActive !== false).length);

  // --- The ONE drawer dialog: 'form' (create/edit header) | 'days' editor ---
  readonly dlgMode = signal<'form' | 'days' | null>(null);
  readonly saving = signal(false);
  readonly editPlan = signal<UnitCourseClosurePlan | null>(null);
  readonly form = this.fb.nonNullable.group({
    description: ['', [Validators.required, Validators.maxLength(255)]],
    dayScope: ['all', [Validators.required]],
    dateFrom: ['', [Validators.required]],
    dateTo: ['', [Validators.required]],
    startTime: [''],
    endTime: [''],
  });
  // Create only: the nines to close - the same header fans out, one plan per
  // ticked nine (e.g. tick all nines for a whole-club shutdown).
  readonly pickedNines = signal<Set<string>>(new Set());

  readonly daysSaving = signal(false);
  readonly generating = signal(false);
  readonly dayPlan = signal<UnitCourseClosurePlan | null>(null);
  // The day editor's rows (see ClosureDayGroup); wrapped in a FormGroup so the
  // template can bind formArrayName / formGroupName.
  readonly dayLines: FormArray<ClosureDayGroup> = this.fb.array<ClosureDayGroup>([]);
  readonly daysForm = this.fb.group({ days: this.dayLines });

  readonly dialogTitle = computed(() => {
    if (this.dlgMode() === 'days') {
      const p = this.dayPlan();
      return p ? `Closure days — ${this.nineCode(p)} · ${p.description}` : 'Closure days';
    }
    const p = this.editPlan();
    return p ? `Edit closure plan — ${this.nineCode(p)}` : 'New closure plan';
  });
  readonly busy = computed(() => this.saving() || this.daysSaving() || this.generating());
  isDirty(): boolean {
    if (this.dlgMode() === 'form') return this.form.dirty || this.pickedNines().size > 0;
    if (this.dlgMode() === 'days') return this.dayLines.dirty;
    return false;
  }

  ngOnInit(): void {
    this.load();
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  nineCode(p: UnitCourseClosurePlan): string {
    return p.UnitCourse?.unitCourseCode || '';
  }

  nineLabel(p: UnitCourseClosurePlan): string {
    const u = p.UnitCourse;
    if (!u) return '';
    return u.description ? `${u.unitCourseCode} — ${u.description}` : u.unitCourseCode;
  }

  scopeLabel(key: string): string {
    return this.dayScopes.find((s) => s.key === key)?.label || key;
  }

  // 'HH:MM' from a stored 'HH:MM:SS' (or '' when unset).
  hhmm(t: string | null | undefined): string {
    return t ? String(t).slice(0, 5) : '';
  }

  // '07:00 – 12:00' for a plan or day row, 'All day' when both times unset.
  closureWindow(startTime: string | null | undefined, endTime: string | null | undefined): string {
    const s = this.hhmm(startTime);
    const e = this.hhmm(endTime);
    return s && e ? `${s} – ${e}` : 'All day';
  }

  dayCount(p: UnitCourseClosurePlan): number {
    return p.Days?.length || 0;
  }

  load(): void {
    this.loading.set(true);
    this.service.list().subscribe({
      next: (data) => {
        this.plans.set(data.plans);
        this.nines.set(data.nines);
        this.loading.set(false);
        this.returnScroll.consume(GolfClosuresComponent.LIST_PATH, this.injector);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load closure plans.');
      },
    });
  }

  // --- Plan form (create/edit) ---

  openAdd(): void {
    this.clearMessages();
    this.editPlan.set(null);
    this.pickedNines.set(new Set());
    this.form.reset({ description: '', dayScope: 'all', dateFrom: '', dateTo: '', startTime: '', endTime: '' });
    this.dlgMode.set('form');
  }

  openEdit(p: UnitCourseClosurePlan): void {
    this.clearMessages();
    this.editPlan.set(p);
    this.pickedNines.set(new Set());
    this.form.reset({
      description: p.description,
      dayScope: p.dayScope,
      dateFrom: p.dateFrom,
      dateTo: p.dateTo,
      startTime: this.hhmm(p.startTime),
      endTime: this.hhmm(p.endTime),
    });
    this.dlgMode.set('form');
  }

  toggleNine(id: string): void {
    this.pickedNines.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  closeDialog(): void {
    this.dlgMode.set(null);
    this.dayLines.clear();
    this.dayLines.markAsPristine();
    this.pickedNines.set(new Set());
  }

  onSave(): void {
    this.clearMessages();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const f = this.form.getRawValue();
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

    const header = {
      description: f.description.trim(),
      dayScope: f.dayScope,
      dateFrom: f.dateFrom,
      dateTo: f.dateTo,
      startTime: f.startTime || null,
      endTime: f.endTime || null,
    };

    const editing = this.editPlan();
    if (!editing && this.pickedNines().size === 0) {
      this.errorMessage.set('Pick at least one unit course to close.');
      return;
    }

    this.saving.set(true);
    const done = (message: string, returnId: string | null) => {
      this.successMessage.set(message || `Closure plan ${editing ? 'updated' : 'added'}.`);
      this.saving.set(false);
      this.form.markAsPristine();
      this.closeDialog();
      if (returnId) this.returnScroll.remember(GolfClosuresComponent.LIST_PATH, returnId);
      this.load();
    };
    const fail = (err: { error?: { message?: string } }) => {
      this.errorMessage.set(err.error?.message || `Failed to ${editing ? 'update' : 'add'} closure plan.`);
      this.saving.set(false);
    };
    if (editing) {
      this.service.update(editing.id, header).subscribe({ next: (res) => done(res.message, editing.id), error: fail });
    } else {
      this.service.create({ ...header, unitCourseIds: [...this.pickedNines()] })
        .subscribe({ next: (res) => done(res.message, res.plans[0]?.id || null), error: fail });
    }
  }

  toggleActive(p: UnitCourseClosurePlan): void {
    this.clearMessages();
    const next = !(p.isActive !== false);
    this.togglingId.set(p.id);
    this.service.update(p.id, { isActive: next }).subscribe({
      next: () => {
        this.successMessage.set(`Closure plan ${next ? 'enabled' : 'disabled'}.`);
        this.togglingId.set(null);
        this.returnScroll.remember(GolfClosuresComponent.LIST_PATH, p.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update closure plan.');
        this.togglingId.set(null);
      },
    });
  }

  // --- Day editor ---

  private newDayGroup(d: { closureDate: string; dayType?: 'weekday' | 'weekend'; isHoliday?: boolean; startTime: string; endTime: string; isActive: boolean }): ClosureDayGroup {
    return this.fb.nonNullable.group({
      closureDate: [d.closureDate],
      dayType: [d.dayType ?? ('' as const)],
      isHoliday: [d.isHoliday === true],
      startTime: [d.startTime],
      endTime: [d.endTime],
      isActive: [d.isActive],
    });
  }

  private setDayLines(rows: Parameters<GolfClosuresComponent['newDayGroup']>[0][], dirty: boolean): void {
    this.dayLines.clear();
    for (const r of rows) this.dayLines.push(this.newDayGroup(r));
    if (dirty) this.dayLines.markAsDirty();
    else this.dayLines.markAsPristine();
  }

  openDays(p: UnitCourseClosurePlan): void {
    this.clearMessages();
    this.dayPlan.set(p);
    this.setDayLines(
      (p.Days || []).map((d) => ({
        closureDate: d.closureDate,
        startTime: this.hhmm(d.startTime),
        endTime: this.hhmm(d.endTime),
        isActive: d.isActive !== false,
      })),
      false,
    );
    this.dlgMode.set('days');
  }

  // Ask the server to expand the plan into day rows (classified against the
  // company's weekend days + public holidays); fills the grid for review.
  generateDays(): void {
    const plan = this.dayPlan();
    if (!plan) return;
    this.clearMessages();
    this.generating.set(true);
    this.service.generateDays(plan.id).subscribe({
      next: (res) => {
        this.setDayLines(
          res.days.map((d) => ({
            closureDate: d.closureDate,
            dayType: d.dayType,
            isHoliday: d.isHoliday,
            startTime: this.hhmm(d.startTime),
            endTime: this.hhmm(d.endTime),
            isActive: true,
          })),
          true,
        );
        this.generating.set(false);
        if (!res.days.length) {
          this.errorMessage.set('No days in the period match the plan\'s day scope.');
        }
      },
      error: (err) => {
        this.generating.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to generate closure days.');
      },
    });
  }

  removeDay(index: number): void {
    this.dayLines.removeAt(index);
    this.dayLines.markAsDirty();
  }

  onSaveDays(): void {
    this.clearMessages();
    const plan = this.dayPlan();
    if (!plan) return;

    // Quick client-side pass for immediate feedback; the API re-validates.
    const days: UnitCourseClosureDay[] = [];
    for (const r of this.dayLines.controls.map((g) => g.getRawValue())) {
      if (!r.startTime !== !r.endTime) {
        this.errorMessage.set(`${formatLocalDate(r.closureDate)}: set both closure times, or leave both empty for a whole-day closure.`);
        return;
      }
      if (r.startTime && r.endTime && r.startTime >= r.endTime) {
        this.errorMessage.set(`${formatLocalDate(r.closureDate)}: closure end time must be after the start time.`);
        return;
      }
      days.push({
        closureDate: r.closureDate,
        startTime: r.startTime || null,
        endTime: r.endTime || null,
        isActive: r.isActive,
      });
    }

    this.daysSaving.set(true);
    this.service.saveDays(plan.id, days).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.daysSaving.set(false);
        this.closeDialog();
        this.returnScroll.remember(GolfClosuresComponent.LIST_PATH, plan.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save closure days.');
        this.daysSaving.set(false);
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
