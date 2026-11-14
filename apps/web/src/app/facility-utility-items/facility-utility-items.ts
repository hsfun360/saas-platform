import { Component, Injector, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import {
  FacilityUtilityItem,
  FacilityUtilityItemPayload,
  FacilityUtilityItemService,
  FacilityUtilityUnit,
  UtilityBehaviour,
  UtilityFeeItemOption,
  UtilityUnitGeneratePreview,
} from '../services/facility-utility-item.service';
import { ScrollReturnService } from '../services/scroll-return.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { ComboboxComponent, ComboOption } from '../shared/combobox/combobox';
import { ConfirmDialogComponent, ConfirmRequest } from '../shared/confirm-dialog/confirm-dialog';
import { CanDirective } from '../shared/can.directive';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { OverflowMenuComponent } from '../shared/overflow-menu/overflow-menu';
import { MenuItemDirective } from '../shared/overflow-menu/menu-item.directive';

const BEHAVIOURS: { key: UtilityBehaviour; label: string; hint: string }[] = [
  { key: 'units', label: 'Numbered units', hint: 'Each unit has its own number and is issued and taken back one by one - a locker.' },
  { key: 'quantity', label: 'By quantity', hint: 'Pieces are handed out by count and counted back - towels.' },
  { key: 'use', label: 'Use only', hint: 'The use is recorded and there is nothing to return - a shower.' },
];

// Facility Management -> Utility Items (/facility/utility-items; slice 6a,
// structures approved 2026-11-11). What the Control Station hands out or lets
// a person use - LOCKER by numbered unit, TOWEL by quantity, SHOWER as a
// recorded use. A utility item is not a facility. ONE drawer dialog with a
// mode signal: the item form, the item's units, one unit, Generate units.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-facility-utility-items',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent,
    ComboboxComponent, ConfirmDialogComponent, CanDirective, OverflowMenuComponent, MenuItemDirective],
  templateUrl: './facility-utility-items.html',
  styleUrls: ['../membership-types/membership-types.css', './facility-utility-items.css'],
})
export class FacilityUtilityItemsComponent implements OnInit {
  private readonly service = inject(FacilityUtilityItemService);
  private readonly fb = inject(FormBuilder);
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private static readonly LIST_PATH = '/facility/utility-items';

  readonly behaviours = BEHAVIOURS;
  readonly rows = signal<FacilityUtilityItem[]>([]);
  readonly feeItems = signal<UtilityFeeItemOption[]>([]);
  readonly maxGenerate = signal(500);
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);
  readonly search = signal('');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');
  readonly confirmAction = signal<ConfirmRequest | null>(null);

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const sorted = [...this.rows()].sort((a, b) => {
      const aActive = a.isActive !== false;
      const bActive = b.isActive !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return a.sortOrder - b.sortOrder || a.code.localeCompare(b.code);
    });
    return sorted.filter((i) => !q || i.code.toLowerCase().includes(q) || i.description.toLowerCase().includes(q) || this.behaviourLabel(i.behaviour).toLowerCase().includes(q));
  });
  readonly activeCount = computed(() => this.rows().filter((i) => i.isActive !== false).length);
  readonly feeOptions = computed<ComboOption[]>(() => this.feeItems()
    .map((f) => ({ value: f.id, label: `${f.transactionType} - ${f.description}${f.isActive ? '' : ' (disabled)'}` })));

  // --- The ONE drawer dialog: 'form' | 'units' | 'unit' | 'generate' ---
  readonly dlgMode = signal<'form' | 'units' | 'unit' | 'generate' | null>(null);
  readonly saving = signal(false);
  readonly editRow = signal<FacilityUtilityItem | null>(null);
  // The item whose units are open, its units, and whether the caller may amend them.
  readonly unitItem = signal<FacilityUtilityItem | null>(null);
  readonly units = signal<FacilityUtilityUnit[]>([]);
  readonly unitsLoading = signal(false);
  readonly unitsReadOnly = signal(false);
  readonly editUnit = signal<FacilityUtilityUnit | null>(null);
  readonly preview = signal<UtilityUnitGeneratePreview | null>(null);
  readonly previewing = signal(false);
  // The item list is stale once a unit was added, changed or removed.
  private unitsChanged = false;

  readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.maxLength(20), Validators.pattern(/^[A-Za-z0-9_]+$/)]],
    description: ['', [Validators.required, Validators.maxLength(255)]],
    behaviour: ['units' as UtilityBehaviour],
    stockQuantity: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(1000000)]),
    maxPerPerson: [1, [Validators.required, Validators.min(0), Validators.max(100)]],
    feeTransactionTypeId: [''],
    // Who the station may serve with it (enforced from slice 6b; visiting
    // affiliated and reciprocal members from slice 7).
    guestsAllowed: [true],
    visitingMembersAllowed: [true],
    requiresEntry: [false],
    sortOrder: [100, [Validators.required, Validators.min(0), Validators.max(9999)]],
  });
  // Bumped on a behaviour change so the OnPush template re-reads the form.
  readonly formVersion = signal(0);

  readonly unitForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.maxLength(20), Validators.pattern(/^[A-Za-z0-9_-]+$/)]],
    location: ['', Validators.maxLength(255)],
    remarks: ['', Validators.maxLength(255)],
  });

  readonly generateForm = this.fb.nonNullable.group({
    prefix: ['', [Validators.maxLength(12), Validators.pattern(/^[A-Za-z0-9_-]*$/)]],
    from: [1, [Validators.required, Validators.min(0), Validators.max(99999)]],
    to: [10, [Validators.required, Validators.min(0), Validators.max(99999)]],
    pad: [3, [Validators.required, Validators.min(1), Validators.max(6)]],
    location: ['', Validators.maxLength(255)],
  });

  readonly dialogTitle = computed(() => {
    const item = this.unitItem();
    switch (this.dlgMode()) {
      case 'form': return this.editRow() ? 'Edit utility item' : 'New utility item';
      case 'units': return item ? `Units - ${item.code}` : 'Units';
      case 'unit': return this.editUnit() ? `Edit unit ${this.editUnit()?.code}` : `New ${item?.code || ''} unit`;
      case 'generate': return item ? `Generate ${item.code} units` : 'Generate units';
      default: return '';
    }
  });

  ngOnInit(): void {
    this.load();
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  behaviourLabel(b: UtilityBehaviour): string {
    return BEHAVIOURS.find((x) => x.key === b)?.label || b;
  }

  behaviourHint(): string {
    return BEHAVIOURS.find((x) => x.key === this.form.controls.behaviour.value)?.hint || '';
  }

  feeLabel(i: FacilityUtilityItem): string {
    const f = this.feeItems().find((x) => x.id === i.feeTransactionTypeId);
    return f ? f.transactionType : '';
  }

  // The code and the way an item is handed out freeze once it is in use.
  codeFrozen(): boolean {
    const r = this.editRow();
    return !!r && (r.outCount > 0 || r.unitCount > 0);
  }

  behaviourFrozen(): boolean {
    const r = this.editRow();
    return !!r && (r.unitCount > 0 || r.outCount > 0);
  }

  load(): void {
    this.loading.set(true);
    this.service.list().subscribe({
      next: (res) => {
        this.rows.set(res.items);
        this.feeItems.set(res.feeItems);
        this.maxGenerate.set(res.limits?.maxGenerate || 500);
        this.loading.set(false);
        this.returnScroll.consume(FacilityUtilityItemsComponent.LIST_PATH, this.injector);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load the utility items.');
      },
    });
  }

  // ---- the item form ----

  private resetForm(i: FacilityUtilityItem | null): void {
    this.form.reset({
      code: i?.code || '',
      description: i?.description || '',
      behaviour: i?.behaviour || 'units',
      stockQuantity: i?.stockQuantity ?? null,
      maxPerPerson: i?.maxPerPerson ?? 1,
      feeTransactionTypeId: i?.feeTransactionTypeId || '',
      guestsAllowed: i ? i.guestsAllowed !== false : true,
      visitingMembersAllowed: i ? i.visitingMembersAllowed !== false : true,
      requiresEntry: i ? i.requiresEntry === true : false,
      sortOrder: i?.sortOrder ?? 100,
    });
    if (this.codeFrozen()) this.form.controls.code.disable(); else this.form.controls.code.enable();
    if (this.behaviourFrozen()) this.form.controls.behaviour.disable(); else this.form.controls.behaviour.enable();
    this.formVersion.update((v) => v + 1);
  }

  openAdd(): void {
    this.clearMessages();
    this.editRow.set(null);
    this.resetForm(null);
    this.dlgMode.set('form');
  }

  openEdit(i: FacilityUtilityItem): void {
    this.clearMessages();
    this.editRow.set(i);
    this.resetForm(i);
    this.dlgMode.set('form');
  }

  behaviourChanged(): void {
    this.formVersion.update((v) => v + 1);
  }

  onSave(): void {
    this.clearMessages();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const payload: FacilityUtilityItemPayload = {
      code: v.code.trim().toUpperCase(),
      description: v.description.trim(),
      trackUnits: v.behaviour === 'units',
      returnRequired: v.behaviour !== 'use',
      stockQuantity: v.behaviour === 'quantity' ? v.stockQuantity : null,
      maxPerPerson: Number(v.maxPerPerson),
      feeTransactionTypeId: v.feeTransactionTypeId || null,
      guestsAllowed: v.guestsAllowed,
      visitingMembersAllowed: v.visitingMembersAllowed,
      requiresEntry: v.requiresEntry,
      sortOrder: Number(v.sortOrder),
    };
    if (this.codeFrozen()) delete payload.code;
    this.saving.set(true);
    const row = this.editRow();
    const req$ = row ? this.service.update(row.id, payload) : this.service.create(payload);
    req$.subscribe({
      next: (res) => {
        this.saving.set(false);
        this.form.markAsPristine();
        this.returnScroll.remember(FacilityUtilityItemsComponent.LIST_PATH, res.item.id);
        // A new numbered item goes straight to its units: it is no use without them.
        if (!row && res.item.trackUnits) {
          this.successMessage.set(`${res.item.code} created - now add its units.`);
          this.load();
          this.showUnits(res.item, false);
          return;
        }
        this.successMessage.set(res.message);
        this.closeDialog();
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save the utility item.');
        this.saving.set(false);
      },
    });
  }

  toggleActive(i: FacilityUtilityItem): void {
    this.clearMessages();
    const next = !(i.isActive !== false);
    this.togglingId.set(i.id);
    this.service.update(i.id, { isActive: next }).subscribe({
      next: () => {
        this.successMessage.set(`${i.code} ${next ? 'enabled' : 'disabled - the station no longer offers it'}.`);
        this.togglingId.set(null);
        this.returnScroll.remember(FacilityUtilityItemsComponent.LIST_PATH, i.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update the utility item.');
        this.togglingId.set(null);
      },
    });
  }

  askDelete(i: FacilityUtilityItem): void {
    this.clearMessages();
    this.confirmAction.set({
      title: 'Delete utility item',
      message: i.unitCount
        ? `${i.code} has ${i.unitCount} unit${i.unitCount === 1 ? '' : 's'} - delete the units first, or disable the item instead.`
        : `Delete utility item ${i.code} (${i.description})? An item that has ever been issued cannot be deleted - disable it instead. This cannot be undone.`,
      confirmLabel: 'Delete utility item',
      run: () => {
        this.confirmAction.set(null);
        this.togglingId.set(i.id);
        this.service.remove(i.id).subscribe({
          next: (res) => { this.togglingId.set(null); this.successMessage.set(res.message); this.load(); },
          error: (err) => { this.togglingId.set(null); this.errorMessage.set(err.error?.message || 'Failed to delete the utility item.'); },
        });
      },
    });
  }

  // ---- the units of a numbered item ----

  openUnits(i: FacilityUtilityItem): void {
    this.clearMessages();
    this.showUnits(i, i.canModify === false);
  }

  private showUnits(i: FacilityUtilityItem, readOnly: boolean): void {
    this.unitItem.set(i);
    this.unitsReadOnly.set(readOnly);
    this.units.set([]);
    this.dlgMode.set('units');
    this.loadUnits();
  }

  private loadUnits(): void {
    const item = this.unitItem();
    if (!item) return;
    this.unitsLoading.set(true);
    this.service.units(item.id).subscribe({
      next: (rows) => { this.units.set(rows); this.unitsLoading.set(false); },
      error: (err) => { this.unitsLoading.set(false); this.errorMessage.set(err.error?.message || 'Failed to load the units.'); },
    });
  }

  unitStatusLabel(u: FacilityUtilityUnit): string {
    if (u.isActive === false) return 'Disabled';
    return u.unitStatus === 'issued' ? 'Issued' : u.unitStatus === 'out-of-service' ? 'Out of service' : 'Available';
  }

  openUnitForm(u: FacilityUtilityUnit | null): void {
    this.clearMessages();
    this.editUnit.set(u);
    this.unitForm.reset({ code: u?.code || '', location: u?.location || '', remarks: u?.remarks || '' });
    this.dlgMode.set('unit');
  }

  saveUnit(): void {
    this.clearMessages();
    const item = this.unitItem();
    if (!item) return;
    if (this.unitForm.invalid) {
      this.unitForm.markAllAsTouched();
      return;
    }
    const v = this.unitForm.getRawValue();
    const payload = { code: v.code.trim().toUpperCase(), location: v.location.trim() || null, remarks: v.remarks.trim() || null };
    const u = this.editUnit();
    this.saving.set(true);
    const req$ = u ? this.service.updateUnit(item.id, u.id, payload) : this.service.createUnit(item.id, payload);
    req$.subscribe({
      next: (res) => {
        this.saving.set(false);
        this.successMessage.set(res.message);
        this.unitForm.markAsPristine();
        this.unitsChanged = true;
        this.dlgMode.set('units');
        this.loadUnits();
      },
      error: (err) => { this.saving.set(false); this.errorMessage.set(err.error?.message || 'Failed to save the unit.'); },
    });
  }

  toggleUnit(u: FacilityUtilityUnit): void {
    const item = this.unitItem();
    if (!item) return;
    this.clearMessages();
    this.togglingId.set(u.id);
    this.service.updateUnit(item.id, u.id, { isActive: u.isActive === false }).subscribe({
      next: (res) => { this.togglingId.set(null); this.successMessage.set(res.message); this.unitsChanged = true; this.loadUnits(); },
      error: (err) => { this.togglingId.set(null); this.errorMessage.set(err.error?.message || 'Failed to update the unit.'); },
    });
  }

  askDeleteUnit(u: FacilityUtilityUnit): void {
    const item = this.unitItem();
    if (!item) return;
    this.clearMessages();
    this.confirmAction.set({
      title: `Delete unit ${u.code}?`,
      message: `${u.code} is removed from ${item.code}. A unit that has ever been issued cannot be deleted - disable it instead. This cannot be undone.`,
      confirmLabel: 'Delete unit',
      run: () => {
        this.confirmAction.set(null);
        this.togglingId.set(u.id);
        this.service.removeUnit(item.id, u.id).subscribe({
          next: (res) => { this.togglingId.set(null); this.successMessage.set(res.message); this.unitsChanged = true; this.loadUnits(); },
          error: (err) => { this.togglingId.set(null); this.errorMessage.set(err.error?.message || 'Failed to delete the unit.'); },
        });
      },
    });
  }

  // ---- Generate units: the preview first, then the concrete button ----

  openGenerate(): void {
    this.clearMessages();
    const item = this.unitItem();
    this.generateForm.reset({ prefix: (item?.code || '').slice(0, 1), from: 1, to: 10, pad: 3, location: '' });
    this.preview.set(null);
    this.dlgMode.set('generate');
    this.refreshPreview();
  }

  private generateRequest() {
    const v = this.generateForm.getRawValue();
    return { prefix: v.prefix.trim().toUpperCase(), from: Number(v.from), to: Number(v.to), pad: Number(v.pad), location: v.location.trim() || null };
  }

  refreshPreview(): void {
    const item = this.unitItem();
    if (!item) return;
    this.clearMessages();
    if (this.generateForm.invalid) {
      this.generateForm.markAllAsTouched();
      this.preview.set(null);
      return;
    }
    this.previewing.set(true);
    this.service.previewUnits(item.id, this.generateRequest()).subscribe({
      next: (p) => { this.preview.set(p); this.previewing.set(false); },
      error: (err) => { this.preview.set(null); this.previewing.set(false); this.errorMessage.set(err.error?.message || 'Failed to preview the units.'); },
    });
  }

  // Any change to the range invalidates the preview shown.
  generateChanged(): void {
    this.preview.set(null);
  }

  submitGenerate(): void {
    const item = this.unitItem();
    const p = this.preview();
    if (!item || !p || !p.fresh) return;
    this.clearMessages();
    this.saving.set(true);
    this.service.generateUnits(item.id, this.generateRequest()).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.successMessage.set(res.message);
        this.generateForm.markAsPristine();
        this.unitsChanged = true;
        this.dlgMode.set('units');
        this.loadUnits();
      },
      error: (err) => { this.saving.set(false); this.errorMessage.set(err.error?.message || 'Failed to add the units.'); },
    });
  }

  backToUnits(): void {
    this.unitForm.markAsPristine();
    this.generateForm.markAsPristine();
    this.dlgMode.set('units');
  }

  isDirty(): boolean {
    switch (this.dlgMode()) {
      case 'form': return this.form.dirty;
      case 'unit': return this.unitForm.dirty;
      case 'generate': return this.generateForm.dirty;
      default: return false;
    }
  }

  closeDialog(): void {
    const item = this.unitItem();
    this.dlgMode.set(null);
    this.unitItem.set(null);
    this.editUnit.set(null);
    this.preview.set(null);
    if (this.unitsChanged) {
      this.unitsChanged = false;
      if (item) this.returnScroll.remember(FacilityUtilityItemsComponent.LIST_PATH, item.id);
      this.load();
    }
  }

  clearSearch(): void {
    this.search.set('');
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
