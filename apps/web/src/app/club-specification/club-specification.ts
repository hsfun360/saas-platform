import { Component, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ClubSpecificationService } from '../services/club-specification.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { ClubNumbering, ClubSpecification, MembershipStatusOption } from '../models/auth.models';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { ConfirmDialogComponent, ConfirmRequest } from '../shared/confirm-dialog/confirm-dialog';
import { UnsavedChangesAware } from '../shared/unsaved-changes.guard';
import { FieldInfoComponent } from '../shared/field-info/field-info';

// Membership Management → Club Specification (SRS 2.1.1 - the membership
// system master). A per-company singleton the club sets once: club type,
// committee vs commercial admission, the sales channels in use, and how
// membership numbers are issued. Modify-only - the record always exists.
//
// Every option states its consequence in a caption (the "show expected
// results" principle): the user sees WHAT the entry screens will hide.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-club-specification',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent, ConfirmDialogComponent, FieldInfoComponent],
  templateUrl: './club-specification.html',
  styleUrls: ['../numbering/numbering.css', './club-specification.css'],
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class ClubSpecificationComponent implements OnInit, UnsavedChangesAware {
  private readonly service = inject(ClubSpecificationService);
  private readonly fb = inject(FormBuilder);

  // Route-leave guard (unsavedChangesGuard on the route): a menu click,
  // browser Back or refresh cannot silently drop a dirty form.
  readonly leaveConfirm = signal<ConfirmRequest | null>(null);
  private leaveResolve: ((leave: boolean) => void) | null = null;

  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.saving();
  }

  confirmLeave(): Promise<boolean> {
    return new Promise((resolve) => {
      this.leaveResolve = resolve;
      this.leaveConfirm.set({
        title: 'Discard unsaved changes?',
        message: 'Your club specification changes have not been saved and will be lost if you leave this screen.',
        confirmLabel: 'Discard changes',
        cancelLabel: 'Keep editing',
        run: () => this.resolveLeave(true),
      });
    });
  }

  cancelLeave(): void {
    this.resolveLeave(false);
  }

  private resolveLeave(leave: boolean): void {
    this.leaveConfirm.set(null);
    this.leaveResolve?.(leave);
    this.leaveResolve = null;
  }

  // The save bar's "Discard changes": re-load resets everything pristine.
  discard(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
    this.load();
  }

  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly clubTypes = signal<MembershipStatusOption[]>([]);
  readonly resetRules = signal<MembershipStatusOption[]>([]);
  readonly tokens = signal<{ token: string; label: string }[]>([]);
  readonly numbering = signal<ClubNumbering | null>(null);

  // Collapsible section cards (Settings-style chevron headers) - the screen is
  // long on a phone, so each card folds to its header. All start expanded.
  // Three cards since 2026-10-28 (user request): Club profile (type +
  // admission + sales channels), Credit facility, Membership number.
  readonly collapsedSections = signal<Record<string, boolean>>({});

  // The long behavioural explanations behind each (i) (settings-chrome
  // standard: ONE short inline hint per field, the rest in the popover).
  readonly hint = {
    committee: 'A committee club admits members by proposal, interview and provision. Membership entry shows the Proposer field and hides the salesperson pickers, and the Sales channels below disappear because a committee club has no sales agents. Switch it off for a commercial pay-to-join club.',
    credit: 'When on, membership entry shows the credit terms - credit limit, terms, statement, arrears reminders and late-payment interest - and the Membership Type carries a default credit limit. When off those fields are hidden and every membership is saved with a credit limit of 0.',
    autoNumber: 'When on, the system issues the next membership number on save from the Membership No. series (configure the format below; the same series is maintained on Numbering Control). When off, staff key the number in, for example from a pre-printed card, and the system only checks that it is not already used.',
  };

  toggleSection(id: string): void {
    this.collapsedSections.update((c) => ({ ...c, [id]: !c[id] }));
  }

  isExpanded(id: string): boolean {
    return !this.collapsedSections()[id];
  }

  // Plain-language consequence caption per club type (shown under the radio).
  readonly clubTypeHints: Record<string, string> = {
    golf: 'Golf and facilities. Membership types can grant golfing access.',
    leisure: 'Facilities without golfing. Golfing options are hidden.',
    others: 'Any other profile (fitness centers etc.). Golfing options are hidden.',
  };

  // Child-number suffix vocab: separator + numbering style compose the stored
  // pattern (e.g. '.' + '001' -> '.001'). Kept as paired selects so the club
  // reads exactly what each choice produces.
  readonly suffixSeparators = [
    { key: '-', label: '- (dash)' },
    { key: '/', label: '/ (slash)' },
    { key: '.', label: '. (dot)' },
    { key: '#', label: '# (hash)' },
  ];
  readonly suffixStyles = [
    { key: 'A', label: 'Letters (A, B, C…)' },
    { key: '1', label: 'Numbers (1, 2, 3…)' },
    { key: '01', label: 'Numbers, 2 digits (01, 02…)' },
    { key: '001', label: 'Numbers, 3 digits (001, 002…)' },
    { key: '0001', label: 'Numbers, 4 digits (0001, 0002…)' },
  ];

  readonly form = this.fb.nonNullable.group({
    clubType: this.fb.nonNullable.control<'golf' | 'leisure' | 'others'>('golf', [Validators.required]),
    isCommittee: [false],
    creditFacilityEnabled: [true],
    nomineeSep: ['-'],
    nomineeStyle: ['A'],
    dependentSep: ['-'],
    dependentStyle: ['A'],
    salesAgencyEnabled: [true],
    salesExternalEnabled: [true],
    salesInternalEnabled: [true],
    isMembershipAutoNumber: [false],
  });
  readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  // Live suffix preview (show-expected-results): the first child numbers a
  // club would see under the current choices, nominee chain included.
  readonly suffixPreview = computed(() => {
    const v = this.formValue();
    const nominee = `CORP-0001${v.nomineeSep}${v.nomineeStyle}`;
    return {
      nominee,
      nomineeDependent: `${nominee}${v.dependentSep}${v.dependentStyle}`,
      individualDependent: `IND-0001${v.dependentSep}${v.dependentStyle}`,
    };
  });

  // '-A' -> { sep: '-', style: 'A' } with defensive fallback to the default.
  private splitSuffix(pattern: string | undefined): { sep: string; style: string } {
    const p = pattern && pattern.length >= 2 ? pattern : '-A';
    return { sep: p[0], style: p.slice(1) };
  }

  // --- Configure dialog (the auto-number format; Numbering Control underneath) ---
  readonly configOpen = signal(false);
  readonly configSaving = signal(false);
  readonly configForm = this.fb.nonNullable.group({
    prefix: ['', [Validators.maxLength(20)]],
    format: ['{PREFIX}{SEQ}', [Validators.required, Validators.maxLength(60)]],
    seqPadLength: [5, [Validators.required, Validators.min(0), Validators.max(12)]],
    startingNumber: [1, [Validators.required, Validators.min(1)]],
    resetRule: ['never', [Validators.required]],
  });
  private readonly configValue = toSignal(this.configForm.valueChanges, { initialValue: this.configForm.getRawValue() });

  // Live sample of the next number as the user edits - mirrors the server
  // generator: next seq = counter+1, or startingNumber if not started.
  readonly configPreview = computed(() => {
    const v = this.configValue();
    const starting = Number(v.startingNumber) || 1;
    const current = this.numbering()?.scheme?.currentNumber ?? 0;
    const seq = current >= starting ? current + 1 : starting;
    return this.render(v.format || '{PREFIX}{SEQ}', v.prefix || '', Number(v.seqPadLength) || 0, seq);
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.service.get().subscribe({
      next: (data) => {
        this.applyData(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load the club specification.');
      },
    });
  }

  private applyData(data: ClubSpecification): void {
    if (data.meta) {
      this.clubTypes.set(data.meta.clubTypes || []);
      this.resetRules.set(data.meta.numbering?.resetRules || []);
      this.tokens.set(data.meta.numbering?.tokens || []);
    }
    this.numbering.set(data.numbering);
    const nominee = this.splitSuffix(data.settings.nomineeNoSuffix);
    const dependent = this.splitSuffix(data.settings.dependentNoSuffix);
    this.form.reset({
      clubType: data.settings.clubType,
      isCommittee: data.settings.isCommittee,
      creditFacilityEnabled: data.settings.creditFacilityEnabled !== false,
      nomineeSep: nominee.sep,
      nomineeStyle: nominee.style,
      dependentSep: dependent.sep,
      dependentStyle: dependent.style,
      salesAgencyEnabled: data.settings.salesAgencyEnabled,
      salesExternalEnabled: data.settings.salesExternalEnabled,
      salesInternalEnabled: data.settings.salesInternalEnabled,
      isMembershipAutoNumber: data.numbering.isMembershipAutoNumber,
    });
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  resetRuleLabel(key: string | undefined): string {
    return this.resetRules().find((r) => r.key === key)?.label || key || '';
  }

  clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }

  save(): void {
    this.clearMessages();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const f = this.form.getRawValue();
    this.service.save({
      ...f,
      nomineeNoSuffix: `${f.nomineeSep}${f.nomineeStyle}`,
      dependentNoSuffix: `${f.dependentSep}${f.dependentStyle}`,
    }).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.successMessage.set(res.message);
        this.numbering.set(res.numbering);
        this.form.reset({ ...this.form.getRawValue(), ...res.settings, isMembershipAutoNumber: res.numbering.isMembershipAutoNumber });
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to save the club specification.');
      },
    });
  }

  // --- Configure dialog ---

  openConfig(): void {
    this.clearMessages();
    const s = this.numbering()?.scheme;
    this.configForm.reset({
      prefix: s?.prefix || '',
      format: s?.format || '{PREFIX}{SEQ}',
      seqPadLength: s?.seqPadLength ?? 5,
      startingNumber: s?.startingNumber ?? 1,
      resetRule: s?.resetRule || 'never',
    });
    this.configOpen.set(true);
  }

  insertToken(token: string): void {
    const ctrl = this.configForm.controls.format;
    ctrl.setValue(`${ctrl.value}${token}`);
    ctrl.markAsDirty();
  }

  saveConfig(): void {
    if (this.configForm.invalid) {
      this.configForm.markAllAsTouched();
      return;
    }
    const v = this.configForm.getRawValue();
    this.configSaving.set(true);
    this.service.saveNumbering({
      prefix: v.prefix.trim() || null,
      format: v.format.trim() || '{PREFIX}{SEQ}',
      seqPadLength: Number(v.seqPadLength),
      startingNumber: Number(v.startingNumber),
      resetRule: v.resetRule,
    }).subscribe({
      next: (res) => {
        this.configSaving.set(false);
        this.configOpen.set(false);
        this.numbering.set(res.numbering);
        this.successMessage.set(res.message);
      },
      error: (err) => {
        this.configSaving.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to save the numbering format.');
      },
    });
  }

  private render(format: string, prefix: string, pad: number, seq: number): string {
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const map: Record<string, string> = {
      '{PREFIX}': prefix,
      '{SEQ}': String(seq).padStart(Math.max(0, pad), '0'),
      '{YYYY}': yyyy,
      '{YY}': yyyy.slice(-2),
      '{MM}': String(now.getMonth() + 1).padStart(2, '0'),
      '{TYPE}': format.includes('{TYPE}') ? 'ORD' : '',
    };
    return format.replace(/\{PREFIX\}|\{SEQ\}|\{YYYY\}|\{YY\}|\{MM\}|\{TYPE\}/g, (m) => map[m] ?? '');
  }
}
