import { Component, Injector, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AbstractControl, FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import {
  ClosureClassSession,
  ClosureTypeOption,
  ClosureUnitOption,
  FacilityClosureDay,
  FacilityClosurePlan,
  FacilityClosureService,
} from '../services/facility-closure.service';
import { ScrollReturnService } from '../services/scroll-return.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { LocalDatePipe, formatLocalDate } from '../shared/local-date.pipe';
import { MembershipStatusOption } from '../models/auth.models';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { OverflowMenuComponent } from '../shared/overflow-menu/overflow-menu';
import { MenuItemDirective } from '../shared/overflow-menu/menu-item.directive';
import { CanDirective } from '../shared/can.directive';
import { ConfirmDialogComponent, ConfirmRequest } from '../shared/confirm-dialog/confirm-dialog';

// One closure-day row in the day editor (house standard: typed FormArray rows;
// the array's dirty state feeds the dialog's guard).
type ClosureDayGroup = FormGroup<{
  closureDate: FormControl<string>; // 'YYYY-MM-DD'
  dayType: FormControl<'weekday' | 'weekend' | ''>;
  isHoliday: FormControl<boolean>;
  startTime: FormControl<string>; // 'HH:MM' or '' (whole day when both empty)
  endTime: FormControl<string>;
  isActive: FormControl<boolean>;
}>;

// Day scopes are a short FIXED vocabulary (facility.constants).
const DAY_SCOPES: MembershipStatusOption[] = [
  { key: 'all', label: 'All days' },
  { key: 'weekday', label: 'Weekdays' },
  { key: 'weekend', label: 'Weekends' },
];

// Facility Management → Facility Closures (/facility/closures; structure
// approved 2026-10-25; the golf Course Closure pattern). One listing of every
// closure plan across all types and units - its own menu, so maintenance
// schedulers never need the setup screens. A plan closes a facility TYPE: one
// unit, or every unit of the type when none is picked (tournament, pool
// cleaning); ticking several units fans the same header out, one plan each.
// ONE drawer dialog with two views (plan form / generated-day editor).
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-facility-closures',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent,
    OverflowMenuComponent, MenuItemDirective, CanDirective, LocalDatePipe, ConfirmDialogComponent],
  templateUrl: './facility-closures.html',
  styleUrls: ['./facility-closures.css'],
})
export class FacilityClosuresComponent implements OnInit {
  private readonly service = inject(FacilityClosureService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private static readonly LIST_PATH = '/facility/closures';

  readonly plans = signal<FacilityClosurePlan[]>([]);
  readonly types = signal<ClosureTypeOption[]>([]);
  readonly units = signal<ClosureUnitOption[]>([]);
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);
  readonly confirmAction = signal<ConfirmRequest | null>(null);

  readonly dayScopes = DAY_SCOPES;

  readonly search = signal('');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const sorted = [...this.plans()].sort((a, b) => {
      const aActive = a.isActive !== false;
      const bActive = b.isActive !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return 0;
    });
    if (!q) return sorted;
    return sorted.filter((p) =>
      p.description.toLowerCase().includes(q)
      || (p.facilityType?.code || '').toLowerCase().includes(q)
      || (p.facilityType?.description || '').toLowerCase().includes(q)
      || (p.facility?.code || '').toLowerCase().includes(q)
      || (p.facility?.name || '').toLowerCase().includes(q)
      || p.dateFrom.includes(q) || p.dateTo.includes(q));
  });
  readonly activeCount = computed(() => this.plans().filter((p) => p.isActive !== false).length);

  // --- The ONE drawer dialog: 'form' (create/edit header) | 'days' editor ---
  readonly dlgMode = signal<'form' | 'days' | null>(null);
  readonly saving = signal(false);
  readonly editPlan = signal<FacilityClosurePlan | null>(null);
  readonly form = this.fb.nonNullable.group({
    facilityTypeId: ['', [Validators.required]],
    description: ['', [Validators.required, Validators.maxLength(255)]],
    dayScope: ['all', [Validators.required]],
    dateFrom: ['', [Validators.required]],
    dateTo: ['', [Validators.required]],
    startTime: [''],
    endTime: [''],
  });
  // Create only: the units to close; none ticked = the whole type.
  readonly pickedUnits = signal<Set<string>>(new Set());
  // The type the create form names (drives the unit list) - mirrored into a
  // signal from the select's change so the template re-renders zonelessly.
  readonly pickedTypeId = signal('');
  readonly unitsOfPickedType = computed(() => this.units().filter((u) => u.facilityTypeId === this.pickedTypeId()));

  readonly daysSaving = signal(false);
  readonly generating = signal(false);
  readonly dayPlan = signal<FacilityClosurePlan | null>(null);
  // Slice 5c: the scheduled class sessions the generated days would cover
  // (saving cancels them); cleared with the dialog.
  readonly classSessionsHit = signal<ClosureClassSession[]>([]);
  readonly dayLines: FormArray<ClosureDayGroup> = this.fb.array<ClosureDayGroup>([]);
  readonly daysForm = this.fb.group({ days: this.dayLines });

  readonly dialogTitle = computed(() => {
    if (this.dlgMode() === 'days') {
      const p = this.dayPlan();
      return p ? `Closure days - ${this.targetCode(p)} · ${p.description}` : 'Closure days';
    }
    const p = this.editPlan();
    return p ? `Edit closure plan - ${this.targetCode(p)}` : 'New closure plan';
  });
  readonly busy = computed(() => this.saving() || this.daysSaving() || this.generating());

  isDirty(): boolean {
    if (this.dlgMode() === 'form') return this.form.dirty || this.pickedUnits().size > 0;
    if (this.dlgMode() === 'days') return this.dayLines.dirty;
    return false;
  }

  ngOnInit(): void {
    // Arriving from a Facilities row's "Closures": open the create form with
    // that unit preselected once the pickers have loaded.
    const qp = this.route.snapshot.queryParamMap;
    const presetType = qp.get('facilityTypeId');
    const presetUnit = qp.get('facilityId');
    this.load(() => {
      if (presetType) {
        this.openAdd();
        this.setPickedType(presetType);
        if (presetUnit && this.units().some((u) => u.id === presetUnit)) this.pickedUnits.set(new Set([presetUnit]));
        this.router.navigate([], { queryParams: {}, replaceUrl: true });
      }
    });
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  // 'TENNIS' for a type-wide plan, 'TC3' for a unit plan.
  targetCode(p: FacilityClosurePlan): string {
    return p.facility?.code || p.facilityType?.code || '';
  }

  targetLabel(p: FacilityClosurePlan): string {
    if (p.facility) return `${p.facility.code} - ${p.facility.name}`;
    return p.facilityType ? `Every ${p.facilityType.description} facility` : '';
  }

  scopeLabel(key: string): string {
    return this.dayScopes.find((s) => s.key === key)?.label || key;
  }

  // '07:00 - 12:00' for a plan or day row, 'All day' when both times unset.
  closureWindow(startTime: string | null | undefined, endTime: string | null | undefined): string {
    return startTime && endTime ? `${startTime} - ${endTime}` : 'All day';
  }

  dayCount(p: FacilityClosurePlan): number {
    return p.days?.length || 0;
  }

  load(after?: () => void): void {
    this.loading.set(true);
    this.service.list().subscribe({
      next: (data) => {
        this.plans.set(data.plans);
        this.types.set(data.types);
        this.units.set(data.facilities);
        this.loading.set(false);
        this.returnScroll.consume(FacilityClosuresComponent.LIST_PATH, this.injector);
        after?.();
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
    this.pickedUnits.set(new Set());
    this.pickedTypeId.set('');
    this.form.reset({ facilityTypeId: '', description: '', dayScope: 'all', dateFrom: '', dateTo: '', startTime: '', endTime: '' });
    this.form.controls.facilityTypeId.enable();
    this.dlgMode.set('form');
  }

  openEdit(p: FacilityClosurePlan): void {
    this.clearMessages();
    this.editPlan.set(p);
    this.pickedUnits.set(new Set());
    this.pickedTypeId.set(p.facilityTypeId);
    this.form.reset({
      facilityTypeId: p.facilityTypeId,
      description: p.description,
      dayScope: p.dayScope,
      dateFrom: p.dateFrom,
      dateTo: p.dateTo,
      startTime: p.startTime || '',
      endTime: p.endTime || '',
    });
    this.form.controls.facilityTypeId.disable();
    this.dlgMode.set('form');
  }

  setPickedType(id: string): void {
    this.form.controls.facilityTypeId.setValue(id);
    this.form.controls.facilityTypeId.markAsDirty();
    this.pickedTypeId.set(id);
    this.pickedUnits.set(new Set());
  }

  toggleUnit(id: string): void {
    this.pickedUnits.update((set) => {
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
    this.pickedUnits.set(new Set());
    this.classSessionsHit.set([]);
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
    this.saving.set(true);
    const done = (message: string, returnId: string | null) => {
      this.successMessage.set(message || `Closure plan ${editing ? 'updated' : 'added'}.`);
      this.saving.set(false);
      this.form.markAsPristine();
      this.closeDialog();
      if (returnId) this.returnScroll.remember(FacilityClosuresComponent.LIST_PATH, returnId);
      this.load();
    };
    const fail = (err: { error?: { message?: string } }) => {
      this.errorMessage.set(err.error?.message || `Failed to ${editing ? 'update' : 'add'} the closure plan.`);
      this.saving.set(false);
    };
    if (editing) {
      this.service.update(editing.id, header).subscribe({ next: (res) => done(res.message, editing.id), error: fail });
    } else {
      this.service.create({ ...header, facilityTypeId: f.facilityTypeId, facilityIds: [...this.pickedUnits()] })
        .subscribe({ next: (res) => done(res.message, res.plans[0]?.id || null), error: fail });
    }
  }

  toggleActive(p: FacilityClosurePlan): void {
    this.clearMessages();
    const next = !(p.isActive !== false);
    this.togglingId.set(p.id);
    this.service.update(p.id, { isActive: next }).subscribe({
      next: () => {
        this.successMessage.set(`Closure plan ${next ? 'enabled' : 'disabled'}.`);
        this.togglingId.set(null);
        this.returnScroll.remember(FacilityClosuresComponent.LIST_PATH, p.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update the closure plan.');
        this.togglingId.set(null);
      },
    });
  }

  askDelete(p: FacilityClosurePlan): void {
    this.clearMessages();
    this.confirmAction.set({
      title: 'Delete closure plan',
      message: `Delete "${p.description}" on ${this.targetLabel(p)} with its ${this.dayCount(p)} closure day${this.dayCount(p) === 1 ? '' : 's'}? The slots reopen for booking. This cannot be undone.`,
      confirmLabel: 'Delete closure plan',
      run: () => {
        this.confirmAction.set(null);
        this.togglingId.set(p.id);
        this.service.remove(p.id).subscribe({
          next: (res) => {
            this.togglingId.set(null);
            this.successMessage.set(res.message);
            this.load();
          },
          error: (err) => {
            this.togglingId.set(null);
            this.errorMessage.set(err.error?.message || 'Failed to delete the closure plan.');
          },
        });
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

  private setDayLines(rows: Parameters<FacilityClosuresComponent['newDayGroup']>[0][], dirty: boolean): void {
    this.dayLines.clear();
    for (const r of rows) this.dayLines.push(this.newDayGroup(r));
    if (dirty) this.dayLines.markAsDirty();
    else this.dayLines.markAsPristine();
  }

  openDays(p: FacilityClosurePlan): void {
    this.clearMessages();
    this.dayPlan.set(p);
    this.setDayLines(
      (p.days || []).map((d) => ({ closureDate: d.closureDate, startTime: d.startTime || '', endTime: d.endTime || '', isActive: d.isActive !== false })),
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
          res.days.map((d) => ({ closureDate: d.closureDate, dayType: d.dayType, isHoliday: d.isHoliday, startTime: d.startTime || '', endTime: d.endTime || '', isActive: true })),
          true,
        );
        this.classSessionsHit.set(res.classSessions || []);
        this.generating.set(false);
        if (!res.days.length) this.errorMessage.set('No days in the period match the plan\'s day scope.');
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
    const days: FacilityClosureDay[] = [];
    for (const r of this.dayLines.controls.map((g) => g.getRawValue())) {
      if (!r.startTime !== !r.endTime) {
        this.errorMessage.set(`${formatLocalDate(r.closureDate)}: set both closure times, or leave both empty for a whole-day closure.`);
        return;
      }
      if (r.startTime && r.endTime && r.startTime >= r.endTime) {
        this.errorMessage.set(`${formatLocalDate(r.closureDate)}: closure end time must be after the start time.`);
        return;
      }
      days.push({ closureDate: r.closureDate, startTime: r.startTime || null, endTime: r.endTime || null, isActive: r.isActive });
    }
    this.daysSaving.set(true);
    this.service.saveDays(plan.id, days).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.daysSaving.set(false);
        this.closeDialog();
        this.returnScroll.remember(FacilityClosuresComponent.LIST_PATH, plan.id);
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
