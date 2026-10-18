import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { GolfCaddyRoundsService, caddyRoundsCsv, csvCell, GolfCaddyRoundsReport } from './golf-caddy-rounds.service';
import { environment } from '../../environments/environment';

describe('GolfCaddyRoundsService', () => {
  let service: GolfCaddyRoundsService;
  let http: HttpTestingController;
  const api = environment.apiUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(GolfCaddyRoundsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the report for a date range, the caddy filter only when given', () => {
    service.report({ dateFrom: '2026-10-01', dateTo: '2026-10-18' }).subscribe();
    const all = http.expectOne((r) => r.url === `${api}/golf/caddy-rounds`);
    expect(all.request.params.get('dateFrom')).toBe('2026-10-01');
    expect(all.request.params.get('dateTo')).toBe('2026-10-18');
    expect(all.request.params.has('caddyId')).toBe(false);
    all.flush({});

    service.report({ dateFrom: '2026-10-01', dateTo: '2026-10-18', caddyId: 'c1' }).subscribe();
    const one = http.expectOne((r) => r.url === `${api}/golf/caddy-rounds`);
    expect(one.request.params.get('caddyId')).toBe('c1');
    one.flush({});
  });

  it('quotes CSV cells that carry a comma or a quote and lays the summary before the detail', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a, b')).toBe('"a, b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('');

    const report: GolfCaddyRoundsReport = {
      dateFrom: '2026-10-01', dateTo: '2026-10-18',
      rows: [{ caddyId: 'c1', caddyNo: 'C-001', caddyName: 'Ali, Jr', caddyStatus: 'active', grade: { code: 'G', name: 'Gold' }, group: null, rounds: 2, roundsNotCounted: 1, rounds9: 0, rounds18: 2, holesServed: 36, golfersServed: 3, requestedByName: 1, open: 0 }],
      totals: { caddies: 1, rounds: 2, roundsNotCounted: 1, rounds9: 0, rounds18: 2, holesServed: 36, golfersServed: 3, requestedByName: 1, open: 0 },
      detail: [{ id: 'a1', caddyId: 'c1', caddyNo: 'C-001', playDate: '2026-10-18', teeTime: '08:00', courseCode: 'E1', holes: 18, holesPlayed: 18, status: 'completed', counts: true, requestedByName: true, swapReason: null, swapReasonLabel: null, swapHole: null, assignedAt: '', completedAt: null, players: [{ playerName: 'Ahmad', memberNo: 'M1' }] }],
      caddies: [],
    };
    const lines = caddyRoundsCsv(report).split('\r\n');
    expect(lines[0].startsWith('Caddy no,Name,Grade')).toBe(true);
    expect(lines[1]).toBe('C-001,"Ali, Jr",Gold,,2,1,0,2,36,3,1,0');
    expect(lines[2].startsWith('Total,1 caddies')).toBe(true);
    expect(lines[3]).toBe('');
    expect(lines[4].startsWith('Play date,Tee time')).toBe(true);
    expect(lines[5]).toBe('2026-10-18,08:00,E1,C-001,Ahmad (M1),18,18,completed,yes,yes,,');
  });
});
