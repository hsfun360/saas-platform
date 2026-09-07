import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NumberingModule, NumberingService } from '../services/numbering.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { NumberingCopyCandidate, NumberingScheme, NumberingToken, MembershipStatusOption } from '../models/auth.models';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { OverflowMenuComponent, MenuItemDirective } from '../shared/overflow-menu/overflow-menu';
import { CanDirective } from '../shared/can.directive';

// Numbering Control - per-company document numbering, ONE screen instance per
// OWNING MODULE (split 2026-08-05): /membership/numbering and /ar/numbering
// share this component; the route's `numberingModule` data picks the module's
// table + purpose list. `mode` decides auto-generate vs manual entry; for
// auto, the format tokens + counter build the number. Live preview mirrors the
// server generator. Reactive Forms + the dialog dirty-guard.
@Component({
  selector: 'app-numbering',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent, OverflowMenuComponent, MenuItemDirective, CanDirective],
  templateUrl: './numbering.html',
  // ar-transaction-types.css carries the shared copy-picker row styles.
  styleUrls: ['../system-setup/system-setup.css', '../ar-transaction-types/ar-transaction-types.css', './numbering.css'],
})
export class NumberingComponent implements OnInit {
  private readonly service = inject(NumberingService);
  private readonly fb = inject(FormBuilder);
  // 'membership' | 'ar' from the route definition.
  readonly module: NumberingModule =
    (inject(ActivatedRoute).snapshot.data['numberingModule'] as NumberingModule) || 'membership';

  readonly schemes = signal<NumberingScheme[]>([]);
  readonly modes = signal<MembershipStatusOption[]>([]);
  readonly resetRules = signal<MembershipStatusOption[]>([]);
  readonly purposes = signal<MembershipStatusOption[]>([]);
  readonly tokens = signal<NumberingToken[]>([]);
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);

  readonly dialogOpen = signal(false);
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);
  // The saved counter of the row being edited (0 for a new scheme) - feeds the preview.
  readonly editCurrentNumber = signal(0);

  readonly form = this.fb.nonNullable.group({
    purpose: ['membership', [Validators.required]],
    mode: ['auto', [Validators.required]],
    prefix: ['', [Validators.maxLength(20)]],
    format: ['{PREFIX}{SEQ}', [Validators.required, Validators.maxLength(60)]],
    seqPadLength: [5, [Validators.required, Validators.min(0), Validators.max(12)]],
    startingNumber: [1, [Validators.required, Validators.min(1)]],
    resetRule: ['never', [Validators.required]],
  });

  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  // Purposes that don't yet have a scheme (only one 'membership' today).
  readonly availablePurposes = computed(() => {
    const used = new Set(this.schemes().map((s) => s.purpose));
    return this.purposes().filter((p) => !used.has(p.key));
  });

  readonly dialogTitle = computed(() =>
    this.editId() ? `Edit — ${this.purposeLabel(this.formValue().purpose ?? 'membership')}` : 'New numbering scheme',
  );

  // Live sample of the next number as the user edits (auto mode only). Mirrors
  // the server generator: next seq = counter+1, or startingNumber if not started.
  readonly preview = computed(() => {
    const v = this.formValue();
    if (v.mode !== 'auto') return null;
    const starting = Number(v.startingNumber) || 1;
    const current = this.editCurrentNumber();
    const seq = current >= starting ? current + 1 : starting;
    return this.render(v.format || '{PREFIX}{SEQ}', v.prefix || '', Number(v.seqPadLength) || 0, seq);
  });

  constructor() {
    this.form.controls.mode.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((mode) => this.syncModeControls(mode));
  }

  ngOnInit(): void {
    this.loadMeta();
    this.load();
  }

  // Format fields are only relevant for auto mode; disable them for manual so the
  // form stays clean and the preview hides.
  private syncModeControls(mode: string): void {
    const c = this.form.controls;
    const fields = [c.prefix, c.format, c.seqPadLength, c.startingNumber, c.resetRule];
    if (mode === 'auto') {
      fields.forEach((f) => f.enable({ emitEvent: false }));
    } else {
      fields.forEach((f) => f.disable({ emitEvent: false }));
    }
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

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  purposeLabel(key: string): string {
    return this.purposes().find((p) => p.key === key)?.label || key;
  }
  modeLabel(key: string): string {
    return this.modes().find((m) => m.key === key)?.label || key;
  }
  resetRuleLabel(key: string): string {
    return this.resetRules().find((r) => r.key === key)?.label || key;
  }

  insertToken(token: string): void {
    const ctrl = this.form.controls.format;
    ctrl.setValue(`${ctrl.value}${token}`);
    ctrl.markAsDirty();
  }

  loadMeta(): void {
    this.service.meta(this.module).subscribe({
      next: (m) => {
        this.modes.set(m.modes);
        this.resetRules.set(m.resetRules);
        this.purposes.set(m.purposes);
        this.tokens.set(m.tokens);
      },
      error: () => {},
    });
  }

  load(): void {
    this.loading.set(true);
    this.service.list(this.module).subscribe({
      next: (data) => {
        this.schemes.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load numbering schemes.');
      },
    });
  }

  openAdd(): void {
    this.clearMessages();
    this.editId.set(null);
    this.editCurrentNumber.set(0);
    const purpose = this.availablePurposes()[0]?.key || 'membership';
    this.form.reset({
      purpose,
      mode: 'auto',
      prefix: '',
      format: '{PREFIX}{SEQ}',
      seqPadLength: 5,
      startingNumber: 1,
      resetRule: 'never',
    });
    this.syncModeControls('auto');
    this.dialogOpen.set(true);
  }

  openEdit(s: NumberingScheme): void {
    this.clearMessages();
    this.editId.set(s.id);
    this.editCurrentNumber.set(s.currentNumber ?? 0);
    this.form.reset({
      purpose: s.purpose,
      mode: s.mode,
      prefix: s.prefix || '',
      format: s.format || '{PREFIX}{SEQ}',
      seqPadLength: s.seqPadLength ?? 5,
      startingNumber: s.startingNumber ?? 1,
      resetRule: s.resetRule || 'never',
    });
    this.syncModeControls(s.mode);
    this.dialogOpen.set(true);
  }

  closeDialog(): void {
    this.dialogOpen.set(false);
  }

  onSave(): void {
    this.clearMessages();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const payload: Partial<NumberingScheme> =
      v.mode === 'auto'
        ? {
            mode: 'auto',
            prefix: v.prefix.trim() || null,
            format: v.format.trim() || '{PREFIX}{SEQ}',
            seqPadLength: Number(v.seqPadLength),
            startingNumber: Number(v.startingNumber),
            resetRule: v.resetRule,
          }
        : { mode: 'manual' };

    this.saving.set(true);
    const id = this.editId();
    const req$ = id
      ? this.service.update(this.module, id, payload)
      : this.service.create(this.module, { purpose: v.purpose, ...payload });
    req$.subscribe({
      next: () => {
        this.successMessage.set(`${this.purposeLabel(v.purpose)} numbering ${id ? 'updated' : 'created'}.`);
        this.saving.set(false);
        this.dialogOpen.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save numbering scheme.');
        this.saving.set(false);
      },
    });
  }

  toggleActive(s: NumberingScheme): void {
    this.clearMessages();
    const next = !(s.isActive !== false);
    this.togglingId.set(s.id);
    this.service.update(this.module, s.id, { isActive: next }).subscribe({
      next: () => {
        this.successMessage.set(`${this.purposeLabel(s.purpose)} numbering ${next ? 'enabled' : 'disabled'}.`);
        this.togglingId.set(null);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update numbering scheme.');
        this.togglingId.set(null);
      },
    });
  }

  // --- Copy from company (2026-09-07, mirrors the Transaction Type copy):
  // sources = the caller's OTHER companies (server re-validates access); the
  // candidate step previews each configured series (show-expected-results) -
  // purposes already configured here are marked and unselectable, new rows
  // pre-selected. Only the CONFIG copies; counters start fresh.
  readonly copyOpen = signal(false);
  readonly copyView = signal<'company' | 'pick'>('company');
  readonly copySources = signal<{ id: string; name: string }[]>([]);
  readonly copySource = signal<{ id: string; name: string } | null>(null);
  readonly copyCandidates = signal<NumberingCopyCandidate[]>([]);
  readonly copyLoading = signal(false);
  readonly copyBusy = signal(false);
  readonly copySelected = signal<Set<string>>(new Set());
  readonly copySelectableCount = computed(() => this.copyCandidates().filter((c) => !c.exists).length);
  readonly copySelectedCount = computed(() => this.copySelected().size);

  openCopy(): void {
    this.clearMessages();
    this.copyView.set('company');
    this.copySource.set(null);
    this.copyCandidates.set([]);
    this.copySelected.set(new Set());
    this.copyOpen.set(true);
    this.copyLoading.set(true);
    this.service.copySources(this.module).subscribe({
      next: (res) => {
        this.copySources.set(res.companies);
        this.copyLoading.set(false);
        if (!res.companies.length) {
          this.copyOpen.set(false);
          this.errorMessage.set('You have access to no other company to copy from.');
        }
      },
      error: (err) => {
        this.copyLoading.set(false);
        this.copyOpen.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load your companies.');
      },
    });
  }

  pickCopySource(company: { id: string; name: string }): void {
    this.copySource.set(company);
    this.copyView.set('pick');
    this.copyLoading.set(true);
    this.copyCandidates.set([]);
    this.service.copyCandidates(this.module, company.id).subscribe({
      next: (res) => {
        this.copyCandidates.set(res.candidates);
        this.copySelected.set(new Set(res.candidates.filter((c) => !c.exists).map((c) => c.id)));
        this.copyLoading.set(false);
      },
      error: (err) => {
        this.copyLoading.set(false);
        this.copyView.set('company');
        this.errorMessage.set(err.error?.message || 'Failed to load that company’s numbering schemes.');
      },
    });
  }

  copyBack(): void {
    this.copyView.set('company');
    this.copySource.set(null);
    this.copyCandidates.set([]);
    this.copySelected.set(new Set());
  }

  isCopySelected(id: string): boolean {
    return this.copySelected().has(id);
  }
  toggleCopySelected(c: NumberingCopyCandidate): void {
    if (c.exists) return;
    const next = new Set(this.copySelected());
    if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
    this.copySelected.set(next);
  }
  allCopySelected(): boolean {
    const selectable = this.copyCandidates().filter((c) => !c.exists);
    return selectable.length > 0 && selectable.every((c) => this.copySelected().has(c.id));
  }
  toggleAllCopy(): void {
    const selectable = this.copyCandidates().filter((c) => !c.exists);
    this.copySelected.set(this.allCopySelected() ? new Set() : new Set(selectable.map((c) => c.id)));
  }

  doCopy(): void {
    const src = this.copySource();
    const ids = [...this.copySelected()];
    if (!src || !ids.length || this.copyBusy()) return;
    this.clearMessages();
    this.copyBusy.set(true);
    this.service.copySchemes(this.module, src.id, ids).subscribe({
      next: (res) => {
        this.copyBusy.set(false);
        this.copyOpen.set(false);
        this.successMessage.set(res.message);
        this.load();
      },
      error: (err) => {
        this.copyBusy.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to copy numbering schemes.');
      },
    });
  }

  closeCopy(): void {
    this.copyOpen.set(false);
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
