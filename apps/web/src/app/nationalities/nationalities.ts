import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NationalityService } from '../services/nationality.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { Nationality } from '../models/auth.models';
import { FavStarComponent } from '../shared/fav-star/fav-star';

// System Setup → Nationalities. Subscriber-owned reference data: one nationality
// list per Account (e.g. MAS - Malaysian), shared by every company and consumed
// by Membership / Golf pickers. Deliberately NOT linked to Country - Country is
// address data; a person living in Malaysia may be Singaporean.
// Enable/disable, no hard delete. Reactive Forms + the dialog dirty-guard.
@Component({
  selector: 'app-nationalities',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent],
  templateUrl: './nationalities.html',
  styleUrls: ['../system-setup/system-setup.css'],
})
export class NationalitiesComponent implements OnInit {
  private readonly service = inject(NationalityService);
  private readonly fb = inject(FormBuilder);

  readonly nationalities = signal<Nationality[]>([]);
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);

  readonly dialogOpen = signal(false);
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    nationalityCode: ['', [Validators.required, Validators.maxLength(30)]],
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
    const sorted = [...this.nationalities()].sort((a, b) => {
      const aActive = a.isActive !== false;
      const bActive = b.isActive !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return a.nationalityCode.localeCompare(b.nationalityCode);
    });
    if (!q) return sorted;
    return sorted.filter(
      (n) => n.nationalityCode.toLowerCase().includes(q) || (n.description || '').toLowerCase().includes(q),
    );
  });
  readonly activeCount = computed(() => this.nationalities().filter((n) => n.isActive !== false).length);

  readonly dialogTitle = computed(() =>
    this.editId() ? `Edit — ${this.formValue().nationalityCode ?? ''}` : 'New nationality',
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
        this.nationalities.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load nationalities.');
      },
    });
  }

  openAdd(): void {
    this.clearMessages();
    this.editId.set(null);
    this.form.reset({ nationalityCode: '', description: '' });
    this.dialogOpen.set(true);
  }

  openEdit(n: Nationality): void {
    this.clearMessages();
    this.editId.set(n.id);
    this.form.reset({ nationalityCode: n.nationalityCode, description: n.description || '' });
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
      nationalityCode: v.nationalityCode.trim(),
      description: v.description.trim() || null,
    };

    this.saving.set(true);
    const id = this.editId();
    const req$ = id ? this.service.update(id, payload) : this.service.create(payload);
    req$.subscribe({
      next: () => {
        this.successMessage.set(`${payload.nationalityCode} ${id ? 'updated' : 'added'}.`);
        this.saving.set(false);
        this.dialogOpen.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save nationality.');
        this.saving.set(false);
      },
    });
  }

  toggleActive(n: Nationality): void {
    this.clearMessages();
    const next = !(n.isActive !== false);
    this.togglingId.set(n.id);
    this.service.update(n.id, { isActive: next }).subscribe({
      next: () => {
        this.successMessage.set(`${n.nationalityCode} ${next ? 'enabled' : 'disabled'}.`);
        this.togglingId.set(null);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update nationality.');
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
