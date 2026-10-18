import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// Caddy Rounds (Golf Management → Front Desk → Caddy Rounds; 2026-10-18): the
// rounds-of-service report the club settles caddy pay from OUTSIDE the
// system - one row per caddy over a date range, with the detail of every
// round (golf.CaddyAssignment).

export interface GolfCaddyRoundsRow {
  caddyId: string;
  caddyNo: string;
  caddyName: string | null;
  caddyStatus: string | null;
  grade: { code: string; name: string } | null;
  group: { code: string; name: string } | null;
  rounds: number;
  roundsNotCounted: number;
  rounds9: number;
  rounds18: number;
  holesServed: number;
  golfersServed: number;
  requestedByName: number;
  open: number;
}

export interface GolfCaddyRoundsTotals {
  caddies: number;
  rounds: number;
  roundsNotCounted: number;
  rounds9: number;
  rounds18: number;
  holesServed: number;
  golfersServed: number;
  requestedByName: number;
  open: number;
}

export interface GolfCaddyRoundDetail {
  id: string;
  caddyId: string;
  caddyNo: string;
  playDate: string;
  teeTime: string | null;
  courseCode: string | null;
  holes: number;
  holesPlayed: number | null;
  status: 'assigned' | 'completed' | 'swapped';
  counts: boolean | null;
  requestedByName: boolean;
  swapReason: string | null;
  swapReasonLabel: string | null;
  swapHole: number | null;
  assignedAt: string;
  completedAt: string | null;
  players: { playerName: string; memberNo: string | null }[];
}

export interface GolfCaddyRoundsReport {
  dateFrom: string;
  dateTo: string;
  rows: GolfCaddyRoundsRow[];
  totals: GolfCaddyRoundsTotals;
  detail: GolfCaddyRoundDetail[];
  caddies: { id: string; caddyNo: string; name: string; status: string }[];
}

@Injectable({ providedIn: 'root' })
export class GolfCaddyRoundsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/golf/caddy-rounds`;

  report(filter: { dateFrom: string; dateTo: string; caddyId?: string }): Observable<GolfCaddyRoundsReport> {
    const params: Record<string, string> = { dateFrom: filter.dateFrom, dateTo: filter.dateTo };
    if (filter.caddyId) params['caddyId'] = filter.caddyId;
    return this.http.get<GolfCaddyRoundsReport>(this.base, { params });
  }
}

// A CSV cell: quoted when it carries a comma, a quote or a line break.
export function csvCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// The report as CSV text: the per-caddy summary, then the round detail.
export function caddyRoundsCsv(report: GolfCaddyRoundsReport): string {
  const lines: string[] = [];
  lines.push(['Caddy no', 'Name', 'Grade', 'Group', 'Rounds', 'Not counted', '9 holes', '18 holes', 'Holes served', 'Golfers served', 'Requested by name', 'Open'].map(csvCell).join(','));
  for (const r of report.rows) {
    lines.push([r.caddyNo, r.caddyName, r.grade?.name || '', r.group?.name || '', r.rounds, r.roundsNotCounted, r.rounds9, r.rounds18, r.holesServed, r.golfersServed, r.requestedByName, r.open].map(csvCell).join(','));
  }
  const t = report.totals;
  lines.push(['Total', `${t.caddies} caddies`, '', '', t.rounds, t.roundsNotCounted, t.rounds9, t.rounds18, t.holesServed, t.golfersServed, t.requestedByName, t.open].map(csvCell).join(','));
  lines.push('');
  lines.push(['Play date', 'Tee time', 'Course', 'Caddy no', 'Golfers', 'Holes', 'Holes played', 'Status', 'Counts', 'Requested by name', 'Swap reason', 'Swap hole'].map(csvCell).join(','));
  for (const d of report.detail) {
    lines.push([
      d.playDate, d.teeTime || '', d.courseCode || '', d.caddyNo,
      d.players.map((p) => p.playerName + (p.memberNo ? ` (${p.memberNo})` : '')).join('; '),
      d.holes, d.holesPlayed === null ? '' : d.holesPlayed, d.status,
      d.counts === null ? '' : (d.counts ? 'yes' : 'no'), d.requestedByName ? 'yes' : 'no', d.swapReasonLabel || '', d.swapHole === null ? '' : d.swapHole,
    ].map(csvCell).join(','));
  }
  return lines.join('\r\n');
}
