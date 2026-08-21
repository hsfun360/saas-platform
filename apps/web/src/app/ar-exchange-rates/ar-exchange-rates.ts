import { Component, Injector, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { ScrollReturnService } from '../services/scroll-return.service';
import { ArService } from '../services/ar.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { OverflowMenuComponent, MenuItemDirective } from '../shared/overflow-menu/overflow-menu';
import { CanDirective } from '../shared/can.directive';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { ArExchangeRate, ArExchangeRateMeta } from '../models/ar.models';

// Account Receivable → Master File Setup → Exchange Rates (multicurrency step
// 1, 2026-08-21). The company's effective-dated foreign-currency rate table:
// 1 unit of the foreign currency = `rate` units of the company base currency.
// Documents snapshot the rate they used, so rows here only set future
// defaults - editing/deleting never rewrites history.
@Component({
  selector: 'app-ar-exchange-rates',
  standalone: true,
  imports: [
    FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, LocalDatePipe, CommonModule, ReactiveFormsModule,
    DialogComponent, OverflowMenuComponent, MenuItemDirective, CanDirective,
  ],
  templateUrl: './ar-exchange-rates.html',
  // membership-types.css supplies the shared .mt-chip pill.
  styleUrls: ['../system-setup/system-setup.css', '../membership-types/membership-types.css', './ar-exchange-rates.css'],
})
export class ArExchangeRatesComponent implements OnInit {
  private readonly service = inject(ArService);
  private readonly fb = inject(FormBuilder);
  // After-save return-to-row (app standard): the list re-sorts on reload, so
  // the saved card is scrolled back into view and flashed.
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private static readonly LIST_PATH = '/ar/exchange-rates';

  readonly rows = signal<ArExchangeRate[]>([]);
  readonly meta = signal<ArExchangeRateMeta | null>(null);
  readonly loading = signal(false);

  private readonly dlgRef = viewChild(DialogComponent);

  readonly dialogOpen = signal(false);
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);
  // Single-dialog rule: the delete confirmation is a VIEW of the one dialog.
  readonly dialogView = signal<'form' | 'delete'>('form');
  readonly deleteTarget = signal<ArExchangeRate | null>(null);

  readonly form = this.fb.nonNullable.group({
    currencyCode: ['', [Validators.required]],
    effectiveDate: ['', [Validators.required]],
    // Typed as text so the 10-decimal precision is validated exactly; the
    // number keyboard comes from inputmode.
    rate: ['', [Validators.required, Validators.pattern(/^\d+(\.\d{1,10})?$/)]],
  });

  readonly search = signal('');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly baseCurrency = computed(() => this.meta()?.baseCurrencyCode || null);
  readonly currencies = computed(() => this.meta()?.currencies || []);
  readonly multiCurrencyEnabled = computed(() => this.meta()?.multiCurrencyEnabled === true);

  // Today's local date (ISO) - decides which row is the CURRENT rate per
  // currency (latest effectiveDate <= today) vs an upcoming one.
  private readonly today = (() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  })();

  readonly currentIds = computed(() => {
    const current = new Map<string, ArExchangeRate>();
    for (const r of this.rows()) {
      if (r.effectiveDate > this.today) continue;
      const prev = current.get(r.currencyCode);
      if (!prev || r.effectiveDate > prev.effectiveDate) current.set(r.currencyCode, r);
    }
    return new Set([...current.values()].map((r) => r.id));
  });

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const sorted = [...this.rows()].sort((a, b) => {
      const c = a.currencyCode.localeCompare(b.currencyCode);
      if (c !== 0) return c;
      return b.effectiveDate.localeCompare(a.effectiveDate);
    });
    if (!q) return sorted;
    return sorted.filter(
      (r) =>
        r.currencyCode.toLowerCase().includes(q) ||
        this.currencyName(r.currencyCode).toLowerCase().includes(q) ||
        r.effectiveDate.includes(q),
    );
  });

  readonly currencyCount = computed(() => new Set(this.rows().map((r) => r.currencyCode)).size);

  readonly dialogTitle = computed(() => (this.editId() ? 'Edit exchange rate' : 'New exchange rate'));

  // Live "1 USD = 4.7100 MYR" readout under the form (show-expected-results).
  readonly previewLine = computed(() => {
    const base = this.baseCurrency();
    const code = this.formCurrency();
    const rate = this.formRate();
    if (!base || !code || !rate) return '';
    return `1 ${code} = ${this.fmtRate(rate)} ${base}`;
  });
  private readonly formCurrency = signal('');
  private readonly formRate = signal('');

  ngOnInit(): void {
    this.service.exchangeRateMeta().subscribe({ next: (m) => this.meta.set(m), error: () => {} });
    this.load();
    // Mirror the two preview-relevant controls into signals (computed cannot
    // read a FormControl directly).
    this.form.controls.currencyCode.valueChanges.subscribe((v) => this.formCurrency.set(v));
    this.form.controls.rate.valueChanges.subscribe((v) => this.formRate.set(v));
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  currencyName(code: string): string {
    return this.currencies().find((c) => c.code === code)?.name || '';
  }

  // Trim the stored 10-decimal value for reading: at least 4 decimals, no
  // trailing zeros beyond that.
  fmtRate(value: string | number): string {
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value);
    const s = n.toFixed(10).replace(/0+$/, '');
    const [int, dec = ''] = s.split('.');
    return `${int}.${dec.padEnd(4, '0')}`;
  }

  isCurrent(r: ArExchangeRate): boolean {
    return this.currentIds().has(r.id);
  }

  isUpcoming(r: ArExchangeRate): boolean {
    return r.effectiveDate > this.today;
  }

  load(): void {
    this.loading.set(true);
    this.service.listExchangeRates().subscribe({
      next: (data) => {
        this.rows.set(data);
        this.loading.set(false);
        this.returnScroll.consume(ArExchangeRatesComponent.LIST_PATH, this.injector);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load exchange rates.');
      },
    });
  }

  openAdd(): void {
    this.clearMessages();
    this.editId.set(null);
    this.dialogView.set('form');
    this.form.reset({ currencyCode: this.currencies()[0]?.code || '', effectiveDate: this.today, rate: '' });
    this.form.controls.currencyCode.enable();
    this.syncPreview();
    this.dialogOpen.set(true);
  }

  openEdit(r: ArExchangeRate): void {
    this.clearMessages();
    this.editId.set(r.id);
    this.dialogView.set('form');
    this.form.reset({ currencyCode: r.currencyCode, effectiveDate: r.effectiveDate, rate: this.trimStored(r.rate) });
    // The currency is immutable on edit (a rate belongs to its currency).
    this.form.controls.currencyCode.disable();
    this.syncPreview();
    this.dialogOpen.set(true);
  }

  askDelete(r: ArExchangeRate): void {
    this.clearMessages();
    this.deleteTarget.set(r);
    this.dialogView.set('delete');
    this.dialogOpen.set(true);
  }

  closeDialog(): void {
    this.dialogOpen.set(false);
    this.deleteTarget.set(null);
  }

  onSave(): void {
    this.clearMessages();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const rate = Number(v.rate);
    if (!(rate > 0)) {
      this.errorMessage.set('Rate must be greater than zero.');
      return;
    }
    this.saving.set(true);
    const id = this.editId();
    const req$ = id
      ? this.service.updateExchangeRate(id, { effectiveDate: v.effectiveDate, rate })
      : this.service.createExchangeRate({ currencyCode: v.currencyCode, effectiveDate: v.effectiveDate, rate });
    req$.subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.saving.set(false);
        this.dialogOpen.set(false);
        this.returnScroll.remember(ArExchangeRatesComponent.LIST_PATH, res.exchangeRate.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save the exchange rate.');
        this.saving.set(false);
      },
    });
  }

  confirmDelete(): void {
    const r = this.deleteTarget();
    if (!r) return;
    this.saving.set(true);
    this.service.deleteExchangeRate(r.id).subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.saving.set(false);
        this.closeDialog();
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to delete the exchange rate.');
        this.saving.set(false);
      },
    });
  }

  clearSearch(): void {
    this.search.set('');
  }

  // The stored DECIMAL(21,10) text without its padding zeros, for the edit
  // field ("4.7100000000" -> "4.71").
  private trimStored(value: string): string {
    if (!/^\d+\.\d+$/.test(value)) return value;
    const s = value.replace(/0+$/, '');
    return s.endsWith('.') ? s.slice(0, -1) : s;
  }

  private syncPreview(): void {
    this.formCurrency.set(this.form.controls.currencyCode.value);
    this.formRate.set(this.form.controls.rate.value);
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
