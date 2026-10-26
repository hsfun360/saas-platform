import { Component, Injector, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import {
  ClassFeeItemOption,
  ClassInstructorOption,
  ClassVenueOption,
  EnrolmentMode,
  FacilityClass,
  FacilityClassPayload,
  FacilityClassSchedule,
  FacilityClassService,
  FacilityScheduleHeader,
  SchedulePreview,
} from '../services/facility-class.service';
import { ScrollReturnService } from '../services/scroll-return.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { ConfirmDialogComponent, ConfirmRequest } from '../shared/confirm-dialog/confirm-dialog';
import { CanDirective } from '../shared/can.directive';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { FieldInfoComponent } from '../shared/field-info/field-info';
import { ComboboxComponent } from '../shared/combobox/combobox';
import { OverflowMenuComponent } from '../shared/overflow-menu/overflow-menu';
import { MenuItemDirective } from '../shared/overflow-menu/menu-item.directive';
import { LocalDatePipe, formatLocalDate } from '../shared/local-date.pipe';

const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || dflt)));
const optInt = (v: unknown, lo: number, hi: number): number | null => (v === null || v === undefined || v === '' ? null : clampInt(v, lo, hi, lo));

// The device's short weekday names, Monday first (ISO 1..7); 2 Nov 2026 is a Monday.
const WEEKDAYS = Array.from({ length: 7 }, (_, i) => ({ iso: i + 1, label: new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(2026, 10, 2 + i)) }));

const MODE_LABELS: Record<EnrolmentMode, string> = { session: 'Per session', term: 'Per term' };

type DlgMode = 'form' | 'schedules' | 'scheduleForm' | 'preview' | 'cancelSchedule' | null;

// Facility Management → Classes (/facility/classes; slice 5, structure
// approved 2026-10-26). The programmes the club offers - code, description,
// the default venue and instructor, the capacity, ONE enrolment mode and the
// fee items - and each class's SCHEDULES: the recurrence header previewed
// into dated sessions (ok / skipped / conflict) before it is saved. ONE
// drawer dialog with five views (class form / schedules / schedule form /
// preview / cancel reason), the single-dialog pattern.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-facility-classes',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent,
    ConfirmDialogComponent, CanDirective, FieldInfoComponent, ComboboxComponent, OverflowMenuComponent, MenuItemDirective, LocalDatePipe],
  templateUrl: './facility-classes.html',
  styleUrls: ['../membership-types/membership-types.css', './facility-classes.css'],
})
export class FacilityClassesComponent implements OnInit {
  private readonly service = inject(FacilityClassService);
  private readonly fb = inject(FormBuilder);
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private static readonly LIST_PATH = '/facility/classes';

  readonly rows = signal<FacilityClass[]>([]);
  readonly venues = signal<ClassVenueOption[]>([]);
  readonly instructors = signal<ClassInstructorOption[]>([]);
  readonly feeItems = signal<ClassFeeItemOption[]>([]);
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);
  readonly search = signal('');
  readonly modeFilter = signal<EnrolmentMode | ''>('');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');
  readonly confirmAction = signal<ConfirmRequest | null>(null);
  readonly weekdays = WEEKDAYS;

  readonly venueOptions = computed(() => this.venues().filter((v) => v.isActive).map((v) => ({ value: v.id, label: `${v.code} - ${v.name} (${v.capacity} seats${v.facility ? ', ' + v.facility.code : ''})` })));
  readonly instructorOptions = computed(() => this.instructors().filter((i) => i.isActive).map((i) => ({ value: i.id, label: `${i.code} - ${i.name}` })));
  readonly feeOptions = computed(() => this.feeItems().filter((f) => f.isActive).map((f) => ({ value: f.id, label: f.description ? `${f.transactionType} - ${f.description}` : f.transactionType })));

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const mode = this.modeFilter();
    const sorted = [...this.rows()].sort((a, b) => {
      const aActive = a.isActive !== false;
      const bActive = b.isActive !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return (a.sortOrder - b.sortOrder) || a.code.localeCompare(b.code);
    });
    return sorted.filter((c) => (!mode || c.enrolmentMode === mode)
      && (!q || c.code.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || (c.venue?.code || '').toLowerCase().includes(q) || (c.instructor?.name || '').toLowerCase().includes(q)));
  });
  readonly activeCount = computed(() => this.rows().filter((c) => c.isActive !== false).length);

  readonly hint = {
    mode: 'Per session: a patron takes a seat in one session and the fee item is priced per session. Per term: a patron takes a seat in every session of a schedule and the fee item is priced per term. Frozen once the class has a schedule.',
    venue: 'The default venue and instructor of the class; a schedule or a single session may pick others. The capacity is the seats per session - blank takes the venue\'s, and it can never exceed the venue\'s.',
    fees: 'Class Fee transaction types, priced by their flat card: the member item and, when visitors pay more, a visitor item. Leave the member item blank for a free class. The items themselves live under Transaction Types.',
    visitors: 'Visitors enrol with a visitor profile, as a booking\'s visitor booker. Walk-ins let the Control Station enrol a patron into a session on the day, within the capacity.',
    notice: 'A seat cancelled closer than this to the session keeps its fee. Blank follows the Specification\'s class notice; 0 = no notice rule for this class.',
    schedule: 'A schedule runs the class on the ticked weekdays between its first and last day at one time. Preview the sessions first: dates the venue\'s facility is closed or that are public holidays are skipped, dates where the venue, the court or the instructor is already taken are left out as conflicts. Editing a schedule re-plans the future sessions that have no enrolments.',
  };

  // --- The ONE drawer dialog ---
  readonly dlgMode = signal<DlgMode>(null);
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);
  readonly editRow = signal<FacilityClass | null>(null);

  readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.maxLength(30), Validators.pattern(/^[A-Za-z0-9_-]+$/)]],
    description: ['', [Validators.required, Validators.maxLength(255)]],
    details: ['', [Validators.maxLength(4000)]],
    venueId: [''],
    instructorId: [''],
    capacity: this.fb.control<number | null>(null, [Validators.min(1), Validators.max(500)]),
    enrolmentMode: ['session' as EnrolmentMode, [Validators.required]],
    feeTransactionTypeId: [''],
    visitorFeeTransactionTypeId: [''],
    visitorsAllowed: [false],
    walkInAllowed: [true],
    cancellationNoticeHours: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(720)]),
    sortOrder: [100, [Validators.required, Validators.min(0), Validators.max(9999)]],
  });

  // --- Schedules of the open class ---
  readonly dlgClass = signal<FacilityClass | null>(null);
  readonly schedules = signal<FacilityClassSchedule[]>([]);
  readonly schedulesLoading = signal(false);
  readonly scheduleBusyId = signal<string | null>(null);
  readonly editSchedule = signal<FacilityClassSchedule | null>(null);
  readonly previewing = signal(false);
  readonly preview = signal<SchedulePreview | null>(null);
  readonly cancelTarget = signal<FacilityClassSchedule | null>(null);

  readonly scheduleForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    dateFrom: ['', [Validators.required]],
    dateTo: ['', [Validators.required]],
    d1: [true], d2: [false], d3: [true], d4: [false], d5: [false], d6: [false], d7: [false],
    startTime: ['', [Validators.required]],
    endTime: ['', [Validators.required]],
    venueId: [''],
    instructorId: [''],
    capacity: this.fb.control<number | null>(null, [Validators.min(1), Validators.max(500)]),
    skipClosures: [true],
    skipPublicHolidays: [true],
    termFeeNote: ['', [Validators.maxLength(255)]],
    remarks: ['', [Validators.maxLength(255)]],
  });
  readonly cancelForm = this.fb.nonNullable.group({ reason: ['', [Validators.required, Validators.maxLength(255)]] });

  readonly dialogTitle = computed(() => {
    const mode = this.dlgMode();
    const c = this.dlgClass();
    const code = c?.code || '';
    if (mode === 'schedules') return `Schedules - ${code}`;
    if (mode === 'scheduleForm') return this.editSchedule() ? `Edit schedule - ${code}` : `New schedule - ${code}`;
    if (mode === 'preview') return `Sessions preview - ${code}`;
    if (mode === 'cancelSchedule') return `Cancel schedule - ${code}`;
    return this.editId() ? 'Edit class' : 'New class';
  });
  readonly busy = computed(() => this.saving() || this.schedulesLoading() || this.previewing());

  isDirty(): boolean {
    switch (this.dlgMode()) {
      case 'form': return this.form.dirty;
      case 'scheduleForm': case 'preview': return this.scheduleForm.dirty;
      case 'cancelSchedule': return this.cancelForm.dirty;
      default: return false;
    }
  }

  ngOnInit(): void {
    this.load();
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  modeLabel(key: EnrolmentMode): string {
    return MODE_LABELS[key] || key;
  }

  // One-line summary for the listing card's subline.
  feeSummary(c: FacilityClass): string {
    if (!c.feeItem) return 'Free';
    const unit = c.enrolmentMode === 'term' ? 'per term' : 'per session';
    return c.visitorFeeItem ? `${c.feeItem.transactionType} ${unit}, visitors ${c.visitorFeeItem.transactionType}` : `${c.feeItem.transactionType} ${unit}`;
  }

  load(): void {
    this.loading.set(true);
    this.service.list().subscribe({
      next: (res) => {
        this.rows.set(res.classes);
        this.venues.set(res.venues);
        this.instructors.set(res.instructors);
        this.feeItems.set(res.feeItems);
        this.loading.set(false);
        this.returnScroll.consume(FacilityClassesComponent.LIST_PATH, this.injector);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load classes.');
      },
    });
  }

  // --- Class form ---

  private resetForm(c: FacilityClass | null): void {
    this.form.reset({
      code: c?.code || '',
      description: c?.description || '',
      details: c?.details || '',
      venueId: c?.venueId || '',
      instructorId: c?.instructorId || '',
      capacity: c?.capacity ?? null,
      enrolmentMode: c?.enrolmentMode || 'session',
      feeTransactionTypeId: c?.feeTransactionTypeId || '',
      visitorFeeTransactionTypeId: c?.visitorFeeTransactionTypeId || '',
      visitorsAllowed: c?.visitorsAllowed === true,
      walkInAllowed: c?.walkInAllowed !== false,
      cancellationNoticeHours: c?.cancellationNoticeHours ?? null,
      sortOrder: c?.sortOrder ?? 100,
    });
    if (c && c.scheduleCount > 0) this.form.controls.enrolmentMode.disable();
    else this.form.controls.enrolmentMode.enable();
  }

  modeFrozen(): boolean {
    return this.form.controls.enrolmentMode.disabled;
  }

  venueCapacityHint(): string {
    const id = this.form.controls.venueId.value;
    const v = id ? this.venues().find((x) => x.id === id) : null;
    return v ? `Blank = the venue's ${v.capacity}; never more than that.` : 'Blank = the venue\'s capacity.';
  }

  openAdd(): void {
    this.clearMessages();
    this.editId.set(null);
    this.editRow.set(null);
    this.resetForm(null);
    this.dlgMode.set('form');
  }

  openEdit(c: FacilityClass): void {
    this.clearMessages();
    this.editId.set(c.id);
    this.editRow.set(c);
    this.resetForm(c);
    this.dlgMode.set('form');
  }

  closeDialog(): void {
    this.dlgMode.set(null);
    this.dlgClass.set(null);
    this.preview.set(null);
    this.editSchedule.set(null);
    this.cancelTarget.set(null);
    this.scheduleForm.markAsPristine();
    this.cancelForm.markAsPristine();
  }

  onSave(): void {
    this.clearMessages();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const payload: FacilityClassPayload = {
      code: v.code.trim().toUpperCase(),
      description: v.description.trim(),
      details: v.details.trim() || null,
      venueId: v.venueId || null,
      instructorId: v.instructorId || null,
      capacity: optInt(v.capacity, 1, 500),
      enrolmentMode: v.enrolmentMode,
      feeTransactionTypeId: v.feeTransactionTypeId || null,
      visitorFeeTransactionTypeId: v.visitorsAllowed ? (v.visitorFeeTransactionTypeId || null) : null,
      visitorsAllowed: v.visitorsAllowed === true,
      walkInAllowed: v.walkInAllowed === true,
      cancellationNoticeHours: optInt(v.cancellationNoticeHours, 0, 720),
      sortOrder: clampInt(v.sortOrder, 0, 9999, 100),
    };
    if (this.modeFrozen()) delete payload.enrolmentMode;
    this.saving.set(true);
    const id = this.editId();
    const req$ = id ? this.service.update(id, payload) : this.service.create(payload);
    req$.subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.saving.set(false);
        this.form.markAsPristine();
        this.closeDialog();
        this.returnScroll.remember(FacilityClassesComponent.LIST_PATH, res.class.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save the class.');
        this.saving.set(false);
      },
    });
  }

  toggleActive(c: FacilityClass): void {
    this.clearMessages();
    const next = !(c.isActive !== false);
    this.togglingId.set(c.id);
    this.service.update(c.id, { isActive: next }).subscribe({
      next: () => {
        this.successMessage.set(`${c.code} ${next ? 'enabled' : 'disabled'}.`);
        this.togglingId.set(null);
        this.returnScroll.remember(FacilityClassesComponent.LIST_PATH, c.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update the class.');
        this.togglingId.set(null);
      },
    });
  }

  askDelete(c: FacilityClass): void {
    this.clearMessages();
    this.confirmAction.set({
      title: 'Delete class',
      message: c.scheduleCount > 0 || c.sessionCount > 0
        ? `${c.code} has ${c.scheduleCount} schedule${c.scheduleCount === 1 ? '' : 's'} and ${c.sessionCount} upcoming session${c.sessionCount === 1 ? '' : 's'} - disable it to keep it out of use.`
        : `Delete class ${c.code} (${c.description})? This cannot be undone.`,
      confirmLabel: 'Delete class',
      run: () => {
        this.confirmAction.set(null);
        this.togglingId.set(c.id);
        this.service.remove(c.id).subscribe({
          next: (res) => {
            this.togglingId.set(null);
            this.successMessage.set(res.message);
            this.load();
          },
          error: (err) => {
            this.togglingId.set(null);
            this.errorMessage.set(err.error?.message || 'Failed to delete the class.');
          },
        });
      },
    });
  }

  // --- Schedules ---

  openSchedules(c: FacilityClass): void {
    this.clearMessages();
    this.dlgClass.set(c);
    this.schedules.set([]);
    this.dlgMode.set('schedules');
    this.reloadSchedules();
  }

  private reloadSchedules(): void {
    const c = this.dlgClass();
    if (!c) return;
    this.schedulesLoading.set(true);
    this.service.schedules(c.id).subscribe({
      next: (rows) => {
        this.schedules.set(rows);
        this.schedulesLoading.set(false);
      },
      error: (err) => {
        this.schedulesLoading.set(false);
        this.closeDialog();
        this.errorMessage.set(err.error?.message || 'Failed to load the schedules.');
      },
    });
  }

  backToSchedules(): void {
    this.dlgMode.set('schedules');
    this.preview.set(null);
    this.editSchedule.set(null);
    this.cancelTarget.set(null);
    this.scheduleForm.markAsPristine();
    this.cancelForm.markAsPristine();
  }

  weekdayText(s: FacilityClassSchedule): string {
    return s.weekdays.map((d) => WEEKDAYS[d - 1]?.label || String(d)).join(', ');
  }

  scheduleSummary(s: FacilityClassSchedule): string {
    const parts = [`${s.sessionCounts.scheduled} scheduled`];
    if (s.sessionCounts.held) parts.push(`${s.sessionCounts.held} held`);
    if (s.sessionCounts.cancelled) parts.push(`${s.sessionCounts.cancelled} cancelled`);
    if (s.nextSessionDate) parts.push(`next ${formatLocalDate(s.nextSessionDate)}`);
    return parts.join(' · ');
  }

  openScheduleForm(s?: FacilityClassSchedule): void {
    this.clearMessages();
    const c = this.dlgClass();
    this.editSchedule.set(s || null);
    this.preview.set(null);
    const days = new Set(s?.weekdays || [1, 3]);
    this.scheduleForm.reset({
      name: s?.name || '',
      dateFrom: s?.dateFrom || '',
      dateTo: s?.dateTo || '',
      d1: days.has(1), d2: days.has(2), d3: days.has(3), d4: days.has(4), d5: days.has(5), d6: days.has(6), d7: days.has(7),
      startTime: s?.startTime || '',
      endTime: s?.endTime || '',
      venueId: s?.venueId || c?.venueId || '',
      instructorId: s?.instructorId || c?.instructorId || '',
      capacity: s?.capacity ?? null,
      skipClosures: s ? s.skipClosures !== false : true,
      skipPublicHolidays: s ? s.skipPublicHolidays !== false : true,
      termFeeNote: s?.termFeeNote || '',
      remarks: s?.remarks || '',
    });
    this.dlgMode.set('scheduleForm');
  }

  private headerFromForm(): FacilityScheduleHeader | null {
    const f = this.scheduleForm.getRawValue();
    const weekdays = [1, 2, 3, 4, 5, 6, 7].filter((d) => (f as Record<string, unknown>)[`d${d}`] === true);
    if (!weekdays.length) {
      this.errorMessage.set('Tick at least one weekday the class runs on.');
      return null;
    }
    if (f.dateTo < f.dateFrom) {
      this.errorMessage.set('The last day must not be before the first day.');
      return null;
    }
    if (f.startTime >= f.endTime) {
      this.errorMessage.set('The end time must be after the start time.');
      return null;
    }
    return {
      name: f.name.trim(),
      dateFrom: f.dateFrom,
      dateTo: f.dateTo,
      weekdays,
      startTime: f.startTime,
      endTime: f.endTime,
      venueId: f.venueId || null,
      instructorId: f.instructorId || null,
      capacity: optInt(f.capacity, 1, 500),
      skipClosures: f.skipClosures === true,
      skipPublicHolidays: f.skipPublicHolidays === true,
      termFeeNote: f.termFeeNote.trim() || null,
      remarks: f.remarks.trim() || null,
    };
  }

  // Ask the server which dates the header generates, skips or leaves out.
  previewSchedule(): void {
    this.clearMessages();
    if (this.scheduleForm.invalid) {
      this.scheduleForm.markAllAsTouched();
      return;
    }
    const c = this.dlgClass();
    const header = this.headerFromForm();
    if (!c || !header) return;
    this.previewing.set(true);
    this.service.previewSchedule(c.id, { ...header, scheduleId: this.editSchedule()?.id || null }).subscribe({
      next: (p) => {
        this.preview.set(p);
        this.previewing.set(false);
        this.dlgMode.set('preview');
      },
      error: (err) => {
        this.previewing.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to preview the sessions.');
      },
    });
  }

  backToScheduleForm(): void {
    this.dlgMode.set('scheduleForm');
  }

  previewRowsOf(status: 'ok' | 'skipped' | 'conflict') {
    return (this.preview()?.rows || []).filter((r) => r.status === status);
  }

  saveSchedule(): void {
    this.clearMessages();
    const c = this.dlgClass();
    const header = this.headerFromForm();
    if (!c || !header) return;
    const s = this.editSchedule();
    this.saving.set(true);
    const req$ = s ? this.service.updateSchedule(c.id, s.id, header) : this.service.createSchedule(c.id, header);
    req$.subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.saving.set(false);
        this.scheduleForm.markAsPristine();
        this.backToSchedules();
        this.reloadSchedules();
        this.refreshRows();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || `Failed to ${s ? 'update' : 'save'} the schedule.`);
        this.saving.set(false);
      },
    });
  }

  closeSchedule(s: FacilityClassSchedule): void {
    const c = this.dlgClass();
    if (!c) return;
    this.clearMessages();
    this.scheduleBusyId.set(s.id);
    this.service.closeSchedule(c.id, s.id).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.scheduleBusyId.set(null);
        this.reloadSchedules();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to close the schedule.');
        this.scheduleBusyId.set(null);
      },
    });
  }

  openCancelSchedule(s: FacilityClassSchedule): void {
    this.clearMessages();
    this.cancelTarget.set(s);
    this.cancelForm.reset({ reason: '' });
    this.dlgMode.set('cancelSchedule');
  }

  submitCancelSchedule(): void {
    this.clearMessages();
    const c = this.dlgClass();
    const s = this.cancelTarget();
    if (!c || !s) return;
    if (this.cancelForm.invalid) {
      this.cancelForm.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.service.cancelSchedule(c.id, s.id, this.cancelForm.getRawValue().reason.trim()).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.saving.set(false);
        this.cancelForm.markAsPristine();
        this.backToSchedules();
        this.reloadSchedules();
        this.refreshRows();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to cancel the schedule.');
        this.saving.set(false);
      },
    });
  }

  // Keep the listing's counts in step without a full reload flash.
  private refreshRows(): void {
    this.service.list().subscribe({ next: (res) => this.rows.set(res.classes), error: () => undefined });
  }

  clearSearch(): void {
    this.search.set('');
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
