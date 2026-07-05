import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LanguageService } from '../services/language.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { Language } from '../models/auth.models';

// System Admin: maintain the language reference table - load a bundled default
// set, add languages manually, rename them, and enable/disable or delete them.
// These are the languages the platform can be presented in (future i18n).
// Reuses the System Setup stylesheet (shared admin-screen look).
@Component({
  selector: 'app-languages',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogComponent],
  templateUrl: './languages.html',
  styleUrls: ['../system-setup/system-setup.css'],
})
export class LanguagesComponent implements OnInit {
  private readonly languageService = inject(LanguageService);

  readonly languages = signal<Language[]>([]);
  readonly loading = signal(false);
  readonly seeding = signal(false);
  readonly togglingCode = signal<string | null>(null);

  // Add-language dialog.
  readonly addOpen = signal(false);
  readonly addSaving = signal(false);
  addForm = { languageCode: '', name: '' };

  // Edit-language dialog.
  readonly editOpen = signal(false);
  readonly editSaving = signal(false);
  editForm = { languageCode: '', name: '' };

  readonly search = signal('');
  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    // Active rows first, then alphabetical by name.
    const sorted = [...this.languages()].sort((a, b) => {
      const aActive = a.isActive !== false;
      const bActive = b.isActive !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    if (!q) return sorted;
    return sorted.filter(
      (l) => l.name.toLowerCase().includes(q) || (l.languageCode || '').toLowerCase().includes(q),
    );
  });
  readonly activeCount = computed(() => this.languages().filter((l) => l.isActive !== false).length);

  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.languageService.listAll().subscribe({
      next: (data) => {
        this.languages.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onSeed(): void {
    this.clearMessages();
    this.seeding.set(true);
    this.languageService.seed().subscribe({
      next: (res) => {
        this.successMessage.set(`Loaded ${res.total} default languages.`);
        this.seeding.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to load default languages.');
        this.seeding.set(false);
      },
    });
  }

  toggleActive(language: Language): void {
    this.clearMessages();
    const next = !(language.isActive !== false);
    this.togglingCode.set(language.languageCode);
    this.languageService.update(language.languageCode, { isActive: next }).subscribe({
      next: () => {
        this.successMessage.set(`${language.name} ${next ? 'enabled' : 'disabled'}.`);
        this.togglingCode.set(null);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update language.');
        this.togglingCode.set(null);
      },
    });
  }


  openAdd(): void {
    this.clearMessages();
    this.addForm = { languageCode: '', name: '' };
    this.addOpen.set(true);
  }

  closeAdd(): void {
    this.addOpen.set(false);
  }

  onSaveAdd(): void {
    this.clearMessages();
    const languageCode = this.addForm.languageCode.trim().toLowerCase();
    const name = this.addForm.name.trim();
    if (!languageCode || !name) {
      this.errorMessage.set('Language code and name are required.');
      return;
    }
    this.addSaving.set(true);
    this.languageService.create({ languageCode, name }).subscribe({
      next: () => {
        this.successMessage.set(`${name} added.`);
        this.addSaving.set(false);
        this.addOpen.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to add language.');
        this.addSaving.set(false);
      },
    });
  }

  openEdit(language: Language): void {
    this.clearMessages();
    this.editForm = { languageCode: language.languageCode, name: language.name };
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
    this.editSaving.set(true);
    this.languageService.update(this.editForm.languageCode, { name }).subscribe({
      next: () => {
        this.successMessage.set(`${name} updated.`);
        this.editSaving.set(false);
        this.editOpen.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update language.');
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
