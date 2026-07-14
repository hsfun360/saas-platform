import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { GolfCourseService } from '../services/golf-course.service';
import { UnitCourseService } from '../services/unit-course.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { GolfCourse, UnitCourse } from '../models/auth.models';

// Golf Management → Master File Setup → Courses (spec 2.2.4).
// An 18-hole course pairs two unit courses - first nine (OUT|COMPOSITE) +
// second nine (IN|COMPOSITE) - with optional alternate and night fallback
// nines, a cross over time and a course picture. Field names match the screen
// labels and DB columns (user's vocabulary). Legacy zone column dropped.
// Enable/disable (no hard delete). Reuses the System Setup stylesheet.
@Component({
  selector: 'app-golf-courses',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DialogComponent],
  templateUrl: './golf-courses.html',
  styleUrls: ['../system-setup/system-setup.css', './golf-courses.css'],
})
export class GolfCoursesComponent implements OnInit {
  private readonly service = inject(GolfCourseService);
  private readonly unitCourseService = inject(UnitCourseService);
  private readonly fb = inject(FormBuilder);

  readonly courses = signal<GolfCourse[]>([]);
  readonly unitCourses = signal<UnitCourse[]>([]);
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);

  // One dialog serves add + edit; editId() decides which.
  readonly dialogOpen = signal(false);
  readonly saving = signal(false);
  readonly uploading = signal(false);
  readonly editId = signal<string | null>(null);
  readonly dialogTitle = computed(() => (this.editId() ? 'Edit course' : 'New course'));

  readonly form = this.fb.nonNullable.group({
    courseCode: ['', [Validators.required, Validators.maxLength(20)]],
    displaySequence: this.fb.control<number | null>(null, [Validators.min(1), Validators.max(999)]),
    description: ['', [Validators.maxLength(255)]],
    firstNineId: ['', [Validators.required]],
    secondNineId: ['', [Validators.required]],
    alternateNineId: [''],
    nightNineId: [''],
    crossOverMinutes: this.fb.control<number | null>(null, [Validators.min(1), Validators.max(600)]),
    photo: [''],
  });

  readonly search = signal('');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  // Picker option lists, filtered by the pairing rules (mirrors the API).
  readonly firstNineOptions = computed(() =>
    this.unitCourses().filter((u) => u.isActive !== false && (u.courseType === 'out' || u.courseType === 'composite')),
  );
  readonly secondNineOptions = computed(() =>
    this.unitCourses().filter((u) => u.isActive !== false && (u.courseType === 'in' || u.courseType === 'composite')),
  );
  readonly alternateNineOptions = computed(() => this.unitCourses().filter((u) => u.isActive !== false));
  readonly nightNineOptions = computed(() =>
    this.unitCourses().filter((u) => u.isActive !== false && u.hasFloodlight === true),
  );

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const sorted = [...this.courses()].sort((a, b) => {
      const aActive = a.isActive !== false;
      const bActive = b.isActive !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return 0;
    });
    if (!q) return sorted;
    return sorted.filter(
      (c) =>
        c.courseCode.toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q) ||
        this.nineCode(c.firstNineId).toLowerCase().includes(q) ||
        this.nineCode(c.secondNineId).toLowerCase().includes(q),
    );
  });
  readonly activeCount = computed(() => this.courses().filter((c) => c.isActive !== false).length);

  ngOnInit(): void {
    this.loadUnitCourses();
    this.load();
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  // Resolve a unit-course id to its code for display ('' when unset/unknown).
  nineCode(id: string | null | undefined): string {
    if (!id) return '';
    return this.unitCourses().find((u) => u.id === id)?.unitCourseCode || '';
  }

  loadUnitCourses(): void {
    this.unitCourseService.list().subscribe({
      next: (data) => this.unitCourses.set(data),
      error: () => {
        /* pickers stay empty; the API still validates on save */
      },
    });
  }

  load(): void {
    this.loading.set(true);
    this.service.list().subscribe({
      next: (data) => {
        this.courses.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load courses.');
      },
    });
  }

  openAdd(): void {
    this.clearMessages();
    this.editId.set(null);
    this.form.reset({
      courseCode: '',
      displaySequence: null,
      description: '',
      firstNineId: '',
      secondNineId: '',
      alternateNineId: '',
      nightNineId: '',
      crossOverMinutes: null,
      photo: '',
    });
    this.dialogOpen.set(true);
  }

  openEdit(c: GolfCourse): void {
    this.clearMessages();
    this.editId.set(c.id);
    this.form.reset({
      courseCode: c.courseCode,
      displaySequence: c.displaySequence ?? null,
      description: c.description || '',
      firstNineId: c.firstNineId,
      secondNineId: c.secondNineId,
      alternateNineId: c.alternateNineId || '',
      nightNineId: c.nightNineId || '',
      crossOverMinutes: c.crossOverMinutes ?? null,
      photo: c.photo || '',
    });
    this.dialogOpen.set(true);
  }

  closeDialog(): void {
    this.dialogOpen.set(false);
  }

  onPhotoSelected(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = ''; // allow re-selecting the same file
    if (!file) return;
    this.clearMessages();
    this.uploading.set(true);
    this.service.uploadPhoto(file).subscribe({
      next: (res) => {
        this.form.controls.photo.setValue(res.url);
        this.form.controls.photo.markAsDirty(); // uploads count as unsaved changes
        this.uploading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to upload photo.');
        this.uploading.set(false);
      },
    });
  }

  removePhoto(): void {
    this.form.controls.photo.setValue('');
    this.form.controls.photo.markAsDirty();
  }

  onSave(): void {
    this.clearMessages();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const f = this.form.getRawValue();
    if (f.firstNineId && f.firstNineId === f.secondNineId) {
      this.errorMessage.set('First nine and second nine must be two different unit courses.');
      return;
    }
    const payload: Partial<GolfCourse> = {
      courseCode: f.courseCode.trim(),
      displaySequence: f.displaySequence,
      description: f.description.trim() || null,
      firstNineId: f.firstNineId,
      secondNineId: f.secondNineId,
      alternateNineId: f.alternateNineId || null,
      nightNineId: f.nightNineId || null,
      crossOverMinutes: f.crossOverMinutes,
      photo: f.photo || null,
    };

    this.saving.set(true);
    const id = this.editId();
    const request = id ? this.service.update(id, payload) : this.service.create(payload);
    request.subscribe({
      next: () => {
        this.successMessage.set(`${payload.courseCode} ${id ? 'updated' : 'added'}.`);
        this.saving.set(false);
        this.dialogOpen.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || `Failed to ${id ? 'update' : 'add'} course.`);
        this.saving.set(false);
      },
    });
  }

  toggleActive(c: GolfCourse): void {
    this.clearMessages();
    const next = !(c.isActive !== false);
    this.togglingId.set(c.id);
    this.service.update(c.id, { isActive: next }).subscribe({
      next: () => {
        this.successMessage.set(`${c.courseCode} ${next ? 'enabled' : 'disabled'}.`);
        this.togglingId.set(null);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update course.');
        this.togglingId.set(null);
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
