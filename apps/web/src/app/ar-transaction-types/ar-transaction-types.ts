import { Component, Injector, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ScrollReturnService } from '../services/scroll-return.service';
import { ArService } from '../services/ar.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { OverflowMenuComponent, MenuItemDirective } from '../shared/overflow-menu/overflow-menu';
import { CanDirective } from '../shared/can.directive';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { ComboboxComponent } from '../shared/combobox/combobox';
import { ArOption, ArTransactionTypeMeta, ArTransactionTypeRow } from '../models/ar.models';

// Account Receivable → Master File Setup → Transaction Type (AR-OWNED since
// 2026-08-15; promoted out of Membership). The billing/receipting catalog:
// code + trxClass (which document book may use the entry) + tax scheme +
// module usability (entitled modules only) + e-Invoice classification.
// Enable/disable, no delete.
@Component({
  selector: 'app-ar-transaction-types',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent, OverflowMenuComponent, MenuItemDirective, CanDirective, ComboboxComponent],
  templateUrl: './ar-transaction-types.html',
  // membership-types.css supplies the shared .mt-chip pill.
  styleUrls: ['../system-setup/system-setup.css', '../membership-types/membership-types.css'],
})
export class ArTransactionTypesComponent implements OnInit {
  private readonly service = inject(ArService);
  private readonly fb = inject(FormBuilder);
  // After-save return-to-row (app standard): the list re-sorts on reload, so
  // the saved/toggled card is scrolled back into view and flashed.
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private static readonly LIST_PATH = '/ar/transaction-types';

  readonly rows = signal<ArTransactionTypeRow[]>([]);
  readonly meta = signal<ArTransactionTypeMeta | null>(null);
  readonly taxSchemes = signal<{ taxSchemeCode: string; name: string | null }[]>([]);
  // Constrained-combobox options (house standard for long reference lists):
  // code AND name in the label so type-to-filter matches both.
  readonly taxSchemeOptions = computed(() =>
    this.taxSchemes().map((s) => ({ value: s.taxSchemeCode, label: s.name ? `${s.taxSchemeCode} — ${s.name}` : s.taxSchemeCode })));
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);

  private readonly dlgRef = viewChild(DialogComponent);

  readonly dialogOpen = signal(false);
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);
  // Class-first flow (single dialog + view signal, per the single-dialog rule):
  // New opens the class picker view, and only the fields that apply to the
  // picked class are shown - Usable-by-modules is Invoice-only, Tax Scheme
  // never applies to Receipts. Edit skips the picker (class is fixed).
  readonly dialogView = signal<'class' | 'form'>('form');
  readonly dialogClass = signal('');
  // Module usability radio (ENTITLED modules only) lives outside the form
  // group because the module list is dynamic. Single-choice since 2026-08-19:
  // an entry belongs to at most ONE producer module ('' = AR internal only).
  readonly selectedModule = signal('');

  readonly form = this.fb.nonNullable.group({
    transactionType: ['', [Validators.required, Validators.maxLength(50)]],
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
  // LHDN descriptions are TEXT and can run past 255 chars (e.g. code 038) - a
  // native <option> with the full text blows the select apart, so the picker
  // shows a truncated label; the meta list is also crash-safe when absent.
  readonly einvOptions = computed(() =>
    (this.meta()?.eInvoiceClassifications || []).map((c) => ({
      code: c.code,
      label: `${c.code} — ${(c.description || '').length > 80 ? (c.description || '').slice(0, 80) + '…' : (c.description || '')}`,
    })));
  // The same list shaped for the constrained combobox ({value, label}).
  readonly einvComboOptions = computed(() =>
    this.einvOptions().map((c) => ({ value: c.code, label: c.label })));

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

  // The chosen class shows in the form's Transaction Class field, not the title.
  readonly dialogTitle = computed(() =>
    this.editId() ? 'Edit transaction type' : 'New transaction type',
  );

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

  // Consequence caption + icon per document class, for the class-picker step
  // (the shared .dlg-pick standard - same shape as the New membership picker).
  readonly trxClassHints: Record<string, string> = {
    invoice: 'bills charges to the debtor’s account.',
    'debit-note': 'an adjustment that increases what the debtor owes.',
    'credit-note': 'an adjustment that reduces what the debtor owes.',
    interest: 'late-payment interest posted by the monthly interest run.',
    deposit: 'security deposits held as collateral.',
    receipt: 'methods of collecting debtor payments.',
    refund: 'methods of paying money back to the debtor.',
    forex: 'exchange-rate gain or loss entries.',
  };

  readonly trxClassIcons: Record<string, string> = {
    invoice: 'request_quote',
    'debit-note': 'add_circle',
    'credit-note': 'remove_circle',
    interest: 'percent',
    deposit: 'account_balance',
    receipt: 'payments',
    refund: 'assignment_return',
    forex: 'currency_exchange',
  };

  // Receipt/Refund entries are payment METHODS: no tax scheme, no interest
  // flag, no e-Invoice fields (the API forces the same shape).
  readonly isPaymentClass = computed(() => this.dialogClass() === 'receipt' || this.dialogClass() === 'refund');

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
        // One-shot: scrolls to + flashes a just-saved record, if any.
        this.returnScroll.consume(ArTransactionTypesComponent.LIST_PATH, this.injector);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load transaction types.');
      },
    });
  }

  pickModule(key: string): void {
    if (this.selectedModule() === key) return;
    this.selectedModule.set(key);
    this.form.markAsDirty();
  }

  openAdd(): void {
    this.clearMessages();
    this.editId.set(null);
    this.dialogClass.set('');
    this.dialogView.set('class');
    this.selectedModule.set('');
    this.form.reset({
      transactionType: '', description: '', taxSchemeCode: '',
      isInterestChargeable: false, isEInvoice: false, eInvoiceClassificationCode: '',
    });
    this.dialogOpen.set(true);
  }

  // Class picked (or re-picked via "Change") - reveal the form with only the
  // fields that class uses; class-specific values are cleared on a switch.
  pickClass(key: string): void {
    if (this.dialogClass() !== key) {
      this.selectedModule.set('');
      if (key === 'receipt' || key === 'refund') {
        this.form.patchValue({ taxSchemeCode: '', isInterestChargeable: false, isEInvoice: false, eInvoiceClassificationCode: '' });
      }
    }
    this.dialogClass.set(key);
    this.dialogView.set('form');
    // The picked class button is destroyed with the view swap - land focus on
    // the Transaction Type field so the user can type straight away.
    this.dlgRef()?.focusFirstField();
  }

  changeClass(): void {
    this.dialogView.set('class');
    this.dlgRef()?.focusFirstField();
  }

  openEdit(t: ArTransactionTypeRow): void {
    this.clearMessages();
    this.editId.set(t.id);
    this.dialogClass.set(t.trxClass);
    this.dialogView.set('form');
    this.selectedModule.set((t.usableInModules || [])[0] || '');
    this.form.reset({
      transactionType: t.transactionType,
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
    const cls = this.dialogClass();
    if (!cls) return; // form view is unreachable without a class, but stay safe
    const v = this.form.getRawValue();
    const payload = {
      transactionType: v.transactionType.trim(),
      trxClass: cls,
      description: v.description.trim() || null,
      // Class-conditional fields: Receipt/Refund are payment methods (no tax,
      // no interest, no e-Invoice), module usability is Invoice-only and
      // holds at most ONE module (the API forces the same shape).
      taxSchemeCode: this.isPaymentClass() ? null : v.taxSchemeCode || null,
      isInterestChargeable: !this.isPaymentClass() && v.isInterestChargeable,
      usableInModules: cls === 'invoice' && this.selectedModule() ? [this.selectedModule()] : [],
      isEInvoice: !this.isPaymentClass() && v.isEInvoice,
      eInvoiceClassificationCode: this.isPaymentClass() ? null : v.eInvoiceClassificationCode || null,
    };

    this.saving.set(true);
    const id = this.editId();
    const req$ = id ? this.service.updateTransactionType(id, payload) : this.service.createTransactionType(payload);
    req$.subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.saving.set(false);
        this.dialogOpen.set(false);
        this.returnScroll.remember(ArTransactionTypesComponent.LIST_PATH, res.transactionType.id);
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
        this.returnScroll.remember(ArTransactionTypesComponent.LIST_PATH, t.id);
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
