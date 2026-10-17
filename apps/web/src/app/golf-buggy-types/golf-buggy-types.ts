import { Component, Injector, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { GolfBuggyTypeService, GolfBuggyType } from '../services/golf-buggy-type.service';
import { ScrollReturnService } from '../services/scroll-return.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { ConfirmDialogComponent, ConfirmRequest } from '../shared/confirm-dialog/confirm-dialog';
import { CanDirective } from '../shared/can.directive';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { OverflowMenuComponent } from '../shared/overflow-menu/overflow-menu';
import { MenuItemDirective } from '../shared/overflow-menu/menu-item.directive';

// Golf Management → Common Setup → Buggy Types (/golf/buggy-types; user
// decisions 2026-10-17). The kinds of buggy the club runs - code, name and
// seats (the riders one unit carries, which caps an issue at the station).
// Deleted only while no buggy record uses the type; disabled otherwise.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-golf-buggy-types',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent,
    ConfirmDialogComponent, CanDirective, OverflowMenuComponent, MenuItemDirective],
  templateUrl: './golf-buggy-types.html',
  // membership-types.css supplies the shared .mt-chip pill.
  styleUrls: ['../membership-types/membership-types.css'],
})
export class GolfBuggyTypesComponent implements OnInit {
  private readonly service = inject(GolfBuggyTypeService);
  private readonly fb = inject(FormBuilder);
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private static readonly LIST_PATH = '/golf/buggy-types';

  readonly rows = signal<GolfBuggyType[]>([]);
  readonly maxSeats = signal(6);
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);

  readonly dialogOpen = signal(false);
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);
  readonly confirmAction = signal<ConfirmRequest | null>(null);

  readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.maxLength(20), Validators.pattern(/^[A-Za-z0-9][A-Za-z0-9-]*$/)]],
    name: ['', [Validators.required, Validators.maxLength(255)]],
    seats: [2, [Validators.required, Validators.min(1), Validators.max(6)]],
    sortOrder: [100, [Validators.required, Validators.min(1), Validators.max(999)]],
  });

  readonly search = signal('');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const sorted = [...this.rows()].sort((a, b) => {
      const aActive = a.isActive !== false;
      const bActive = b.isActive !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return (a.sortOrder - b.sortOrder) || a.code.localeCompare(b.code);
    });
    if (!q) return sorted;
    return sorted.filter((t) => t.code.toLowerCase().includes(q) || t.name.toLowerCase().includes(q));
  });
  readonly activeCount = computed(() => this.rows().filter((t) => t.isActive !== false).length);
  readonly dialogTitle = computed(() => (this.editId() ? 'Edit buggy type' : 'New buggy type'));

  ngOnInit(): void {
    this.load();
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  load(): void {
    this.loading.set(true);
    this.service.list().subscribe({
      next: (res) => {
        this.rows.set(res.buggyTypes);
        this.maxSeats.set(res.maxSeats || 6);
        this.loading.set(false);
        this.returnScroll.consume(GolfBuggyTypesComponent.LIST_PATH, this.injector);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load buggy types.');
      },
    });
  }

  openAdd(): void {
    this.clearMessages();
    this.editId.set(null);
    this.form.reset({ code: '', name: '', seats: 2, sortOrder: 100 });
    this.dialogOpen.set(true);
  }

  openEdit(t: GolfBuggyType): void {
    this.clearMessages();
    this.editId.set(t.id);
    this.form.reset({ code: t.code, name: t.name, seats: t.seats, sortOrder: t.sortOrder });
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
      code: v.code.trim().toUpperCase(),
      name: v.name.trim(),
      seats: Number(v.seats) || 2,
      sortOrder: Number(v.sortOrder) || 100,
    };
    this.saving.set(true);
    const id = this.editId();
    const req$ = id ? this.service.update(id, payload) : this.service.create(payload);
    req$.subscribe({
      next: (res) => {
        this.successMessage.set(res.message);
        this.saving.set(false);
        this.form.markAsPristine();
        this.dialogOpen.set(false);
        this.returnScroll.remember(GolfBuggyTypesComponent.LIST_PATH, res.buggyType.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save the buggy type.');
        this.saving.set(false);
      },
    });
  }

  toggleActive(t: GolfBuggyType): void {
    this.clearMessages();
    const next = !(t.isActive !== false);
    this.togglingId.set(t.id);
    this.service.setActive(t.id, next).subscribe({
      next: () => {
        this.successMessage.set(`${t.code} ${next ? 'enabled' : 'disabled'}.`);
        this.togglingId.set(null);
        this.returnScroll.remember(GolfBuggyTypesComponent.LIST_PATH, t.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update the buggy type.');
        this.togglingId.set(null);
      },
    });
  }

  askDelete(t: GolfBuggyType): void {
    this.clearMessages();
    this.confirmAction.set({
      title: 'Delete buggy type',
      message: `Delete buggy type ${t.code} (${t.name})? It is refused while any buggy record uses it; disable it instead to keep history.`,
      confirmLabel: 'Delete buggy type',
      run: () => {
        this.confirmAction.set(null);
        this.togglingId.set(t.id);
        this.service.remove(t.id).subscribe({
          next: (res) => {
            this.togglingId.set(null);
            this.successMessage.set(res.message);
            this.load();
          },
          error: (err) => {
            this.togglingId.set(null);
            this.errorMessage.set(err.error?.message || 'Failed to delete the buggy type.');
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
