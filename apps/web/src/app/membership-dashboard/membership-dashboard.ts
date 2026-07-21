import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { DashChartComponent, DashChartClick, DashChartOption } from './dash-chart';
import {
  AgentPerfResult,
  AgentPerfRow,
  BreakdownBucket,
  BreakdownDimension,
  DashboardMeta,
  DashboardSummary,
  DrillMemberRow,
  DrillMembershipRow,
  DrillResult,
  MembershipDashboardService,
  MovementMonth,
} from '../services/membership-dashboard.service';
import { ThemeService } from '../services/theme.service';
import { CountryService } from '../services/country.service';
import { NationalityService } from '../services/nationality.service';

// Chart ink & series colors. ECharts paints to <canvas>, which cannot resolve
// CSS custom properties, so the theme pair is carried here instead of in
// styles.css - both modes from the validated dataviz reference palette
// (adjacent-pair CVD-safe order), switched on ThemeService.resolved().
interface ChartInk {
  ink: string;
  inkSecondary: string;
  muted: string;
  grid: string;
  axis: string;
  series: string[];
  joins: string;
  expiries: string;
}

const CHART_THEME: Record<'light' | 'dark', ChartInk> = {
  light: {
    ink: '#0b0b0b',
    inkSecondary: '#52514e',
    muted: '#898781',
    grid: '#e1e0d9',
    axis: '#c3c2b7',
    series: ['#2a78d6', '#008300', '#e87ba4', '#eda100', '#1baf7a', '#eb6834', '#4a3aa7', '#e34948'],
    joins: '#2a78d6',
    expiries: '#e34948',
  },
  dark: {
    ink: '#ffffff',
    inkSecondary: '#c3c2b7',
    muted: '#898781',
    grid: '#2c2c2a',
    axis: '#383835',
    series: ['#3987e5', '#008300', '#d55181', '#c98500', '#199e70', '#d95926', '#9085e9', '#e66767'],
    joins: '#3987e5',
    expiries: '#e66767',
  },
};

type PeriodPreset = 'thisMonth' | 'thisYear' | 'last12' | 'custom';

// One active drill filter (a chip). `params` go straight onto the /drill query;
// chips with the same key replace each other (re-clicking a segment of the same
// chart swaps the filter, clicking another chart narrows).
interface DrillChip {
  key: string;
  label: string;
  params: Record<string, string>;
  entity: 'memberships' | 'members';
}

interface AgentChannel {
  key: string;
  label: string;
  icon: string;
  count: number;
  params: Record<string, string>;
  rows: AgentPerfRow[];
}

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

@Component({
  selector: 'app-membership-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LocalDatePipe, ScreenTitlePipe, ScreenSubtitlePipe, DashChartComponent],
  templateUrl: './membership-dashboard.html',
  styleUrls: ['../system-setup/system-setup.css', './membership-dashboard.css'],
})
export class MembershipDashboardComponent implements OnInit {
  private readonly api = inject(MembershipDashboardService);
  private readonly theme = inject(ThemeService);
  private readonly countryService = inject(CountryService);
  private readonly nationalityService = inject(NationalityService);

  readonly errorMessage = signal('');
  readonly loading = signal(false);

  // --- Global filters -------------------------------------------------------
  readonly periodPreset = signal<PeriodPreset>('last12');
  readonly customFrom = signal('');
  readonly customTo = signal('');
  readonly classFilter = signal('');
  readonly kindFilter = signal('');
  readonly statusMode = signal<'membership' | 'member'>('membership');

  readonly period = computed<{ from: string; to: string }>(() => {
    const today = new Date();
    const to = dateOnly(today);
    switch (this.periodPreset()) {
      case 'thisMonth':
        return { from: to.slice(0, 8) + '01', to };
      case 'thisYear':
        return { from: to.slice(0, 5) + '01-01', to };
      case 'custom': {
        const from = this.customFrom();
        const t = this.customTo();
        if (from && t) return { from, to: t };
        return { from: to.slice(0, 5) + '01-01', to };
      }
      default: {
        const d = new Date(today);
        d.setFullYear(d.getFullYear() - 1);
        d.setDate(d.getDate() + 1);
        return { from: dateOnly(d), to };
      }
    }
  });

  // --- Data -----------------------------------------------------------------
  readonly meta = signal<DashboardMeta | null>(null);
  readonly summary = signal<DashboardSummary | null>(null);
  readonly movement = signal<MovementMonth[]>([]);
  readonly statusBuckets = signal<BreakdownBucket[]>([]);
  readonly memberStatusBuckets = signal<BreakdownBucket[]>([]);
  readonly typeBuckets = signal<BreakdownBucket[]>([]);
  readonly ageBuckets = signal<BreakdownBucket[]>([]);
  readonly countryBuckets = signal<BreakdownBucket[]>([]);
  readonly nationalityBuckets = signal<BreakdownBucket[]>([]);
  readonly agentPerf = signal<AgentPerfResult | null>(null);

  private readonly countryNames = signal<Map<string, string>>(new Map());
  private readonly nationalityNames = signal<Map<string, string>>(new Map());

  // --- Label lookups --------------------------------------------------------
  private readonly statusById = computed(() => {
    const m = new Map<string, { name: string; color: string | null; statusClass: string }>();
    for (const s of this.meta()?.statuses ?? []) {
      m.set(s.id, { name: s.membershipStatus, color: s.statusColor ?? null, statusClass: s.statusClass });
    }
    return m;
  });
  private readonly typeById = computed(() => {
    const m = new Map<string, string>();
    for (const t of this.meta()?.types ?? []) m.set(t.id, t.category);
    return m;
  });
  private readonly agentById = computed(() => {
    const m = new Map<string, string>();
    for (const a of this.meta()?.agents ?? []) m.set(a.id, a.name);
    return m;
  });

  statusName(id: string | null): string {
    if (!id) return 'Unknown';
    return this.statusById().get(id)?.name ?? 'Unknown';
  }
  statusColor(id: string | null): string | null {
    if (!id) return null;
    return this.statusById().get(id)?.color ?? null;
  }
  typeName(id: string | null): string {
    if (!id) return 'Unknown';
    return this.typeById().get(id) ?? 'Unknown';
  }
  agentName(id: string | null): string {
    if (!id) return 'No agent recorded';
    return this.agentById().get(id) ?? 'Unknown agent';
  }
  private ageBandLabel(key: string): string {
    if (key === 'unknown') return 'Unknown';
    return this.meta()?.ageBands.find((b) => b.key === key)?.label ?? key;
  }
  private countryLabel(key: string): string {
    if (key === 'unknown') return 'Unknown';
    return this.countryNames().get(key.toUpperCase()) ?? key;
  }
  private nationalityLabel(key: string): string {
    if (key === 'unknown') return 'Unknown';
    return this.nationalityNames().get(key) ?? key;
  }

  memberDisplayName(row: DrillMemberRow): string {
    const name = [row.firstName, row.lastName].filter(Boolean).join(' ');
    return row.localName ? `${name} (${row.localName})` : name;
  }

  // --- Lifecycle ------------------------------------------------------------
  ngOnInit(): void {
    this.api.meta().subscribe({
      next: (m) => this.meta.set(m),
      error: (err) => this.errorMessage.set(err.error?.message || 'Failed to load the dashboard.'),
    });
    this.countryService.listActive().subscribe({
      next: (list) => this.countryNames.set(new Map(list.map((c) => [c.alpha2.toUpperCase(), `${c.flagEmoji ?? ''} ${c.name}`.trim()]))),
      error: () => {},
    });
    this.nationalityService.listActive().subscribe({
      next: (list) => this.nationalityNames.set(new Map(list.map((n) => [n.nationalityCode, n.description || n.nationalityCode]))),
      error: () => {},
    });
    this.reloadAll();
  }

  // --- Loading --------------------------------------------------------------
  private periodParams(): { from: string; to: string; class?: string } {
    const { from, to } = this.period();
    const p: { from: string; to: string; class?: string } = { from, to };
    if (this.classFilter()) p.class = this.classFilter();
    return p;
  }

  private reloadAll(): void {
    this.loading.set(true);
    const p = this.periodParams();
    let pending = 4;
    const done = () => { if (--pending === 0) this.loading.set(false); };
    const fail = (err: { error?: { message?: string } }) => {
      this.errorMessage.set(err.error?.message || 'Failed to load the dashboard.');
      done();
    };
    this.api.summary(p).subscribe({ next: (s) => { this.summary.set(s); done(); }, error: fail });
    this.api.movement(p).subscribe({ next: (r) => { this.movement.set(r.months); done(); }, error: fail });
    this.api.agents(p).subscribe({ next: (r) => { this.agentPerf.set(r); done(); }, error: fail });
    this.reloadBreakdowns(done);
  }

  private reloadBreakdowns(done?: () => void): void {
    const base: { class?: string } = {};
    if (this.classFilter()) base.class = this.classFilter();
    const memberParams: { class?: string; kind?: string } = { ...base };
    if (this.kindFilter()) memberParams.kind = this.kindFilter();

    const targets: [BreakdownDimension, (b: BreakdownBucket[]) => void, { class?: string; kind?: string }][] = [
      ['status', (b) => this.statusBuckets.set(b), base],
      ['memberStatus', (b) => this.memberStatusBuckets.set(b), memberParams],
      ['type', (b) => this.typeBuckets.set(b), base],
      ['ageBand', (b) => this.ageBuckets.set(b), memberParams],
      ['country', (b) => this.countryBuckets.set(b), memberParams],
      ['nationality', (b) => this.nationalityBuckets.set(b), memberParams],
    ];
    let pending = targets.length;
    for (const [dim, sink, params] of targets) {
      this.api.breakdown(dim, params).subscribe({
        next: (r) => { sink(r.buckets); if (--pending === 0 && done) done(); },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Failed to load the dashboard.');
          if (--pending === 0 && done) done();
        },
      });
    }
  }

  // --- Filter setters -------------------------------------------------------
  setPreset(preset: PeriodPreset): void {
    this.periodPreset.set(preset);
    if (preset !== 'custom') this.reloadAll();
  }
  setCustomFrom(v: string): void {
    this.customFrom.set(v);
    if (this.customFrom() && this.customTo()) this.reloadAll();
  }
  setCustomTo(v: string): void {
    this.customTo.set(v);
    if (this.customFrom() && this.customTo()) this.reloadAll();
  }
  setClass(v: string): void {
    this.classFilter.set(v);
    this.reloadAll();
  }
  setKind(v: string): void {
    this.kindFilter.set(v);
    this.reloadBreakdowns();
  }
  setStatusMode(mode: 'membership' | 'member'): void {
    this.statusMode.set(mode);
  }

  // --- Chart options --------------------------------------------------------
  private chartInk(): ChartInk {
    return CHART_THEME[this.theme.resolved()];
  }

  private axisCommon(ink: ChartInk) {
    return {
      axisLine: { lineStyle: { color: ink.axis } },
      axisTick: { show: false },
      axisLabel: { color: ink.muted, fontSize: 11 },
      splitLine: { lineStyle: { color: ink.grid } },
    };
  }

  readonly movementOptions = computed<DashChartOption>(() => {
    const ink = this.chartInk();
    const months = this.movement();
    return {
      animation: false,
      grid: { left: 44, right: 16, top: 40, bottom: 28 },
      legend: { top: 4, textStyle: { color: ink.inkSecondary, fontSize: 12 }, itemWidth: 12, itemHeight: 12 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: {
        type: 'category',
        data: months.map((m) => this.monthLabel(m.month)),
        ...this.axisCommon(ink),
        splitLine: { show: false },
      },
      yAxis: { type: 'value', minInterval: 1, ...this.axisCommon(ink), axisLine: { show: false } },
      series: [
        {
          name: 'Joins',
          type: 'bar',
          data: months.map((m) => m.joins),
          itemStyle: { color: ink.joins, borderRadius: [4, 4, 0, 0] },
          barMaxWidth: 22,
        },
        {
          name: 'Expiries',
          type: 'bar',
          data: months.map((m) => m.expiries),
          itemStyle: { color: ink.expiries, borderRadius: [4, 4, 0, 0] },
          barMaxWidth: 22,
        },
      ],
    };
  });

  readonly statusDonutOptions = computed<DashChartOption>(() => {
    const ink = this.chartInk();
    const buckets = this.statusMode() === 'membership' ? this.statusBuckets() : this.memberStatusBuckets();
    const data = buckets.map((b, i) => ({
      name: this.statusName(b.key === 'unknown' ? null : b.key),
      value: b.count,
      itemStyle: { color: this.statusColor(b.key) ?? ink.series[i % ink.series.length] },
    }));
    return {
      animation: false,
      tooltip: { trigger: 'item' },
      legend: {
        orient: 'vertical',
        right: 0,
        top: 'middle',
        textStyle: { color: ink.inkSecondary, fontSize: 12 },
        itemWidth: 12,
        itemHeight: 12,
      },
      series: [{
        type: 'pie',
        radius: ['52%', '78%'],
        center: ['34%', '50%'],
        data,
        label: { show: false },
        itemStyle: { borderWidth: 2, borderColor: 'transparent' },
        emphasis: { label: { show: true, color: ink.ink, fontSize: 14, formatter: '{b}\n{c}' } },
      }],
    };
  });

  private hBarOptions(buckets: BreakdownBucket[], labelFn: (key: string) => string): DashChartOption {
    const ink = this.chartInk();
    const rows = [...buckets].reverse(); // ECharts y-axis renders bottom-up
    return {
      animation: false,
      grid: { left: 8, right: 40, top: 8, bottom: 8, containLabel: true },
      tooltip: { trigger: 'item' },
      xAxis: { type: 'value', minInterval: 1, ...this.axisCommon(ink), axisLine: { show: false }, axisLabel: { show: false }, splitLine: { show: false } },
      yAxis: {
        type: 'category',
        data: rows.map((b) => labelFn(b.key)),
        ...this.axisCommon(ink),
        axisLabel: { color: ink.inkSecondary, fontSize: 12 },
        splitLine: { show: false },
      },
      series: [{
        type: 'bar',
        data: rows.map((b) => b.count),
        itemStyle: { color: ink.series[0], borderRadius: [0, 4, 4, 0] },
        barMaxWidth: 18,
        label: { show: true, position: 'right', color: ink.inkSecondary, fontSize: 11 },
      }],
    };
  }

  readonly typeOptions = computed<DashChartOption>(() => this.hBarOptions(this.typeBuckets(), (k) => this.typeName(k === 'unknown' ? null : k)));
  readonly ageOptions = computed<DashChartOption>(() => this.hBarOptions(this.orderedAgeBuckets(), (k) => this.ageBandLabel(k)));
  readonly countryOptions = computed<DashChartOption>(() => this.hBarOptions(this.countryBuckets(), (k) => this.countryLabel(k)));
  readonly nationalityOptions = computed<DashChartOption>(() => this.hBarOptions(this.nationalityBuckets(), (k) => this.nationalityLabel(k)));

  // Age bands render in band order (a distribution), not by count.
  private orderedAgeBuckets(): BreakdownBucket[] {
    const order = (this.meta()?.ageBands.map((b) => b.key) ?? []).concat('unknown');
    return [...this.ageBuckets()].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  }

  chartHeight(buckets: BreakdownBucket[]): number {
    return Math.max(160, Math.min(400, 40 + buckets.length * 34));
  }

  private monthLabel(ym: string): string {
    const m = parseInt(ym.slice(5, 7), 10);
    return `${MONTHS[m - 1]} ${ym.slice(2, 4)}`;
  }

  // --- Agent leaderboard ----------------------------------------------------
  readonly expandedChannels = signal<Set<string>>(new Set());

  readonly agentChannels = computed<AgentChannel[]>(() => {
    const perf = this.agentPerf();
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

  // --- Drill-down -----------------------------------------------------------
  readonly drillChips = signal<DrillChip[]>([]);
  readonly drillEntity = signal<'memberships' | 'members'>('memberships');
  readonly drillRows = signal<(DrillMembershipRow | DrillMemberRow)[]>([]);
  readonly drillTotal = signal(0);
  readonly drillLoading = signal(false);
  readonly drillOpen = signal(false);

  membershipRow(row: DrillMembershipRow | DrillMemberRow): DrillMembershipRow {
    return row as DrillMembershipRow;
  }
  memberRow(row: DrillMembershipRow | DrillMemberRow): DrillMemberRow {
    return row as DrillMemberRow;
  }

  private addDrill(chip: DrillChip): void {
    const chips = this.drillChips().filter((c) => c.key !== chip.key);
    chips.push(chip);
    this.drillChips.set(chips);
    this.drillEntity.set(chip.entity);
    this.drillOpen.set(true);
    this.fetchDrill(0);
    // Bring the panel into view - it lives below the charts.
    setTimeout(() => document.getElementById('md-drill')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  }

  removeChip(key: string): void {
    const chips = this.drillChips().filter((c) => c.key !== key);
    this.drillChips.set(chips);
    if (chips.length === 0) this.closeDrill();
    else this.fetchDrill(0);
  }

  closeDrill(): void {
    this.drillOpen.set(false);
    this.drillChips.set([]);
    this.drillRows.set([]);
    this.drillTotal.set(0);
  }

  setDrillEntity(entity: 'memberships' | 'members'): void {
    if (this.drillEntity() === entity) return;
    this.drillEntity.set(entity);
    this.fetchDrill(0);
  }

  private drillParams(): Record<string, string> {
    const params: Record<string, string> = { entity: this.drillEntity() };
    if (this.classFilter()) params['class'] = this.classFilter();
    for (const chip of this.drillChips()) Object.assign(params, chip.params);
    return params;
  }

  private fetchDrill(offset: number): void {
    this.drillLoading.set(true);
    this.api.drill(this.drillParams(), offset).subscribe({
      next: (r: DrillResult) => {
        this.drillRows.set(offset === 0 ? r.rows : [...this.drillRows(), ...r.rows]);
        this.drillTotal.set(r.total);
        this.drillLoading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to load the drill-down list.');
        this.drillLoading.set(false);
      },
    });
  }

  loadMoreDrill(): void {
    this.fetchDrill(this.drillRows().length);
  }

  // --- Chart click handlers (each opens/narrows the drill) ------------------
  onMovementClick(e: DashChartClick): void {
    const month = this.movement()[e.dataIndex];
    if (!month) return;
    const from = `${month.month}-01`;
    const lastDay = new Date(parseInt(month.month.slice(0, 4), 10), parseInt(month.month.slice(5, 7), 10), 0).getDate();
    const to = `${month.month}-${String(lastDay).padStart(2, '0')}`;
    if (e.seriesName === 'Expiries') {
      this.addDrill({
        key: 'movement',
        label: `Expired in ${this.monthLabel(month.month)}`,
        params: { expiredFrom: from, expiredTo: to },
        entity: 'memberships',
      });
    } else {
      this.addDrill({
        key: 'movement',
        label: `Joined in ${this.monthLabel(month.month)}`,
        params: { joinedFrom: from, joinedTo: to },
        entity: 'memberships',
      });
    }
  }

  onStatusClick(e: DashChartClick): void {
    const mode = this.statusMode();
    const buckets = mode === 'membership' ? this.statusBuckets() : this.memberStatusBuckets();
    const bucket = buckets[e.dataIndex];
    if (!bucket || bucket.key === 'unknown') return;
    if (mode === 'membership') {
      this.addDrill({
        key: 'status',
        label: `Status: ${this.statusName(bucket.key)}`,
        params: { statusId: bucket.key },
        entity: 'memberships',
      });
    } else {
      this.addDrill({
        key: 'memberStatus',
        label: `Member status: ${this.statusName(bucket.key)}`,
        params: { memberStatusId: bucket.key },
        entity: 'members',
      });
    }
  }

  onTypeClick(e: DashChartClick): void {
    const bucket = [...this.typeBuckets()].reverse()[e.dataIndex];
    if (!bucket || bucket.key === 'unknown') return;
    this.addDrill({
      key: 'type',
      label: `Type: ${this.typeName(bucket.key)}`,
      params: { typeId: bucket.key },
      entity: 'memberships',
    });
  }

  onAgeClick(e: DashChartClick): void {
    const bucket = [...this.orderedAgeBuckets()].reverse()[e.dataIndex];
    if (!bucket) return;
    this.addDrill({
      key: 'ageBand',
      label: `Age: ${this.ageBandLabel(bucket.key)}`,
      params: { ageBand: bucket.key },
      entity: 'members',
    });
  }

  onCountryClick(e: DashChartClick): void {
    const bucket = [...this.countryBuckets()].reverse()[e.dataIndex];
    if (!bucket) return;
    this.addDrill({
      key: 'country',
      label: `Country: ${this.countryLabel(bucket.key)}`,
      params: { countryCode: bucket.key },
      entity: 'members',
    });
  }

  onNationalityClick(e: DashChartClick): void {
    const bucket = [...this.nationalityBuckets()].reverse()[e.dataIndex];
    if (!bucket) return;
    this.addDrill({
      key: 'nationality',
      label: `Nationality: ${this.nationalityLabel(bucket.key)}`,
      params: { nationality: bucket.key },
      entity: 'members',
    });
  }

  drillChannel(channel: AgentChannel): void {
    const { from, to } = this.period();
    this.addDrill({
      key: 'agent',
      label: `${channel.label} · joined ${from} to ${to}`,
      params: { ...channel.params, joinedFrom: from, joinedTo: to },
      entity: 'memberships',
    });
  }

  drillAgent(row: AgentPerfRow, event: Event): void {
    event.stopPropagation();
    const { from, to } = this.period();
    this.addDrill({
      key: 'agent',
      label: `Agent: ${row.name} · joined ${from} to ${to}`,
      params: { agentId: row.agentId, joinedFrom: from, joinedTo: to },
      entity: 'memberships',
    });
  }

  drillNewJoins(): void {
    const { from, to } = this.period();
    this.addDrill({
      key: 'movement',
      label: `Joined ${from} to ${to}`,
      params: { joinedFrom: from, joinedTo: to },
      entity: 'memberships',
    });
  }

  drillExpired(): void {
    const { from, to } = this.period();
    this.addDrill({
      key: 'movement',
      label: `Expired ${from} to ${to}`,
      params: { expiredFrom: from, expiredTo: to },
      entity: 'memberships',
    });
  }
}
