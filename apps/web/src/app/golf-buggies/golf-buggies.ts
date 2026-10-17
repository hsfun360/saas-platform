import { Component, Injector, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { GolfBuggyService, GolfBuggy, GolfBuggyIssue, GolfBuggyMeta, GolfFleetCounts } from '../services/golf-buggy.service';
import { ScrollReturnService } from '../services/scroll-return.service';
import { DialogComponent } from '../shared/dialog/dialog';
import { ConfirmDialogComponent, ConfirmRequest } from '../shared/confirm-dialog/confirm-dialog';
import { CanDirective } from '../shared/can.directive';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { OverflowMenuComponent } from '../shared/overflow-menu/overflow-menu';
import { MenuItemDirective } from '../shared/overflow-menu/menu-item.directive';
import { ComboboxComponent } from '../shared/combobox/combobox';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { openBlobInNewTab } from '../shared/open-blob';

type DialogMode = 'form' | 'retire' | 'history';

// Golf Management → Common Setup → Buggies (/golf/buggies; user decisions
// 2026-10-17). The fleet register: one card per unit with its type, the live
// location the Buggy Station maintains (in depot / on course with its riders
// / in maintenance) and the register status (active / retired). Edit is the
// visible action; History, Print label, New QR code, Retire / Reinstate and
// Delete (no outings yet) fold into the kebab. "Print QR labels" prints the
// sticker sheet for the whole active fleet.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-golf-buggies',
  standalone: true,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ReactiveFormsModule, DialogComponent,
    ConfirmDialogComponent, CanDirective, OverflowMenuComponent, MenuItemDirective, ComboboxComponent, LocalDatePipe],
  templateUrl: './golf-buggies.html',
  styleUrls: ['../membership-types/membership-types.css', './golf-buggies.css'],
})
export class GolfBuggiesComponent implements OnInit {
  private readonly service = inject(GolfBuggyService);
  private readonly fb = inject(FormBuilder);
  private readonly returnScroll = inject(ScrollReturnService);
  private readonly injector = inject(Injector);
  private static readonly LIST_PATH = '/golf/buggies';

  readonly rows = signal<GolfBuggy[]>([]);
  readonly meta = signal<GolfBuggyMeta | null>(null);
  readonly fleet = signal<GolfFleetCounts>({ active: 0, inDepot: 0, onCourse: 0, maintenance: 0 });
  readonly enabled = signal(false);
  readonly loading = signal(false);
  readonly busyId = signal<string | null>(null);

  readonly dialogOpen = signal(false);
  readonly mode = signal<DialogMode>('form');
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);
  readonly target = signal<GolfBuggy | null>(null);
  readonly history = signal<GolfBuggyIssue[]>([]);
  readonly historyLoading = signal(false);
  readonly retireReason = signal('');
  readonly confirmAction = signal<ConfirmRequest | null>(null);

  readonly form = this.fb.nonNullable.group({
    buggyNo: ['', [Validators.required, Validators.maxLength(20), Validators.pattern(/^[A-Za-z0-9][A-Za-z0-9-]*$/)]],
    buggyTypeId: ['', [Validators.required]],
    model: ['', [Validators.maxLength(100)]],
    serialNo: ['', [Validators.maxLength(100)]],
    purchaseDate: [''],
    remarks: ['', [Validators.maxLength(255)]],
  });

  readonly search = signal('');
  readonly filter = signal<'all' | 'in-depot' | 'on-course' | 'maintenance' | 'retired'>('all');
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly typeOptions = computed(() =>
    (this.meta()?.buggyTypes || []).map((t) => ({ value: t.id, label: `${t.code} - ${t.name} (${t.seats} seat${t.seats === 1 ? '' : 's'})` })));

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const f = this.filter();
    return this.rows().filter((b) => {
      if (f === 'retired' ? b.status !== 'retired' : (f !== 'all' && (b.status === 'retired' || b.location !== f))) return false;
      if (!q) return true;
      return b.buggyNo.toLowerCase().includes(q)
        || (b.buggyType?.name || '').toLowerCase().includes(q)
        || (b.buggyType?.code || '').toLowerCase().includes(q)
        || (b.model || '').toLowerCase().includes(q)
        || (b.serialNo || '').toLowerCase().includes(q)
        || (b.openIssue?.riders || []).some((r) => r.playerName.toLowerCase().includes(q));
    });
  });
  readonly retiredCount = computed(() => this.rows().filter((b) => b.status === 'retired').length);

  readonly dialogTitle = computed(() => {
    switch (this.mode()) {
      case 'retire': return `Retire buggy ${this.target()?.buggyNo || ''}`;
      case 'history': return `Buggy ${this.target()?.buggyNo || ''} - history`;
      default: return this.editId() ? 'Edit buggy' : 'New buggy';
    }
  });

  ngOnInit(): void {
    this.service.meta().subscribe({ next: (m) => this.meta.set(m), error: () => {} });
    this.load();
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  locationLabel(b: GolfBuggy): string {
    if (b.status === 'retired') return 'Retired';
    return this.meta()?.locations.find((l) => l.key === b.location)?.label || b.location;
  }

  ridersOf(i: GolfBuggyIssue | null | undefined): string {
    return (i?.riders || []).map((r) => r.playerName).join(' and ');
  }

  load(): void {
    this.loading.set(true);
    this.service.list().subscribe({
      next: (res) => {
        this.rows.set(res.buggies);
        this.fleet.set(res.fleet);
        this.enabled.set(res.enabled === true);
        this.loading.set(false);
        this.returnScroll.consume(GolfBuggiesComponent.LIST_PATH, this.injector);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load the fleet.');
      },
    });
  }

  openAdd(): void {
    this.clearMessages();
    this.editId.set(null);
    this.target.set(null);
    this.mode.set('form');
    this.form.reset({ buggyNo: '', buggyTypeId: '', model: '', serialNo: '', purchaseDate: '', remarks: '' });
    this.dialogOpen.set(true);
  }

  openEdit(b: GolfBuggy): void {
    this.clearMessages();
    this.editId.set(b.id);
    this.target.set(b);
    this.mode.set('form');
    this.form.reset({
      buggyNo: b.buggyNo, buggyTypeId: b.buggyTypeId, model: b.model || '', serialNo: b.serialNo || '',
      purchaseDate: b.purchaseDate || '', remarks: b.remarks || '',
    });
    this.dialogOpen.set(true);
  }

  openHistory(b: GolfBuggy): void {
    this.clearMessages();
    this.target.set(b);
    this.mode.set('history');
    this.history.set([]);
    this.historyLoading.set(true);
    this.dialogOpen.set(true);
    this.service.history(b.id).subscribe({
      next: (res) => { this.history.set(res.issues); this.historyLoading.set(false); },
      error: (err) => { this.historyLoading.set(false); this.errorMessage.set(err.error?.message || 'Failed to load the history.'); },
    });
  }

  openRetire(b: GolfBuggy): void {
    this.clearMessages();
    this.target.set(b);
    this.mode.set('retire');
    this.retireReason.set('');
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
      buggyNo: v.buggyNo.trim().toUpperCase(),
      buggyTypeId: v.buggyTypeId,
      model: v.model.trim() || null,
      serialNo: v.serialNo.trim() || null,
      purchaseDate: v.purchaseDate || null,
      remarks: v.remarks.trim() || null,
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
        this.returnScroll.remember(GolfBuggiesComponent.LIST_PATH, res.buggy.id);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save the buggy.');
        this.saving.set(false);
      },
    });
  }

  runRetire(): void {
    const b = this.target();
    const reason = this.retireReason().trim();
    if (!b || !reason) return;
    this.saving.set(true);
    this.service.retire(b.id, reason).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.dialogOpen.set(false);
        this.successMessage.set(res.message);
        this.returnScroll.remember(GolfBuggiesComponent.LIST_PATH, b.id);
        this.load();
      },
      error: (err) => { this.saving.set(false); this.errorMessage.set(err.error?.message || 'Failed to retire the buggy.'); },
    });
  }

  reinstate(b: GolfBuggy): void {
    this.clearMessages();
    this.busyId.set(b.id);
    this.service.reinstate(b.id).subscribe({
      next: (res) => { this.busyId.set(null); this.successMessage.set(res.message); this.returnScroll.remember(GolfBuggiesComponent.LIST_PATH, b.id); this.load(); },
      error: (err) => { this.busyId.set(null); this.errorMessage.set(err.error?.message || 'Failed to reinstate the buggy.'); },
    });
  }

  askRegenerateQr(b: GolfBuggy): void {
    this.clearMessages();
    this.confirmAction.set({
      title: 'Issue a new QR code',
      message: `Issue a new QR code for buggy ${b.buggyNo}? The sticker on it stops working the moment the new code is issued - print and fit the new label.`,
      confirmLabel: 'Issue new QR code',
      danger: false,
      run: () => {
        this.confirmAction.set(null);
        this.busyId.set(b.id);
        this.service.regenerateQr(b.id).subscribe({
          next: (res) => { this.busyId.set(null); this.successMessage.set(res.message); this.load(); },
          error: (err) => { this.busyId.set(null); this.errorMessage.set(err.error?.message || 'Failed to issue the QR code.'); },
        });
      },
    });
  }

  askDelete(b: GolfBuggy): void {
    this.clearMessages();
    this.confirmAction.set({
      title: 'Delete buggy',
      message: `Delete buggy ${b.buggyNo}? Only a unit with no outing on record can be deleted; retire it instead to keep its history.`,
      confirmLabel: 'Delete buggy',
      run: () => {
        this.confirmAction.set(null);
        this.busyId.set(b.id);
        this.service.remove(b.id).subscribe({
          next: (res) => { this.busyId.set(null); this.successMessage.set(res.message); this.load(); },
          error: (err) => { this.busyId.set(null); this.errorMessage.set(err.error?.message || 'Failed to delete the buggy.'); },
        });
      },
    });
  }

  // Printable label sheets: fetched with the session token and opened in a
  // new tab as a blob (a plain link could not carry the Authorization header).
  printLabels(ids: string[] = []): void {
    this.clearMessages();
    this.service.labelsHtml(ids).subscribe({
      next: (html) => openBlobInNewTab(html),
      error: (err) => this.errorMessage.set(err.error?.message || 'The label sheet could not be opened.'),
    });
  }

  printOne(b: GolfBuggy): void {
    this.printLabels([b.id]);
  }

  clearSearch(): void {
    this.search.set('');
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
