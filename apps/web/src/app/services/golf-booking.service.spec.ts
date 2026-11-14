import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GolfBookingService } from './golf-booking.service';

// The member's guests on the booking screen (2026-11-13): the booker's guest
// standing, their guest passes for the date, the class a keyed member line
// will take, and the pass a guest line names on the save.
describe('GolfBookingService - the member\'s guests', () => {
  let service: GolfBookingService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(GolfBookingService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads the context with the play date so the guest allowance is of the right month', () => {
    let remaining: number | null | undefined;
    service.context('G-001', '2026-12-05').subscribe((ctx) => (remaining = ctx.guests?.remaining));
    const req = http.expectOne((r) => r.url === '/api/golf/bookings/context');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('memberNo')).toBe('G-001');
    expect(req.request.params.get('playDate')).toBe('2026-12-05');
    req.flush({ member: {}, window: {}, courses: [], meta: {}, guests: { quota: 3, allowance: 4, used: 1, remaining: 3, date: '2026-12-05' } });
    expect(remaining).toBe(3);
  });

  it('leaves the play date out of the context call when none is given', () => {
    service.context('G-001').subscribe();
    const req = http.expectOne((r) => r.url === '/api/golf/bookings/context');
    expect(req.request.params.has('playDate')).toBe(false);
    req.flush({});
  });

  it('lists the booker\'s guest passes for the date from GET /guest-passes', () => {
    let names: string[] = [];
    service.guestPasses('G-001', '2026-11-21').subscribe((res) => (names = res.passes.map((p) => p.guestName)));
    const req = http.expectOne((r) => r.url === '/api/golf/bookings/guest-passes');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('memberNo')).toBe('G-001');
    expect(req.request.params.get('playDate')).toBe('2026-11-21');
    req.flush({ passes: [{ guestId: 'g1', guestName: 'Lee', registrationNo: 'G2611-00001', status: 'registered' }], guests: { quota: null, allowance: null, used: 0, remaining: null, date: '2026-11-21' } });
    expect(names).toEqual(['Lee']);
  });

  it('asks which class a member line takes on the locked flight (a read, GET /line-check)', () => {
    let asGuest: boolean | undefined;
    service.lineCheck({ memberNo: 'G-001', lineMemberNo: 'S-009', playerType: 'member', lockGroupId: 'lock-1' }).subscribe((r) => (asGuest = r.playsAsGuest));
    const req = http.expectOne((r) => r.url === '/api/golf/bookings/line-check');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('lineMemberNo')).toBe('S-009');
    expect(req.request.params.get('lockGroupId')).toBe('lock-1');
    expect(req.request.params.has('bookingId')).toBe(false);
    req.flush({ memberNo: 'S-009', name: 'Lim', playerType: 'member-guest', playerTypeLabel: 'Member as Guest', playsAsGuest: true, reason: 'outside the playing rights of Member' });
    expect(asGuest).toBe(true);
  });

  it('checks a line against the booking\'s current flight when no flight is locked', () => {
    service.lineCheck({ memberNo: 'G-001', lineMemberNo: 'S-009', playerType: 'member', bookingId: 'b1' }).subscribe();
    const req = http.expectOne((r) => r.url === '/api/golf/bookings/line-check');
    expect(req.request.params.get('bookingId')).toBe('b1');
    expect(req.request.params.has('lockGroupId')).toBe(false);
    req.flush({});
  });

  it('carries the picked guest pass on the guest line of the save', () => {
    service.create({
      lockGroupId: 'lock-1', memberNo: 'G-001', holes: 18,
      players: [{ playerType: 'member', memberNo: 'G-001' }, { playerType: 'guest', guestName: 'Lee', guestId: 'g1' }],
    }).subscribe();
    const req = http.expectOne('/api/golf/bookings');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.players[1]).toEqual({ playerType: 'guest', guestName: 'Lee', guestId: 'g1' });
    req.flush({ message: 'Booking confirmed.', booking: {} });
  });
});
