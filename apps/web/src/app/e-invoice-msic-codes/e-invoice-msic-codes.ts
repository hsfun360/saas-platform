import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { EInvoiceMsicCodeService } from '../services/e-invoice-msic-code.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { EInvoiceMsicCode } from '../models/auth.models';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { CanDirective } from '../shared/can.directive';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { OverflowMenuComponent, MenuItemDirective } from '../shared/overflow-menu/overflow-menu';

// MSIC 2008 section names (A-U), display-only: LHDN's JSON carries just the
// section letter ("MSIC Category Reference"); the names are the standard MSIC
// 2008 section titles so cards read "C — Manufacturing" instead of a bare "C".
const MSIC_SECTION_NAMES: Record<string, string> = {
  A: 'Agriculture, Forestry and Fishing',
  B: 'Mining and Quarrying',
  C: 'Manufacturing',
  D: 'Electricity, Gas, Steam and Air Conditioning Supply',
  E: 'Water Supply; Sewerage, Waste Management and Remediation Activities',
  F: 'Construction',
  G: 'Wholesale and Retail Trade; Repair of Motor Vehicles and Motorcycles',
  H: 'Transportation and Storage',
  I: 'Accommodation and Food Service Activities',
  J: 'Information and Communication',
  K: 'Financial and Insurance/Takaful Activities',
  L: 'Real Estate Activities',
  M: 'Professional, Scientific and Technical Activities',
  N: 'Administrative and Support Service Activities',
  O: 'Public Administration and Defence; Compulsory Social Security',
  P: 'Education',
  Q: 'Human Health and Social Work Activities',
  R: 'Arts, Entertainment and Recreation',
  S: 'Other Service Activities',
  T: 'Activities of Households as Employers',
  U: 'Activities of Extraterritorial Organizations and Bodies',
};

// System Admin: maintain the Malaysia LHDN e-Invoice MSIC code reference table
// (MSIC 2008 sub-category, 5-digit business nature/activity codes) - sync the
// published LHDN list, add codes manually, edit them, and enable/disable or
// delete them. Clone of the e-Invoice Classification Codes screen; reuses the System
// Setup stylesheet (shared admin-screen look).
@Component({
  selector: 'app-e-invoice-msic-codes',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent, CanDirective, LocalDatePipe, OverflowMenuComponent, MenuItemDirective],
  templateUrl: './e-invoice-msic-codes.html',
  styleUrls: ['../system-setup/system-setup.css'],
})
export class EInvoiceMsicCodesComponent implements OnInit {
  private readonly eInvoiceMsicCodeService = inject(EInvoiceMsicCodeService);
  private readonly fb = inject(FormBuilder);

  readonly codes = signal<EInvoiceMsicCode[]>([]);
  readonly loading = signal(false);
  readonly syncing = signal(false);
  readonly togglingCode = signal<string | null>(null);
  readonly deletingCode = signal<string | null>(null);

  // Add-code dialog. LHDN e-Invoice MSIC codes are 5 digits today; the pattern allows up
  // to 20 letters/digits to match the column's headroom (same as the API rule).
  readonly addOpen = signal(false);
  readonly addSaving = signal(false);
  readonly addForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^[0-9A-Za-z-]{1,20}$/)]],
    description: ['', [Validators.required, Validators.maxLength(500)]],
    categoryReference: ['', [Validators.maxLength(20)]],
  });

  // Edit-code dialog. The code is display-only (not a form field); it lives in a
  // separate signal so it can key the update call.
  readonly editOpen = signal(false);
  readonly editSaving = signal(false);
  readonly editingCode = signal('');
  readonly editForm = this.fb.nonNullable.group({
    description: ['', [Validators.required, Validators.maxLength(500)]],
    categoryReference: ['', [Validators.maxLength(20)]],
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
      (c) =>
        c.description.toLowerCase().includes(q) ||
        (c.code || '').toLowerCase().includes(q) ||
        this.sectionLabel(c).toLowerCase().includes(q),
    );
  });
  readonly activeCount = computed(() => this.codes().filter((c) => c.isActive !== false).length);
  readonly lastSynced = computed(() => this.codes().find((c) => c.syncedAt)?.syncedAt || null);

  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  ngOnInit(): void {
    this.load();
  }

  // "C — Manufacturing" for a known section letter, the raw value otherwise.
  sectionLabel(code: EInvoiceMsicCode): string {
    const ref = (code.categoryReference || '').trim();
    if (!ref) return '';
    const name = MSIC_SECTION_NAMES[ref];
    return name ? `${ref} — ${name}` : ref;
  }

  load(): void {
    this.loading.set(true);
    this.eInvoiceMsicCodeService.listAll().subscribe({
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
    this.eInvoiceMsicCodeService.sync().subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.syncing.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to sync e-Invoice MSIC codes.');
        this.syncing.set(false);
      },
    });
  }

  toggleActive(code: EInvoiceMsicCode): void {
    this.clearMessages();
    const next = !(code.isActive !== false);
    this.togglingCode.set(code.code);
    this.eInvoiceMsicCodeService.update(code.code, { isActive: next }).subscribe({
      next: () => {
        this.successMessage.set(`Code ${code.code} ${next ? 'enabled' : 'disabled'}.`);
        this.togglingCode.set(null);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update e-Invoice MSIC code.');
        this.togglingCode.set(null);
      },
    });
  }

  onDelete(code: EInvoiceMsicCode): void {
    this.clearMessages();
    this.deletingCode.set(code.code);
    this.eInvoiceMsicCodeService.delete(code.code).subscribe({
      next: () => {
        this.successMessage.set(`Code ${code.code} deleted.`);
        this.deletingCode.set(null);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to delete e-Invoice MSIC code.');
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
    this.addForm.reset({ code: '', description: '', categoryReference: '' });
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
    const categoryReference = value.categoryReference.trim();
    this.addSaving.set(true);
    this.eInvoiceMsicCodeService.create({ code, description, ...(categoryReference ? { categoryReference } : {}) }).subscribe({
      next: () => {
        this.successMessage.set(`Code ${code} added.`);
        this.addSaving.set(false);
        this.addOpen.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to add e-Invoice MSIC code.');
        this.addSaving.set(false);
      },
    });
  }

  openEdit(code: EInvoiceMsicCode): void {
    this.clearMessages();
    this.editingCode.set(code.code);
    this.editForm.reset({
      description: code.description,
      categoryReference: code.categoryReference || '',
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
    this.editSaving.set(true);
    this.eInvoiceMsicCodeService
      .update(this.editingCode(), { description: value.description.trim(), categoryReference: value.categoryReference.trim() })
      .subscribe({
        next: () => {
          this.successMessage.set(`Code ${this.editingCode()} updated.`);
          this.editSaving.set(false);
          this.editOpen.set(false);
          this.load();
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Failed to update e-Invoice MSIC code.');
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
