import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { DashChartComponent, DashChartClick, DashChartOption } from './dash-chart';
import { InsightDrillComponent } from './insight-drill';
import { CHART_THEME, ChartInk, PeriodPreset, axisCommon, computePeriod, monthBounds, monthLabel } from './insight-theme';
import {
  AgentPerfResult,
  AgentPerfRow,
  DashboardMeta,
  MembershipDashboardService,
} from '../services/membership-dashboard.service';
import { ThemeService } from '../services/theme.service';
import { FavStarComponent } from '../shared/fav-star/fav-star';

// A sales channel row in the leaderboard: Internal staff, External agents, or
// one card per Agency (the agency's own staff roll up under it).
interface AgentChannel {
  key: string;
  label: string;
  icon: string;
  count: number;
  params: Record<string, string>;
  rows: AgentPerfRow[];
}

// The trend chart's series - fixed slot order (dataviz rule: color follows the
// entity, assigned in fixed order, never cycled).
const CHANNEL_SERIES = [
  { key: 'internal', name: 'Internal', slot: 0, drill: { agentKind: 'internal' } },
  { key: 'external', name: 'External', slot: 1, drill: { agentKind: 'external' } },
  { key: 'agency', name: 'Agency', slot: 2, drill: { agentKind: 'agency-staff' } },
] as const;

// Business Insights → Agent Performance: memberships closed in the period by
// sales channel and agent (closing salesAgentId - the commission driver).
// Membership movement/demographics live on the sibling Membership Analysis
// screen (user decision 2026-07-22 - split for load + RBAC granularity).
@Component({
  selector: 'app-agent-performance',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FavStarComponent, ScreenTitlePipe, ScreenSubtitlePipe, DashChartComponent, InsightDrillComponent],
  templateUrl: './agent-performance.html',
  styleUrls: ['../system-setup/system-setup.css', './insights.css', './agent-performance.css'],
})
export class AgentPerformanceComponent implements OnInit {
  private readonly api = inject(MembershipDashboardService);
  private readonly theme = inject(ThemeService);

  private readonly drill = viewChild.required(InsightDrillComponent);

  readonly errorMessage = signal('');
  readonly loading = signal(false);

  // --- Global filters -------------------------------------------------------
  readonly periodPreset = signal<PeriodPreset>('last12');
  readonly customFrom = signal('');
  readonly customTo = signal('');
  readonly classFilter = signal('');

  readonly period = computed(() => computePeriod(this.periodPreset(), this.customFrom(), this.customTo()));

  // --- Data -----------------------------------------------------------------
  readonly meta = signal<DashboardMeta | null>(null);
  readonly perf = signal<AgentPerfResult | null>(null);

  // --- Lifecycle ------------------------------------------------------------
  ngOnInit(): void {
    this.api.meta().subscribe({
      next: (m) => this.meta.set(m),
      error: (err) => this.errorMessage.set(err.error?.message || 'Failed to load agent performance.'),
    });
    this.reload();
  }

  private reload(): void {
    this.loading.set(true);
    const { from, to } = this.period();
    const p: { from: string; to: string; class?: string } = { from, to };
    if (this.classFilter()) p.class = this.classFilter();
    this.api.agents(p).subscribe({
      next: (r) => { this.perf.set(r); this.loading.set(false); },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to load agent performance.');
        this.loading.set(false);
      },
    });
  }

  // --- Filter setters -------------------------------------------------------
  setPreset(preset: PeriodPreset): void {
    this.periodPreset.set(preset);
    if (preset !== 'custom') this.reload();
  }
  setCustomFrom(v: string): void {
    this.customFrom.set(v);
    if (this.customFrom() && this.customTo()) this.reload();
  }
  setCustomTo(v: string): void {
    this.customTo.set(v);
    if (this.customFrom() && this.customTo()) this.reload();
  }
  setClass(v: string): void {
    this.classFilter.set(v);
    this.reload();
  }

  // --- KPI totals -----------------------------------------------------------
  readonly totals = computed(() => {
    const perf = this.perf();
    const t = { closed: 0, internal: 0, external: 0, agency: 0, unattributed: perf?.unattributed ?? 0 };
    for (const row of perf?.agents ?? []) {
      if (row.agencyId) t.agency += row.count;
      else if (row.agentKind === 'internal') t.internal += row.count;
      else t.external += row.count;
    }
    t.closed = t.internal + t.external + t.agency + t.unattributed;
    return t;
  });

  // --- Trend chart (monthly closings, stacked by channel) -------------------
  private chartInk(): ChartInk {
    return CHART_THEME[this.theme.resolved()];
  }

  readonly trendOptions = computed<DashChartOption>(() => {
    const ink = this.chartInk();
    const months = this.perf()?.months ?? [];
    const series: Record<string, unknown>[] = CHANNEL_SERIES.map((c) => ({
      name: c.name as string,
      type: 'bar',
      stack: 'closed',
      data: months.map((m) => m[c.key]),
      itemStyle: { color: ink.series[c.slot] },
      barMaxWidth: 22,
    }));
    // Unattributed closings ride on the same stack in a muted, non-series tone
    // ("no data" reads as gray, not as a competing channel).
    series.push({
      name: 'No agent',
      type: 'bar',
      stack: 'closed',
      data: months.map((m) => m.none),
      itemStyle: { color: ink.muted },
      barMaxWidth: 22,
    });
    return {
      animation: false,
      grid: { left: 44, right: 16, top: 40, bottom: 28 },
      legend: { top: 4, textStyle: { color: ink.inkSecondary, fontSize: 12 }, itemWidth: 12, itemHeight: 12 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: {
        type: 'category',
        data: months.map((m) => monthLabel(m.month)),
        ...axisCommon(ink),
        splitLine: { show: false },
      },
      yAxis: { type: 'value', minInterval: 1, ...axisCommon(ink), axisLine: { show: false } },
      series,
    };
  });

  readonly hasTrendData = computed(() => (this.perf()?.months ?? []).some((m) => m.internal + m.external + m.agency + m.none > 0));

  onTrendClick(e: DashChartClick): void {
    const month = (this.perf()?.months ?? [])[e.dataIndex];
    if (!month) return;
    const channel = CHANNEL_SERIES.find((c) => c.name === e.seriesName);
    if (!channel) return; // 'No agent' segment - no drillable filter for "absence of agent"
    const { from, to } = monthBounds(month.month);
    this.drill().addFilter({
      key: 'agent',
      label: `${channel.name} · joined in ${monthLabel(month.month)}`,
      params: { ...channel.drill, joinedFrom: from, joinedTo: to },
      entity: 'memberships',
    });
  }

  // --- Leaderboard ----------------------------------------------------------
  readonly expandedChannels = signal<Set<string>>(new Set());

  readonly channels = computed<AgentChannel[]>(() => {
    const perf = this.perf();
    if (!perf) return [];
    const channels = new Map<string, AgentChannel>();
    for (const row of perf.agents) {
      let key: string;
      let label: string;
      let icon: string;
      let params: Record<string, string>;
      if (row.agencyId) {
        key = `agency:${row.agencyId}`;
        label = row.agencyName ?? 'Agency';
        icon = 'storefront';
        params = { agencyId: row.agencyId };
      } else if (row.agentKind === 'internal') {
        key = 'internal';
        label = 'Staff (Internal)';
        icon = 'badge';
        params = { agentKind: 'internal' };
      } else {
        key = 'external';
        label = 'Agents (External)';
        icon = 'person_pin';
        params = { agentKind: 'external' };
      }
      let ch = channels.get(key);
      if (!ch) {
        ch = { key, label, icon, count: 0, params, rows: [] };
        channels.set(key, ch);
      }
      ch.count += row.count;
      ch.rows.push(row);
    }
    return [...channels.values()].sort((a, b) => b.count - a.count);
  });

  toggleChannel(key: string): void {
    const next = new Set(this.expandedChannels());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.expandedChannels.set(next);
  }

  drillChannel(channel: AgentChannel): void {
    const { from, to } = this.period();
    this.drill().addFilter({
      key: 'agent',
      label: `${channel.label} · joined ${from} to ${to}`,
      params: { ...channel.params, joinedFrom: from, joinedTo: to },
      entity: 'memberships',
    });
  }

  drillAgent(row: AgentPerfRow, event: Event): void {
    event.stopPropagation();
    const { from, to } = this.period();
    this.drill().addFilter({
      key: 'agent',
      label: `Agent: ${row.name} · joined ${from} to ${to}`,
      params: { agentId: row.agentId, joinedFrom: from, joinedTo: to },
      entity: 'memberships',
    });
  }

  drillKind(kind: 'internal' | 'external' | 'agency-staff', label: string): void {
    const { from, to } = this.period();
    this.drill().addFilter({
      key: 'agent',
      label: `${label} · joined ${from} to ${to}`,
      params: { agentKind: kind, joinedFrom: from, joinedTo: to },
      entity: 'memberships',
    });
  }

  drillAllClosed(): void {
    const { from, to } = this.period();
    this.drill().addFilter({
      key: 'agent',
      label: `Joined ${from} to ${to}`,
      params: { joinedFrom: from, joinedTo: to },
      entity: 'memberships',
    });
  }
}
