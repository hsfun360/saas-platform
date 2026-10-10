import { Component, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { CanDirective } from '../shared/can.directive';
import { ArService } from '../services/ar.service';
import { ArDesignatedTypeOption, ArSetting, ArStatementColumn, ArStatementColumnKey } from '../models/ar.models';
import { ComboboxComponent } from '../shared/combobox/combobox';

// Combobox row for a designated-transaction-type picker: code — description.
const toTypeChoice = (t: ArDesignatedTypeOption): { value: string; label: string } => ({
  value: t.id,
  label: t.description ? `${t.transactionType} — ${t.description}` : t.transactionType,
});

// The lines-table column catalogue (mirrors the PDF renderer's BASE_COLS).
type ColumnGroup = FormGroup<{
  key: FormControl<ArStatementColumnKey>;
  name: FormControl<string>;      // default label, shown as the row identity
  visible: FormControl<boolean>;
  label: FormControl<string>;     // override; '' = default
}>;
type ColumnValue = ReturnType<ColumnGroup['getRawValue']>;

const COLUMN_CATALOG: { key: ArStatementColumnKey; name: string }[] = [
  { key: 'date', name: 'DATE' },
  { key: 'docNo', name: 'DOCUMENT' },
  { key: 'details', name: 'DETAILS' },
  { key: 'debit', name: 'DEBIT' },
  { key: 'credit', name: 'CREDIT' },
  { key: 'balance', name: 'BALANCE' },
];

// Account Receivable → AR Specification (split from Statement Generation
// 2026-08-06, same role as Club Specification for Membership): the per-company
// AR options singleton. Today: statement cutoff day + the aging boundaries
// printed on every statement. Future AR-wide switches land here, not on the
// processing screens.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ar-specification',
  standalone: true,
  imports: [
    FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule,
    CanDirective, CdkDropList, CdkDrag, CdkDragHandle, ComboboxComponent,
  ],
  templateUrl: './ar-specification.html',
  styleUrls: ['../system-setup/system-setup.css', './ar-specification.css'],
})
export class ArSpecificationComponent implements OnInit {
  private readonly service = inject(ArService);
  private readonly fb = inject(FormBuilder);

  readonly successMessage = signal('');
  readonly errorMessage = signal('');
  readonly loading = signal(true);
  readonly saving = signal(false);

  // Collapsible section cards (standard: start expanded; folding never loses
  // form state - the FormGroup keeps values while the DOM is hidden).
  readonly expanded = signal<Record<string, boolean>>({ cutoff: true, aging: true, layout: true, integration: true, currency: true });

  // Membership integration (2026-08-15): shown ONLY when the company is
  // entitled to Membership Management (AR-only subscribers never see it);
  // the API enforces the same server-side.
  readonly membershipEntitled = signal(false);
  readonly interestTypeOptions = signal<ArDesignatedTypeOption[]>([]);
  readonly depConvTypeOptions = signal<ArDesignatedTypeOption[]>([]);
  readonly interestTypeChoices = computed(() => this.interestTypeOptions().map(toTypeChoice));
  readonly depConvTypeChoices = computed(() => this.depConvTypeOptions().map(toTypeChoice));

  // Multi-currency (2026-08-21): the toggle needs the company's default
  // currency (= the AR base currency) - null keeps it off with a pointer to
  // the Companies screen; the API enforces the same prerequisite.
  readonly baseCurrencyCode = signal<string | null>(null);
  readonly forexTypeOptions = signal<ArDesignatedTypeOption[]>([]);
  readonly forexTypeChoices = computed(() => this.forexTypeOptions().map(toTypeChoice));

  readonly form = this.fb.nonNullable.group({
    // Blank = calendar month; otherwise a whole day 1..31 (pattern runs on the
    // stringified value, so it also rejects decimals like 27.5).
    statementCutoffDay: ['', [Validators.min(1), Validators.max(31), Validators.pattern(/^\d*$/)]],
    aging1: ['', [Validators.required]],
    aging2: [''],
    aging3: [''],
    aging4: [''],
    aging5: [''],
    aging6: [''],
    // Statement layout (Level 1).
    statementShowLogo: [true],
    useBrandColor: [false],
    statementBrandColor: ['#1e3a8a'],
    statementShowAging: [true],
    statementShowDeposit: [true],
    statementShowIncurredBy: [true],
    statementShowGeneratedNote: [true],
    statementFooterText: [''],
    // Membership integration.
    membershipIntegration: [false],
    interestTransactionTypeId: [''],
    depositConversionTransactionTypeId: [''],
    // Multi-currency.
    multiCurrencyEnabled: [false],
    fxTransactionTypeId: [''],
    // Statement table columns - see "Column layout" below.
    columns: this.fb.array<ColumnGroup>([]),
  });

  ngOnInit(): void {
    this.service.getArSetting().subscribe({
      next: (res) => {
        this.membershipEntitled.set(res.membershipModuleEntitled === true);
        this.interestTypeOptions.set(res.interestTypeOptions || []);
        this.depConvTypeOptions.set(res.depositConversionTypeOptions || []);
        this.baseCurrencyCode.set(res.baseCurrencyCode || null);
        this.forexTypeOptions.set(res.forexTypeOptions || []);
        this.applySetting(res.setting);
        // No base currency = the toggle cannot be switched on (reactive-forms
        // way: disable the control, never the DOM attribute).
        if (!res.baseCurrencyCode) this.form.controls.multiCurrencyEnabled.disable();
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load the AR specification.');
      },
    });
  }

  // Column layout: draggable rows (order = print order; unticked = hidden;
  // label overrides the printed heading). A FormArray inside the form (house
  // standard), so form.dirty covers a reorder, a tick and a rename alike and
  // Save reads it with the rest of the form.
  get columns(): FormArray<ColumnGroup> {
    return this.form.controls.columns;
  }

  private newColumnGroup(row: ColumnValue): ColumnGroup {
    return this.fb.nonNullable.group({
      key: [row.key],
      name: [row.name],
      visible: [row.visible],
      label: [row.label],
    });
  }

  private setColumns(rows: ColumnValue[], dirty: boolean): void {
    this.columns.clear({ emitEvent: false });
    for (const r of rows) this.columns.push(this.newColumnGroup(r), { emitEvent: false });
    if (dirty) this.columns.markAsDirty(); else this.columns.markAsPristine();
  }

  // A drag moves the GROUP inside the array; the rows bind their controls by
  // instance (track by key + [formControl]), so they travel with it.
  onColumnDrop(event: CdkDragDrop<ColumnGroup[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const g = this.columns.at(event.previousIndex);
    this.columns.removeAt(event.previousIndex, { emitEvent: false });
    this.columns.insert(event.currentIndex, g);
    this.columns.markAsDirty();
  }

  private standardColumns(): ColumnValue[] {
    return COLUMN_CATALOG.map((c) => ({ ...c, visible: true, label: '' }));
  }

  resetColumns(): void {
    this.setColumns(this.standardColumns(), true);
  }

  private applyColumns(cols: ArStatementColumn[] | null): void {
    if (!cols || !cols.length) {
      this.setColumns(this.standardColumns(), false);
      return;
    }
    const rows: ColumnValue[] = [];
    for (const c of cols) {
      const cat = COLUMN_CATALOG.find((x) => x.key === c.key);
      if (cat) rows.push({ key: cat.key, name: cat.name, visible: true, label: c.label || '' });
    }
    // Hidden columns trail the list, unticked, so they can be re-enabled.
    for (const cat of COLUMN_CATALOG) {
      if (!rows.some((r) => r.key === cat.key)) rows.push({ ...cat, visible: false, label: '' });
    }
    this.setColumns(rows, false);
  }

  // null when the arrangement IS the standard (order, all visible, no labels).
  private columnsPayload(): ArStatementColumn[] | null {
    const rows = this.columns.controls.map((g) => g.getRawValue());
    const visible = rows.filter((r) => r.visible);
    const isStandard = visible.length === COLUMN_CATALOG.length
      && visible.every((r, i) => r.key === COLUMN_CATALOG[i].key && !r.label.trim());
    if (isStandard) return null;
    return visible.map((r) => (r.label.trim() ? { key: r.key, label: r.label.trim() } : { key: r.key }));
  }

  toggleSection(key: string): void {
    this.expanded.update((v) => ({ ...v, [key]: !v[key] }));
  }

  isExpanded(key: string): boolean {
    return this.expanded()[key] !== false;
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  private applySetting(s: ArSetting): void {
    this.form.reset({
      statementCutoffDay: s.statementCutoffDay === null ? '' : String(s.statementCutoffDay),
      aging1: s.aging1 === null ? '' : String(s.aging1),
      aging2: s.aging2 === null ? '' : String(s.aging2),
      aging3: s.aging3 === null ? '' : String(s.aging3),
      aging4: s.aging4 === null ? '' : String(s.aging4),
      aging5: s.aging5 === null ? '' : String(s.aging5),
      aging6: s.aging6 === null ? '' : String(s.aging6),
      statementShowLogo: s.statementShowLogo !== false,
      useBrandColor: !!s.statementBrandColor,
      statementBrandColor: s.statementBrandColor || '#1e3a8a',
      statementShowAging: s.statementShowAging !== false,
      statementShowDeposit: s.statementShowDeposit !== false,
      statementShowIncurredBy: s.statementShowIncurredBy !== false,
      statementShowGeneratedNote: s.statementShowGeneratedNote !== false,
      statementFooterText: s.statementFooterText || '',
      membershipIntegration: s.membershipIntegration === true,
      interestTransactionTypeId: s.interestTransactionTypeId || '',
      depositConversionTransactionTypeId: s.depositConversionTransactionTypeId || '',
      multiCurrencyEnabled: s.multiCurrencyEnabled === true,
      fxTransactionTypeId: s.fxTransactionTypeId || '',
    });
    this.applyColumns(s.statementColumns);
  }

  onSave(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    if (!this.columns.controls.some((g) => g.controls.visible.value)) {
      this.errorMessage.set('The statement needs at least one visible column.');
      return;
    }
    const v = this.form.getRawValue();
    // input[type=number] controls carry number | null at runtime (Angular's
    // NumberValueAccessor), '' only before first edit - normalize either way.
    const num = (x: string | number | null): number | null => {
      if (x === null || x === undefined || String(x).trim() === '') return null;
      return Number(x);
    };
    this.saving.set(true);
    this.service.saveArSetting({
      statementCutoffDay: num(v.statementCutoffDay),
      aging1: num(v.aging1), aging2: num(v.aging2), aging3: num(v.aging3),
      aging4: num(v.aging4), aging5: num(v.aging5), aging6: num(v.aging6),
      statementShowLogo: v.statementShowLogo,
      statementBrandColor: v.useBrandColor ? v.statementBrandColor : null,
      statementShowAging: v.statementShowAging,
      statementShowDeposit: v.statementShowDeposit,
      statementShowIncurredBy: v.statementShowIncurredBy,
      statementShowGeneratedNote: v.statementShowGeneratedNote,
      statementFooterText: v.statementFooterText.trim() || null,
      statementColumns: this.columnsPayload(),
      // Membership-integration fields travel only for entitled companies -
      // the API rejects them otherwise.
      ...(this.membershipEntitled() ? {
        membershipIntegration: v.membershipIntegration,
        interestTransactionTypeId: v.interestTransactionTypeId || null,
        depositConversionTransactionTypeId: v.depositConversionTransactionTypeId || null,
      } : {}),
      // Multi-currency: the toggle only travels as ON when the base currency
      // exists (the control is disabled otherwise, and the API re-checks).
      multiCurrencyEnabled: !!this.baseCurrencyCode() && v.multiCurrencyEnabled,
      fxTransactionTypeId: v.fxTransactionTypeId || null,
    }).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.successMessage.set(res.message);
        this.applySetting(res.setting);
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to save the AR specification.');
      },
    });
  }

  // Open the SAVED layout options rendered on a dummy statement in a new tab
  // (show-expected-results before a real month is generated).
  readonly previewing = signal(false);
  onPreviewLayout(): void {
    if (this.previewing()) return;
    this.previewing.set(true);
    this.service.previewStatementLayout().subscribe({
      next: (blob) => {
        this.previewing.set(false);
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: () => {
        this.previewing.set(false);
        this.errorMessage.set('Failed to render the layout preview.');
      },
    });
  }
}
