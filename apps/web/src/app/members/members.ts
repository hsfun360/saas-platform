import { Component, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CommonModule } from '@angular/common';
import { MembershipService } from '../services/membership.service';
import { MemberSearchRow, MembersMeta } from '../models/auth.models';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { ComboboxComponent } from '../shared/combobox/combobox';
import { onDebounced } from '../shared/debounce';

// Membership Management → Members - the flat, read-only search across every
// person the company knows: individual members, nominees and dependents.
// Creation/editing happens on the Memberships screen.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-members',
  standalone: true,
  imports: [FavStarComponent, LocalDatePipe, ScreenTitlePipe, ScreenSubtitlePipe, CommonModule, ComboboxComponent],
  templateUrl: './members.html',
  styleUrls: ['../memberships/memberships.css'],
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

  // Status filter options for the shared combobox (long reference list).
  readonly statusFilterOptions = computed(() =>
    (this.meta()?.statuses || []).map((s) => ({ value: s.id, label: s.membershipStatus })));

  // Server-side search (the list is capped), debounced while typing.
  constructor() {
    onDebounced(this.search, 300, () => this.load());
  }

  ngOnInit(): void {
    this.service.membersMeta().subscribe({ next: (m) => this.meta.set(m), error: () => {} });
    this.load();
  }

  onSearchInput(value: string): void {
    this.search.set(value);
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
