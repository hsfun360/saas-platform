import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ClassificationCodeService } from '../services/classification-code.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { ClassificationCode } from '../models/auth.models';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { CanDirective } from '../shared/can.directive';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { OverflowMenuComponent, MenuItemDirective } from '../shared/overflow-menu/overflow-menu';

// System Admin: maintain the Malaysia LHDN e-Invoice classification-code reference
// table - sync the published LHDN list, add codes manually, edit them, and
// enable/disable or delete them. Reuses the System Setup stylesheet (shared
// admin-screen look).
//
// Reactive Forms (canonical reference: platform-users): create/edit use typed
// nonNullable FormGroups, validators live on the controls, and `form.dirty`
// feeds the shared dialog's unsaved-changes guard directly.
@Component({
  selector: 'app-classification-codes',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent, CanDirective, LocalDatePipe, OverflowMenuComponent, MenuItemDirective],
  templateUrl: './classification-codes.html',
  styleUrls: ['../system-setup/system-setup.css'],
})
export class ClassificationCodesComponent implements OnInit {
  private readonly classificationCodeService = inject(ClassificationCodeService);
  private readonly fb = inject(FormBuilder);

  readonly codes = signal<ClassificationCode[]>([]);
  readonly loading = signal(false);
  readonly syncing = signal(false);
  readonly togglingCode = signal<string | null>(null);
  readonly deletingCode = signal<string | null>(null);

  // Add-code dialog. Code must be a 3-digit LHDN code (zero-padded, e.g. 046).
  readonly addOpen = signal(false);
  readonly addSaving = signal(false);
  readonly addForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{3}$/)]],
    description: ['', [Validators.required, Validators.maxLength(500)]],
  });

  // Edit-code dialog. The code is display-only (not a form field); it lives in a
  // separate signal so it can key the update call.
  readonly editOpen = signal(false);
  readonly editSaving = signal(false);
  readonly editingCode = signal('');
  readonly editForm = this.fb.nonNullable.group({
    description: ['', [Validators.required, Validators.maxLength(500)]],
  });

  readonly search = signal('');
  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    // Active rows first, then by code (the leading identifier).
    const sorted = [...this.codes()].sort((a, b) => {
      const aActive = a.isActive !== false;
      const bActive = b.isActive !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return a.code.localeCompare(b.code);
    });
    if (!q) return sorted;
    return sorted.filter(
      (c) => c.description.toLowerCase().includes(q) || (c.code || '').toLowerCase().includes(q),
    );
  });
  readonly activeCount = computed(() => this.codes().filter((c) => c.isActive !== false).length);
  readonly lastSynced = computed(() => this.codes().find((c) => c.syncedAt)?.syncedAt || null);

  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.classificationCodeService.listAll().subscribe({
      next: (data) => {
        this.codes.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onSync(): void {
    this.clearMessages();
    this.syncing.set(true);
    this.classificationCodeService.sync().subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.syncing.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to sync classification codes.');
        this.syncing.set(false);
      },
    });
  }

  toggleActive(code: ClassificationCode): void {
    this.clearMessages();
    const next = !(code.isActive !== false);
    this.togglingCode.set(code.code);
    this.classificationCodeService.update(code.code, { isActive: next }).subscribe({
      next: () => {
        this.successMessage.set(`Code ${code.code} ${next ? 'enabled' : 'disabled'}.`);
        this.togglingCode.set(null);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update classification code.');
        this.togglingCode.set(null);
      },
    });
  }

  onDelete(code: ClassificationCode): void {
    this.clearMessages();
    this.deletingCode.set(code.code);
    this.classificationCodeService.delete(code.code).subscribe({
      next: () => {
        this.successMessage.set(`Code ${code.code} deleted.`);
        this.deletingCode.set(null);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to delete classification code.');
        this.deletingCode.set(null);
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
    this.addForm.reset({ code: '', description: '' });
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
    const code = value.code.trim();
    const description = value.description.trim();
    this.addSaving.set(true);
    this.classificationCodeService.create({ code, description }).subscribe({
      next: () => {
        this.successMessage.set(`Code ${code} added.`);
        this.addSaving.set(false);
        this.addOpen.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to add classification code.');
        this.addSaving.set(false);
      },
    });
  }

  openEdit(code: ClassificationCode): void {
    this.clearMessages();
    this.editingCode.set(code.code);
    this.editForm.reset({ description: code.description });
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
    const description = this.editForm.getRawValue().description.trim();
    this.editSaving.set(true);
    this.classificationCodeService.update(this.editingCode(), { description }).subscribe({
      next: () => {
        this.successMessage.set(`Code ${this.editingCode()} updated.`);
        this.editSaving.set(false);
        this.editOpen.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update classification code.');
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
