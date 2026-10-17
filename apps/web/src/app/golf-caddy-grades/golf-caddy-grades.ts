import { Component, Injector, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { GolfCaddyGradeService, GolfCaddyGrade } from '../services/golf-caddy-grade.service';
import { ScrollReturnService } from '../services/scroll-return.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { ConfirmDialogComponent, ConfirmRequest } from '../shared/confirm-dialog/confirm-dialog';
import { CanDirective } from '../shared/can.directive';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { OverflowMenuComponent } from '../shared/overflow-menu/overflow-menu';
import { MenuItemDirective } from '../shared/overflow-menu/menu-item.directive';

// Golf Management → Common Setup → Caddy Grades (/golf/caddy-grades; user
// decisions 2026-10-17). The club's caddy grades: code, name and how many
// golfers one caddy of the grade serves at once (the cap on a caddy slot at
// the station). Pay rates are deliberately absent - the club pays caddies
// outside the system. Deleted only while no caddy holds the grade.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-golf-caddy-grades',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent,
    ConfirmDialogComponent, CanDirective, OverflowMenuComponent, MenuItemDirective],
  templateUrl: './golf-caddy-grades.html',
  styleUrls: ['../membership-types/membership-types.css'],
})
export class GolfCaddyGradesComponent implements OnInit {
  private readonly service = inject(GolfCaddyGradeService);
  private readonly fb = inject(FormBuilder);
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private static readonly LIST_PATH = '/golf/caddy-grades';

  readonly rows = signal<GolfCaddyGrade[]>([]);
  readonly maxPlayers = signal(4);
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);

  readonly dialogOpen = signal(false);
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);
  readonly confirmAction = signal<ConfirmRequest | null>(null);

  readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.maxLength(20), Validators.pattern(/^[A-Za-z0-9][A-Za-z0-9-]*$/)]],
    name: ['', [Validators.required, Validators.maxLength(255)]],
    playersPerCaddy: [1, [Validators.required, Validators.min(1), Validators.max(4)]],
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
  readonly dialogTitle = computed(() => (this.editId() ? 'Edit caddy grade' : 'New caddy grade'));

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
        this.rows.set(res.caddyGrades);
        this.maxPlayers.set(res.maxPlayersPerCaddy || 4);
        this.loading.set(false);
        this.returnScroll.consume(GolfCaddyGradesComponent.LIST_PATH, this.injector);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load caddy grades.');
      },
    });
  }

  openAdd(): void {
    this.clearMessages();
    this.editId.set(null);
    this.form.reset({ code: '', name: '', playersPerCaddy: 1, sortOrder: 100 });
    this.dialogOpen.set(true);
  }

  openEdit(t: GolfCaddyGrade): void {
    this.clearMessages();
    this.editId.set(t.id);
    this.form.reset({ code: t.code, name: t.name, playersPerCaddy: t.playersPerCaddy, sortOrder: t.sortOrder });
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
      playersPerCaddy: Number(v.playersPerCaddy) || 1,
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
        this.returnScroll.remember(GolfCaddyGradesComponent.LIST_PATH, res.caddyGrade.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save the caddy grade.');
        this.saving.set(false);
      },
    });
  }

  toggleActive(t: GolfCaddyGrade): void {
    this.clearMessages();
    const next = !(t.isActive !== false);
    this.togglingId.set(t.id);
    this.service.setActive(t.id, next).subscribe({
      next: () => {
        this.successMessage.set(`${t.code} ${next ? 'enabled' : 'disabled'}.`);
        this.togglingId.set(null);
        this.returnScroll.remember(GolfCaddyGradesComponent.LIST_PATH, t.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update the caddy grade.');
        this.togglingId.set(null);
      },
    });
  }

  askDelete(t: GolfCaddyGrade): void {
    this.clearMessages();
    this.confirmAction.set({
      title: 'Delete caddy grade',
      message: `Delete caddy grade ${t.code} (${t.name})? It is refused while any caddy holds the grade; disable it instead to keep history.`,
      confirmLabel: 'Delete caddy grade',
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
            this.errorMessage.set(err.error?.message || 'Failed to delete the caddy grade.');
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
