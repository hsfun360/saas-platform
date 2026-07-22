// Shared chart theming + date helpers for the Business Insights screens.
//
// Chart ink & series colors: ECharts paints to <canvas>, which cannot resolve
// CSS custom properties, so the theme pair is carried here instead of in
// styles.css - both modes from the validated dataviz reference palette
// (adjacent-pair CVD-safe order), switched on ThemeService.resolved().

export interface ChartInk {
  ink: string;
  inkSecondary: string;
  muted: string;
  grid: string;
  axis: string;
  series: string[];
  joins: string;
  expiries: string;
}

export const CHART_THEME: Record<'light' | 'dark', ChartInk> = {
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

// Recessive axis/grid defaults every insight chart shares.
export function axisCommon(ink: ChartInk) {
  return {
    axisLine: { lineStyle: { color: ink.axis } },
    axisTick: { show: false },
    axisLabel: { color: ink.muted, fontSize: 11 },
    splitLine: { lineStyle: { color: ink.grid } },
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function monthLabel(ym: string): string {
  const m = parseInt(ym.slice(5, 7), 10);
  return `${MONTHS[m - 1]} ${ym.slice(2, 4)}`;
}

export function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function monthBounds(ym: string): { from: string; to: string } {
  const lastDay = new Date(parseInt(ym.slice(0, 4), 10), parseInt(ym.slice(5, 7), 10), 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${String(lastDay).padStart(2, '0')}` };
}

export type PeriodPreset = 'thisMonth' | 'thisYear' | 'last12' | 'custom';

// Resolve a preset + custom inputs to a from/to pair (custom falls back to
// this-year until both bounds are picked).
export function computePeriod(preset: PeriodPreset, customFrom: string, customTo: string): { from: string; to: string } {
  const today = new Date();
  const to = dateOnly(today);
  switch (preset) {
    case 'thisMonth':
      return { from: to.slice(0, 8) + '01', to };
    case 'thisYear':
      return { from: to.slice(0, 5) + '01-01', to };
    case 'custom':
      if (customFrom && customTo) return { from: customFrom, to: customTo };
      return { from: to.slice(0, 5) + '01-01', to };
    default: {
      const d = new Date(today);
      d.setFullYear(d.getFullYear() - 1);
      d.setDate(d.getDate() + 1);
      return { from: dateOnly(d), to };
    }
  }
}
