import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DepartmentService } from '../services/department.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { Department } from '../models/auth.models';

// System Setup → Departments. Subscriber-owned reference data: one department
// list per Account, shared by every company; assigned to users per company in
// User Management and consumed by the RBAC data-scope rule (same-department
// seniority). Enable/disable, no hard delete.
// Reactive Forms + the shared dialog unsaved-changes guard (house standard).
@Component({
  selector: 'app-departments',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DialogComponent],
  templateUrl: './departments.html',
  styleUrls: ['../system-setup/system-setup.css'],
})
export class DepartmentsComponent implements OnInit {
  private readonly service = inject(DepartmentService);
  private readonly fb = inject(FormBuilder);

  readonly departments = signal<Department[]>([]);
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);

  readonly dialogOpen = signal(false);
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    departmentCode: ['', [Validators.required, Validators.maxLength(30)]],
    description: ['', [Validators.maxLength(200)]],
  });

  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  readonly search = signal('');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const sorted = [...this.departments()].sort((a, b) => {
      const aActive = a.isActive !== false;
      const bActive = b.isActive !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return a.departmentCode.localeCompare(b.departmentCode);
    });
    if (!q) return sorted;
    return sorted.filter(
      (d) => d.departmentCode.toLowerCase().includes(q) || (d.description || '').toLowerCase().includes(q),
    );
  });
  readonly activeCount = computed(() => this.departments().filter((d) => d.isActive !== false).length);

  readonly dialogTitle = computed(() =>
    this.editId() ? `Edit — ${this.formValue().departmentCode ?? ''}` : 'New department',
  );

  ngOnInit(): void {
    this.load();
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  load(): void {
    this.loading.set(true);
    this.service.listAll().subscribe({
      next: (data) => {
        this.departments.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load departments.');
      },
    });
  }

  openAdd(): void {
    this.clearMessages();
    this.editId.set(null);
    this.form.reset({ departmentCode: '', description: '' });
    this.dialogOpen.set(true);
  }

  openEdit(d: Department): void {
    this.clearMessages();
    this.editId.set(d.id);
    this.form.reset({ departmentCode: d.departmentCode, description: d.description || '' });
    this.dialogOpen.set(true);
  }

  closeDialog(): void {
    this.dialogOpen.set(false);
  }

  onSave(): void {
    this.clearMessages();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const payload = {
      departmentCode: v.departmentCode.trim(),
      description: v.description.trim() || null,
    };

    this.saving.set(true);
    const id = this.editId();
    const req$ = id ? this.service.update(id, payload) : this.service.create(payload);
    req$.subscribe({
      next: () => {
        this.successMessage.set(`${payload.departmentCode} ${id ? 'updated' : 'added'}.`);
        this.saving.set(false);
        this.dialogOpen.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save department.');
        this.saving.set(false);
      },
    });
  }

  toggleActive(d: Department): void {
    this.clearMessages();
    const next = !(d.isActive !== false);
    this.togglingId.set(d.id);
    this.service.update(d.id, { isActive: next }).subscribe({
      next: () => {
        this.successMessage.set(`${d.departmentCode} ${next ? 'enabled' : 'disabled'}.`);
        this.togglingId.set(null);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update department.');
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
