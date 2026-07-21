import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { CountryService } from '../services/country.service';
import { LanguageService } from '../services/language.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { Country, Language } from '../models/auth.models';

// One translation row = a small typed FormGroup. `languageCode` and `label` are
// carried alongside the editable `name` so we can render the row's label and read
// the code back into the API payload without a separate parallel array.
type TranslationGroup = FormGroup<{
  languageCode: FormControl<string>;
  label: FormControl<string>;
  name: FormControl<string>;
}>;

// System Admin: maintain the country reference table - sync it from the
// world_countries dataset and enable/disable individual countries in the pickers.
// Reuses the System Setup stylesheet (shared admin-screen look).
//
// The edit dialog uses Reactive Forms (see docs/coding-standards.md → "Forms",
// canonical reference `platform-users`): a typed FormGroup with a `dialCode`
// control plus a `translations` FormArray (one FormGroup per language). `form.dirty`
// feeds the shared dialog's unsaved-changes guard directly.
@Component({
  selector: 'app-countries',
  standalone: true,
  imports: [ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent],
  templateUrl: './countries.html',
  styleUrls: ['../system-setup/system-setup.css'],
})
export class CountriesComponent implements OnInit {
  private readonly languageService = inject(LanguageService);
  private readonly fb = inject(FormBuilder);

  readonly countries = signal<Country[]>([]);
  readonly loading = signal(false);
  readonly syncing = signal(false);
  readonly togglingCode = signal<string | null>(null);

  // Active languages (from the Language table) drive which translations the edit
  // dialog offers. Loaded once on init; empty if the Language table isn't seeded.
  readonly languages = signal<Language[]>([]);

  // Edit dialog. The edited country's alpha-2 / display name aren't editable form
  // inputs, so they live in signals outside the form (id + title source).
  readonly editOpen = signal(false);
  readonly editSaving = signal(false);
  readonly editAlpha2 = signal('');
  readonly editName = signal('');

  // Edit form: a dial code control plus a FormArray of per-language translation
  // rows (built fresh on each openEdit from the country's `names` map).
  readonly editForm = this.fb.nonNullable.group({
    dialCode: this.fb.nonNullable.control('', [Validators.maxLength(8)]),
    translations: this.fb.nonNullable.array<TranslationGroup>([]),
  });

  // Convenience accessor for the template (`@for` over the rows) and read-back.
  get translationControls(): TranslationGroup[] {
    return this.editForm.controls.translations.controls;
  }

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

  // Show a control's validation message once the user has interacted with it
  // (or after a submit attempt marks everything touched).
  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  openEdit(country: Country): void {
    this.clearMessages();
    this.editAlpha2.set(country.alpha2);
    this.editName.set(country.name);

    // Rebuild the translations FormArray from scratch: clear, then push one typed
    // group per language row. Each group is created with its values as its
    // nonNullable defaults, so the reset() below keeps those values and marks the
    // whole form pristine.
    const arr: FormArray<TranslationGroup> = this.editForm.controls.translations;
    arr.clear();
    for (const row of this.buildTranslations(country)) {
      arr.push(this.buildTranslationGroup(row.code, row.label, row.name));
    }
    this.editForm.reset({ dialCode: country.dialCode || '' });

    this.editOpen.set(true);
  }

  private buildTranslationGroup(code: string, label: string, name: string): TranslationGroup {
    return this.fb.nonNullable.group({
      languageCode: this.fb.nonNullable.control(code),
      label: this.fb.nonNullable.control(label),
      name: this.fb.nonNullable.control(name, [Validators.maxLength(100)]),
    });
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
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }
    const value = this.editForm.getRawValue();
    // Read the FormArray back into the exact payload the API expects: a map keyed
    // by language code with trimmed names (empty string clears that translation).
    const names: Record<string, string> = {};
    for (const t of value.translations) names[t.languageCode] = t.name.trim();
    this.editSaving.set(true);
    this.countryService
      .updateCountry(this.editAlpha2(), { dialCode: value.dialCode.trim(), names })
      .subscribe({
        next: () => {
          this.successMessage.set(`${this.editName()} updated.`);
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
