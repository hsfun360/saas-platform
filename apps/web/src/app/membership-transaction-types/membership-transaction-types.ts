import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TransactionTypeService } from '../services/transaction-type.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { CanDirective } from '../shared/can.directive';
import { MembershipTransactionType, MembershipStatusOption, TaxSchemeRef } from '../models/auth.models';

// Membership Management → Master File Setup → Transaction Type.
// Per-company billing-item catalog: code + charge type (fixed vocabulary) +
// description + THE tax scheme (single source - Joining fees / Standing charges
// rows pick a transaction type and inherit its tax). Enable/disable, no delete.
@Component({
  selector: 'app-membership-transaction-types',
  standalone: true,
  imports: [ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent, CanDirective],
  templateUrl: './membership-transaction-types.html',
  // membership-types.css supplies the shared .mt-chip pill.
  styleUrls: ['../system-setup/system-setup.css', '../membership-types/membership-types.css'],
})
export class MembershipTransactionTypesComponent implements OnInit {
  private readonly service = inject(TransactionTypeService);
  private readonly fb = inject(FormBuilder);

  readonly rows = signal<MembershipTransactionType[]>([]);
  readonly chargeTypes = signal<MembershipStatusOption[]>([]);
  readonly taxSchemes = signal<TaxSchemeRef[]>([]);
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);

  readonly dialogOpen = signal(false);
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    transactionType: ['', [Validators.required, Validators.maxLength(50)]],
    chargeType: ['', [Validators.required]],
    description: ['', [Validators.maxLength(255)]],
    taxSchemeCode: [''],
  });

  readonly search = signal('');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const sorted = [...this.rows()].sort((a, b) => {
      const aActive = a.isActive !== false;
      const bActive = b.isActive !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return a.transactionType.localeCompare(b.transactionType);
    });
    if (!q) return sorted;
    return sorted.filter(
      (t) =>
        t.transactionType.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        this.chargeTypeLabel(t.chargeType).toLowerCase().includes(q),
    );
  });
  readonly activeCount = computed(() => this.rows().filter((t) => t.isActive !== false).length);

  readonly dialogTitle = computed(() => (this.editId() ? 'Edit transaction type' : 'New transaction type'));

  ngOnInit(): void {
    this.service.meta().subscribe({ next: (m) => this.chargeTypes.set(m.chargeTypes), error: () => {} });
    this.service.taxSchemes().subscribe({ next: (r) => this.taxSchemes.set(r.schemes), error: () => {} });
    this.load();
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  chargeTypeLabel(key: string): string {
    return this.chargeTypes().find((c) => c.key === key)?.label || key;
  }

  taxSchemeName(code: string | null | undefined): string {
    if (!code) return '';
    const s = this.taxSchemes().find((t) => t.taxSchemeCode === code);
    return s ? `${s.taxSchemeCode}${s.name ? ' — ' + s.name : ''}` : code;
  }

  load(): void {
    this.loading.set(true);
    this.service.list().subscribe({
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

  openAdd(): void {
    this.clearMessages();
    this.editId.set(null);
    this.form.reset({ transactionType: '', chargeType: '', description: '', taxSchemeCode: '' });
    this.dialogOpen.set(true);
  }

  openEdit(t: MembershipTransactionType): void {
    this.clearMessages();
    this.editId.set(t.id);
    this.form.reset({
      transactionType: t.transactionType,
      chargeType: t.chargeType,
      description: t.description || '',
      taxSchemeCode: t.taxSchemeCode || '',
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
      chargeType: v.chargeType,
      description: v.description.trim() || null,
      taxSchemeCode: v.taxSchemeCode || null,
    };

    this.saving.set(true);
    const id = this.editId();
    const req$ = id ? this.service.update(id, payload) : this.service.create(payload);
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

  toggleActive(t: MembershipTransactionType): void {
    this.clearMessages();
    const next = !(t.isActive !== false);
    this.togglingId.set(t.id);
    this.service.setActive(t.id, next).subscribe({
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
