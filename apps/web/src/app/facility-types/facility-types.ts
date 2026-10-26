import { Component, Injector, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import {
  FacilityMeta,
  FacilityType,
  FacilityTypePayload,
  FacilityTypeService,
  FacilityTypeSlot,
  FacilityTypeSlotSet,
  FacilityUsageMode,
  FacilityUsageModeOption,
} from '../services/facility-type.service';
import { FacilityTransactionType, FacilityTransactionTypeService } from '../services/facility-transaction-type.service';
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
import { MembershipStatusOption } from '../models/auth.models';

// One slot row in the slot editor: a typed FormGroup inside `slotLines`
// (house standard - the array's dirty state feeds the dialog's guard).
type SlotGroup = FormGroup<{
  slotNumber: FormControl<number>;
  startTime: FormControl<string>; // 'HH:MM'
  endTime: FormControl<string>;
  isFrontDesk: FormControl<boolean>;
  isActive: FormControl<boolean>;
}>;

// Fallback vocabularies until /meta lands - must match facility.constants.
const FALLBACK_MODES: FacilityUsageModeOption[] = [
  { key: 'slot', label: 'Time slot booking' },
  { key: 'entry', label: 'Entry registration' },
  { key: 'issue', label: 'Issue and return' },
];
const FALLBACK_SCOPES: MembershipStatusOption[] = [
  { key: 'all', label: 'All days' },
  { key: 'weekday', label: 'Weekdays' },
  { key: 'weekend', label: 'Weekends' },
];
const MODE_ICONS: Record<FacilityUsageMode, string> = { slot: 'event_available', entry: 'login', issue: 'key' };

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || dflt)));
const optInt = (v: unknown, lo: number, hi: number): number | null => (v === null || v === undefined || v === '' ? null : clampInt(v, lo, hi, lo));

// Facility Management → Facility Types (/facility/facility-types; structure
// approved 2026-10-25). The KIND of facility and its rules: code, description,
// usage mode (slot / entry / issue - frozen once a unit exists) and the rule
// group that mode applies - slot limits, entry capacity, issue tracking,
// opening hours, guest policy. Slot-mode types own their SLOT SETS (header ->
// generated slots, previewed before save, then hand-adjusted). ONE drawer
// dialog with four views (type form / slot-set list / slot-set form / slot
// editor), the single-dialog pattern.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-facility-types',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent,
    ConfirmDialogComponent, CanDirective, FieldInfoComponent, ComboboxComponent, OverflowMenuComponent, MenuItemDirective, LocalDatePipe],
  templateUrl: './facility-types.html',
  // membership-types.css supplies the shared .mt-chip pill.
  styleUrls: ['../membership-types/membership-types.css', './facility-types.css'],
})
export class FacilityTypesComponent implements OnInit {
  private readonly service = inject(FacilityTypeService);
  private readonly transactionTypes = inject(FacilityTransactionTypeService);
  private readonly fb = inject(FormBuilder);
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private static readonly LIST_PATH = '/facility/facility-types';

  readonly rows = signal<FacilityType[]>([]);
  readonly meta = signal<FacilityMeta | null>(null);
  // The billing catalog for the default-fee pickers (slice 2a); a facility
  // fee of this type or of any type, a guest fee likewise.
  readonly fees = signal<FacilityTransactionType[]>([]);
  readonly facilityFeeOptions = computed(() => this.feeOptionsFor('facility-fee'));
  readonly guestFeeOptions = computed(() => this.feeOptionsFor('guest-fee'));
  readonly issueFeeOptions = computed(() => this.feeOptionsFor('issue-fee'));
  readonly usageModes = computed(() => this.meta()?.usageModes || FALLBACK_MODES);
  readonly dayScopes = computed(() => this.meta()?.dayScopes || FALLBACK_SCOPES);
  readonly slotMinutesMin = computed(() => this.meta()?.limits.slotMinutesMin || 15);
  readonly slotMinutesMax = computed(() => this.meta()?.limits.slotMinutesMax || 240);
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);
  readonly uploading = signal(false);

  readonly search = signal('');
  readonly modeFilter = signal<FacilityUsageMode | ''>('');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');
  readonly confirmAction = signal<ConfirmRequest | null>(null);

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const mode = this.modeFilter();
    const sorted = [...this.rows()].sort((a, b) => {
      const aActive = a.isActive !== false;
      const bActive = b.isActive !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return (a.sortOrder - b.sortOrder) || a.code.localeCompare(b.code);
    });
    return sorted.filter((t) => (!mode || t.usageMode === mode)
      && (!q || t.code.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)));
  });
  readonly activeCount = computed(() => this.rows().filter((t) => t.isActive !== false).length);

  // Long behavioural explanations live in <app-field-info> popovers.
  readonly hint = {
    mode: 'Time slot booking: courts and halls, booked by fixed slots from this type\'s slot sets. Entry registration: gym and pool, registered on arrival, optionally capped. Issue and return: lockers (numbered units) and towels (counted) handed out at the Control Station. The mode is frozen once a facility exists under the type.',
    slotsPerDay: 'How many slots of this type one member may hold on one day, counted as the booker or as a participant; cancelled bookings free the count. 0 = no limit.',
    consecutive: 'How many adjacent slots on one facility a single booking may take - a hall hired by the hour sets a high number. 0 = no limit.',
    advance: 'Overrides the Specification\'s general advance booking days for this type only; leave blank to follow the general rule.',
    participants: 'Max is what one court holds (badminton 4); leave blank when participants are not tracked (a hall). Min is what a booking must name - 1 means no rule.',
    capacity: 'The number of persons inside at one time across all facilities of this type. The Control Station shows the live count and refuses entry past it; blank = unlimited.',
    trackUnits: 'On: every facility under this type is one numbered unit, issued to one patron and returned (lockers). Off: one counted consumable issued by quantity (towels) - create a single facility row for the counter.',
    hours: 'Entry and issue types are open between these times; leave both blank for no restriction. Slot types take their hours from the slot set instead.',
    guests: 'These apply only while guest control is switched on in Facility Specification, and only tighten the general flags there. Guests also count against the member\'s monthly allowance.',
    slotSets: 'A slot set defines the bookable slots for a day scope from an effective date: first start, last start and slot length generate the list, which you can then adjust (untick a lunch break, mark evening slots front-desk-only). Add a weekend set when weekends run differently, and a new set with a later effective date when the schedule changes.',
    fees: 'When a bill opens for a booking of this type, the facility fee is charged once per reserved slot and the guest fee once per guest participant, each priced from its rate card for the slot\'s day, session and participant type. Leave a picker blank for no automatic charge. The items themselves live under Transaction Types.',
    approval: 'Every booking of this type is held pending approval and routes through the Workflow engine (purpose Facility booking); with no chain configured it approves at once. A participant type can also require approval on its own.',
  };

  // --- The ONE drawer dialog ---
  readonly dlgMode = signal<'form' | 'sets' | 'setForm' | 'slots' | null>(null);
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);
  readonly editRow = signal<FacilityType | null>(null);

  readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.maxLength(20), Validators.pattern(/^[A-Za-z0-9_]+$/)]],
    description: ['', [Validators.required, Validators.maxLength(255)]],
    usageMode: ['slot' as FacilityUsageMode, [Validators.required]],
    iconUrl: [''],
    sortOrder: [100, [Validators.required, Validators.min(0), Validators.max(9999)]],
    // slot mode
    maxParticipants: this.fb.control<number | null>(null, [Validators.min(1), Validators.max(500)]),
    minParticipants: [1, [Validators.required, Validators.min(1), Validators.max(500)]],
    maxSlotsPerDayWeekday: [0, [Validators.required, Validators.min(0), Validators.max(50)]],
    maxSlotsPerDayWeekend: [0, [Validators.required, Validators.min(0), Validators.max(50)]],
    maxConsecutiveSlots: [0, [Validators.required, Validators.min(0), Validators.max(50)]],
    advanceBookingDays: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(365)]),
    // entry mode
    capacity: this.fb.control<number | null>(null, [Validators.min(1), Validators.max(100000)]),
    // issue mode
    trackUnits: [true],
    maxIssuePerPatron: [1, [Validators.required, Validators.min(0), Validators.max(100)]],
    issueDueDays: [0, [Validators.required, Validators.min(0), Validators.max(365)]],
    issueFeeTransactionTypeId: [''],
    entryRequiresBooking: [false],
    // opening hours
    openTimeWeekday: [''],
    closeTimeWeekday: [''],
    openTimeWeekend: [''],
    closeTimeWeekend: [''],
    // guest policy
    guestsAllowed: [true],
    memberGuestsAllowed: [true],
    maxGuestsPerBooking: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(100)]),
    hostMustBePresent: [true],
    // slice 2a: default fees + approval
    feeTransactionTypeId: [''],
    guestFeeTransactionTypeId: [''],
    requiresApproval: [false],
  });

  // Active items of the charge type that belong to this facility type or to
  // any type (the API refuses another type's item).
  private feeOptionsFor(chargeType: string): { value: string; label: string }[] {
    const typeId = this.editId();
    return this.fees()
      .filter((f) => f.chargeType === chargeType && f.isActive !== false && (!f.facilityTypeId || f.facilityTypeId === typeId))
      .map((f) => ({ value: f.id, label: f.description ? `${f.transactionType} - ${f.description}` : f.transactionType }));
  }

  // --- Slot sets (slot-mode types) ---
  readonly dlgType = signal<FacilityType | null>(null);
  readonly sets = signal<FacilityTypeSlotSet[]>([]);
  readonly setsLoading = signal(false);
  readonly setTogglingId = signal<string | null>(null);
  readonly setSaving = signal(false);
  readonly editSetId = signal<string | null>(null);
  readonly setForm = this.fb.nonNullable.group({
    description: ['', [Validators.maxLength(255)]],
    dayScope: ['all', [Validators.required]],
    effectiveDate: ['', [Validators.required]],
    firstSlotTime: ['', [Validators.required]],
    lastSlotTime: ['', [Validators.required]],
    slotMinutes: this.fb.control<number | null>(60, [Validators.required]),
    frontDeskFrom: [''],
    regenerate: [false],
  });

  readonly slotSet = signal<FacilityTypeSlotSet | null>(null);
  readonly slotsSaving = signal(false);
  readonly generating = signal(false);
  readonly slotLines: FormArray<SlotGroup> = this.fb.array<SlotGroup>([]);
  readonly slotsForm = this.fb.group({ slots: this.slotLines });

  readonly dialogTitle = computed(() => {
    const mode = this.dlgMode();
    const t = this.dlgType();
    const code = t?.code || '';
    if (mode === 'sets') return `Slot sets - ${code}`;
    if (mode === 'setForm') return this.editSetId() ? `Edit slot set - ${code}` : `New slot set - ${code}`;
    if (mode === 'slots') {
      const s = this.slotSet();
      return s ? `Slots - ${this.scopeLabel(s.dayScope)} from ${formatLocalDate(s.effectiveDate)}` : 'Slots';
    }
    return this.editId() ? 'Edit facility type' : 'New facility type';
  });
  readonly busy = computed(() => this.saving() || this.setsLoading() || this.setSaving() || this.slotsSaving() || this.generating() || this.uploading());

  isDirty(): boolean {
    switch (this.dlgMode()) {
      case 'form': return this.form.dirty;
      case 'setForm': return this.setForm.dirty;
      case 'slots': return this.slotLines.dirty;
      default: return false;
    }
  }

  ngOnInit(): void {
    this.service.meta().subscribe({ next: (m) => this.meta.set(m), error: () => undefined });
    // The pickers tolerate a missing Transaction Types grant: they just stay empty.
    this.transactionTypes.list().subscribe({ next: (rows) => this.fees.set(rows), error: () => undefined });
    this.load();
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  // The usage mode the form currently holds (drives which sections show).
  formMode(): FacilityUsageMode {
    return this.form.controls.usageMode.value;
  }

  modeLabel(key: string): string {
    return this.usageModes().find((m) => m.key === key)?.label || key;
  }

  modeIcon(key: FacilityUsageMode): string {
    return MODE_ICONS[key] || 'category';
  }

  scopeLabel(key: string): string {
    return this.dayScopes().find((s) => s.key === key)?.label || key;
  }

  // One-line rule summary for the listing card's subline.
  ruleSummary(t: FacilityType): string {
    if (t.usageMode === 'slot') {
      const parts: string[] = [];
      if (t.maxSlotsPerDayWeekday || t.maxSlotsPerDayWeekend) parts.push(`${t.maxSlotsPerDayWeekday || 'no limit'} / ${t.maxSlotsPerDayWeekend || 'no limit'} slots per day`);
      if (t.maxConsecutiveSlots) parts.push(`${t.maxConsecutiveSlots} consecutive`);
      if (t.maxParticipants) parts.push(`${t.maxParticipants} participants`);
      return parts.join(' · ');
    }
    if (t.usageMode === 'entry') return t.capacity ? `Capacity ${t.capacity}` : 'No capacity cap';
    return t.trackUnits ? `Numbered units · max ${t.maxIssuePerPatron || 'unlimited'} per patron` : `Counted items · max ${t.maxIssuePerPatron || 'unlimited'} per patron`;
  }

  load(): void {
    this.loading.set(true);
    this.service.list().subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
        this.returnScroll.consume(FacilityTypesComponent.LIST_PATH, this.injector);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load facility types.');
      },
    });
  }

  // --- Type form ---

  private resetForm(t: FacilityType | null): void {
    this.form.reset({
      code: t?.code || '',
      description: t?.description || '',
      usageMode: t?.usageMode || 'slot',
      iconUrl: t?.iconUrl || '',
      sortOrder: t?.sortOrder ?? 100,
      maxParticipants: t?.maxParticipants ?? null,
      minParticipants: t?.minParticipants ?? 1,
      maxSlotsPerDayWeekday: t?.maxSlotsPerDayWeekday ?? 0,
      maxSlotsPerDayWeekend: t?.maxSlotsPerDayWeekend ?? 0,
      maxConsecutiveSlots: t?.maxConsecutiveSlots ?? 0,
      advanceBookingDays: t?.advanceBookingDays ?? null,
      capacity: t?.capacity ?? null,
      trackUnits: t?.trackUnits !== false,
      maxIssuePerPatron: t?.maxIssuePerPatron ?? 1,
      issueDueDays: t?.issueDueDays ?? 0,
      issueFeeTransactionTypeId: t?.issueFeeTransactionTypeId || '',
      entryRequiresBooking: t?.entryRequiresBooking === true,
      openTimeWeekday: t?.openTimeWeekday || '',
      closeTimeWeekday: t?.closeTimeWeekday || '',
      openTimeWeekend: t?.openTimeWeekend || '',
      closeTimeWeekend: t?.closeTimeWeekend || '',
      guestsAllowed: t?.guestsAllowed !== false,
      memberGuestsAllowed: t?.memberGuestsAllowed !== false,
      maxGuestsPerBooking: t?.maxGuestsPerBooking ?? null,
      hostMustBePresent: t?.hostMustBePresent !== false,
      feeTransactionTypeId: t?.feeTransactionTypeId || '',
      guestFeeTransactionTypeId: t?.guestFeeTransactionTypeId || '',
      requiresApproval: t?.requiresApproval === true,
    });
    // The usage mode is frozen once a unit exists under the type.
    if (t && t.unitCount > 0) this.form.controls.usageMode.disable();
    else this.form.controls.usageMode.enable();
  }

  openAdd(): void {
    this.clearMessages();
    this.editId.set(null);
    this.editRow.set(null);
    this.resetForm(null);
    this.dlgMode.set('form');
  }

  openEdit(t: FacilityType): void {
    this.clearMessages();
    this.editId.set(t.id);
    this.editRow.set(t);
    this.resetForm(t);
    this.dlgMode.set('form');
  }

  modeFrozen(): boolean {
    return this.form.controls.usageMode.disabled;
  }

  closeDialog(): void {
    this.dlgMode.set(null);
    this.dlgType.set(null);
    this.slotLines.clear();
    this.slotLines.markAsPristine();
  }

  onIconSelected(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.clearMessages();
    this.uploading.set(true);
    this.service.uploadIcon(file).subscribe({
      next: (res) => {
        this.form.controls.iconUrl.setValue(res.url);
        this.form.controls.iconUrl.markAsDirty();
        this.uploading.set(false);
      },
      error: (err) => {
        this.uploading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to upload the icon.');
      },
    });
  }

  removeIcon(): void {
    this.form.controls.iconUrl.setValue('');
    this.form.controls.iconUrl.markAsDirty();
  }

  onSave(): void {
    this.clearMessages();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const mode = v.usageMode;
    if (mode === 'slot' && v.maxParticipants !== null && Number(v.minParticipants) > Number(v.maxParticipants)) {
      this.errorMessage.set('Min participants cannot exceed max participants.');
      return;
    }
    if (mode !== 'slot') {
      for (const [open, close, label] of [[v.openTimeWeekday, v.closeTimeWeekday, 'Weekday'], [v.openTimeWeekend, v.closeTimeWeekend, 'Weekend']] as const) {
        if (!open !== !close) {
          this.errorMessage.set(`${label} opening hours need both an open and a close time, or neither.`);
          return;
        }
        if (open && close && open >= close) {
          this.errorMessage.set(`${label} close time must be after the open time.`);
          return;
        }
      }
    }
    const payload: FacilityTypePayload = {
      code: v.code.trim().toUpperCase(),
      description: v.description.trim(),
      usageMode: mode,
      iconUrl: v.iconUrl || null,
      sortOrder: clampInt(v.sortOrder, 0, 9999, 100),
      maxParticipants: optInt(v.maxParticipants, 1, 500),
      minParticipants: clampInt(v.minParticipants, 1, 500, 1),
      maxSlotsPerDayWeekday: clampInt(v.maxSlotsPerDayWeekday, 0, 50, 0),
      maxSlotsPerDayWeekend: clampInt(v.maxSlotsPerDayWeekend, 0, 50, 0),
      maxConsecutiveSlots: clampInt(v.maxConsecutiveSlots, 0, 50, 0),
      advanceBookingDays: optInt(v.advanceBookingDays, 0, 365),
      capacity: optInt(v.capacity, 1, 100000),
      trackUnits: v.trackUnits === true,
      maxIssuePerPatron: clampInt(v.maxIssuePerPatron, 0, 100, 1),
      issueDueDays: clampInt(v.issueDueDays, 0, 365, 0),
      issueFeeTransactionTypeId: v.issueFeeTransactionTypeId || null,
      entryRequiresBooking: v.entryRequiresBooking === true,
      openTimeWeekday: v.openTimeWeekday || null,
      closeTimeWeekday: v.closeTimeWeekday || null,
      openTimeWeekend: v.openTimeWeekend || null,
      closeTimeWeekend: v.closeTimeWeekend || null,
      guestsAllowed: v.guestsAllowed === true,
      memberGuestsAllowed: v.memberGuestsAllowed === true,
      maxGuestsPerBooking: optInt(v.maxGuestsPerBooking, 0, 100),
      hostMustBePresent: v.hostMustBePresent === true,
      feeTransactionTypeId: v.feeTransactionTypeId || null,
      guestFeeTransactionTypeId: v.guestFeeTransactionTypeId || null,
      requiresApproval: v.requiresApproval === true,
    };
    this.saving.set(true);
    const id = this.editId();
    const req$ = id ? this.service.update(id, payload) : this.service.create(payload);
    req$.subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.saving.set(false);
        this.form.markAsPristine();
        this.closeDialog();
        this.returnScroll.remember(FacilityTypesComponent.LIST_PATH, res.facilityType.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save the facility type.');
        this.saving.set(false);
      },
    });
  }

  toggleActive(t: FacilityType): void {
    this.clearMessages();
    const next = !(t.isActive !== false);
    this.togglingId.set(t.id);
    this.service.update(t.id, { isActive: next }).subscribe({
      next: () => {
        this.successMessage.set(`${t.code} ${next ? 'enabled' : 'disabled'}.`);
        this.togglingId.set(null);
        this.returnScroll.remember(FacilityTypesComponent.LIST_PATH, t.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update the facility type.');
        this.togglingId.set(null);
      },
    });
  }

  askDelete(t: FacilityType): void {
    this.clearMessages();
    this.confirmAction.set({
      title: 'Delete facility type',
      message: t.unitCount > 0
        ? `${t.code} still has ${t.unitCount} facilit${t.unitCount === 1 ? 'y' : 'ies'} - delete those first, or disable the type to keep it out of use.`
        : `Delete facility type ${t.code} (${t.description})? Its ${t.slotSetCount} slot set${t.slotSetCount === 1 ? '' : 's'} and closure plans go with it. This cannot be undone.`,
      confirmLabel: 'Delete facility type',
      run: () => {
        this.confirmAction.set(null);
        this.togglingId.set(t.id);
        this.service.remove(t.id).subscribe({
          next: (res) => {
            this.togglingId.set(null);
            this.successMessage.set(res.message);
            this.load();
          },
          error: (err) => {
            this.togglingId.set(null);
            this.errorMessage.set(err.error?.message || 'Failed to delete the facility type.');
          },
        });
      },
    });
  }

  // --- Slot sets ---

  openSets(t: FacilityType): void {
    this.clearMessages();
    this.dlgType.set(t);
    this.sets.set([]);
    this.dlgMode.set('sets');
    this.reloadSets();
  }

  private reloadSets(): void {
    const t = this.dlgType();
    if (!t) return;
    this.setsLoading.set(true);
    this.service.slotSets(t.id).subscribe({
      next: (sets) => {
        this.sets.set(sets);
        this.setsLoading.set(false);
      },
      error: (err) => {
        this.setsLoading.set(false);
        this.closeDialog();
        this.errorMessage.set(err.error?.message || 'Failed to load slot sets.');
      },
    });
  }

  backToSets(): void {
    this.dlgMode.set('sets');
    this.slotLines.clear();
    this.slotLines.markAsPristine();
    this.setForm.markAsPristine();
  }

  slotCount(s: FacilityTypeSlotSet): number {
    return s.slots?.length || 0;
  }

  activeSlotCount(s: FacilityTypeSlotSet): number {
    return (s.slots || []).filter((x) => x.isActive !== false).length;
  }

  openSetForm(s?: FacilityTypeSlotSet): void {
    this.clearMessages();
    this.editSetId.set(s?.id || null);
    this.setForm.reset({
      description: s?.description || '',
      dayScope: s?.dayScope || 'all',
      effectiveDate: s?.effectiveDate || '',
      firstSlotTime: s?.firstSlotTime || '',
      lastSlotTime: s?.lastSlotTime || '',
      slotMinutes: s?.slotMinutes ?? 60,
      frontDeskFrom: s?.frontDeskFrom || '',
      regenerate: false,
    });
    this.dlgMode.set('setForm');
  }

  // What the header would generate, from the live form values (show the
  // expected result on the Save button).
  generateCount(): number {
    const f = this.setForm.getRawValue();
    if (!f.firstSlotTime || !f.lastSlotTime || !f.slotMinutes) return 0;
    const first = toMinutes(f.firstSlotTime);
    const last = toMinutes(f.lastSlotTime);
    const minutes = Number(f.slotMinutes);
    if (last < first || minutes < this.slotMinutesMin() || minutes > this.slotMinutesMax() || last + minutes > 24 * 60) return 0;
    return Math.floor((last - first) / minutes) + 1;
  }

  onSaveSet(): void {
    this.clearMessages();
    if (this.setForm.invalid) {
      this.setForm.markAllAsTouched();
      return;
    }
    const f = this.setForm.getRawValue();
    const minutes = Number(f.slotMinutes);
    if (!Number.isInteger(minutes) || minutes < this.slotMinutesMin() || minutes > this.slotMinutesMax()) {
      this.errorMessage.set(`Slot length must be a whole number of minutes between ${this.slotMinutesMin()} and ${this.slotMinutesMax()}.`);
      return;
    }
    if (f.firstSlotTime > f.lastSlotTime) {
      this.errorMessage.set('The last slot must not start before the first slot.');
      return;
    }
    if (toMinutes(f.lastSlotTime) + minutes > 24 * 60) {
      this.errorMessage.set('The last slot must end by midnight.');
      return;
    }
    const t = this.dlgType();
    if (!t) return;
    const header = {
      description: f.description.trim() || null,
      dayScope: f.dayScope,
      effectiveDate: f.effectiveDate,
      firstSlotTime: f.firstSlotTime,
      lastSlotTime: f.lastSlotTime,
      slotMinutes: minutes,
      frontDeskFrom: f.frontDeskFrom || null,
    };
    this.setSaving.set(true);
    const id = this.editSetId();
    const req$ = id
      ? this.service.updateSlotSet(t.id, id, { ...header, regenerate: f.regenerate === true })
      : this.service.createSlotSet(t.id, header);
    req$.subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.setSaving.set(false);
        this.setForm.markAsPristine();
        this.backToSets();
        this.reloadSets();
        this.refreshTypeRow(t.id);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || `Failed to ${id ? 'update' : 'add'} the slot set.`);
        this.setSaving.set(false);
      },
    });
  }

  toggleSetActive(s: FacilityTypeSlotSet): void {
    const t = this.dlgType();
    if (!t) return;
    this.clearMessages();
    const next = !(s.isActive !== false);
    this.setTogglingId.set(s.id);
    this.service.updateSlotSet(t.id, s.id, { isActive: next }).subscribe({
      next: () => {
        this.successMessage.set(`Slot set ${next ? 'enabled' : 'disabled'}.`);
        this.setTogglingId.set(null);
        this.reloadSets();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update the slot set.');
        this.setTogglingId.set(null);
      },
    });
  }

  askDeleteSet(s: FacilityTypeSlotSet): void {
    const t = this.dlgType();
    if (!t) return;
    this.clearMessages();
    this.confirmAction.set({
      title: 'Delete slot set',
      message: `Delete the ${this.scopeLabel(s.dayScope)} slot set from ${formatLocalDate(s.effectiveDate)} with its ${this.slotCount(s)} slots? This cannot be undone.`,
      confirmLabel: 'Delete slot set',
      run: () => {
        this.confirmAction.set(null);
        this.setTogglingId.set(s.id);
        this.service.removeSlotSet(t.id, s.id).subscribe({
          next: (res) => {
            this.setTogglingId.set(null);
            this.successMessage.set(res.message);
            this.reloadSets();
            this.refreshTypeRow(t.id);
          },
          error: (err) => {
            this.setTogglingId.set(null);
            this.errorMessage.set(err.error?.message || 'Failed to delete the slot set.');
          },
        });
      },
    });
  }

  // Keep the listing's slot-set count in step without a full reload flash.
  private refreshTypeRow(typeId: string): void {
    this.service.list().subscribe({ next: (rows) => this.rows.set(rows), error: () => undefined });
    void typeId;
  }

  // --- Slot editor ---

  private newSlotGroup(r: FacilityTypeSlot): SlotGroup {
    return this.fb.nonNullable.group({
      slotNumber: [r.slotNumber],
      startTime: [r.startTime],
      endTime: [r.endTime],
      isFrontDesk: [r.isFrontDesk === true],
      isActive: [r.isActive !== false],
    });
  }

  private setSlotLines(rows: FacilityTypeSlot[], dirty: boolean): void {
    this.slotLines.clear();
    for (const r of rows) this.slotLines.push(this.newSlotGroup(r));
    if (dirty) this.slotLines.markAsDirty();
    else this.slotLines.markAsPristine();
  }

  openSlots(s: FacilityTypeSlotSet): void {
    this.clearMessages();
    this.slotSet.set(s);
    this.setSlotLines(s.slots || [], false);
    this.dlgMode.set('slots');
  }

  // Ask the server for the header's generated slots (the ONE generation rule)
  // and fill the grid for review - nothing is saved until Save.
  regenerateSlots(): void {
    const t = this.dlgType();
    const s = this.slotSet();
    if (!t || !s) return;
    this.clearMessages();
    this.generating.set(true);
    this.service.previewSlots(t.id, {
      dayScope: s.dayScope,
      effectiveDate: s.effectiveDate,
      firstSlotTime: s.firstSlotTime,
      lastSlotTime: s.lastSlotTime,
      slotMinutes: s.slotMinutes,
      frontDeskFrom: s.frontDeskFrom,
    }).subscribe({
      next: (res) => {
        this.setSlotLines(res.slots, true);
        this.generating.set(false);
      },
      error: (err) => {
        this.generating.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to generate slots.');
      },
    });
  }

  onSaveSlots(): void {
    const t = this.dlgType();
    const s = this.slotSet();
    if (!t || !s) return;
    this.clearMessages();
    const slots: FacilityTypeSlot[] = [];
    for (const r of this.slotLines.controls.map((g) => g.getRawValue())) {
      if (!r.startTime || !r.endTime) {
        this.errorMessage.set(`Slot ${r.slotNumber}: start and end times are required.`);
        return;
      }
      if (r.startTime >= r.endTime) {
        this.errorMessage.set(`Slot ${r.slotNumber}: the end must be after the start.`);
        return;
      }
      slots.push({ slotNumber: r.slotNumber, startTime: r.startTime, endTime: r.endTime, isFrontDesk: r.isFrontDesk, isActive: r.isActive });
    }
    this.slotsSaving.set(true);
    this.service.saveSlots(t.id, s.id, slots).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.slotsSaving.set(false);
        this.backToSets();
        this.reloadSets();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save the slots.');
        this.slotsSaving.set(false);
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
