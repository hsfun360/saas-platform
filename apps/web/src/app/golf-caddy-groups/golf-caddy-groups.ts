import { Component, Injector, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { GolfCaddyGroupService, GolfCaddyGroup } from '../services/golf-caddy-group.service';
import { ScrollReturnService } from '../services/scroll-return.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { ConfirmDialogComponent, ConfirmRequest } from '../shared/confirm-dialog/confirm-dialog';
import { CanDirective } from '../shared/can.directive';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { OverflowMenuComponent } from '../shared/overflow-menu/overflow-menu';
import { MenuItemDirective } from '../shared/overflow-menu/menu-item.directive';

// Golf Management → Common Setup → Caddy Groups (/golf/caddy-groups; user
// decisions 2026-10-17). An optional grouping of caddies - a team under a
// leader - with a size cap and the order the groups rotate in. Deleted only
// while empty.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-golf-caddy-groups',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent,
    ConfirmDialogComponent, CanDirective, OverflowMenuComponent, MenuItemDirective],
  templateUrl: './golf-caddy-groups.html',
  styleUrls: ['../membership-types/membership-types.css'],
})
export class GolfCaddyGroupsComponent implements OnInit {
  private readonly service = inject(GolfCaddyGroupService);
  private readonly fb = inject(FormBuilder);
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private static readonly LIST_PATH = '/golf/caddy-groups';

  readonly rows = signal<GolfCaddyGroup[]>([]);
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);

  readonly dialogOpen = signal(false);
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);
  readonly confirmAction = signal<ConfirmRequest | null>(null);

  readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.maxLength(20), Validators.pattern(/^[A-Za-z0-9][A-Za-z0-9-]*$/)]],
    name: ['', [Validators.required, Validators.maxLength(255)]],
    maxCaddies: this.fb.control<number | null>(null, [Validators.min(1), Validators.max(999)]),
    rotationOrder: [100, [Validators.required, Validators.min(1), Validators.max(999)]],
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
      return (a.rotationOrder - b.rotationOrder) || a.code.localeCompare(b.code);
    });
    if (!q) return sorted;
    return sorted.filter((t) => t.code.toLowerCase().includes(q) || t.name.toLowerCase().includes(q));
  });
  readonly activeCount = computed(() => this.rows().filter((t) => t.isActive !== false).length);
  readonly dialogTitle = computed(() => (this.editId() ? 'Edit caddy group' : 'New caddy group'));

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
        this.rows.set(res.caddyGroups);
        this.loading.set(false);
        this.returnScroll.consume(GolfCaddyGroupsComponent.LIST_PATH, this.injector);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load caddy groups.');
      },
    });
  }

  openAdd(): void {
    this.clearMessages();
    this.editId.set(null);
    this.form.reset({ code: '', name: '', maxCaddies: null, rotationOrder: 100 });
    this.dialogOpen.set(true);
  }

  openEdit(t: GolfCaddyGroup): void {
    this.clearMessages();
    this.editId.set(t.id);
    this.form.reset({ code: t.code, name: t.name, maxCaddies: t.maxCaddies ?? null, rotationOrder: t.rotationOrder });
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
      maxCaddies: v.maxCaddies === null || v.maxCaddies === undefined || String(v.maxCaddies) === '' ? null : Number(v.maxCaddies),
      rotationOrder: Number(v.rotationOrder) || 100,
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
        this.returnScroll.remember(GolfCaddyGroupsComponent.LIST_PATH, res.caddyGroup.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save the caddy group.');
        this.saving.set(false);
      },
    });
  }

  toggleActive(t: GolfCaddyGroup): void {
    this.clearMessages();
    const next = !(t.isActive !== false);
    this.togglingId.set(t.id);
    this.service.setActive(t.id, next).subscribe({
      next: () => {
        this.successMessage.set(`${t.code} ${next ? 'enabled' : 'disabled'}.`);
        this.togglingId.set(null);
        this.returnScroll.remember(GolfCaddyGroupsComponent.LIST_PATH, t.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update the caddy group.');
        this.togglingId.set(null);
      },
    });
  }

  askDelete(t: GolfCaddyGroup): void {
    this.clearMessages();
    this.confirmAction.set({
      title: 'Delete caddy group',
      message: `Delete caddy group ${t.code} (${t.name})? It is refused while any caddy is in it; move them first or disable the group.`,
      confirmLabel: 'Delete caddy group',
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
            this.errorMessage.set(err.error?.message || 'Failed to delete the caddy group.');
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
