import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CurrencyService } from '../services/currency.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { Currency } from '../models/auth.models';

// System Admin: maintain the ISO 4217 currency reference table - load the bundled
// defaults, add currencies manually, edit them, and enable/disable or delete them.
// Reuses the System Setup stylesheet (shared admin-screen look).
@Component({
  selector: 'app-currencies',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogComponent],
  templateUrl: './currencies.html',
  styleUrls: ['../system-setup/system-setup.css'],
})
export class CurrenciesComponent implements OnInit {
  private readonly currencyService = inject(CurrencyService);

  readonly currencies = signal<Currency[]>([]);
  readonly loading = signal(false);
  readonly seeding = signal(false);
  readonly togglingCode = signal<string | null>(null);

  // Add-currency dialog.
  readonly addOpen = signal(false);
  readonly addSaving = signal(false);
  addForm = { code: '', name: '', symbol: '', numericCode: '', minorUnit: '2' };

  // Edit-currency dialog.
  readonly editOpen = signal(false);
  readonly editSaving = signal(false);
  editForm = { code: '', name: '', symbol: '', minorUnit: '2' };

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

  openAdd(): void {
    this.clearMessages();
    this.addForm = { code: '', name: '', symbol: '', numericCode: '', minorUnit: '2' };
    this.addOpen.set(true);
  }

  closeAdd(): void {
    this.addOpen.set(false);
  }

  onSaveAdd(): void {
    this.clearMessages();
    const code = this.addForm.code.trim().toUpperCase();
    const name = this.addForm.name.trim();
    if (!/^[A-Z]{3}$/.test(code)) {
      this.errorMessage.set('Code must be a 3-letter ISO 4217 code (e.g. USD).');
      return;
    }
    if (!name) {
      this.errorMessage.set('Name is required.');
      return;
    }
    const numericCode = this.addForm.numericCode.trim() ? Number(this.addForm.numericCode) : undefined;
    const minorUnit = this.addForm.minorUnit.trim() ? Number(this.addForm.minorUnit) : 2;
    this.addSaving.set(true);
    this.currencyService
      .create({ code, name, symbol: this.addForm.symbol.trim() || undefined, numericCode, minorUnit })
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
    this.editForm = {
      code: currency.code,
      name: currency.name,
      symbol: currency.symbol || '',
      minorUnit: String(currency.minorUnit ?? 2),
    };
    this.editOpen.set(true);
  }

  closeEdit(): void {
    this.editOpen.set(false);
  }

  onSaveEdit(): void {
    this.clearMessages();
    const name = this.editForm.name.trim();
    if (!name) {
      this.errorMessage.set('Name is required.');
      return;
    }
    const minorUnit = this.editForm.minorUnit.trim() ? Number(this.editForm.minorUnit) : 2;
    this.editSaving.set(true);
    this.currencyService
      .update(this.editForm.code, { name, symbol: this.editForm.symbol.trim(), minorUnit })
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
