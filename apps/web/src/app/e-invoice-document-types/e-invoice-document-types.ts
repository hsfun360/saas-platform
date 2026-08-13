import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { EInvoiceDocumentTypeService } from '../services/e-invoice-document-type.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { EInvoiceDocumentType } from '../models/auth.models';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { CanDirective } from '../shared/can.directive';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { OverflowMenuComponent, MenuItemDirective } from '../shared/overflow-menu/overflow-menu';

// System Admin: maintain the Malaysia LHDN e-Invoice document-type reference table
// ('01' Invoice .. '04' Refund Note, '11'-'14' self-billed variants) - sync
// the published LHDN list,
// add codes manually, edit them, and enable/disable or delete them. Clone of the
// Classification Codes screen; reuses the System Setup stylesheet.
@Component({
  selector: 'app-e-invoice-document-types',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent, CanDirective, LocalDatePipe, OverflowMenuComponent, MenuItemDirective],
  templateUrl: './e-invoice-document-types.html',
  styleUrls: ['../system-setup/system-setup.css'],
})
export class EInvoiceDocumentTypesComponent implements OnInit {
  private readonly eInvoiceDocumentTypeService = inject(EInvoiceDocumentTypeService);
  private readonly fb = inject(FormBuilder);

  readonly documentTypes = signal<EInvoiceDocumentType[]>([]);
  readonly loading = signal(false);
  readonly syncing = signal(false);
  readonly togglingCode = signal<string | null>(null);
  readonly deletingCode = signal<string | null>(null);

  // Add-code dialog. LHDN codes are '01'..'06' and 'E' today; the pattern allows
  // up to 20 letters/digits to match the column's headroom (same as the API rule).
  readonly addOpen = signal(false);
  readonly addSaving = signal(false);
  readonly addForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^[0-9A-Za-z-]{1,20}$/)]],
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
    const sorted = [...this.documentTypes()].sort((a, b) => {
      const aActive = a.isActive !== false;
      const bActive = b.isActive !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return a.code.localeCompare(b.code);
    });
    if (!q) return sorted;
    return sorted.filter(
      (t) => t.description.toLowerCase().includes(q) || (t.code || '').toLowerCase().includes(q),
    );
  });
  readonly activeCount = computed(() => this.documentTypes().filter((t) => t.isActive !== false).length);
  readonly lastSynced = computed(() => this.documentTypes().find((t) => t.syncedAt)?.syncedAt || null);

  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.eInvoiceDocumentTypeService.listAll().subscribe({
      next: (data) => {
        this.documentTypes.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onSync(): void {
    this.clearMessages();
    this.syncing.set(true);
    this.eInvoiceDocumentTypeService.sync().subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.syncing.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to sync e-Invoice document types.');
        this.syncing.set(false);
      },
    });
  }

  toggleActive(documentType: EInvoiceDocumentType): void {
    this.clearMessages();
    const next = !(documentType.isActive !== false);
    this.togglingCode.set(documentType.code);
    this.eInvoiceDocumentTypeService.update(documentType.code, { isActive: next }).subscribe({
      next: () => {
        this.successMessage.set(`Code ${documentType.code} ${next ? 'enabled' : 'disabled'}.`);
        this.togglingCode.set(null);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update e-Invoice document type.');
        this.togglingCode.set(null);
      },
    });
  }

  onDelete(documentType: EInvoiceDocumentType): void {
    this.clearMessages();
    this.deletingCode.set(documentType.code);
    this.eInvoiceDocumentTypeService.delete(documentType.code).subscribe({
      next: () => {
        this.successMessage.set(`Code ${documentType.code} deleted.`);
        this.deletingCode.set(null);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to delete e-Invoice document type.');
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
    const code = value.code.trim().toUpperCase();
    const description = value.description.trim();
    this.addSaving.set(true);
    this.eInvoiceDocumentTypeService.create({ code, description }).subscribe({
      next: () => {
        this.successMessage.set(`Code ${code} added.`);
        this.addSaving.set(false);
        this.addOpen.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to add e-Invoice document type.');
        this.addSaving.set(false);
      },
    });
  }

  openEdit(documentType: EInvoiceDocumentType): void {
    this.clearMessages();
    this.editingCode.set(documentType.code);
    this.editForm.reset({ description: documentType.description });
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
    this.eInvoiceDocumentTypeService.update(this.editingCode(), { description }).subscribe({
      next: () => {
        this.successMessage.set(`Code ${this.editingCode()} updated.`);
        this.editSaving.set(false);
        this.editOpen.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update e-Invoice document type.');
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
