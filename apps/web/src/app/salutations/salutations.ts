import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SalutationService } from '../services/salutation.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { Salutation } from '../models/auth.models';

// System Setup → Salutations. Subscriber-owned reference data: one salutation
// list per Account (Mr/Mrs/Datuk/... - locale aware), shared by every company and
// consumed by Membership / Golf pickers. Enable/disable, no hard delete.
// Reactive Forms + the shared dialog unsaved-changes guard (house standard).
@Component({
  selector: 'app-salutations',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DialogComponent],
  templateUrl: './salutations.html',
  styleUrls: ['../system-setup/system-setup.css'],
})
export class SalutationsComponent implements OnInit {
  private readonly service = inject(SalutationService);
  private readonly fb = inject(FormBuilder);

  readonly salutations = signal<Salutation[]>([]);
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);

  readonly dialogOpen = signal(false);
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    salutationCode: ['', [Validators.required, Validators.maxLength(30)]],
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
    const sorted = [...this.salutations()].sort((a, b) => {
      const aActive = a.isActive !== false;
      const bActive = b.isActive !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return a.salutationCode.localeCompare(b.salutationCode);
    });
    if (!q) return sorted;
    return sorted.filter(
      (s) => s.salutationCode.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q),
    );
  });
  readonly activeCount = computed(() => this.salutations().filter((s) => s.isActive !== false).length);

  readonly dialogTitle = computed(() =>
    this.editId() ? `Edit — ${this.formValue().salutationCode ?? ''}` : 'New salutation',
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
        this.salutations.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load salutations.');
      },
    });
  }

  openAdd(): void {
    this.clearMessages();
    this.editId.set(null);
    this.form.reset({ salutationCode: '', description: '' });
    this.dialogOpen.set(true);
  }

  openEdit(s: Salutation): void {
    this.clearMessages();
    this.editId.set(s.id);
    this.form.reset({ salutationCode: s.salutationCode, description: s.description || '' });
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
      salutationCode: v.salutationCode.trim(),
      description: v.description.trim() || null,
    };

    this.saving.set(true);
    const id = this.editId();
    const req$ = id ? this.service.update(id, payload) : this.service.create(payload);
    req$.subscribe({
      next: () => {
        this.successMessage.set(`${payload.salutationCode} ${id ? 'updated' : 'added'}.`);
        this.saving.set(false);
        this.dialogOpen.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save salutation.');
        this.saving.set(false);
      },
    });
  }

  toggleActive(s: Salutation): void {
    this.clearMessages();
    const next = !(s.isActive !== false);
    this.togglingId.set(s.id);
    this.service.update(s.id, { isActive: next }).subscribe({
      next: () => {
        this.successMessage.set(`${s.salutationCode} ${next ? 'enabled' : 'disabled'}.`);
        this.togglingId.set(null);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update salutation.');
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
