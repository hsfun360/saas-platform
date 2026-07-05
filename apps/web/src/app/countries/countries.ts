import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CountryService } from '../services/country.service';
import { LanguageService } from '../services/language.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { Country, Language } from '../models/auth.models';

// System Admin: maintain the country reference table - sync it from the
// world_countries dataset and enable/disable individual countries in the pickers.
// Reuses the System Setup stylesheet (shared admin-screen look).
@Component({
  selector: 'app-countries',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogComponent],
  templateUrl: './countries.html',
  styleUrls: ['../system-setup/system-setup.css'],
})
export class CountriesComponent implements OnInit {
  readonly countries = signal<Country[]>([]);
  readonly loading = signal(false);
  readonly syncing = signal(false);
  readonly togglingCode = signal<string | null>(null);

  // Active languages (from the Language table) drive which translations the edit
  // dialog offers. Loaded once on init; empty if the Language table isn't seeded.
  readonly languages = signal<Language[]>([]);

  // Edit dialog (dial code + localized names).
  readonly editOpen = signal(false);
  readonly editSaving = signal(false);
  editForm = { alpha2: '', name: '', dialCode: '' };
  // One row per language to translate, prefilled from the country's `names` map.
  // `code` is the language code, `label` its display name, `name` the (editable)
  // translation. English is listed first; languages already present on the country
  // but not currently active are still shown so existing data stays editable.
  editTranslations: { code: string; label: string; name: string }[] = [];

  readonly search = signal('');
  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const list = this.countries();
    if (!q) return list;
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.alpha2 || '').toLowerCase().includes(q) ||
        (c.alpha3 || '').toLowerCase().includes(q),
    );
  });
  readonly activeCount = computed(() => this.countries().filter((c) => c.isActive !== false).length);
  readonly lastSynced = computed(() => this.countries().find((c) => c.syncedAt)?.syncedAt || null);

  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  private readonly languageService = inject(LanguageService);

  constructor(private countryService: CountryService) {}

  ngOnInit(): void {
    this.load();
    this.languageService.listActive().subscribe({
      next: (list) => this.languages.set(list),
      error: () => {}, // no active languages -> edit dialog falls back to existing names
    });
  }

  load(): void {
    this.loading.set(true);
    this.countryService.listAll().subscribe({
      next: (data) => {
        this.countries.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onSync(): void {
    this.clearMessages();
    this.syncing.set(true);
    this.countryService.sync().subscribe({
      next: (res) => {
        this.successMessage.set(`Synced ${res.total} countries across ${res.languages} language(s).`);
        this.syncing.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to sync countries.');
        this.syncing.set(false);
      },
    });
  }

  toggleActive(country: Country): void {
    this.clearMessages();
    const next = !(country.isActive !== false);
    this.togglingCode.set(country.alpha2);
    this.countryService.setActive(country.alpha2, next).subscribe({
      next: () => {
        this.successMessage.set(`${country.name} ${next ? 'enabled' : 'disabled'}.`);
        this.togglingCode.set(null);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update country.');
        this.togglingCode.set(null);
      },
    });
  }

  openEdit(country: Country): void {
    this.clearMessages();
    this.editForm = { alpha2: country.alpha2, name: country.name, dialCode: country.dialCode || '' };
    this.editTranslations = this.buildTranslations(country);
    this.editOpen.set(true);
  }

  // Union of the active languages and any language already present on the country's
  // `names` map (so existing translations stay editable even if that language was
  // later deactivated). English first, then alphabetical by label.
  private buildTranslations(country: Country): { code: string; label: string; name: string }[] {
    const names = country.names || {};
    const labels = new Map<string, string>();
    for (const l of this.languages()) labels.set(l.languageCode, l.name);
    for (const code of Object.keys(names)) if (!labels.has(code)) labels.set(code, code.toUpperCase());

    return [...labels.entries()]
      .map(([code, label]) => ({ code, label, name: names[code] || '' }))
      .sort((a, b) => {
        if (a.code === 'en') return -1;
        if (b.code === 'en') return 1;
        return a.label.localeCompare(b.label);
      });
  }

  closeEdit(): void {
    this.editOpen.set(false);
  }

  onSaveEdit(): void {
    this.clearMessages();
    this.editSaving.set(true);
    const names: Record<string, string> = {};
    for (const t of this.editTranslations) names[t.code] = t.name.trim();
    this.countryService
      .updateCountry(this.editForm.alpha2, { dialCode: this.editForm.dialCode.trim(), names })
      .subscribe({
        next: () => {
          this.successMessage.set(`${this.editForm.name} updated.`);
          this.editSaving.set(false);
          this.editOpen.set(false);
          this.load();
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Failed to update country.');
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
