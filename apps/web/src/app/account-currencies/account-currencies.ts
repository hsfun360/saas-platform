import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CurrencyService } from '../services/currency.service';
import { Currency } from '../models/auth.models';

// Tenant Admin self-service: choose which of the platform's currencies the
// subscriber (account) uses, and set the default among them. Companies under the
// account can then pick their default currency from this set (Companies screen).
// Reuses the System Setup stylesheet (shared admin-screen look).
@Component({
  selector: 'app-account-currencies',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './account-currencies.html',
  styleUrls: ['../system-setup/system-setup.css'],
})
export class AccountCurrenciesComponent implements OnInit {
  private readonly currencyService = inject(CurrencyService);

  readonly available = signal<Currency[]>([]);
  readonly selected = signal<ReadonlySet<string>>(new Set());
  readonly defaultCode = signal<string>('');
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly search = signal('');
  readonly filteredAvailable = computed(() => {
    const q = this.search().trim().toLowerCase();
    const list = this.available();
    if (!q) return list;
    return list.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q));
  });

  // The selected currencies, in the available-list order, for the default picker.
  readonly selectedCurrencies = computed(() =>
    this.available().filter((c) => this.selected().has(c.code)),
  );

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.currencyService.getAccountCurrencies().subscribe({
      next: (state) => {
        this.available.set(state.available);
        this.selected.set(new Set(state.selected.map((c) => c.code)));
        this.defaultCode.set(state.defaultCurrencyCode || '');
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  isSelected(code: string): boolean {
    return this.selected().has(code);
  }

  isDefault(code: string): boolean {
    return this.defaultCode() === code;
  }

  // Clicking a selected chip makes it the default.
  setDefault(code: string): void {
    if (this.selected().has(code)) this.defaultCode.set(code);
  }

  // Remove a currency from the selection (via its chip ✕).
  remove(code: string): void {
    if (this.selected().has(code)) this.toggle(code);
  }

  toggle(code: string): void {
    const next = new Set(this.selected());
    if (next.has(code)) {
      next.delete(code);
      if (this.defaultCode() === code) this.defaultCode.set(''); // default must stay within the set
    } else {
      next.add(code);
    }
    this.selected.set(next);
    if (!this.defaultCode() && next.size) this.defaultCode.set([...next][0]);
  }

  clearSearch(): void {
    this.search.set('');
  }

  save(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
    const codes = this.selectedCurrencies().map((c) => c.code);
    this.saving.set(true);
    this.currencyService.updateAccountCurrencies(codes, this.defaultCode() || null).subscribe({
      next: (state) => {
        this.available.set(state.available);
        this.selected.set(new Set(state.selected.map((c) => c.code)));
        this.defaultCode.set(state.defaultCurrencyCode || '');
        this.successMessage.set(state.message || 'Currencies updated.');
        this.saving.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update currencies.');
        this.saving.set(false);
      },
    });
  }
}
