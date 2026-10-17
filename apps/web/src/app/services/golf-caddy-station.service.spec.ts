import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { GolfCaddyStationService } from './golf-caddy-station.service';
import { environment } from '../../environments/environment';

// One test per endpoint shape (method, URL, payload keys) so a backend
// contract change fails here, not on the station screen.
describe('GolfCaddyStationService', () => {
  let service: GolfCaddyStationService;
  let http: HttpTestingController;
  const api = environment.apiUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(GolfCaddyStationService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the day and resolves a badge with the play date', () => {
    service.day('2026-10-17', 'course-1').subscribe();
    const day = http.expectOne((r) => r.url === `${api}/golf/caddy-station/day`);
    expect(day.request.params.get('playDate')).toBe('2026-10-17');
    expect(day.request.params.get('courseId')).toBe('course-1');
    day.flush({});

    service.resolve('C-001', '2026-10-17').subscribe();
    const res = http.expectOne((r) => r.url === `${api}/golf/caddy-station/resolve`);
    expect(res.request.params.get('code')).toBe('C-001');
    expect(res.request.params.get('playDate')).toBe('2026-10-17');
    res.flush({});
  });

  it('checks in by caddy id and work date, assigns next-up or a named caddy out of turn', () => {
    service.checkIn({ caddy: { id: 'c1' }, workDate: '2026-10-17' }).subscribe();
    const ci = http.expectOne(`${api}/golf/caddy-station/check-in`);
    expect(ci.request.method).toBe('POST');
    expect(ci.request.body).toEqual({ caddy: { id: 'c1' }, workDate: '2026-10-17' });
    ci.flush({ message: 'ok', attendance: {} });

    service.assign({ next: true, playerIds: ['p1'] }).subscribe();
    const next = http.expectOne(`${api}/golf/caddy-station/assign`);
    expect(next.request.body).toEqual({ next: true, playerIds: ['p1'] });
    next.flush({ message: 'ok', assignment: {} });

    service.assign({ caddy: { id: 'c2' }, playerIds: ['p1', 'p2'], requestedByName: true }).subscribe();
    const named = http.expectOne(`${api}/golf/caddy-station/assign`);
    expect(named.request.body.requestedByName).toBe(true);
    expect(named.request.body.caddy).toEqual({ id: 'c2' });
    named.flush({ message: 'ok', assignment: {} });
  });

  it('completes with holes played and swaps with a reason', () => {
    service.complete({ assignmentId: 'a1', holesPlayed: 9, note: null, checkOut: true }).subscribe();
    const done = http.expectOne(`${api}/golf/caddy-station/complete`);
    expect(done.request.body).toEqual({ assignmentId: 'a1', holesPlayed: 9, note: null, checkOut: true });
    done.flush({ message: 'ok', assignment: {} });

    service.swap({ assignmentId: 'a1', next: true, swapReason: 'unwell', swapHole: 7 }).subscribe();
    const swap = http.expectOne(`${api}/golf/caddy-station/swap`);
    expect(swap.request.body.swapReason).toBe('unwell');
    expect(swap.request.body.next).toBe(true);
    swap.flush({ message: 'ok', assignment: {}, swappedAssignment: {} });
  });
});
