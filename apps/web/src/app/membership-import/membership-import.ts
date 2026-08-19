import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MembershipImportService } from '../services/membership-import.service';
import { CanDirective } from '../shared/can.directive';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { OverflowMenuComponent, MenuItemDirective } from '../shared/overflow-menu/overflow-menu';
import { ImportBatchDetail, ImportBatchSummary, ImportMigrateResult, ImportRow } from '../models/auth.models';

// Membership Management → Membership Import. Upload a two-sheet Excel file
// (Memberships + Members) into the staging mid-tables, review it grouped per
// membership with inline validation issues, tick which memberships to migrate,
// and migrate the selection into the real tables. Selection unit is the
// MEMBERSHIP (a nominee/dependent never migrates without its contract).
//
// URL state: /membership/import lists batches, /membership/import/:id reviews
// one (deep-linkable, browser back returns to the list).
@Component({
  selector: 'app-membership-import',
  standalone: true,
  imports: [CommonModule, CanDirective, LocalDatePipe, ScreenTitlePipe, ScreenSubtitlePipe, FavStarComponent, OverflowMenuComponent, MenuItemDirective],
  templateUrl: './membership-import.html',
  styleUrls: ['../system-setup/system-setup.css', './membership-import.css'],
})
export class MembershipImportComponent implements OnInit {
  private readonly service = inject(MembershipImportService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly batches = signal<ImportBatchSummary[]>([]);
  readonly detail = signal<ImportBatchDetail | null>(null);
  readonly loading = signal(false);
  readonly uploading = signal(false);
  readonly migrating = signal(false);
  readonly deletingId = signal<string | null>(null);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');
  // Failures of the last migrate run, shown until dismissed.
  readonly lastResults = signal<ImportMigrateResult[]>([]);

  // Selected staged MEMBERSHIP row ids (the migration unit).
  readonly selected = signal<Set<string>>(new Set());

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      const id = p.get('id');
      if (id) this.loadDetail(id);
      else {
        this.detail.set(null);
        this.load();
      }
    });
  }

  ngOnInit(): void {}

  // --- derived counts ---

  readonly selectableGroups = computed(() =>
    (this.detail()?.groups || []).filter((g) => g.membership.isValid && g.membership.migrateStatus !== 'migrated'));

  readonly selectedMembers = computed(() => {
    const sel = this.selected();
    return (this.detail()?.groups || [])
      .filter((g) => sel.has(g.membership.id))
      .reduce((n, g) => n + g.members.length, 0);
  });

  readonly allSelected = computed(() => {
    const sel = this.selected();
    const selectable = this.selectableGroups();
    return selectable.length > 0 && selectable.every((g) => sel.has(g.membership.id));
  });

  errorCount(rows: ImportRow[]): number {
    return rows.reduce((n, r) => n + r.issues.filter((i) => i.level === 'error').length, 0);
  }

  groupIssueCount(g: { membership: ImportRow; members: ImportRow[] }): number {
    return this.errorCount([g.membership, ...g.members]);
  }

  memberName(r: ImportRow): string {
    return [r.data['firstName'], r.data['lastName']].filter(Boolean).join(' ') || '—';
  }

  // --- data loads ---

  load(): void {
    this.loading.set(true);
    this.service.list().subscribe({
      next: (rows) => { this.batches.set(rows); this.loading.set(false); },
      error: (err) => { this.loading.set(false); this.errorMessage.set(err.error?.message || 'Failed to load import batches.'); },
    });
  }

  private loadDetail(id: string): void {
    this.loading.set(true);
    this.service.get(id).subscribe({
      next: (d) => { this.applyDetail(d); this.loading.set(false); },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to load the import batch.');
        this.router.navigate(['/membership/import']);
      },
    });
  }

  // Preselect every valid, not-yet-migrated membership (show expected results:
  // the user sees exactly what will move before confirming).
  private applyDetail(d: ImportBatchDetail): void {
    this.detail.set(d);
    const pre = new Set<string>();
    for (const g of d.groups) {
      if (g.membership.isValid && g.membership.migrateStatus !== 'migrated') pre.add(g.membership.id);
    }
    this.selected.set(pre);
  }

  open(b: ImportBatchSummary): void {
    this.clearMessages();
    this.router.navigate(['/membership/import', b.id]);
  }

  back(): void {
    this.clearMessages();
    this.router.navigate(['/membership/import']);
  }

  // --- actions ---

  downloadTemplate(): void {
    this.clearMessages();
    this.service.template().subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'membership-import-template.xlsx';
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.errorMessage.set('Failed to download the template.'),
    });
  }

  onFilePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    this.clearMessages();
    this.uploading.set(true);
    this.service.upload(file).subscribe({
      next: (res) => {
        this.uploading.set(false);
        this.successMessage.set(res.message);
        this.router.navigate(['/membership/import', res.batch.id]);
      },
      error: (err) => {
        this.uploading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to upload the file.');
      },
    });
  }

  toggle(g: { membership: ImportRow }): void {
    if (!g.membership.isValid || g.membership.migrateStatus === 'migrated') return;
    this.selected.update((s) => {
      const next = new Set(s);
      if (next.has(g.membership.id)) next.delete(g.membership.id);
      else next.add(g.membership.id);
      return next;
    });
  }

  toggleAll(): void {
    if (this.allSelected()) this.selected.set(new Set());
    else this.selected.set(new Set(this.selectableGroups().map((g) => g.membership.id)));
  }

  migrate(): void {
    const d = this.detail();
    const ids = [...this.selected()];
    if (!d || !ids.length) return;
    this.clearMessages();
    this.migrating.set(true);
    this.service.migrate(d.id, ids).subscribe({
      next: (res) => {
        this.migrating.set(false);
        this.successMessage.set(res.message);
        this.lastResults.set(res.results.filter((r) => !r.ok));
        this.applyDetail(res.batch);
      },
      error: (err) => {
        this.migrating.set(false);
        this.errorMessage.set(err.error?.message || 'Migration failed.');
      },
    });
  }

  deleteBatch(b: ImportBatchSummary): void {
    if (!window.confirm(`Delete the staged batch '${b.fileName}'? Migrated records stay - this only clears the staging rows.`)) return;
    this.clearMessages();
    this.deletingId.set(b.id);
    this.service.delete(b.id).subscribe({
      next: (res) => {
        this.deletingId.set(null);
        this.successMessage.set(res.message);
        this.load();
      },
      error: (err) => {
        this.deletingId.set(null);
        this.errorMessage.set(err.error?.message || 'Failed to delete the batch.');
      },
    });
  }

  clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
    this.lastResults.set([]);
  }
}
