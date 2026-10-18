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
// Playing-right row and round-quota row (2026-10-15): `target` encodes the
// player type or club as 'type:<id>' | 'club:<id>' for one combobox.
type PrGroup = FormGroup<{ target: FormControl<string>; membershipTypeId: FormControl<string>; courseId: FormControl<string>; dayScope: FormControl<string>; startTime: FormControl<string>; endTime: FormControl<string>; effectiveFrom: FormControl<string>; effectiveTo: FormControl<string> }>;
type RqGroup = FormGroup<{ target: FormControl<string>; membershipTypeId: FormControl<string>; dayScope: FormControl<string>; period: FormControl<string>; maxRounds: FormControl<number>; maxGuestRounds: FormControl<number | null> }>;

const clampInt = (v: unknown, lo: number, hi: number, dflt: number) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || dflt)));
const clampHcp = (v: unknown) => Math.max(0, Math.min(54, Math.round((Number(v) || 0) * 10) / 10));
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { CanDirective } from '../shared/can.directive';
import { ComboboxComponent } from '../shared/combobox/combobox';
import { FieldInfoComponent } from '../shared/field-info/field-info';
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
  GolfRainCheckBasis,
  GolfPlayingRightRule,
  GolfRoundQuotaRule,
  GolfRuleTargets,
  GolfQuotaPeriod,
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
  imports: [CommonModule, ReactiveFormsModule, ScreenTitlePipe, ScreenSubtitlePipe, FavStarComponent, CanDirective, ComboboxComponent, FieldInfoComponent],
  templateUrl: './golf-settings.html',
  styleUrls: ['./golf-settings.css'],
})
export class GolfSettingsComponent implements OnInit {
  private readonly service = inject(GolfSettingService);
  private readonly fb = inject(FormBuilder);

  // Long behavioural explanations live in <app-field-info> popovers (the
  // field-info standard): each field keeps at most ONE short inline hint;
  // these are the moved paragraphs, bound with [text]="hint.x".
  readonly hint = {
    typeOverride: 'Grants selected membership types the privilege to book earlier than the general rule. The hours above always apply club-wide.',
    bookingLimit: 'Counted as the booking maker or a Member player line; playing as a member-guest is not counted. Per day prompts at search which flight is already booked; per session hides the already-booked sessions\' flights.',
    sessions: 'The club\'s day parts - e.g. Morning, Afternoon, Evening. "One booking per session" allows one booking in each; a tee time outside every session is unrestricted.',
    sameDay: 'When off, bookings start from tomorrow up to the advance window - golfers take today\'s flights by registering at the front desk.',
    merge: 'When off, the first confirmed booking claims the whole flight; more players can only be added to that same booking.',
    junior: 'A junior member (a dependent whose relationship is son, daughter or ward) may not be in a booking unless their principal is also a player - or, if no principal is on record, at least one adult member. The booking refuses; the front desk registers with a warning.',
    handicap: 'Golfers with no handicap recorded are exempt from the limits; only golfers marked Beginner or Provisional need accompanying.',
    noShow: 'The front desk reviews and confirms the day\'s no-shows before anything is charged; late cancellations are priced on the Bookings screen before the cancel is confirmed. Charges post to the booker\'s member account.',
    lateAction: 'Charging frees the flight for others; refusing keeps the booking, and players who do not turn up are recorded as no-shows.',
    noShowType: 'A No Show Charges transaction type - its flat price and tax scheme set the penalty (e.g. 80.00 + 5% tax). Maintained under Transaction Type.',
    rainCheck: 'The Tee Time Sheet offers Issue rain check on a registered player whose bill is settled, and a Rain Check payment type can redeem it on a later bill of the same golfer. A rain check is used once; value above that bill is forfeited.',
    prorate: 'Ticked: the value is the basis times the unplayed share (the desk keys the holes played). Unticked: the full basis whatever was played.',
    buggy: 'On: the Buggy Station issues a unit per buggy slot - a single buggy fee is one slot, two shared buggy fees in the same flight are one slot for both riders - and only once the fees are paid. Off: the fleet register and buggy types can still be keyed, nothing is issued. Which courses make the buggy compulsory (the fee auto-charged at registration) is set per course under Courses; the single and shared fee items under Transaction Type.',
    caddy: 'On: the Caddy Station checks caddies in (first in is next up, back of the queue after each round), assigns one caddy per caddy slot - a single caddy fee is one slot, two shared caddy fees in the same flight are one slot for both golfers - only once the fees are paid, and records each round with the holes played. A caddy is assigned out of turn only when the player asked for them. Off: the register, grades and groups can still be keyed. The single and shared caddy fee items live under Transaction Type.',
    rights: 'On: a booking is refused when a player\'s target has playing-right rules and the flight falls outside every one of them, or when the player would exceed their round quota; the front desk warns. A target with no playing-right rows is unrestricted. Rules are kept while off.',
    group: 'Off: a group booking is confirmed the moment it is created - the committee club keying its own events. On: a new booking is tentative, its reserved flights expire unless it is submitted for approval, approval starts the deposit clock, and the booking is confirmed when the deposit is received. The approval chain itself is set up under Workflow (purpose Golf group booking); with no chain, submitting approves at once.',
    shareCaps: 'The hard ceiling on the share of a course\'s tee times that all group bookings together may hold on one day - whatever an approver decides. Reserve flights refuses past it. Club events are exempt and do not count.',
  };

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly membershipTypes = signal<GolfMembershipTypeOption[]>([]);
  readonly courses = signal<GolfCourseOption[]>([]);
  readonly noShowTypes = signal<GolfNoShowTypeOption[]>([]);
  // The playing-right / round-quota targets (player types + affiliated clubs).
  readonly ruleTargets = signal<GolfRuleTargets | null>(null);

  // Collapsible section state (section-card standard; sections start open).
  readonly expanded = signal<Record<string, boolean>>({ booking: true, minPlayers: true, guests: true, handicap: true, noshow: true, raincheck: true, rights: true, buggies: true, caddies: true, groups: true, teesheet: true });

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
    // Rain checks (2026-10-15).
    rainCheckEnabled: [false],
    rainCheckValidityDays: [90, [Validators.required, Validators.min(1), Validators.max(730)]],
    rainCheckBasis: ['green-fee'],
    rainCheckProrate: [true],
    // Playing rights + round quotas (2026-10-15).
    playingRightsEnabled: [false],
    // Buggy management (2026-10-17): the Buggy Station door.
    buggyManagementEnabled: [false],
    // Caddy management (2026-10-17): the Caddy Station door.
    caddyManagementEnabled: [false],
    teeSheetColorBooked: ['#2563eb'],
    teeSheetColorRegistered: ['#f59e0b'],
    teeSheetColorBilled: ['#8b5cf6'],
    teeSheetColorSettled: ['#16a34a'],
    // Group booking control (2026-10-11).
    groupBookingControlEnabled: [false],
    groupTentativeHoldHours: [72, [Validators.required, Validators.min(0), Validators.max(720)]],
    groupDepositDueDays: [7, [Validators.required, Validators.min(0), Validators.max(365)]],
    groupDefaultDepositPct: [30, [Validators.required, Validators.min(0), Validators.max(100)]],
    groupShareCapWeekday: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
    groupShareCapWeekend: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
    groupMaxTentativePerUser: [0, [Validators.required, Validators.min(0), Validators.max(50)]],
    groupNextInLineHours: [24, [Validators.required, Validators.min(1), Validators.max(168)]],
    // The six rule editors (see the *Group types at the top of the file).
    overrides: this.fb.array<OvGroup>([]),
    minPlayerRules: this.fb.array<MpGroup>([]),
    guestRules: this.fb.array<GcGroup>([]),
    limitRules: this.fb.array<HlGroup>([]),
    accRules: this.fb.array<HaGroup>([]),
    sessions: this.fb.array<SsGroup>([]),
    rightRules: this.fb.array<PrGroup>([]),
    quotaRules: this.fb.array<RqGroup>([]),
  });
  // Playing-right whitelist rows and round-quota rows (2026-10-15).
  get rightRules(): FormArray<PrGroup> { return this.form.controls.rightRules; }
  get quotaRules(): FormArray<RqGroup> { return this.form.controls.quotaRules; }
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
  // Rain check value basis (fixed enum - native select).
  readonly rainCheckBases: { key: GolfRainCheckBasis; label: string }[] = [
    { key: 'green-fee', label: 'Green-fee lines only' },
    { key: 'bill', label: 'The whole bill' },
  ];

  readonly noShowTypeOptions = computed(() =>
    this.noShowTypes().map((t) => ({
      value: t.id,
      label: `${t.transactionType}${t.description ? ' - ' + t.description : ''}${t.isActive ? '' : ' (inactive)'}`,
    })),
  );

  readonly typeOptions = computed(() =>
    this.membershipTypes().map((t) => ({
      value: t.id,
      label: `${t.category}${t.description ? ' - ' + t.description : ''}${t.isGolfAllow ? '' : ' (no golfing right)'}`,
    })),
  );

  // One picker for the rule target: the club's active player types, then
  // its affiliated clubs ('type:<id>' / 'club:<id>').
  readonly targetOptions = computed(() => {
    const t = this.ruleTargets();
    if (!t) return [];
    return [
      ...t.playerTypes.map((p) => ({ value: `type:${p.id}`, label: `${p.code} - ${p.description}` })),
      ...t.affiliatedClubs.map((c) => ({ value: `club:${c.id}`, label: `${c.code} - ${c.name} (${c.kind === 'reciprocal' ? 'reciprocal club' : 'affiliated association'})` })),
    ];
  });
  readonly quotaPeriods = computed(() => this.ruleTargets()?.periods || [{ key: 'week' as GolfQuotaPeriod, label: 'Per week' }, { key: 'month' as GolfQuotaPeriod, label: 'Per month' }, { key: 'year' as GolfQuotaPeriod, label: 'Per year' }]);

  readonly courseOptions = computed(() =>
    this.courses().map((c) => ({
      value: c.id,
      label: `${c.courseCode}${c.description ? ' - ' + c.description : ''}${c.isActive ? '' : ' (inactive)'}`,
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
    this.service.ruleTargets().subscribe({ next: (r) => this.ruleTargets.set(r), error: () => {} });
  }

  // Method, not computed: control values are not signals.
  playingRightsOn(): boolean {
    return this.form.controls.playingRightsEnabled.value === true;
  }

  // Whether a rule target is a member-base player type (then a membership
  // type refinement makes sense).
  targetTakesMembershipType(target: string): boolean {
    if (!target.startsWith('type:')) return false;
    const t = this.ruleTargets()?.playerTypes.find((p) => p.id === target.slice(5));
    return !!t && (t.baseIdentity === 'member' || t.baseIdentity === 'member-guest');
  }

  addRightRule(): void {
    this.push(this.rightRules, this.newRightRule({ playerTypeId: null, affiliatedClubId: null, membershipTypeId: null, courseId: null, dayScope: 'all', startTime: null, endTime: null, effectiveFrom: null, effectiveTo: null }));
  }
  removeRightRule(index: number): void { this.drop(this.rightRules, index); }
  addQuotaRule(): void {
    this.push(this.quotaRules, this.newQuotaRule({ playerTypeId: null, affiliatedClubId: null, membershipTypeId: null, dayScope: 'all', period: 'month', maxRounds: 4, maxGuestRounds: null }));
  }
  removeQuotaRule(index: number): void { this.drop(this.quotaRules, index); }

  // Method, not computed: control values are not signals (same as overridesOn).
  noShowControlOn(): boolean {
    return this.form.controls.noShowControlEnabled.value === true;
  }

  groupControlOn(): boolean {
    return this.form.controls.groupBookingControlEnabled.value === true;
  }

  rainCheckOn(): boolean {
    return this.form.controls.rainCheckEnabled.value === true;
  }

  // What a rain check will be worth with the current settings (show the
  // expected result), on a worked example; hidden while the days are invalid.
  rainCheckPreview(): string {
    const c = this.form.controls;
    if (c.rainCheckValidityDays.invalid) return '';
    const days = Number(c.rainCheckValidityDays.value) || 0;
    const basis = c.rainCheckBasis.value === 'bill' ? 'the whole settled bill' : "the settled bill's green-fee lines";
    const value = c.rainCheckProrate.value
      ? 'prorated by the holes not played (6 of 18 holes played on a 90.00 green fee = 60.00)'
      : 'in full whatever was played (a 90.00 green fee = 90.00)';
    return `A rain check is worth ${basis}, ${value}; the desk may lower it, never raise it. It can be redeemed once, on one later bill of the same golfer, within ${days} day${days === 1 ? '' : 's'} of issue.`;
  }

  // What the group-booking timers mean with the current numbers (show the
  // expected result); hidden while a number is out of range.
  groupPreview(): string {
    const c = this.form.controls;
    if (c.groupTentativeHoldHours.invalid || c.groupDepositDueDays.invalid || c.groupDefaultDepositPct.invalid) return '';
    const hold = Number(c.groupTentativeHoldHours.value) || 0;
    const days = Number(c.groupDepositDueDays.value) || 0;
    const pct = Number(c.groupDefaultDepositPct.value) || 0;
    const holdText = hold > 0 ? `Reserved flights of a tentative booking are released after ${hold} hour(s) unless it is submitted for approval.` : 'Reserved flights of a tentative booking are held until it is submitted (no expiry).';
    const depText = pct > 0 ? `Unless the proforma states otherwise, the deposit is ${pct}% of the group bill, due ${days} day(s) after approval; a booking whose deposit is not in by then lapses and its flights are released.` : 'No deposit is demanded unless the proforma states one - approval confirms the booking at once.';
    return `${holdText} ${depText}`;
  }

  // The share caps in words (they apply in BOTH club modes).
  capPreview(): string {
    const c = this.form.controls;
    if (c.groupShareCapWeekday.invalid || c.groupShareCapWeekend.invalid || c.groupMaxTentativePerUser.invalid) return '';
    const wd = Number(c.groupShareCapWeekday.value) || 0;
    const we = Number(c.groupShareCapWeekend.value) || 0;
    const max = Number(c.groupMaxTentativePerUser.value) || 0;
    const cap = (n: number, label: string) => (n > 0 ? `on a ${label} all groups together may hold at most ${n}% of a course's tee times` : `no ${label} cap`);
    const hoard = max > 0 ? ` A user may hold at most ${max} tentative booking(s) with reserved flights at a time.` : '';
    return `Reserve flights refuses past the cap: ${cap(wd, 'weekday')}, ${cap(we, 'weekend or holiday')}. Club events are exempt and do not count.${hoard}`;
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
          rainCheckEnabled: doc.setting.rainCheckEnabled === true,
          rainCheckValidityDays: doc.setting.rainCheckValidityDays ?? 90,
          rainCheckBasis: doc.setting.rainCheckBasis || 'green-fee',
          rainCheckProrate: doc.setting.rainCheckProrate !== false,
          playingRightsEnabled: doc.setting.playingRightsEnabled === true,
          buggyManagementEnabled: doc.setting.buggyManagementEnabled === true,
          caddyManagementEnabled: doc.setting.caddyManagementEnabled === true,
          teeSheetColorBooked: doc.setting.teeSheetColorBooked || '#2563eb',
          teeSheetColorRegistered: doc.setting.teeSheetColorRegistered || '#f59e0b',
          teeSheetColorBilled: doc.setting.teeSheetColorBilled || '#8b5cf6',
          teeSheetColorSettled: doc.setting.teeSheetColorSettled || '#16a34a',
          groupBookingControlEnabled: doc.setting.groupBookingControlEnabled === true,
          groupTentativeHoldHours: doc.setting.groupTentativeHoldHours ?? 72,
          groupDepositDueDays: doc.setting.groupDepositDueDays ?? 7,
          groupDefaultDepositPct: doc.setting.groupDefaultDepositPct ?? 30,
          groupShareCapWeekday: doc.setting.groupShareCapWeekday ?? 0,
          groupShareCapWeekend: doc.setting.groupShareCapWeekend ?? 0,
          groupMaxTentativePerUser: doc.setting.groupMaxTentativePerUser ?? 0,
          groupNextInLineHours: doc.setting.groupNextInLineHours ?? 24,
        });
        this.fill(this.overrides, doc.overrides, (r) => this.newOverride(r));
        this.fill(this.minPlayerRules, doc.minPlayerRules ?? [], (r) => this.newMinPlayerRule(r));
        this.fill(this.guestRules, doc.guestControlRules ?? [], (r) => this.newGuestRule(r));
        this.fill(this.limitRules, doc.handicapLimitRules ?? [], (r) => this.newLimitRule(r));
        this.fill(this.accRules, doc.handicapAccompanimentRules ?? [], (r) => this.newAccRule(r));
        this.fill(this.sessions, doc.sessions ?? [], (r) => this.newSession(r));
        this.fill(this.rightRules, doc.playingRightRules ?? [], (r) => this.newRightRule(r));
        this.fill(this.quotaRules, doc.roundQuotaRules ?? [], (r) => this.newQuotaRule(r));
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
  private targetOf(r: { playerTypeId: string | null; affiliatedClubId: string | null }): string {
    return r.affiliatedClubId ? `club:${r.affiliatedClubId}` : (r.playerTypeId ? `type:${r.playerTypeId}` : '');
  }
  private newRightRule(r: GolfPlayingRightRule): PrGroup {
    return this.fb.nonNullable.group({
      target: [this.targetOf(r)], membershipTypeId: [r.membershipTypeId || ''], courseId: [r.courseId || ''], dayScope: [r.dayScope],
      startTime: [r.startTime || ''], endTime: [r.endTime || ''], effectiveFrom: [r.effectiveFrom || ''], effectiveTo: [r.effectiveTo || ''],
    });
  }
  private newQuotaRule(r: GolfRoundQuotaRule): RqGroup {
    return this.fb.nonNullable.group({
      target: [this.targetOf(r)], membershipTypeId: [r.membershipTypeId || ''], dayScope: [r.dayScope], period: [r.period as string],
      maxRounds: [r.maxRounds], maxGuestRounds: [r.maxGuestRounds as number | null],
    });
  }
  private splitTarget(target: string): { playerTypeId: string | null; affiliatedClubId: string | null } {
    if (target.startsWith('club:')) return { playerTypeId: null, affiliatedClubId: target.slice(5) };
    if (target.startsWith('type:')) return { playerTypeId: target.slice(5), affiliatedClubId: null };
    return { playerTypeId: null, affiliatedClubId: null };
  }
  private readRightRules(): GolfPlayingRightRule[] {
    return this.rightRules.controls.map((g) => {
      const v = g.getRawValue();
      const t = this.splitTarget(v.target);
      return { ...t, membershipTypeId: t.playerTypeId && this.targetTakesMembershipType(v.target) ? (v.membershipTypeId || null) : null, courseId: v.courseId || null, dayScope: v.dayScope, startTime: v.startTime || null, endTime: v.endTime || null, effectiveFrom: v.effectiveFrom || null, effectiveTo: v.effectiveTo || null };
    });
  }
  private readQuotaRules(): GolfRoundQuotaRule[] {
    return this.quotaRules.controls.map((g) => {
      const v = g.getRawValue();
      const t = this.splitTarget(v.target);
      return { ...t, membershipTypeId: t.playerTypeId && this.targetTakesMembershipType(v.target) ? (v.membershipTypeId || null) : null, dayScope: v.dayScope, period: v.period as GolfQuotaPeriod, maxRounds: clampInt(v.maxRounds, 1, 999, 1), maxGuestRounds: v.maxGuestRounds === null || v.maxGuestRounds === undefined || String(v.maxGuestRounds) === '' ? null : clampInt(v.maxGuestRounds, 0, 999, 0) };
    });
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

  // The save bar's "Discard changes": re-load from the server, which resets
  // every control (and the FormArrays) to the saved state, pristine.
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
          this.errorMessage.set(`A ${label} rule needs both From and To times - or neither for the whole day.`);
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

    const rightRules = this.readRightRules();
    const quotaRules = this.readQuotaRules();
    for (const r of [...rightRules, ...quotaRules]) {
      if (!r.playerTypeId && !r.affiliatedClubId) {
        this.errorMessage.set('Every playing-right and round-quota rule needs a target - a player type or an affiliated club.');
        return;
      }
    }
    for (const r of rightRules) {
      if (!!r.startTime !== !!r.endTime) {
        this.errorMessage.set('A playing-right rule needs both From and To times - or neither for the whole day.');
        return;
      }
      if (r.startTime && r.endTime && r.startTime >= r.endTime) {
        this.errorMessage.set('A playing-right rule\'s From time must be before its To time.');
        return;
      }
      if (r.effectiveFrom && r.effectiveTo && r.effectiveTo < r.effectiveFrom) {
        this.errorMessage.set('A playing-right rule cannot end before it starts.');
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
      rainCheckEnabled: v.rainCheckEnabled,
      rainCheckValidityDays: v.rainCheckValidityDays,
      rainCheckBasis: v.rainCheckBasis as GolfRainCheckBasis,
      rainCheckProrate: v.rainCheckProrate,
      playingRightsEnabled: v.playingRightsEnabled,
      buggyManagementEnabled: v.buggyManagementEnabled,
      caddyManagementEnabled: v.caddyManagementEnabled,
      teeSheetColorBooked: v.teeSheetColorBooked,
      teeSheetColorRegistered: v.teeSheetColorRegistered,
      teeSheetColorBilled: v.teeSheetColorBilled,
      teeSheetColorSettled: v.teeSheetColorSettled,
      groupBookingControlEnabled: v.groupBookingControlEnabled,
      groupTentativeHoldHours: v.groupTentativeHoldHours,
      groupDepositDueDays: v.groupDepositDueDays,
      groupDefaultDepositPct: v.groupDefaultDepositPct,
      groupShareCapWeekday: v.groupShareCapWeekday,
      groupShareCapWeekend: v.groupShareCapWeekend,
      groupMaxTentativePerUser: v.groupMaxTentativePerUser,
      groupNextInLineHours: v.groupNextInLineHours,
      overrides: rows,
      minPlayerRules: rules,
      guestControlRules: guestRules,
      handicapLimitRules: this.readLimitRules(),
      handicapAccompanimentRules: accRules,
      sessions,
      playingRightRules: rightRules,
      roundQuotaRules: quotaRules,
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
