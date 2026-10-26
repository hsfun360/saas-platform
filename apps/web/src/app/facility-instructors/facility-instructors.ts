import { Component, Injector, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FacilityInstructor, FacilityInstructorPayload, FacilityInstructorService } from '../services/facility-instructor.service';
import { ScrollReturnService } from '../services/scroll-return.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { ConfirmDialogComponent, ConfirmRequest } from '../shared/confirm-dialog/confirm-dialog';
import { CanDirective } from '../shared/can.directive';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { PhoneInputComponent } from '../shared/phone-input/phone-input';
import { OverflowMenuComponent } from '../shared/overflow-menu/overflow-menu';
import { MenuItemDirective } from '../shared/overflow-menu/menu-item.directive';

// Facility Management → Instructors (/facility/instructors; slice 5,
// structure approved 2026-10-26). The people who lead class sessions - code,
// name, contact, specialities, photo. No login of their own in this slice.
// ONE drawer dialog (create / edit), the listing standard.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-facility-instructors',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent,
    ConfirmDialogComponent, CanDirective, PhoneInputComponent, OverflowMenuComponent, MenuItemDirective],
  templateUrl: './facility-instructors.html',
  styleUrls: ['../membership-types/membership-types.css', './facility-instructors.css'],
})
export class FacilityInstructorsComponent implements OnInit {
  private readonly service = inject(FacilityInstructorService);
  private readonly fb = inject(FormBuilder);
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private static readonly LIST_PATH = '/facility/instructors';

  readonly rows = signal<FacilityInstructor[]>([]);
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);
  readonly uploading = signal(false);
  readonly search = signal('');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');
  readonly confirmAction = signal<ConfirmRequest | null>(null);

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const sorted = [...this.rows()].sort((a, b) => {
      const aActive = a.isActive !== false;
      const bActive = b.isActive !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return sorted.filter((i) => !q || i.code.toLowerCase().includes(q) || i.name.toLowerCase().includes(q) || (i.specialities || '').toLowerCase().includes(q));
  });
  readonly activeCount = computed(() => this.rows().filter((i) => i.isActive !== false).length);

  // --- The ONE drawer dialog ---
  readonly dlgOpen = signal(false);
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);
  readonly editRow = signal<FacilityInstructor | null>(null);

  readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.maxLength(20), Validators.pattern(/^[A-Za-z0-9_-]+$/)]],
    name: ['', [Validators.required, Validators.maxLength(255)]],
    mobile: [''],
    email: ['', [Validators.email, Validators.maxLength(255)]],
    specialities: ['', [Validators.maxLength(255)]],
    photoUrl: [''],
    remarks: ['', [Validators.maxLength(255)]],
  });

  readonly dialogTitle = computed(() => (this.editId() ? 'Edit instructor' : 'New instructor'));

  ngOnInit(): void {
    this.load();
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  codeFrozen(): boolean {
    const r = this.editRow();
    return !!r && r.sessionCount > 0;
  }

  load(): void {
    this.loading.set(true);
    this.service.list().subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
        this.returnScroll.consume(FacilityInstructorsComponent.LIST_PATH, this.injector);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load instructors.');
      },
    });
  }

  private resetForm(i: FacilityInstructor | null): void {
    this.form.reset({
      code: i?.code || '',
      name: i?.name || '',
      mobile: i?.mobile || '',
      email: i?.email || '',
      specialities: i?.specialities || '',
      photoUrl: i?.photoUrl || '',
      remarks: i?.remarks || '',
    });
    if (i && i.sessionCount > 0) this.form.controls.code.disable();
    else this.form.controls.code.enable();
  }

  openAdd(): void {
    this.clearMessages();
    this.editId.set(null);
    this.editRow.set(null);
    this.resetForm(null);
    this.dlgOpen.set(true);
  }

  openEdit(i: FacilityInstructor): void {
    this.clearMessages();
    this.editId.set(i.id);
    this.editRow.set(i);
    this.resetForm(i);
    this.dlgOpen.set(true);
  }

  closeDialog(): void {
    this.dlgOpen.set(false);
  }

  onPhotoSelected(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.clearMessages();
    this.uploading.set(true);
    this.service.uploadPhoto(file).subscribe({
      next: (res) => {
        this.form.controls.photoUrl.setValue(res.url);
        this.form.controls.photoUrl.markAsDirty();
        this.uploading.set(false);
      },
      error: (err) => {
        this.uploading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to upload the photo.');
      },
    });
  }

  removePhoto(): void {
    this.form.controls.photoUrl.setValue('');
    this.form.controls.photoUrl.markAsDirty();
  }

  onSave(): void {
    this.clearMessages();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const payload: FacilityInstructorPayload = {
      code: v.code.trim().toUpperCase(),
      name: v.name.trim(),
      mobile: v.mobile || null,
      email: v.email.trim() || null,
      specialities: v.specialities.trim() || null,
      photoUrl: v.photoUrl || null,
      remarks: v.remarks.trim() || null,
    };
    if (this.codeFrozen()) delete payload.code;
    this.saving.set(true);
    const id = this.editId();
    const req$ = id ? this.service.update(id, payload) : this.service.create(payload);
    req$.subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.saving.set(false);
        this.form.markAsPristine();
        this.closeDialog();
        this.returnScroll.remember(FacilityInstructorsComponent.LIST_PATH, res.instructor.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save the instructor.');
        this.saving.set(false);
      },
    });
  }

  toggleActive(i: FacilityInstructor): void {
    this.clearMessages();
    const next = !(i.isActive !== false);
    this.togglingId.set(i.id);
    this.service.update(i.id, { isActive: next }).subscribe({
      next: () => {
        this.successMessage.set(`${i.name} ${next ? 'enabled' : 'disabled'}.`);
        this.togglingId.set(null);
        this.returnScroll.remember(FacilityInstructorsComponent.LIST_PATH, i.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update the instructor.');
        this.togglingId.set(null);
      },
    });
  }

  askDelete(i: FacilityInstructor): void {
    this.clearMessages();
    const inUse = i.classCount + i.sessionCount;
    this.confirmAction.set({
      title: 'Delete instructor',
      message: inUse
        ? `${i.name} is named by ${i.classCount} class${i.classCount === 1 ? '' : 'es'} and ${i.sessionCount} session${i.sessionCount === 1 ? '' : 's'} - disable the instructor instead.`
        : `Delete instructor ${i.code} (${i.name})? This cannot be undone.`,
      confirmLabel: 'Delete instructor',
      run: () => {
        this.confirmAction.set(null);
        this.togglingId.set(i.id);
        this.service.remove(i.id).subscribe({
          next: (res) => {
            this.togglingId.set(null);
            this.successMessage.set(res.message);
            this.load();
          },
          error: (err) => {
            this.togglingId.set(null);
            this.errorMessage.set(err.error?.message || 'Failed to delete the instructor.');
          },
        });
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
