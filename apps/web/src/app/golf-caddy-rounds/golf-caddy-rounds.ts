import { Component, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { ComboboxComponent } from '../shared/combobox/combobox';
import { LocalDatePipe, localDateOnly } from '../shared/local-date.pipe';
import { GolfCaddyRoundsService, GolfCaddyRoundsReport, GolfCaddyRoundsRow, GolfCaddyRoundDetail, caddyRoundsCsv } from '../services/golf-caddy-rounds.service';

// Golf Management → Front Desk → Caddy Rounds (/golf/caddy-rounds; user
// decision 2026-10-17: the club pays caddies OUTSIDE the system but every
// round of service is tracked). One card per caddy over the period - the
// rounds that count (completed, or swapped out for a reason that counts),
// the ones that do not (a complaint swap), 9 and 18 hole rounds, holes and
// golfers served, rounds requested by name - with the round detail folded
// under each card, and a CSV export of the whole report.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-golf-caddy-rounds',
  standalone: true,
  imports: [CommonModule, ScreenTitlePipe, ScreenSubtitlePipe, FavStarComponent, ComboboxComponent, LocalDatePipe],
  templateUrl: './golf-caddy-rounds.html',
  styleUrls: ['./golf-caddy-rounds.css'],
})
export class GolfCaddyRoundsComponent implements OnInit {
  private readonly service = inject(GolfCaddyRoundsService);

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly report = signal<GolfCaddyRoundsReport | null>(null);

  // The period defaults to the month to date - the usual pay period.
  readonly dateFrom = signal(localDateOnly().slice(0, 8) + '01');
  readonly dateTo = signal(localDateOnly());
  readonly caddyId = signal('');
  readonly search = signal('');
  readonly openDetail = signal<Set<string>>(new Set());

  readonly rows = computed(() => this.report()?.rows || []);
  readonly totals = computed(() => this.report()?.totals || null);
  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const list = this.rows();
    return q ? list.filter((r) => r.caddyNo.toLowerCase().includes(q) || (r.caddyName || '').toLowerCase().includes(q) || (r.grade?.name || '').toLowerCase().includes(q) || (r.group?.name || '').toLowerCase().includes(q)) : list;
  });
  readonly caddyOptions = computed(() => (this.report()?.caddies || []).map((c) => ({ value: c.id, label: `${c.caddyNo} - ${c.name}${c.status !== 'active' ? ' (' + c.status + ')' : ''}` })));

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    if (!this.dateFrom() || !this.dateTo()) return;
    this.loading.set(true);
    this.service.report({ dateFrom: this.dateFrom(), dateTo: this.dateTo(), caddyId: this.caddyId() }).subscribe({
      next: (r) => { this.report.set(r); this.loading.set(false); },
      error: (err) => { this.loading.set(false); this.errorMessage.set(err.error?.message || 'Failed to load the caddy rounds.'); },
    });
  }

  setDateFrom(v: string): void { if (v) { this.dateFrom.set(v); this.load(); } }
  setDateTo(v: string): void { if (v) { this.dateTo.set(v); this.load(); } }
  setCaddy(v: string | null): void { this.caddyId.set(v || ''); this.load(); }
  clearSearch(): void { this.search.set(''); }

  detailOf(r: GolfCaddyRoundsRow): GolfCaddyRoundDetail[] {
    return (this.report()?.detail || []).filter((d) => d.caddyId === r.caddyId);
  }

  isOpen(r: GolfCaddyRoundsRow): boolean {
    return this.openDetail().has(r.caddyId);
  }

  toggleDetail(r: GolfCaddyRoundsRow): void {
    this.openDetail.update((s) => {
      const next = new Set(s);
      if (next.has(r.caddyId)) next.delete(r.caddyId); else next.add(r.caddyId);
      return next;
    });
  }

  golfersOf(d: GolfCaddyRoundDetail): string {
    return d.players.map((p) => p.playerName).join(' and ');
  }

  roundText(d: GolfCaddyRoundDetail): string {
    if (d.status === 'assigned') return 'on the course';
    const holes = d.holesPlayed === null ? '' : ` · ${d.holesPlayed} of ${d.holes} holes`;
    if (d.status === 'swapped') return `swapped${d.swapHole ? ' at hole ' + d.swapHole : ''}${d.swapReasonLabel ? ' · ' + d.swapReasonLabel.toLowerCase() : ''}${holes}${d.counts ? '' : ' · not counted'}`;
    return `completed${holes}`;
  }

  // The whole report as a CSV file the browser saves (client-side; the data is already here).
  exportCsv(): void {
    const r = this.report();
    if (!r) return;
    const blob = new Blob(['﻿' + caddyRoundsCsv(r)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `caddy-rounds-${r.dateFrom}-to-${r.dateTo}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
