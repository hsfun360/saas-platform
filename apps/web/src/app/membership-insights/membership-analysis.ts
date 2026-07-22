import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { DashChartComponent, DashChartClick, DashChartOption } from './dash-chart';
import { InsightDrillComponent } from './insight-drill';
import { CHART_THEME, ChartInk, PeriodPreset, axisCommon, computePeriod, monthBounds, monthLabel } from './insight-theme';
import {
  BreakdownBucket,
  BreakdownDimension,
  DashboardMeta,
  DashboardSummary,
  MembershipDashboardService,
  MovementMonth,
} from '../services/membership-dashboard.service';
import { ThemeService } from '../services/theme.service';
import { CountryService } from '../services/country.service';
import { NationalityService } from '../services/nationality.service';

// Business Insights → Membership Analysis: movement + demographics of the
// membership base. Sales/agent analytics live on the sibling Agent Performance
// screen (user decision 2026-07-22 - split for load + RBAC granularity).
@Component({
  selector: 'app-membership-analysis',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ScreenTitlePipe, ScreenSubtitlePipe, DashChartComponent, InsightDrillComponent],
  templateUrl: './membership-analysis.html',
  styleUrls: ['../system-setup/system-setup.css', './insights.css'],
})
export class MembershipAnalysisComponent implements OnInit {
  private readonly api = inject(MembershipDashboardService);
  private readonly theme = inject(ThemeService);
  private readonly countryService = inject(CountryService);
  private readonly nationalityService = inject(NationalityService);

  private readonly drill = viewChild.required(InsightDrillComponent);

  readonly errorMessage = signal('');
  readonly loading = signal(false);

  // --- Global filters -------------------------------------------------------
  readonly periodPreset = signal<PeriodPreset>('last12');
  readonly customFrom = signal('');
  readonly customTo = signal('');
  readonly classFilter = signal('');
  readonly kindFilter = signal('');
  readonly statusMode = signal<'membership' | 'member'>('membership');

  readonly period = computed(() => computePeriod(this.periodPreset(), this.customFrom(), this.customTo()));

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

  private readonly countryNames = signal<Map<string, string>>(new Map());
  private readonly nationalityNames = signal<Map<string, string>>(new Map());

  // --- Label lookups --------------------------------------------------------
  private readonly statusById = computed(() => {
    const m = new Map<string, { name: string; color: string | null }>();
    for (const s of this.meta()?.statuses ?? []) m.set(s.id, { name: s.membershipStatus, color: s.statusColor ?? null });
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
    return this.meta()?.types.find((t) => t.id === id)?.category ?? 'Unknown';
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

  // --- Lifecycle ------------------------------------------------------------
  ngOnInit(): void {
    this.api.meta().subscribe({
      next: (m) => this.meta.set(m),
      error: (err) => this.errorMessage.set(err.error?.message || 'Failed to load the analysis.'),
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
    let pending = 3;
    const done = () => { if (--pending === 0) this.loading.set(false); };
    const fail = (err: { error?: { message?: string } }) => {
      this.errorMessage.set(err.error?.message || 'Failed to load the analysis.');
      done();
    };
    this.api.summary(p).subscribe({ next: (s) => { this.summary.set(s); done(); }, error: fail });
    this.api.movement(p).subscribe({ next: (r) => { this.movement.set(r.months); done(); }, error: fail });
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
          this.errorMessage.set(err.error?.message || 'Failed to load the analysis.');
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
        data: months.map((m) => monthLabel(m.month)),
        ...axisCommon(ink),
        splitLine: { show: false },
      },
      yAxis: { type: 'value', minInterval: 1, ...axisCommon(ink), axisLine: { show: false } },
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
      xAxis: { type: 'value', minInterval: 1, ...axisCommon(ink), axisLine: { show: false }, axisLabel: { show: false }, splitLine: { show: false } },
      yAxis: {
        type: 'category',
        data: rows.map((b) => labelFn(b.key)),
        ...axisCommon(ink),
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

  // --- Chart click handlers (each opens/narrows the drill) ------------------
  onMovementClick(e: DashChartClick): void {
    const month = this.movement()[e.dataIndex];
    if (!month) return;
    const { from, to } = monthBounds(month.month);
    if (e.seriesName === 'Expiries') {
      this.drill().addFilter({
        key: 'movement',
        label: `Expired in ${monthLabel(month.month)}`,
        params: { expiredFrom: from, expiredTo: to },
        entity: 'memberships',
      });
    } else {
      this.drill().addFilter({
        key: 'movement',
        label: `Joined in ${monthLabel(month.month)}`,
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
      this.drill().addFilter({
        key: 'status',
        label: `Status: ${this.statusName(bucket.key)}`,
        params: { statusId: bucket.key },
        entity: 'memberships',
      });
    } else {
      this.drill().addFilter({
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
    this.drill().addFilter({
      key: 'type',
      label: `Type: ${this.typeName(bucket.key)}`,
      params: { typeId: bucket.key },
      entity: 'memberships',
    });
  }

  onAgeClick(e: DashChartClick): void {
    const bucket = [...this.orderedAgeBuckets()].reverse()[e.dataIndex];
    if (!bucket) return;
    this.drill().addFilter({
      key: 'ageBand',
      label: `Age: ${this.ageBandLabel(bucket.key)}`,
      params: { ageBand: bucket.key },
      entity: 'members',
    });
  }

  onCountryClick(e: DashChartClick): void {
    const bucket = [...this.countryBuckets()].reverse()[e.dataIndex];
    if (!bucket) return;
    this.drill().addFilter({
      key: 'country',
      label: `Country: ${this.countryLabel(bucket.key)}`,
      params: { countryCode: bucket.key },
      entity: 'members',
    });
  }

  onNationalityClick(e: DashChartClick): void {
    const bucket = [...this.nationalityBuckets()].reverse()[e.dataIndex];
    if (!bucket) return;
    this.drill().addFilter({
      key: 'nationality',
      label: `Nationality: ${this.nationalityLabel(bucket.key)}`,
      params: { nationality: bucket.key },
      entity: 'members',
    });
  }

  drillNewJoins(): void {
    const { from, to } = this.period();
    this.drill().addFilter({
      key: 'movement',
      label: `Joined ${from} to ${to}`,
      params: { joinedFrom: from, joinedTo: to },
      entity: 'memberships',
    });
  }

  drillExpired(): void {
    const { from, to } = this.period();
    this.drill().addFilter({
      key: 'movement',
      label: `Expired ${from} to ${to}`,
      params: { expiredFrom: from, expiredTo: to },
      entity: 'memberships',
    });
  }
}
