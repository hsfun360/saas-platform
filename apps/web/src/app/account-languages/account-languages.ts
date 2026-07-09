import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LanguageService } from '../services/language.service';
import { TranslatePipe } from '../i18n/translate.pipe';
import { Language } from '../models/auth.models';

// Tenant Admin self-service: choose which of the platform's languages the
// subscriber (account) offers, and set the default among them. Users in the
// account can then pick a personal preferred language from this set (Settings).
// Reuses the System Setup stylesheet (shared admin-screen look).
@Component({
  selector: 'app-account-languages',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './account-languages.html',
  styleUrls: ['../system-setup/system-setup.css'],
})
export class AccountLanguagesComponent implements OnInit {
  private readonly languageService = inject(LanguageService);

  readonly available = signal<Language[]>([]);
  readonly selected = signal<ReadonlySet<string>>(new Set());
  readonly defaultCode = signal<string>('');
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  // The selected languages, in the available-list order, for the default picker.
  readonly selectedLanguages = computed(() =>
    this.available().filter((l) => this.selected().has(l.languageCode)),
  );

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.languageService.getAccountLanguages().subscribe({
      next: (state) => {
        this.available.set(state.available);
        this.selected.set(new Set(state.selected.map((l) => l.languageCode)));
        this.defaultCode.set(state.defaultLanguageCode || '');
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

  // Remove a language from the selection (via its chip ✕).
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
    // Keep a sensible default: first selected if none chosen yet.
    if (!this.defaultCode() && next.size) this.defaultCode.set([...next][0]);
  }

  save(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
    const codes = this.selectedLanguages().map((l) => l.languageCode);
    this.saving.set(true);
    this.languageService.updateAccountLanguages(codes, this.defaultCode() || null).subscribe({
      next: (state) => {
        this.available.set(state.available);
        this.selected.set(new Set(state.selected.map((l) => l.languageCode)));
        this.defaultCode.set(state.defaultLanguageCode || '');
        this.successMessage.set(state.message || 'Languages updated.');
        this.saving.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update languages.');
        this.saving.set(false);
      },
    });
  }
}
