import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

// Register once, tree-shaken: only the chart types the dashboard uses ship in
// the (lazy-loaded) chunk.
echarts.use([BarChart, LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

export type DashChartOption = echarts.EChartsCoreOption;

export interface DashChartClick {
  seriesName?: string;
  name?: string;
  dataIndex: number;
}

// Thin ECharts host: renders the given option, resizes with its container,
// surfaces clicks (the dashboard's drill-down trigger). Purely presentational -
// all option building stays in the dashboard component.
@Component({
  selector: 'app-dash-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #host [style.height.px]="height()" style="width: 100%;"></div>`,
  styles: [':host { display: block; width: 100%; }'],
})
export class DashChartComponent implements OnDestroy {
  readonly options = input.required<DashChartOption>();
  readonly height = input(280);
  readonly chartClick = output<DashChartClick>();

  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private chart: echarts.ECharts | undefined;
  private resizeObserver: ResizeObserver | undefined;

  constructor() {
    afterNextRender(() => this.init());
    // Re-apply whenever the option object changes (data load, theme flip).
    effect(() => {
      const opts = this.options();
      if (this.chart) this.chart.setOption(opts, { notMerge: true });
    });
  }

  private init(): void {
    const el = this.host().nativeElement;
    this.chart = echarts.init(el);
    this.chart.setOption(this.options(), { notMerge: true });
    this.chart.on('click', (params) => {
      this.chartClick.emit({
        seriesName: typeof params.seriesName === 'string' ? params.seriesName : undefined,
        name: typeof params.name === 'string' ? params.name : undefined,
        dataIndex: typeof params.dataIndex === 'number' ? params.dataIndex : -1,
      });
    });
    this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
    this.resizeObserver.observe(el);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.chart?.dispose();
  }
}
