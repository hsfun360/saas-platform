import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RaceService } from '../services/race.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { Race } from '../models/auth.models';
import { FavStarComponent } from '../shared/fav-star/fav-star';

// System Setup → Races. Subscriber-owned reference data: one race/ethnicity list
// per Account (e.g. MAL - Malay), shared by every company and consumed by
// Membership pickers. Pure demographic vocabulary - linked to nothing else.
// Enable/disable, no hard delete. Reactive Forms + the dialog dirty-guard.
@Component({
  selector: 'app-races',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent],
  templateUrl: './races.html',
  styleUrls: ['../system-setup/system-setup.css'],
})
export class RacesComponent implements OnInit {
  private readonly service = inject(RaceService);
  private readonly fb = inject(FormBuilder);

  readonly races = signal<Race[]>([]);
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);

  readonly dialogOpen = signal(false);
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    raceCode: ['', [Validators.required, Validators.maxLength(30)]],
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
    const sorted = [...this.races()].sort((a, b) => {
      const aActive = a.isActive !== false;
      const bActive = b.isActive !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return a.raceCode.localeCompare(b.raceCode);
    });
    if (!q) return sorted;
    return sorted.filter(
      (r) => r.raceCode.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q),
    );
  });
  readonly activeCount = computed(() => this.races().filter((r) => r.isActive !== false).length);

  readonly dialogTitle = computed(() =>
    this.editId() ? `Edit — ${this.formValue().raceCode ?? ''}` : 'New race',
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
        this.races.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load races.');
      },
    });
  }

  openAdd(): void {
    this.clearMessages();
    this.editId.set(null);
    this.form.reset({ raceCode: '', description: '' });
    this.dialogOpen.set(true);
  }

  openEdit(r: Race): void {
    this.clearMessages();
    this.editId.set(r.id);
    this.form.reset({ raceCode: r.raceCode, description: r.description || '' });
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
      raceCode: v.raceCode.trim(),
      description: v.description.trim() || null,
    };

    this.saving.set(true);
    const id = this.editId();
    const req$ = id ? this.service.update(id, payload) : this.service.create(payload);
    req$.subscribe({
      next: () => {
        this.successMessage.set(`${payload.raceCode} ${id ? 'updated' : 'added'}.`);
        this.saving.set(false);
        this.dialogOpen.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save race.');
        this.saving.set(false);
      },
    });
  }

  toggleActive(r: Race): void {
    this.clearMessages();
    const next = !(r.isActive !== false);
    this.togglingId.set(r.id);
    this.service.update(r.id, { isActive: next }).subscribe({
      next: () => {
        this.successMessage.set(`${r.raceCode} ${next ? 'enabled' : 'disabled'}.`);
        this.togglingId.set(null);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update race.');
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
