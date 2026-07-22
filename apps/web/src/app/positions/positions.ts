import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { PositionService } from '../services/position.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { Position, PositionDefault } from '../models/auth.models';
import { FavStarComponent } from '../shared/fav-star/fav-star';

// System Setup → Positions. Subscriber-owned position ladder: one list per
// Account, shared by every company; assigned to users per company in User
// Management. `rank` (higher = more senior) drives the RBAC data-scope rule -
// a senior may amend a subordinate's records in the same department; equal
// ranks are peers. Enable/disable, no hard delete.
// "Load defaults" previews the bundled Staff/Supervisor/Manager ladder and
// creates only what you select (show-expected-results standard).
@Component({
  selector: 'app-positions',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent],
  templateUrl: './positions.html',
  styleUrls: ['../system-setup/system-setup.css'],
})
export class PositionsComponent implements OnInit {
  private readonly service = inject(PositionService);
  private readonly fb = inject(FormBuilder);

  readonly positions = signal<Position[]>([]);
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);

  readonly dialogOpen = signal(false);
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    positionCode: ['', [Validators.required, Validators.maxLength(30)]],
    description: ['', [Validators.maxLength(200)]],
    rank: [0, [Validators.required]],
  });

  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  // Load-defaults preview dialog: the bundled ladder, flagged with what already
  // exists; new entries are pre-selected.
  readonly defaultsOpen = signal(false);
  readonly defaultsLoading = signal(false);
  readonly defaults = signal<PositionDefault[]>([]);
  readonly selectedDefaults = signal<ReadonlySet<string>>(new Set<string>());
  readonly seeding = signal(false);
  readonly selectedDefaultCount = computed(() => this.selectedDefaults().size);

  readonly search = signal('');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  // Most senior first (matching the backend order), disabled entries last.
  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const sorted = [...this.positions()].sort((a, b) => {
      const aActive = a.isActive !== false;
      const bActive = b.isActive !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      if (a.rank !== b.rank) return b.rank - a.rank;
      return a.positionCode.localeCompare(b.positionCode);
    });
    if (!q) return sorted;
    return sorted.filter(
      (p) => p.positionCode.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q),
    );
  });
  readonly activeCount = computed(() => this.positions().filter((p) => p.isActive !== false).length);

  readonly dialogTitle = computed(() =>
    this.editId() ? `Edit — ${this.formValue().positionCode ?? ''}` : 'New position',
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
        this.positions.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load positions.');
      },
    });
  }

  openAdd(): void {
    this.clearMessages();
    this.editId.set(null);
    this.form.reset({ positionCode: '', description: '', rank: 0 });
    this.dialogOpen.set(true);
  }

  openEdit(p: Position): void {
    this.clearMessages();
    this.editId.set(p.id);
    this.form.reset({ positionCode: p.positionCode, description: p.description || '', rank: p.rank });
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
      positionCode: v.positionCode.trim(),
      description: v.description.trim() || null,
      rank: Math.trunc(Number(v.rank)),
    };

    this.saving.set(true);
    const id = this.editId();
    const req$ = id ? this.service.update(id, payload) : this.service.create(payload);
    req$.subscribe({
      next: () => {
        this.successMessage.set(`${payload.positionCode} ${id ? 'updated' : 'added'}.`);
        this.saving.set(false);
        this.dialogOpen.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save position.');
        this.saving.set(false);
      },
    });
  }

  toggleActive(p: Position): void {
    this.clearMessages();
    const next = !(p.isActive !== false);
    this.togglingId.set(p.id);
    this.service.update(p.id, { isActive: next }).subscribe({
      next: () => {
        this.successMessage.set(`${p.positionCode} ${next ? 'enabled' : 'disabled'}.`);
        this.togglingId.set(null);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update position.');
        this.togglingId.set(null);
      },
    });
  }

  // ---- Load defaults (preview + select, then seed) ----

  openDefaults(): void {
    this.clearMessages();
    this.defaultsOpen.set(true);
    this.defaultsLoading.set(true);
    this.service.getDefaults().subscribe({
      next: (rows) => {
        this.defaults.set(rows);
        // Pre-select the new ones (existing codes are shown but not selectable).
        this.selectedDefaults.set(new Set(rows.filter((r) => !r.alreadyExists).map((r) => r.positionCode)));
        this.defaultsLoading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to load the default positions.');
        this.defaultsOpen.set(false);
        this.defaultsLoading.set(false);
      },
    });
  }

  closeDefaults(): void {
    this.defaultsOpen.set(false);
  }

  toggleDefault(code: string): void {
    const next = new Set(this.selectedDefaults());
    if (next.has(code)) next.delete(code);
    else next.add(code);
    this.selectedDefaults.set(next);
  }

  seedSelected(): void {
    const codes = [...this.selectedDefaults()];
    if (!codes.length) return;
    this.seeding.set(true);
    this.service.seed(codes).subscribe({
      next: (res) => {
        this.successMessage.set(res.message || `${res.created} position(s) created.`);
        this.seeding.set(false);
        this.defaultsOpen.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to add the default positions.');
        this.seeding.set(false);
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
