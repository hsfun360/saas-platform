import { Component, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

// The six rule editors are FormArrays INSIDE the one specification form (house
// standard): typed row groups below; form.dirty alone drives Save and the
// unsaved-changes state. Nullable model fields ride as '' in the controls and
// are mapped back to null (and clamped) when the payload is built.
type OvGroup = FormGroup<{ membershipTypeId: FormControl<string>; advanceBookingDays: FormControl<number> }>;
type MpGroup = FormGroup<{ courseId: FormControl<string>; dayScope: FormControl<string>; startTime: FormControl<string>; endTime: FormControl<string>; minPlayers: FormControl<number> }>;
type GcGroup = FormGroup<{ courseId: FormControl<string>; dayScope: FormControl<string>; startTime: FormControl<string>; endTime: FormControl<string>; allowGuest: FormControl<boolean>; allowMemberGuest: FormControl<boolean> }>;
type HlGroup = FormGroup<{ courseId: FormControl<string>; dayScope: FormControl<string>; holes: FormControl<string>; gender: FormControl<string>; maxHandicap: FormControl<number>; latestTeeOff: FormControl<string> }>;
type HaGroup = FormGroup<{ courseId: FormControl<string>; dayScope: FormControl<string>; holes: FormControl<string>; startTime: FormControl<string>; endTime: FormControl<string>; appliesToBeginner: FormControl<boolean>; appliesToProvisional: FormControl<boolean>; minCompanions: FormControl<number>; companionMaxHandicapMen: FormControl<number>; companionMaxHandicapWomen: FormControl<number>; latestTeeOff: FormControl<string> }>;
type SsGroup = FormGroup<{ name: FormControl<string>; startTime: FormControl<string>; endTime: FormControl<string> }>;

const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || dflt)));
const clampHcp = (v: unknown) => Math.max(0, Math.min(54, Math.round((Number(v) || 0) * 10) / 10));
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { CanDirective } from '../shared/can.directive';
import { ComboboxComponent } from '../shared/combobox/combobox';
import {
  GolfSettingService,
  GolfAdvanceBookingOverride,
  GolfMembershipTypeOption,
  GolfMinPlayerRule,
  GolfGuestControlRule,
  GolfHandicapLimitRule,
  GolfHandicapAccompanimentRule,
  GolfCourseOption,
  GolfSessionBand,
  GolfBookingLimit,
  GolfNoShowTypeOption,
  GolfLateCancellationAction,
  GolfNoShowChargeBasis,
} from '../services/golf-setting.service';

// Golf Management → Golf Specification (/golf/settings) - the per-company
// golf settings singleton (pattern of Club Specification). Today: the
// advance-booking window - general days + early-opening hours before
// midnight + optional per-membership-type day overrides (privileged earlier
// booking). The window for play date D opens at 00:00 of (D - effectiveDays)
// minus the hours, club-local. Section-card standard, one Save (PUT upserts
// the singleton and replaces the override lines atomically).
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-golf-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ScreenTitlePipe, ScreenSubtitlePipe, FavStarComponent, CanDirective, ComboboxComponent],
  templateUrl: './golf-settings.html',
  styleUrls: ['../system-setup/system-setup.css', './golf-settings.css'],
})
export class GolfSettingsComponent implements OnInit {
  private readonly service = inject(GolfSettingService);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly membershipTypes = signal<GolfMembershipTypeOption[]>([]);
  readonly courses = signal<GolfCourseOption[]>([]);
  readonly noShowTypes = signal<GolfNoShowTypeOption[]>([]);

  // Collapsible section state (section-card standard; sections start open).
  readonly expanded = signal<Record<string, boolean>>({ booking: true, minPlayers: true, guests: true, handicap: true, noshow: true, teesheet: true });

  readonly form = this.fb.nonNullable.group({
    advanceBookingDays: [7, [Validators.required, Validators.min(0), Validators.max(365)]],
    advanceBookingHours: [0, [Validators.required, Validators.min(0), Validators.max(23)]],
    allowMembershipTypeOverride: [false],
    allowBookingMerge: [false],
    minPlayersWeekday: [1, [Validators.required, Validators.min(1), Validators.max(10)]],
    minPlayersWeekend: [1, [Validators.required, Validators.min(1), Validators.max(10)]],
    bookingLockMinutes: [5, [Validators.required, Validators.min(1), Validators.max(60)]],
    bookingLimitWeekday: ['day'],
    bookingLimitWeekend: ['day'],
    allowSameDayBooking: [false],
    guestControlEnabled: [false],
    allowGuestWeekday: [true],
    allowMemberGuestWeekday: [true],
    allowGuestWeekend: [true],
    allowMemberGuestWeekend: [true],
    handicapControlEnabled: [false],
    juniorBookingControlEnabled: [false],
    noShowControlEnabled: [false],
    cancellationNoticeHours: [24, [Validators.required, Validators.min(0), Validators.max(720)]],
    lateCancellationAction: ['charge'],
    noShowTransactionTypeId: [''],
    noShowChargeBasis: ['player'],
    teeSheetColorBooked: ['#2563eb'],
    teeSheetColorRegistered: ['#f59e0b'],
    teeSheetColorBilled: ['#8b5cf6'],
    teeSheetColorSettled: ['#16a34a'],
    // The six rule editors (see the *Group types at the top of the file).
    overrides: this.fb.array<OvGroup>([]),
    minPlayerRules: this.fb.array<MpGroup>([]),
    guestRules: this.fb.array<GcGroup>([]),
    limitRules: this.fb.array<HlGroup>([]),
    accRules: this.fb.array<HaGroup>([]),
    sessions: this.fb.array<SsGroup>([]),
  });
  // Advance-booking overrides per membership type.
  get overrides(): FormArray<OvGroup> { return this.form.controls.overrides; }
  // Minimum-players exception rules.
  get minPlayerRules(): FormArray<MpGroup> { return this.form.controls.minPlayerRules; }
  // Guest-control exception rules.
  get guestRules(): FormArray<GcGroup> { return this.form.controls.guestRules; }
  // Handicap-control rules (Tropicana procedure 2).
  get limitRules(): FormArray<HlGroup> { return this.form.controls.limitRules; }
  get accRules(): FormArray<HaGroup> { return this.form.controls.accRules; }
  // Golf Sessions (2026-10-01): the club's named day parts - the per-session
  // booking limit's bands.
  get sessions(): FormArray<SsGroup> { return this.form.controls.sessions; }

  // Booking-limit vocabulary (fixed enum - native selects).
  readonly bookingLimits: { key: GolfBookingLimit; label: string }[] = [
    { key: 'none', label: 'No limit' },
    { key: 'day', label: 'One booking per day' },
    { key: 'session', label: 'One booking per session' },
  ];

  // Cancellation & no-show vocabularies (fixed enums - native selects).
  readonly lateActions: { key: GolfLateCancellationAction; label: string }[] = [
    { key: 'charge', label: 'Allow the cancellation and charge the no-show penalty' },
    { key: 'refuse', label: 'Refuse the cancellation - the booking stands' },
  ];
  readonly chargeBases: { key: GolfNoShowChargeBasis; label: string }[] = [
    { key: 'player', label: 'Per no-show player' },
    { key: 'booking', label: 'Per booking' },
  ];

  readonly noShowTypeOptions = computed(() =>
    this.noShowTypes().map((t) => ({
      value: t.id,
      label: `${t.transactionType}${t.description ? ' — ' + t.description : ''}${t.isActive ? '' : ' (inactive)'}`,
    })),
  );

  readonly typeOptions = computed(() =>
    this.membershipTypes().map((t) => ({
      value: t.id,
      label: `${t.category}${t.description ? ' — ' + t.description : ''}${t.isGolfAllow ? '' : ' (no golfing right)'}`,
    })),
  );

  readonly courseOptions = computed(() =>
    this.courses().map((c) => ({
      value: c.id,
      label: `${c.courseCode}${c.description ? ' — ' + c.description : ''}${c.isActive ? '' : ' (inactive)'}`,
    })),
  );

  // Specific days for the exception-rule day scopes (2026-09-28, e.g. a
  // Sunday guest ban); a specific day outranks weekday/weekend at resolution.
  readonly daysOfWeek = [
    { key: 'monday', label: 'Monday' },
    { key: 'tuesday', label: 'Tuesday' },
    { key: 'wednesday', label: 'Wednesday' },
    { key: 'thursday', label: 'Thursday' },
    { key: 'friday', label: 'Friday' },
    { key: 'saturday', label: 'Saturday' },
    { key: 'sunday', label: 'Sunday' },
  ];

  ngOnInit(): void {
    this.load();
    this.service.membershipTypes().subscribe({ next: (r) => this.membershipTypes.set(r.membershipTypes), error: () => {} });
    this.service.courses().subscribe({ next: (r) => this.courses.set(r.courses), error: () => {} });
    this.service.noShowTypes().subscribe({ next: (r) => this.noShowTypes.set(r.types), error: () => {} });
  }

  // Method, not computed: control values are not signals (same as overridesOn).
  noShowControlOn(): boolean {
    return this.form.controls.noShowControlEnabled.value === true;
  }

  setNoShowType(value: string): void {
    this.form.controls.noShowTransactionTypeId.setValue(value || '');
    this.form.controls.noShowTransactionTypeId.markAsDirty();
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  // Method, not computed: control values are not signals; bindings re-evaluate per CD.
  overridesOn(): boolean {
    return this.form.controls.allowMembershipTypeOverride.value === true;
  }

  toggleSection(key: string): void {
    this.expanded.update((m) => ({ ...m, [key]: !m[key] }));
  }

  isExpanded(key: string): boolean {
    return this.expanded()[key] !== false;
  }

  typeLabel(id: string): string {
    const t = this.membershipTypes().find((x) => x.id === id);
    return t ? t.category : '?';
  }

  load(): void {
    this.loading.set(true);
    this.service.get().subscribe({
      next: (doc) => {
        this.form.reset({
          advanceBookingDays: doc.setting.advanceBookingDays,
          advanceBookingHours: doc.setting.advanceBookingHours,
          allowMembershipTypeOverride: doc.setting.allowMembershipTypeOverride,
          allowBookingMerge: doc.setting.allowBookingMerge,
          minPlayersWeekday: doc.setting.minPlayersWeekday,
          minPlayersWeekend: doc.setting.minPlayersWeekend,
          bookingLockMinutes: doc.setting.bookingLockMinutes,
          bookingLimitWeekday: doc.setting.bookingLimitWeekday || 'day',
          bookingLimitWeekend: doc.setting.bookingLimitWeekend || 'day',
          allowSameDayBooking: doc.setting.allowSameDayBooking,
          guestControlEnabled: doc.setting.guestControlEnabled,
          allowGuestWeekday: doc.setting.allowGuestWeekday,
          allowMemberGuestWeekday: doc.setting.allowMemberGuestWeekday,
          allowGuestWeekend: doc.setting.allowGuestWeekend,
          allowMemberGuestWeekend: doc.setting.allowMemberGuestWeekend,
          handicapControlEnabled: doc.setting.handicapControlEnabled,
          juniorBookingControlEnabled: doc.setting.juniorBookingControlEnabled,
          noShowControlEnabled: doc.setting.noShowControlEnabled === true,
          cancellationNoticeHours: doc.setting.cancellationNoticeHours ?? 24,
          lateCancellationAction: doc.setting.lateCancellationAction || 'charge',
          noShowTransactionTypeId: doc.setting.noShowTransactionTypeId || '',
          noShowChargeBasis: doc.setting.noShowChargeBasis || 'player',
          teeSheetColorBooked: doc.setting.teeSheetColorBooked || '#2563eb',
          teeSheetColorRegistered: doc.setting.teeSheetColorRegistered || '#f59e0b',
          teeSheetColorBilled: doc.setting.teeSheetColorBilled || '#8b5cf6',
          teeSheetColorSettled: doc.setting.teeSheetColorSettled || '#16a34a',
        });
        this.fill(this.overrides, doc.overrides, (r) => this.newOverride(r));
        this.fill(this.minPlayerRules, doc.minPlayerRules ?? [], (r) => this.newMinPlayerRule(r));
        this.fill(this.guestRules, doc.guestControlRules ?? [], (r) => this.newGuestRule(r));
        this.fill(this.limitRules, doc.handicapLimitRules ?? [], (r) => this.newLimitRule(r));
        this.fill(this.accRules, doc.handicapAccompanimentRules ?? [], (r) => this.newAccRule(r));
        this.fill(this.sessions, doc.sessions ?? [], (r) => this.newSession(r));
        this.form.markAsPristine();
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load the golf specification.');
      },
    });
  }

  // ---- row factories (model -> control group) ----
  private fill<G extends FormGroup>(arr: FormArray<G>, rows: unknown[], make: (r: never) => G): void {
    arr.clear();
    for (const r of rows) arr.push(make(r as never));
  }
  private push<G extends FormGroup>(arr: FormArray<G>, g: G): void {
    arr.push(g);
    arr.markAsDirty();
  }
  private drop(arr: FormArray, index: number): void {
    arr.removeAt(index);
    arr.markAsDirty();
  }

  private newOverride(r: GolfAdvanceBookingOverride): OvGroup {
    return this.fb.nonNullable.group({ membershipTypeId: [r.membershipTypeId], advanceBookingDays: [r.advanceBookingDays] });
  }
  private newMinPlayerRule(r: GolfMinPlayerRule): MpGroup {
    return this.fb.nonNullable.group({ courseId: [r.courseId || ''], dayScope: [r.dayScope as string], startTime: [r.startTime || ''], endTime: [r.endTime || ''], minPlayers: [r.minPlayers] });
  }
  private newGuestRule(r: GolfGuestControlRule): GcGroup {
    return this.fb.nonNullable.group({ courseId: [r.courseId || ''], dayScope: [r.dayScope as string], startTime: [r.startTime || ''], endTime: [r.endTime || ''], allowGuest: [r.allowGuest], allowMemberGuest: [r.allowMemberGuest] });
  }
  private newLimitRule(r: GolfHandicapLimitRule): HlGroup {
    return this.fb.nonNullable.group({ courseId: [r.courseId || ''], dayScope: [r.dayScope], holes: [r.holes === null ? '' : String(r.holes)], gender: [r.gender as string], maxHandicap: [r.maxHandicap], latestTeeOff: [r.latestTeeOff || ''] });
  }
  private newAccRule(r: GolfHandicapAccompanimentRule): HaGroup {
    return this.fb.nonNullable.group({
      courseId: [r.courseId || ''], dayScope: [r.dayScope], holes: [r.holes === null ? '' : String(r.holes)], startTime: [r.startTime || ''], endTime: [r.endTime || ''],
      appliesToBeginner: [r.appliesToBeginner], appliesToProvisional: [r.appliesToProvisional], minCompanions: [r.minCompanions],
      companionMaxHandicapMen: [r.companionMaxHandicapMen], companionMaxHandicapWomen: [r.companionMaxHandicapWomen], latestTeeOff: [r.latestTeeOff || ''],
    });
  }
  private newSession(r: GolfSessionBand): SsGroup {
    return this.fb.nonNullable.group({ name: [r.name], startTime: [r.startTime], endTime: [r.endTime] });
  }

  // ---- row readers (control group -> model, '' -> null, clamped) ----
  private readOverrides(): GolfAdvanceBookingOverride[] {
    return this.overrides.controls.map((g) => { const v = g.getRawValue(); return { membershipTypeId: v.membershipTypeId, advanceBookingDays: clampInt(v.advanceBookingDays, 0, 365, 0) }; });
  }
  private readMinPlayerRules(): GolfMinPlayerRule[] {
    return this.minPlayerRules.controls.map((g) => { const v = g.getRawValue(); return { courseId: v.courseId || null, dayScope: v.dayScope as GolfMinPlayerRule['dayScope'], startTime: v.startTime || null, endTime: v.endTime || null, minPlayers: clampInt(v.minPlayers, 1, 10, 1) }; });
  }
  private readGuestRules(): GolfGuestControlRule[] {
    return this.guestRules.controls.map((g) => { const v = g.getRawValue(); return { courseId: v.courseId || null, dayScope: v.dayScope as GolfGuestControlRule['dayScope'], startTime: v.startTime || null, endTime: v.endTime || null, allowGuest: v.allowGuest, allowMemberGuest: v.allowMemberGuest }; });
  }
  private readLimitRules(): GolfHandicapLimitRule[] {
    return this.limitRules.controls.map((g) => { const v = g.getRawValue(); return { courseId: v.courseId || null, dayScope: v.dayScope, holes: v.holes === '' ? null : Number(v.holes), gender: v.gender as GolfHandicapLimitRule['gender'], maxHandicap: clampHcp(v.maxHandicap), latestTeeOff: v.latestTeeOff || null }; });
  }
  private readAccRules(): GolfHandicapAccompanimentRule[] {
    return this.accRules.controls.map((g) => { const v = g.getRawValue(); return {
      courseId: v.courseId || null, dayScope: v.dayScope, holes: v.holes === '' ? null : Number(v.holes), startTime: v.startTime || null, endTime: v.endTime || null,
      appliesToBeginner: v.appliesToBeginner, appliesToProvisional: v.appliesToProvisional, minCompanions: clampInt(v.minCompanions, 1, 3, 1),
      companionMaxHandicapMen: clampHcp(v.companionMaxHandicapMen), companionMaxHandicapWomen: clampHcp(v.companionMaxHandicapWomen), latestTeeOff: v.latestTeeOff || null,
    }; });
  }
  private readSessions(): GolfSessionBand[] {
    return this.sessions.controls.map((g) => g.getRawValue());
  }

  addOverride(): void {
    this.push(this.overrides, this.newOverride({ membershipTypeId: '', advanceBookingDays: this.form.controls.advanceBookingDays.value }));
  }
  removeOverride(index: number): void { this.drop(this.overrides, index); }

  addRule(): void {
    this.push(this.minPlayerRules, this.newMinPlayerRule({ courseId: null, dayScope: 'all', startTime: null, endTime: null, minPlayers: 2 }));
  }
  removeRule(index: number): void { this.drop(this.minPlayerRules, index); }

  // Method, not computed: control values are not signals (same as overridesOn).
  guestControlOn(): boolean {
    return this.form.controls.guestControlEnabled.value === true;
  }

  addGuestRule(): void {
    this.push(this.guestRules, this.newGuestRule({ courseId: null, dayScope: 'all', startTime: null, endTime: null, allowGuest: true, allowMemberGuest: true }));
  }
  removeGuestRule(index: number): void { this.drop(this.guestRules, index); }

  // Method, not computed: control values are not signals (same as overridesOn).
  handicapControlOn(): boolean {
    return this.form.controls.handicapControlEnabled.value === true;
  }

  addLimitRule(): void {
    this.push(this.limitRules, this.newLimitRule({ courseId: null, dayScope: 'weekday', holes: null, gender: 'any', maxHandicap: 36, latestTeeOff: null }));
  }
  removeLimitRule(index: number): void { this.drop(this.limitRules, index); }

  addAccRule(): void {
    this.push(this.accRules, this.newAccRule({
      courseId: null, dayScope: 'weekday', holes: null, startTime: null, endTime: null,
      appliesToBeginner: true, appliesToProvisional: true, minCompanions: 1,
      companionMaxHandicapMen: 24, companionMaxHandicapWomen: 36, latestTeeOff: null,
    }));
  }
  removeAccRule(index: number): void { this.drop(this.accRules, index); }

  // Whether either day type limits bookings per session (shows the bands
  // editor emphasis). Method, not computed: control values are not signals.
  sessionLimitOn(): boolean {
    return this.form.controls.bookingLimitWeekday.value === 'session'
      || this.form.controls.bookingLimitWeekend.value === 'session';
  }

  addSession(): void {
    this.push(this.sessions, this.newSession({ name: '', startTime: '', endTime: '' }));
  }
  removeSession(index: number): void { this.drop(this.sessions, index); }

  // Live preview of the window rule with the current numbers. Hidden while
  // either number is out of range - the field errors speak then (a 25-hour
  // value once previewed as "-1:00 am").
  windowPreview(): string {
    if (this.form.controls.advanceBookingDays.invalid || this.form.controls.advanceBookingHours.invalid) return '';
    const days = Number(this.form.controls.advanceBookingDays.value) || 0;
    const hours = Number(this.form.controls.advanceBookingHours.value) || 0;
    if (hours === 0) return `Bookings for a play date open ${days} day(s) before, at 12:00 midnight.`;
    const h = 24 - hours;
    const label = `${h > 12 ? h - 12 : h}:00 ${h >= 12 ? 'pm' : 'am'}`;
    return `Bookings for a play date open ${days} day(s) before - and already the previous evening from ${label} (${hours} hour(s) before midnight).`;
  }

  onSave(): void {
    this.clearMessages();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const rows = this.readOverrides();
    if (rows.some((r) => !r.membershipTypeId)) {
      this.errorMessage.set('Every override line needs a membership type.');
      return;
    }
    const ids = rows.map((r) => r.membershipTypeId);
    if (new Set(ids).size !== ids.length) {
      this.errorMessage.set('A membership type can only have one override line.');
      return;
    }
    const rules = this.readMinPlayerRules();
    const guestRules = this.readGuestRules();
    const accRules = this.readAccRules();
    for (const [label, scoped] of [['minimum-players', rules], ['guest-control', guestRules], ['accompaniment', accRules]] as const) {
      for (const r of scoped) {
        if (!!r.startTime !== !!r.endTime) {
          this.errorMessage.set(`A ${label} rule needs both From and To times — or neither for the whole day.`);
          return;
        }
        if (r.startTime && r.endTime && r.startTime >= r.endTime) {
          this.errorMessage.set(`A ${label} rule's From time must be before its To time.`);
          return;
        }
      }
    }
    for (const r of accRules) {
      if (!r.appliesToBeginner && !r.appliesToProvisional) {
        this.errorMessage.set('An accompaniment rule must target beginners, provisional golfers, or both.');
        return;
      }
    }
    const sessions = this.readSessions();
    for (const s of sessions) {
      if (!s.name.trim()) {
        this.errorMessage.set('Every session needs a name.');
        return;
      }
      if (!s.startTime || !s.endTime) {
        this.errorMessage.set(`Session '${s.name}' needs both From and Until times.`);
        return;
      }
      if (s.startTime >= s.endTime) {
        this.errorMessage.set(`Session '${s.name}': the From time must be before the Until time.`);
        return;
      }
    }

    const v = this.form.getRawValue();
    if (v.noShowControlEnabled && !v.noShowTransactionTypeId) {
      this.errorMessage.set('Pick the no-show transaction type before switching cancellation & no-show control on.');
      return;
    }
    this.saving.set(true);
    this.service.save({
      advanceBookingDays: v.advanceBookingDays,
      advanceBookingHours: v.advanceBookingHours,
      allowMembershipTypeOverride: v.allowMembershipTypeOverride,
      allowBookingMerge: v.allowBookingMerge,
      minPlayersWeekday: v.minPlayersWeekday,
      minPlayersWeekend: v.minPlayersWeekend,
      bookingLockMinutes: v.bookingLockMinutes,
      bookingLimitWeekday: v.bookingLimitWeekday as GolfBookingLimit,
      bookingLimitWeekend: v.bookingLimitWeekend as GolfBookingLimit,
      allowSameDayBooking: v.allowSameDayBooking,
      guestControlEnabled: v.guestControlEnabled,
      allowGuestWeekday: v.allowGuestWeekday,
      allowMemberGuestWeekday: v.allowMemberGuestWeekday,
      allowGuestWeekend: v.allowGuestWeekend,
      allowMemberGuestWeekend: v.allowMemberGuestWeekend,
      handicapControlEnabled: v.handicapControlEnabled,
      juniorBookingControlEnabled: v.juniorBookingControlEnabled,
      noShowControlEnabled: v.noShowControlEnabled,
      cancellationNoticeHours: v.cancellationNoticeHours,
      lateCancellationAction: v.lateCancellationAction as GolfLateCancellationAction,
      noShowTransactionTypeId: v.noShowTransactionTypeId || null,
      noShowChargeBasis: v.noShowChargeBasis as GolfNoShowChargeBasis,
      teeSheetColorBooked: v.teeSheetColorBooked,
      teeSheetColorRegistered: v.teeSheetColorRegistered,
      teeSheetColorBilled: v.teeSheetColorBilled,
      teeSheetColorSettled: v.teeSheetColorSettled,
      overrides: rows,
      minPlayerRules: rules,
      guestControlRules: guestRules,
      handicapLimitRules: this.readLimitRules(),
      handicapAccompanimentRules: accRules,
      sessions,
    }).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.saving.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save the golf specification.');
        this.saving.set(false);
      },
    });
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
