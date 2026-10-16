import { Component, Injector, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { GolfPlayerTypeService, GolfPlayerType, GolfPlayerBaseIdentity } from '../services/golf-player-type.service';
import { ScrollReturnService } from '../services/scroll-return.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { ConfirmDialogComponent, ConfirmRequest } from '../shared/confirm-dialog/confirm-dialog';
import { CanDirective } from '../shared/can.directive';
import { MembershipStatusOption } from '../models/auth.models';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { OverflowMenuComponent } from '../shared/overflow-menu/overflow-menu';
import { MenuItemDirective } from '../shared/overflow-menu/menu-item.directive';

// Golf Management → Common Setup → Player Types (/golf/player-types; spec
// 2.3.1, user decisions 2026-10-15). The club's catalog of player
// categories: code + base identity (the engine class, a fixed vocabulary -
// native select) + description + the approval flag. Three system rows per
// club (Member / Member as Guest / Guest) keep their codes and stay active;
// club-defined rows (an association's members, a reciprocal club, a hotel
// guest) are edited, enabled / disabled and, while nothing references
// their code, deleted. The code is what the rate card prices by and what
// the booking and registration lines carry.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-golf-player-types',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent,
    ConfirmDialogComponent, CanDirective, OverflowMenuComponent, MenuItemDirective],
  templateUrl: './golf-player-types.html',
  // membership-types.css supplies the shared .mt-chip pill; own css = the switch row.
  styleUrls: ['../membership-types/membership-types.css', './golf-player-types.css'],
})
export class GolfPlayerTypesComponent implements OnInit {
  private readonly service = inject(GolfPlayerTypeService);
  private readonly fb = inject(FormBuilder);
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private static readonly LIST_PATH = '/golf/player-types';

  readonly rows = signal<GolfPlayerType[]>([]);
  readonly baseIdentities = signal<MembershipStatusOption[]>([]);
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);

  readonly dialogOpen = signal(false);
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);
  readonly editSystem = signal(false);
  readonly confirmAction = signal<ConfirmRequest | null>(null);

  readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.maxLength(20), Validators.pattern(/^[A-Za-z0-9][A-Za-z0-9-]*$/)]],
    description: ['', [Validators.required, Validators.maxLength(255)]],
    baseIdentity: ['' as GolfPlayerBaseIdentity | '', [Validators.required]],
    requiresApproval: [false],
    sortOrder: [100, [Validators.required, Validators.min(1), Validators.max(999)]],
  });

  readonly search = signal('');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  // System rows first, then active before disabled, then sort order + code.
  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const sorted = [...this.rows()].sort((a, b) => {
      if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
      const aActive = a.isActive !== false;
      const bActive = b.isActive !== false;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return (a.sortOrder - b.sortOrder) || a.code.localeCompare(b.code);
    });
    if (!q) return sorted;
    return sorted.filter((t) =>
      t.code.toLowerCase().includes(q)
      || t.description.toLowerCase().includes(q)
      || this.baseLabel(t.baseIdentity).toLowerCase().includes(q));
  });
  readonly activeCount = computed(() => this.rows().filter((t) => t.isActive !== false).length);

  readonly dialogTitle = computed(() => (this.editId() ? 'Edit player type' : 'New player type'));

  ngOnInit(): void {
    this.load();
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  baseLabel(key: string): string {
    return this.baseIdentities().find((b) => b.key === key)?.label || key;
  }

  // What the picked base identity means for the player (show the expected result).
  baseHint(): string {
    switch (this.form.controls.baseIdentity.value) {
      case 'member': return 'A member of this club: standing, golfing right, booking limit, junior and handicap checks; books in advance.';
      case 'member-guest': return 'A member playing under another member\'s booking: member standing, but the guest-control switch for members as guests and the booker\'s guest quota apply.';
      case 'guest': return 'A visitor with no standing: guest control and the booker\'s guest quota apply; may walk in at the desk.';
      case 'affiliate': return 'A member of an affiliated or reciprocal club: enters only through a confirmed Affiliated Visit (letter of introduction), never the booking screen or a walk-in; counts as a guest for guest control and quota.';
      default: return '';
    }
  }

  load(): void {
    this.loading.set(true);
    this.service.list().subscribe({
      next: (res) => {
        this.rows.set(res.playerTypes);
        this.baseIdentities.set(res.baseIdentities);
        this.loading.set(false);
        this.returnScroll.consume(GolfPlayerTypesComponent.LIST_PATH, this.injector);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load player types.');
      },
    });
  }

  openAdd(): void {
    this.clearMessages();
    this.editId.set(null);
    this.editSystem.set(false);
    this.form.reset({ code: '', description: '', baseIdentity: '', requiresApproval: false, sortOrder: 100 });
    this.form.controls.code.enable({ emitEvent: false });
    this.form.controls.baseIdentity.enable({ emitEvent: false });
    this.dialogOpen.set(true);
  }

  openEdit(t: GolfPlayerType): void {
    this.clearMessages();
    this.editId.set(t.id);
    this.editSystem.set(t.isSystem);
    this.form.reset({ code: t.code, description: t.description, baseIdentity: t.baseIdentity, requiresApproval: t.requiresApproval, sortOrder: t.sortOrder });
    // A system row keeps its code and base identity (reactive-forms way: the
    // control is disabled, never the DOM attribute).
    if (t.isSystem) {
      this.form.controls.code.disable({ emitEvent: false });
      this.form.controls.baseIdentity.disable({ emitEvent: false });
    } else {
      this.form.controls.code.enable({ emitEvent: false });
      this.form.controls.baseIdentity.enable({ emitEvent: false });
    }
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
      description: v.description.trim(),
      baseIdentity: v.baseIdentity,
      requiresApproval: v.requiresApproval,
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
        this.returnScroll.remember(GolfPlayerTypesComponent.LIST_PATH, res.playerType.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save the player type.');
        this.saving.set(false);
      },
    });
  }

  toggleActive(t: GolfPlayerType): void {
    this.clearMessages();
    const next = !(t.isActive !== false);
    this.togglingId.set(t.id);
    this.service.setActive(t.id, next).subscribe({
      next: () => {
        this.successMessage.set(`${t.code} ${next ? 'enabled' : 'disabled'}.`);
        this.togglingId.set(null);
        this.returnScroll.remember(GolfPlayerTypesComponent.LIST_PATH, t.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update the player type.');
        this.togglingId.set(null);
      },
    });
  }

  askDelete(t: GolfPlayerType): void {
    this.clearMessages();
    this.confirmAction.set({
      title: 'Delete player type',
      message: `Delete player type ${t.code} (${t.description})? It is refused while any booking line, roster line or transaction type still uses it; disable it instead to keep history.`,
      confirmLabel: 'Delete player type',
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
            this.errorMessage.set(err.error?.message || 'Failed to delete the player type.');
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
