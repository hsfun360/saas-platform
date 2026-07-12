import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CurrencyService } from '../services/currency.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { Currency } from '../models/auth.models';

// System Admin: maintain the ISO 4217 currency reference table - load the bundled
// defaults, add currencies manually, edit them, and enable/disable or delete them.
// Reuses the System Setup stylesheet (shared admin-screen look).
//
// Reactive Forms (canonical reference: platform-users): create/edit use typed
// nonNullable FormGroups, validators live on the controls, and `form.dirty`
// feeds the shared dialog's unsaved-changes guard directly.
@Component({
  selector: 'app-currencies',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DialogComponent],
  templateUrl: './currencies.html',
  styleUrls: ['../system-setup/system-setup.css'],
})
export class CurrenciesComponent implements OnInit {
  private readonly currencyService = inject(CurrencyService);
  private readonly fb = inject(FormBuilder);

  readonly currencies = signal<Currency[]>([]);
  readonly loading = signal(false);
  readonly seeding = signal(false);
  readonly togglingCode = signal<string | null>(null);

  // Add-currency dialog. Code must be a 3-letter ISO 4217 code; numeric fields
  // stay strings (nonNullable) and are parsed to numbers in the submit handler.
  readonly addOpen = signal(false);
  readonly addSaving = signal(false);
  readonly addForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^[A-Za-z]{3}$/)]],
    numericCode: [''],
    name: ['', [Validators.required, Validators.maxLength(100)]],
    symbol: ['', [Validators.maxLength(8)]],
    minorUnit: ['2'],
  });

  // Edit-currency dialog. The code is display-only (not a form field); it lives
  // in a separate signal so it can key the update call.
  readonly editOpen = signal(false);
  readonly editSaving = signal(false);
  readonly editingCode = signal('');
  readonly editForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    symbol: ['', [Validators.maxLength(8)]],
    minorUnit: ['2'],
  });

  readonly search = signal('');
  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    // Active rows first, then alphabetical by code (the leading identifier).
    const sorted = [...this.currencies()].sort((a, b) => {
      const aActive = a.isActive !== false;
      const bActive = b.isActive !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return a.code.localeCompare(b.code);
    });
    if (!q) return sorted;
    return sorted.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.code || '').toLowerCase().includes(q),
    );
  });
  readonly activeCount = computed(() => this.currencies().filter((c) => c.isActive !== false).length);

  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.currencyService.listAll().subscribe({
      next: (data) => {
        this.currencies.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onSeed(): void {
    this.clearMessages();
    this.seeding.set(true);
    this.currencyService.seed().subscribe({
      next: (res) => {
        this.successMessage.set(`Loaded ${res.total} ISO 4217 currencies.`);
        this.seeding.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to load default currencies.');
        this.seeding.set(false);
      },
    });
  }

  toggleActive(currency: Currency): void {
    this.clearMessages();
    const next = !(currency.isActive !== false);
    this.togglingCode.set(currency.code);
    this.currencyService.update(currency.code, { isActive: next }).subscribe({
      next: () => {
        this.successMessage.set(`${currency.name} ${next ? 'enabled' : 'disabled'}.`);
        this.togglingCode.set(null);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update currency.');
        this.togglingCode.set(null);
      },
    });
  }

  // Show a control's validation message once the user has interacted with it
  // (or after a submit attempt marks everything touched).
  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  openAdd(): void {
    this.clearMessages();
    this.addForm.reset({ code: '', numericCode: '', name: '', symbol: '', minorUnit: '2' });
    this.addOpen.set(true);
  }

  closeAdd(): void {
    this.addOpen.set(false);
  }

  onSaveAdd(): void {
    this.clearMessages();
    if (this.addForm.invalid) {
      this.addForm.markAllAsTouched();
      return;
    }
    const value = this.addForm.getRawValue();
    const code = value.code.trim().toUpperCase();
    const name = value.name.trim();
    const numericCode = value.numericCode.trim() ? Number(value.numericCode) : undefined;
    const minorUnit = value.minorUnit.trim() ? Number(value.minorUnit) : 2;
    this.addSaving.set(true);
    this.currencyService
      .create({ code, name, symbol: value.symbol.trim() || undefined, numericCode, minorUnit })
      .subscribe({
        next: () => {
          this.successMessage.set(`${name} added.`);
          this.addSaving.set(false);
          this.addOpen.set(false);
          this.load();
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Failed to add currency.');
          this.addSaving.set(false);
        },
      });
  }

  openEdit(currency: Currency): void {
    this.clearMessages();
    this.editingCode.set(currency.code);
    this.editForm.reset({
      name: currency.name,
      symbol: currency.symbol || '',
      minorUnit: String(currency.minorUnit ?? 2),
    });
    this.editOpen.set(true);
  }

  closeEdit(): void {
    this.editOpen.set(false);
  }

  onSaveEdit(): void {
    this.clearMessages();
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }
    const value = this.editForm.getRawValue();
    const name = value.name.trim();
    const minorUnit = value.minorUnit.trim() ? Number(value.minorUnit) : 2;
    this.editSaving.set(true);
    this.currencyService
      .update(this.editingCode(), { name, symbol: value.symbol.trim(), minorUnit })
      .subscribe({
        next: () => {
          this.successMessage.set(`${name} updated.`);
          this.editSaving.set(false);
          this.editOpen.set(false);
          this.load();
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Failed to update currency.');
          this.editSaving.set(false);
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
