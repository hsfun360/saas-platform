import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { GolfCaddyRequestService } from './golf-caddy-request.service';
import { environment } from '../../environments/environment';

// One test per endpoint shape (method, URL, payload keys): the three doors a
// named-caddy request has - the booking, the desk and the station.
describe('GolfCaddyRequestService', () => {
  let service: GolfCaddyRequestService;
  let http: HttpTestingController;
  const api = environment.apiUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(GolfCaddyRequestService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('requests and cancels on the booking router with the play-date candidates', () => {
    service.candidatesForBooking('2026-10-18').subscribe();
    const cand = http.expectOne((r) => r.url === `${api}/golf/bookings/caddy-request-candidates`);
    expect(cand.request.params.get('playDate')).toBe('2026-10-18');
    cand.flush({ playDate: '2026-10-18', caddies: [] });

    service.requestForBooking('b1', { caddyId: 'c1', playerId: null, remarks: 'Mandarin please' }).subscribe();
    const req = http.expectOne(`${api}/golf/bookings/b1/caddy-requests`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ caddyId: 'c1', playerId: null, remarks: 'Mandarin please' });
    req.flush({ message: 'ok', request: {} });

    service.cancelFromBooking('r1').subscribe();
    const cancel = http.expectOne(`${api}/golf/bookings/caddy-requests/r1/cancel`);
    expect(cancel.request.body).toEqual({ reason: null });
    cancel.flush({ message: 'ok', request: {} });
  });

  it('requests on a golfer from the desk and records that the caddy cannot serve at the station', () => {
    service.requestForPlayer({ playerId: 'p1', caddyNo: 'C-002' }).subscribe();
    const req = http.expectOne(`${api}/golf/front-desk/caddy-requests`);
    expect(req.request.body).toEqual({ playerId: 'p1', caddyNo: 'C-002' });
    req.flush({ message: 'ok', request: {} });

    service.cancelFromDesk('r1', 'Changed mind').subscribe();
    const cancel = http.expectOne(`${api}/golf/front-desk/caddy-requests/r1/cancel`);
    expect(cancel.request.body).toEqual({ reason: 'Changed mind' });
    cancel.flush({ message: 'ok', request: {} });

    service.cancelByCaddy('r1', 'Unwell').subscribe();
    const byCaddy = http.expectOne(`${api}/golf/caddy-station/requests/r1/cancel-by-caddy`);
    expect(byCaddy.request.body).toEqual({ reason: 'Unwell' });
    byCaddy.flush({ message: 'ok', request: {} });
  });
});
