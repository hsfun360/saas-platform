import { Component, OnInit, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { AdminService } from '../services/admin.service';
import { UnverifiedUser } from '../models/auth.models';
import { LocalDatePipe } from '../shared/local-date.pipe';

const STALE_DAYS = 7;

// Platform-admin cleanup utility (design agreed 2026-07-27): review every
// unverified registration and choose what to delete - a manual page, not a
// cron, per the no-dark-rooms principle. Rows older than 7 days are
// pre-selected; the backend independently refuses anything verified, linked
// to a workspace, or on ADMIN_EMAILS, whatever the selection says.
@Component({
  selector: 'app-unverified-users',
  standalone: true,
  imports: [LocalDatePipe],
  templateUrl: './unverified-users.html',
  styleUrls: ['./unverified-users.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnverifiedUsersComponent implements OnInit {
  private readonly admin = inject(AdminService);

  readonly rows = signal<UnverifiedUser[]>([]);
  readonly selected = signal<ReadonlySet<string>>(new Set());
  readonly loading = signal(true);
  readonly deleting = signal(false);
  readonly resultMessage = signal('');
  readonly errorMessage = signal('');
  readonly skipped = signal<{ id: string; email?: string; reason: string }[]>([]);

  readonly selectedCount = computed(() => this.selected().size);
  readonly staleCount = computed(() => this.rows().filter(r => this.isStale(r)).length);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.admin.listUnverifiedUsers().subscribe({
      next: (rows) => {
        this.rows.set(rows);
        // Pre-select the stale (>7 days) deletable rows - the policy default;
        // the admin can adjust before committing.
        this.selected.set(new Set(rows.filter(r => this.isStale(r) && !r.hasWorkspace).map(r => r.id)));
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err?.error?.message || 'Failed to load registrations.');
      },
    });
  }

  ageDays(row: UnverifiedUser): number {
    return Math.floor((Date.now() - new Date(row.createdAt).getTime()) / 86400000);
  }

  isStale(row: UnverifiedUser): boolean {
    return this.ageDays(row) >= STALE_DAYS;
  }

  isSelected(id: string): boolean {
    return this.selected().has(id);
  }

  toggle(row: UnverifiedUser): void {
    if (row.hasWorkspace) return; // never deletable - checkbox is disabled too
    this.selected.update(prev => {
      const next = new Set(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
  }

  deleteSelected(): void {
    const ids = [...this.selected()];
    if (ids.length === 0) return;
    this.deleting.set(true);
    this.resultMessage.set('');
    this.errorMessage.set('');
    this.admin.deleteUnverifiedUsers(ids).subscribe({
      next: (res) => {
        this.deleting.set(false);
        this.resultMessage.set(res.message);
        this.skipped.set(res.skipped || []);
        this.load();
      },
      error: (err) => {
        this.deleting.set(false);
        this.errorMessage.set(err?.error?.message || 'Failed to delete registrations.');
      },
    });
  }
}
