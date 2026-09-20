import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
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
  GolfCourseOption,
} from '../services/golf-setting.service';

// Golf Management → Golf Specification (/golf/settings) - the per-company
// golf settings singleton (pattern of Club Specification). Today: the
// advance-booking window - general days + early-opening hours before
// midnight + optional per-membership-type day overrides (privileged earlier
// booking). The window for play date D opens at 00:00 of (D - effectiveDays)
// minus the hours, club-local. Section-card standard, one Save (PUT upserts
// the singleton and replaces the override lines atomically).
@Component({
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

  // Collapsible section state (section-card standard; sections start open).
  readonly expanded = signal<Record<string, boolean>>({ booking: true, minPlayers: true, guests: true });

  readonly form = this.fb.nonNullable.group({
    advanceBookingDays: [7, [Validators.required, Validators.min(0), Validators.max(365)]],
    advanceBookingHours: [0, [Validators.required, Validators.min(0), Validators.max(23)]],
    allowMembershipTypeOverride: [false],
    allowBookingMerge: [false],
    minPlayersWeekday: [1, [Validators.required, Validators.min(1), Validators.max(10)]],
    minPlayersWeekend: [1, [Validators.required, Validators.min(1), Validators.max(10)]],
    bookingLockMinutes: [5, [Validators.required, Validators.min(1), Validators.max(60)]],
    guestControlEnabled: [false],
    allowGuestWeekday: [true],
    allowMemberGuestWeekday: [true],
    allowGuestWeekend: [true],
    allowMemberGuestWeekend: [true],
  });

  // Override lines kept outside the FormGroup (dynamic rows); ovDirty feeds
  // the Save state alongside form.dirty.
  readonly overrides = signal<GolfAdvanceBookingOverride[]>([]);
  readonly ovDirty = signal(false);

  // Minimum-players exception rules (same dynamic-row pattern).
  readonly minPlayerRules = signal<GolfMinPlayerRule[]>([]);
  readonly mpDirty = signal(false);

  // Guest-control exception rules (same dynamic-row pattern).
  readonly guestRules = signal<GolfGuestControlRule[]>([]);
  readonly gcDirty = signal(false);

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

  ngOnInit(): void {
    this.load();
    this.service.membershipTypes().subscribe({ next: (r) => this.membershipTypes.set(r.membershipTypes), error: () => {} });
    this.service.courses().subscribe({ next: (r) => this.courses.set(r.courses), error: () => {} });
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
          guestControlEnabled: doc.setting.guestControlEnabled,
          allowGuestWeekday: doc.setting.allowGuestWeekday,
          allowMemberGuestWeekday: doc.setting.allowMemberGuestWeekday,
          allowGuestWeekend: doc.setting.allowGuestWeekend,
          allowMemberGuestWeekend: doc.setting.allowMemberGuestWeekend,
        });
        this.overrides.set(doc.overrides);
        this.ovDirty.set(false);
        this.minPlayerRules.set(doc.minPlayerRules ?? []);
        this.mpDirty.set(false);
        this.guestRules.set(doc.guestControlRules ?? []);
        this.gcDirty.set(false);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load the golf specification.');
      },
    });
  }

  addOverride(): void {
    this.overrides.update((rows) => [...rows, { membershipTypeId: '', advanceBookingDays: this.form.controls.advanceBookingDays.value }]);
    this.ovDirty.set(true);
  }

  removeOverride(index: number): void {
    this.overrides.update((rows) => rows.filter((_, i) => i !== index));
    this.ovDirty.set(true);
  }

  setOverrideType(index: number, value: string): void {
    this.overrides.update((rows) => rows.map((r, i) => (i === index ? { ...r, membershipTypeId: value } : r)));
    this.ovDirty.set(true);
  }

  setOverrideDays(index: number, value: string): void {
    const days = Math.max(0, Math.min(365, Math.floor(Number(value) || 0)));
    this.overrides.update((rows) => rows.map((r, i) => (i === index ? { ...r, advanceBookingDays: days } : r)));
    this.ovDirty.set(true);
  }

  addRule(): void {
    this.minPlayerRules.update((rows) => [...rows, { courseId: null, dayScope: 'all', startTime: null, endTime: null, minPlayers: 2 }]);
    this.mpDirty.set(true);
  }

  removeRule(index: number): void {
    this.minPlayerRules.update((rows) => rows.filter((_, i) => i !== index));
    this.mpDirty.set(true);
  }

  setRule(index: number, patch: Partial<GolfMinPlayerRule>): void {
    this.minPlayerRules.update((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    this.mpDirty.set(true);
  }

  setRuleMin(index: number, value: string): void {
    const min = Math.max(1, Math.min(10, Math.floor(Number(value) || 1)));
    this.setRule(index, { minPlayers: min });
  }

  // Method, not computed: control values are not signals (same as overridesOn).
  guestControlOn(): boolean {
    return this.form.controls.guestControlEnabled.value === true;
  }

  addGuestRule(): void {
    this.guestRules.update((rows) => [...rows, { courseId: null, dayScope: 'all', startTime: null, endTime: null, allowGuest: true, allowMemberGuest: true }]);
    this.gcDirty.set(true);
  }

  removeGuestRule(index: number): void {
    this.guestRules.update((rows) => rows.filter((_, i) => i !== index));
    this.gcDirty.set(true);
  }

  setGuestRule(index: number, patch: Partial<GolfGuestControlRule>): void {
    this.guestRules.update((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    this.gcDirty.set(true);
  }

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
    const rows = this.overrides();
    if (rows.some((r) => !r.membershipTypeId)) {
      this.errorMessage.set('Every override line needs a membership type.');
      return;
    }
    const ids = rows.map((r) => r.membershipTypeId);
    if (new Set(ids).size !== ids.length) {
      this.errorMessage.set('A membership type can only have one override line.');
      return;
    }
    const rules = this.minPlayerRules();
    const guestRules = this.guestRules();
    for (const [label, scoped] of [['minimum-players', rules], ['guest-control', guestRules]] as const) {
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

    const v = this.form.getRawValue();
    this.saving.set(true);
    this.service.save({
      advanceBookingDays: v.advanceBookingDays,
      advanceBookingHours: v.advanceBookingHours,
      allowMembershipTypeOverride: v.allowMembershipTypeOverride,
      allowBookingMerge: v.allowBookingMerge,
      minPlayersWeekday: v.minPlayersWeekday,
      minPlayersWeekend: v.minPlayersWeekend,
      bookingLockMinutes: v.bookingLockMinutes,
      guestControlEnabled: v.guestControlEnabled,
      allowGuestWeekday: v.allowGuestWeekday,
      allowMemberGuestWeekday: v.allowMemberGuestWeekday,
      allowGuestWeekend: v.allowGuestWeekend,
      allowMemberGuestWeekend: v.allowMemberGuestWeekend,
      overrides: rows,
      minPlayerRules: rules,
      guestControlRules: guestRules,
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
