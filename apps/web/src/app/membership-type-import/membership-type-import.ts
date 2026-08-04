import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MembershipTypeImportService } from '../services/membership-type-import.service';
import { CanDirective } from '../shared/can.directive';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { TypeImportBatchDetail, TypeImportBatchSummary, TypeImportMigrateResult, TypeImportRow } from '../models/auth.models';

// Membership Management → Membership Type Import. Upload a one-sheet Excel
// file into the staging mid-tables, review every type row with its inline
// validation issues, tick which types to migrate, and migrate the selection
// into the real Membership Type master. Same flow as Membership Import;
// joining fees / standing charges stay maintained on the Types screen.
//
// URL state: /membership/type-import lists batches, /membership/type-import/:id
// reviews one (deep-linkable, browser back returns to the list).
@Component({
  selector: 'app-membership-type-import',
  standalone: true,
  imports: [CommonModule, CanDirective, LocalDatePipe, ScreenTitlePipe, ScreenSubtitlePipe, FavStarComponent],
  templateUrl: './membership-type-import.html',
  styleUrls: ['../system-setup/system-setup.css', '../membership-import/membership-import.css'],
})
export class MembershipTypeImportComponent {
  private readonly service = inject(MembershipTypeImportService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly batches = signal<TypeImportBatchSummary[]>([]);
  readonly detail = signal<TypeImportBatchDetail | null>(null);
  readonly loading = signal(false);
  readonly uploading = signal(false);
  readonly migrating = signal(false);
  readonly deletingId = signal<string | null>(null);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');
  // Non-ok / noteworthy outcomes of the last migrate run, shown until dismissed.
  readonly lastResults = signal<TypeImportMigrateResult[]>([]);

  // Selected staged type row ids (the migration unit).
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

  // --- derived counts ---

  readonly selectableRows = computed(() =>
    (this.detail()?.rows || []).filter((r) => r.isValid && r.migrateStatus !== 'migrated'));

  readonly allSelected = computed(() => {
    const sel = this.selected();
    const selectable = this.selectableRows();
    return selectable.length > 0 && selectable.every((r) => sel.has(r.id));
  });

  errorCount(r: TypeImportRow): number {
    return r.issues.filter((i) => i.level === 'error').length;
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
        this.router.navigate(['/membership/type-import']);
      },
    });
  }

  // Preselect every valid, not-yet-migrated row (show expected results: the
  // user sees exactly what will move before confirming).
  private applyDetail(d: TypeImportBatchDetail): void {
    this.detail.set(d);
    const pre = new Set<string>();
    for (const r of d.rows) {
      if (r.isValid && r.migrateStatus !== 'migrated') pre.add(r.id);
    }
    this.selected.set(pre);
  }

  open(b: TypeImportBatchSummary): void {
    this.clearMessages();
    this.router.navigate(['/membership/type-import', b.id]);
  }

  back(): void {
    this.clearMessages();
    this.router.navigate(['/membership/type-import']);
  }

  // --- actions ---

  downloadTemplate(): void {
    this.clearMessages();
    this.service.template().subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'membership-type-import-template.xlsx';
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
        this.router.navigate(['/membership/type-import', res.batch.id]);
      },
      error: (err) => {
        this.uploading.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to upload the file.');
      },
    });
  }

  toggle(r: TypeImportRow): void {
    if (!r.isValid || r.migrateStatus === 'migrated') return;
    this.selected.update((s) => {
      const next = new Set(s);
      if (next.has(r.id)) next.delete(r.id);
      else next.add(r.id);
      return next;
    });
  }

  toggleAll(): void {
    if (this.allSelected()) this.selected.set(new Set());
    else this.selected.set(new Set(this.selectableRows().map((r) => r.id)));
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
        this.lastResults.set(res.results.filter((r) => !r.ok || r.message));
        this.applyDetail(res.batch);
      },
      error: (err) => {
        this.migrating.set(false);
        this.errorMessage.set(err.error?.message || 'Migration failed.');
      },
    });
  }

  deleteBatch(b: TypeImportBatchSummary): void {
    if (!window.confirm(`Delete the staged batch '${b.fileName}'? Migrated types stay - this only clears the staging rows.`)) return;
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
