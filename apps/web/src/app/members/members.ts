import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, debounceTime } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MembershipService } from '../services/membership.service';
import { MemberSearchRow, MembersMeta } from '../models/auth.models';

// Membership Management → Members - the flat, read-only search across every
// person the company knows: individual members, nominees and dependents.
// Creation/editing happens on the Memberships screen.
@Component({
  selector: 'app-members',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './members.html',
  styleUrls: ['../system-setup/system-setup.css', '../memberships/memberships.css'],
})
export class MembersComponent implements OnInit {
  private readonly service = inject(MembershipService);

  readonly rows = signal<MemberSearchRow[]>([]);
  readonly total = signal(0);
  readonly limit = signal(200);
  readonly meta = signal<MembersMeta | null>(null);
  readonly loading = signal(false);
  readonly loadingMore = signal(false);
  readonly searched = signal(false);
  readonly search = signal('');
  readonly kindFilter = signal('');
  readonly statusFilter = signal('');
  readonly errorMessage = signal('');

  readonly hasMore = () => this.rows().length < this.total();

  // Server-side search (the list is capped), debounced while typing.
  private readonly query$ = new Subject<void>();

  constructor() {
    this.query$.pipe(debounceTime(300), takeUntilDestroyed()).subscribe(() => this.load());
  }

  ngOnInit(): void {
    this.service.membersMeta().subscribe({ next: (m) => this.meta.set(m), error: () => {} });
    this.load();
  }

  onSearchInput(value: string): void {
    this.search.set(value);
    this.query$.next();
  }

  setKind(kind: string): void {
    this.kindFilter.set(kind);
    this.load();
  }

  setStatus(statusId: string): void {
    this.statusFilter.set(statusId);
    this.load();
  }

  // reset=true replaces the list (new search/filter); reset=false appends the
  // next page ("Load more").
  load(reset = true): void {
    const offset = reset ? 0 : this.rows().length;
    if (reset) this.loading.set(true); else this.loadingMore.set(true);
    this.service.searchMembers(this.search().trim(), this.kindFilter(), this.statusFilter(), offset).subscribe({
      next: (res) => {
        this.rows.set(reset ? res.members : [...this.rows(), ...res.members]);
        this.total.set(res.total);
        this.limit.set(res.limit);
        this.loading.set(false);
        this.loadingMore.set(false);
        this.searched.set(true);
      },
      error: (err) => {
        this.loading.set(false);
        this.loadingMore.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to search members.');
      },
    });
  }

  loadMore(): void {
    if (!this.loadingMore() && this.hasMore()) this.load(false);
  }

  clearSearch(): void {
    this.search.set('');
    this.load();
  }

  memberName(m: MemberSearchRow): string {
    return [m.firstName, m.lastName].filter(Boolean).join(' ') || m.memberNo;
  }

  kindLabel(key: string): string {
    return this.meta()?.memberKinds.find((k) => k.key === key)?.label || key;
  }

  dependentLabel(key: string | null | undefined): string {
    return key ? this.meta()?.dependentTypes.find((k) => k.key === key)?.label || key : '';
  }

  statusName(id: string): string {
    return this.meta()?.statuses.find((s) => s.id === id)?.membershipStatus || '';
  }

  statusColor(id: string): string {
    return this.meta()?.statuses.find((s) => s.id === id)?.statusColor || 'var(--text-muted)';
  }
}
