import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { IndustryTypeService } from '../services/industry-type.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { IndustryType } from '../models/auth.models';

// System Setup → Industry Types. Subscriber-owned reference data: one industry
// taxonomy per Account, shared by every company in the subscription and consumed
// by Membership / Golf pickers. Enable/disable, no hard delete.
// Reactive Forms + the shared dialog unsaved-changes guard (house standard).
@Component({
  selector: 'app-industry-types',
  standalone: true,
  imports: [ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent],
  templateUrl: './industry-types.html',
  styleUrls: ['../system-setup/system-setup.css'],
})
export class IndustryTypesComponent implements OnInit {
  private readonly service = inject(IndustryTypeService);
  private readonly fb = inject(FormBuilder);

  readonly types = signal<IndustryType[]>([]);
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);

  readonly dialogOpen = signal(false);
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    industryTypeCode: ['', [Validators.required, Validators.maxLength(30)]],
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
    const sorted = [...this.types()].sort((a, b) => {
      const aActive = a.isActive !== false;
      const bActive = b.isActive !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return a.industryTypeCode.localeCompare(b.industryTypeCode);
    });
    if (!q) return sorted;
    return sorted.filter(
      (t) => t.industryTypeCode.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q),
    );
  });
  readonly activeCount = computed(() => this.types().filter((t) => t.isActive !== false).length);

  readonly dialogTitle = computed(() =>
    this.editId() ? `Edit — ${this.formValue().industryTypeCode ?? ''}` : 'New industry type',
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
        this.types.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load industry types.');
      },
    });
  }

  openAdd(): void {
    this.clearMessages();
    this.editId.set(null);
    this.form.reset({ industryTypeCode: '', description: '' });
    this.dialogOpen.set(true);
  }

  openEdit(t: IndustryType): void {
    this.clearMessages();
    this.editId.set(t.id);
    this.form.reset({ industryTypeCode: t.industryTypeCode, description: t.description || '' });
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
      industryTypeCode: v.industryTypeCode.trim(),
      description: v.description.trim() || null,
    };

    this.saving.set(true);
    const id = this.editId();
    const req$ = id ? this.service.update(id, payload) : this.service.create(payload);
    req$.subscribe({
      next: () => {
        this.successMessage.set(`${payload.industryTypeCode} ${id ? 'updated' : 'added'}.`);
        this.saving.set(false);
        this.dialogOpen.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save industry type.');
        this.saving.set(false);
      },
    });
  }

  toggleActive(t: IndustryType): void {
    this.clearMessages();
    const next = !(t.isActive !== false);
    this.togglingId.set(t.id);
    this.service.update(t.id, { isActive: next }).subscribe({
      next: () => {
        this.successMessage.set(`${t.industryTypeCode} ${next ? 'enabled' : 'disabled'}.`);
        this.togglingId.set(null);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update industry type.');
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
