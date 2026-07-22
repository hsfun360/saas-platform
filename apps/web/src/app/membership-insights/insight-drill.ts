import { ChangeDetectionStrategy, Component, ElementRef, inject, input, signal } from '@angular/core';
import {
  DashboardMeta,
  DrillMemberRow,
  DrillMembershipRow,
  DrillResult,
  MembershipDashboardService,
} from '../services/membership-dashboard.service';

// One active drill filter (a chip). `params` go straight onto the /drill query;
// chips with the same key replace each other (re-clicking a segment of the same
// chart swaps the filter, clicking another chart narrows).
export interface DrillChip {
  key: string;
  label: string;
  params: Record<string, string>;
  entity: 'memberships' | 'members';
}

// The "records behind the numbers" panel shared by both Business Insights
// screens. Parents push filters in via addFilter() (viewChild ref); the panel
// owns its own fetch/paging/chips state.
@Component({
  selector: 'app-insight-drill',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './insight-drill.html',
  // system-setup.css supplies the .flash primitives; insights.css the shared
  // md-card/md-seg/md-status/md-empty primitives (component-scoped, so the
  // panel must include them itself - parent styles don't reach child templates).
  styleUrls: ['../system-setup/system-setup.css', './insights.css', './insight-drill.css'],
})
export class InsightDrillComponent {
  private readonly api = inject(MembershipDashboardService);
  private readonly host = inject(ElementRef<HTMLElement>);

  // Label catalogs + the pages' global class filter (applied to every drill).
  readonly meta = input<DashboardMeta | null>(null);
  readonly classFilter = input('');

  readonly errorMessage = signal('');
  readonly chips = signal<DrillChip[]>([]);
  readonly entity = signal<'memberships' | 'members'>('memberships');
  readonly rows = signal<(DrillMembershipRow | DrillMemberRow)[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly open = signal(false);

  // --- Label lookups --------------------------------------------------------
  statusName(id: string | null): string {
    if (!id) return 'Unknown';
    const s = this.meta()?.statuses.find((x) => x.id === id);
    return s ? s.membershipStatus : 'Unknown';
  }
  statusColor(id: string | null): string | null {
    if (!id) return null;
    return this.meta()?.statuses.find((x) => x.id === id)?.statusColor ?? null;
  }
  typeName(id: string | null): string {
    if (!id) return 'Unknown';
    return this.meta()?.types.find((x) => x.id === id)?.category ?? 'Unknown';
  }
  agentName(id: string | null): string {
    if (!id) return 'No agent recorded';
    return this.meta()?.agents.find((x) => x.id === id)?.name ?? 'Unknown agent';
  }
  memberDisplayName(row: DrillMemberRow): string {
    const name = [row.firstName, row.lastName].filter(Boolean).join(' ');
    return row.localName ? `${name} (${row.localName})` : name;
  }
  membershipRow(row: DrillMembershipRow | DrillMemberRow): DrillMembershipRow {
    return row as DrillMembershipRow;
  }
  memberRow(row: DrillMembershipRow | DrillMemberRow): DrillMemberRow {
    return row as DrillMemberRow;
  }

  // --- Filter management ----------------------------------------------------
  addFilter(chip: DrillChip): void {
    const chips = this.chips().filter((c) => c.key !== chip.key);
    chips.push(chip);
    this.chips.set(chips);
    this.entity.set(chip.entity);
    this.open.set(true);
    this.fetch(0);
    // Bring the panel into view - it lives below the charts.
    setTimeout(() => (this.host.nativeElement as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  }

  removeChip(key: string): void {
    const chips = this.chips().filter((c) => c.key !== key);
    this.chips.set(chips);
    if (chips.length === 0) this.close();
    else this.fetch(0);
  }

  close(): void {
    this.open.set(false);
    this.chips.set([]);
    this.rows.set([]);
    this.total.set(0);
  }

  setEntity(entity: 'memberships' | 'members'): void {
    if (this.entity() === entity) return;
    this.entity.set(entity);
    this.fetch(0);
  }

  private params(): Record<string, string> {
    const params: Record<string, string> = { entity: this.entity() };
    if (this.classFilter()) params['class'] = this.classFilter();
    for (const chip of this.chips()) Object.assign(params, chip.params);
    return params;
  }

  private fetch(offset: number): void {
    this.loading.set(true);
    this.api.drill(this.params(), offset).subscribe({
      next: (r: DrillResult) => {
        this.rows.set(offset === 0 ? r.rows : [...this.rows(), ...r.rows]);
        this.total.set(r.total);
        this.loading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to load the drill-down list.');
        this.loading.set(false);
      },
    });
  }

  loadMore(): void {
    this.fetch(this.rows().length);
  }
}
