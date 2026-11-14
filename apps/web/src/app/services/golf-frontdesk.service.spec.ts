import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GolfFrontDeskService } from './golf-frontdesk.service';

// The walk-in's host member (2026-11-13): a guest is registered under a host
// whose guest standing and passes the desk reads first; a visitor has none.
describe('GolfFrontDeskService - the walk-in host member', () => {
  let service: GolfFrontDeskService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(GolfFrontDeskService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads the host\'s guest standing and passes from GET /host-guests', () => {
    let left: number | null | undefined;
    service.hostGuests('G-001', '2026-11-21').subscribe((res) => (left = res.guests.remaining));
    const req = http.expectOne((r) => r.url === '/api/golf/front-desk/host-guests');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('memberNo')).toBe('G-001');
    expect(req.request.params.get('playDate')).toBe('2026-11-21');
    req.flush({ host: { memberNo: 'G-001', name: 'Tan', membershipTypeCategory: 'Gold', statusLabel: 'Active', actionControl: 'allow' }, guests: { quota: 3, allowance: 4, used: 3, remaining: 1, date: '2026-11-21' }, passes: [] });
    expect(left).toBe(1);
  });

  it('registers a guest walk-in under the host, with the pass it names', () => {
    service.registerWalkIn({
      playDate: '2026-11-21', courseId: 'c1', teeTime: '08:00', holes: 18, playerType: 'guest',
      hostMemberNo: 'G-001', guestId: 'g1', guest: { name: 'Lee' },
    }).subscribe();
    const req = http.expectOne('/api/golf/front-desk/registrations');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.walkIn.hostMemberNo).toBe('G-001');
    expect(req.request.body.walkIn.guestId).toBe('g1');
    expect(req.request.body.walkIn.guest.name).toBe('Lee');
    req.flush({ message: 'Registered Lee.', registration: {} });
  });

  it('registers a visitor walk-in with no host', () => {
    service.registerWalkIn({ playDate: '2026-11-21', courseId: 'c1', teeTime: '08:00', holes: 9, playerType: 'visitor', guest: { name: 'Walk-in Wong' } }).subscribe();
    const req = http.expectOne('/api/golf/front-desk/registrations');
    expect(req.request.body.walkIn.playerType).toBe('visitor');
    expect('hostMemberNo' in req.request.body.walkIn).toBe(false);
    req.flush({ message: 'Registered.', registration: {} });
  });
});
