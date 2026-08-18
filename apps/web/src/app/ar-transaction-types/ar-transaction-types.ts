import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ArService } from '../services/ar.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { CanDirective } from '../shared/can.directive';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { ArOption, ArTransactionTypeMeta, ArTransactionTypeRow } from '../models/ar.models';

// Account Receivable → Master File Setup → Transaction Type (AR-OWNED since
// 2026-08-15; promoted out of Membership). The billing/receipting catalog:
// code + trxClass (which document book may use the entry) + tax scheme +
// module usability (entitled modules only) + e-Invoice classification.
// Enable/disable, no delete.
@Component({
  selector: 'app-ar-transaction-types',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent, CanDirective],
  templateUrl: './ar-transaction-types.html',
  // membership-types.css supplies the shared .mt-chip pill.
  styleUrls: ['../system-setup/system-setup.css', '../membership-types/membership-types.css'],
})
export class ArTransactionTypesComponent implements OnInit {
  private readonly service = inject(ArService);
  private readonly fb = inject(FormBuilder);

  readonly rows = signal<ArTransactionTypeRow[]>([]);
  readonly meta = signal<ArTransactionTypeMeta | null>(null);
  readonly taxSchemes = signal<{ taxSchemeCode: string; name: string | null }[]>([]);
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);

  readonly dialogOpen = signal(false);
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);
  // Module usability checkboxes (per ENTITLED module) live outside the form
  // group because the module list is dynamic.
  readonly selectedModules = signal<Set<string>>(new Set());

  readonly form = this.fb.nonNullable.group({
    transactionType: ['', [Validators.required, Validators.maxLength(50)]],
    trxClass: ['', [Validators.required]],
    description: ['', [Validators.maxLength(255)]],
    taxSchemeCode: [''],
    isInterestChargeable: [false],
    isEInvoice: [false],
    eInvoiceClassificationCode: [''],
  });

  readonly search = signal('');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly trxClasses = computed<ArOption[]>(() => this.meta()?.trxClasses || []);
  readonly modules = computed<ArOption[]>(() => this.meta()?.modules || []);

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const sorted = [...this.rows()].sort((a, b) => {
      const aActive = a.isActive !== false;
      const bActive = b.isActive !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      const cls = a.trxClass.localeCompare(b.trxClass);
      if (cls !== 0) return cls;
      return a.transactionType.localeCompare(b.transactionType);
    });
    if (!q) return sorted;
    return sorted.filter(
      (t) =>
        t.transactionType.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        this.trxClassLabel(t.trxClass).toLowerCase().includes(q),
    );
  });
  readonly activeCount = computed(() => this.rows().filter((t) => t.isActive !== false).length);

  readonly dialogTitle = computed(() => (this.editId() ? 'Edit transaction type' : 'New transaction type'));

  ngOnInit(): void {
    this.service.transactionTypeMeta().subscribe({ next: (m) => this.meta.set(m), error: () => {} });
    this.service.transactionTypeTaxSchemes().subscribe({ next: (r) => this.taxSchemes.set(r.schemes), error: () => {} });
    this.load();
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  trxClassLabel(key: string): string {
    return this.trxClasses().find((c) => c.key === key)?.label || key;
  }

  moduleLabel(key: string): string {
    return this.modules().find((m) => m.key === key)?.label || key;
  }

  taxSchemeName(code: string | null | undefined): string {
    if (!code) return '';
    const s = this.taxSchemes().find((t) => t.taxSchemeCode === code);
    return s ? `${s.taxSchemeCode}${s.name ? ' — ' + s.name : ''}` : code;
  }

  load(): void {
    this.loading.set(true);
    this.service.listTransactionTypes().subscribe({
      next: (data) => {
        this.rows.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load transaction types.');
      },
    });
  }

  isModuleSelected(key: string): boolean {
    return this.selectedModules().has(key);
  }

  toggleModule(key: string): void {
    const next = new Set(this.selectedModules());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.selectedModules.set(next);
    this.form.markAsDirty();
  }

  openAdd(): void {
    this.clearMessages();
    this.editId.set(null);
    this.selectedModules.set(new Set());
    this.form.reset({
      transactionType: '', trxClass: '', description: '', taxSchemeCode: '',
      isInterestChargeable: false, isEInvoice: false, eInvoiceClassificationCode: '',
    });
    this.dialogOpen.set(true);
  }

  openEdit(t: ArTransactionTypeRow): void {
    this.clearMessages();
    this.editId.set(t.id);
    this.selectedModules.set(new Set(t.usableInModules || []));
    this.form.reset({
      transactionType: t.transactionType,
      trxClass: t.trxClass,
      description: t.description || '',
      taxSchemeCode: t.taxSchemeCode || '',
      isInterestChargeable: t.isInterestChargeable === true,
      isEInvoice: t.isEInvoice === true,
      eInvoiceClassificationCode: t.eInvoiceClassificationCode || '',
    });
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
    const payload = {
      transactionType: v.transactionType.trim(),
      trxClass: v.trxClass,
      description: v.description.trim() || null,
      taxSchemeCode: v.taxSchemeCode || null,
      isInterestChargeable: v.isInterestChargeable,
      usableInModules: [...this.selectedModules()],
      isEInvoice: v.isEInvoice,
      eInvoiceClassificationCode: v.eInvoiceClassificationCode || null,
    };

    this.saving.set(true);
    const id = this.editId();
    const req$ = id ? this.service.updateTransactionType(id, payload) : this.service.createTransactionType(payload);
    req$.subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.saving.set(false);
        this.dialogOpen.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save the transaction type.');
        this.saving.set(false);
      },
    });
  }

  toggleActive(t: ArTransactionTypeRow): void {
    this.clearMessages();
    const next = !(t.isActive !== false);
    this.togglingId.set(t.id);
    this.service.setTransactionTypeActive(t.id, next).subscribe({
      next: () => {
        this.successMessage.set(`${t.transactionType} ${next ? 'enabled' : 'disabled'}.`);
        this.togglingId.set(null);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update the transaction type.');
        this.togglingId.set(null);
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
