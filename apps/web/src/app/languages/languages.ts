import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LanguageService } from '../services/language.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { Language } from '../models/auth.models';

// System Admin: maintain the language reference table - load a bundled default
// set, add languages manually, rename them, and enable/disable or delete them.
// These are the languages the platform can be presented in (future i18n).
// Reuses the System Setup stylesheet (shared admin-screen look).
//
// Reactive Forms (canonical reference: platform-users): create/edit use typed
// nonNullable FormGroups, validators live on the controls, and `form.dirty`
// feeds the shared dialog's unsaved-changes guard directly.
@Component({
  selector: 'app-languages',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DialogComponent],
  templateUrl: './languages.html',
  styleUrls: ['../system-setup/system-setup.css'],
})
export class LanguagesComponent implements OnInit {
  private readonly languageService = inject(LanguageService);
  private readonly fb = inject(FormBuilder);

  readonly languages = signal<Language[]>([]);
  readonly loading = signal(false);
  readonly seeding = signal(false);
  readonly togglingCode = signal<string | null>(null);

  // Add-language dialog.
  readonly addOpen = signal(false);
  readonly addSaving = signal(false);
  readonly addForm = this.fb.nonNullable.group({
    languageCode: ['', [Validators.required, Validators.maxLength(10)]],
    name: ['', [Validators.required, Validators.maxLength(100)]],
  });

  // Edit-language dialog. The code is display-only (not a form field); it lives
  // in a separate signal so it can key the update call.
  readonly editOpen = signal(false);
  readonly editSaving = signal(false);
  readonly editingCode = signal('');
  readonly editForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
  });

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


  // Show a control's validation message once the user has interacted with it
  // (or after a submit attempt marks everything touched).
  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  openAdd(): void {
    this.clearMessages();
    this.addForm.reset({ languageCode: '', name: '' });
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
    const languageCode = value.languageCode.trim().toLowerCase();
    const name = value.name.trim();
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
    this.editingCode.set(language.languageCode);
    this.editForm.reset({ name: language.name });
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
    const name = this.editForm.getRawValue().name.trim();
    this.editSaving.set(true);
    this.languageService.update(this.editingCode(), { name }).subscribe({
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
