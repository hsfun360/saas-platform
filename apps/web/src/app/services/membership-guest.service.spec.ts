import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MembershipGuestService } from './membership-guest.service';

describe('MembershipGuestService', () => {
  let service: MembershipGuestService;
  let http: HttpTestingController;
  const base = '/api/membership/guest-registrations';

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(MembershipGuestService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists registrations with the filters as query params', () => {
    service.list({ dateFrom: '2026-11-01', dateTo: '2026-11-30', status: 'registered' }).subscribe();
    const list = http.expectOne((r) => r.url === base);
    expect(list.request.method).toBe('GET');
    expect(list.request.params.get('dateFrom')).toBe('2026-11-01');
    expect(list.request.params.get('dateTo')).toBe('2026-11-30');
    expect(list.request.params.get('status')).toBe('registered');
    list.flush({ registrations: [], statuses: [], today: '2026-11-10', numberingMode: 'auto' });
  });

  it('looks the host up by member number and date, and searches returning guests', () => {
    service.host('A0018', '2026-11-14').subscribe();
    const host = http.expectOne((r) => r.url === `${base}/host`);
    expect(host.request.params.get('memberNo')).toBe('A0018');
    expect(host.request.params.get('visitDate')).toBe('2026-11-14');
    host.flush({ host: {}, allowance: null, visitDate: '2026-11-14' });

    service.searchGuests('mei').subscribe();
    const guests = http.expectOne((r) => r.url === `${base}/guests`);
    expect(guests.request.params.get('q')).toBe('mei');
    guests.flush({ guests: [] });
  });

  it('registers with POST (create grant) and drives every desk action with PUT (edit grant)', () => {
    const guest = { name: 'Lim Mei Ling', mobile: '+60123456789', email: null, identityNo: null };
    service.create({ memberNo: 'A0018', visitDate: '2026-11-14', guest, remarks: null, sendEmail: false }).subscribe();
    const create = http.expectOne(base);
    expect(create.request.method).toBe('POST');
    expect(create.request.body.guest.name).toBe('Lim Mei Ling');
    expect(create.request.body.sendEmail).toBe(false);
    create.flush({ message: 'ok', registration: { id: 'r1' }, pass: {} });

    service.update('r1', { guest, remarks: 'VIP' }).subscribe();
    const update = http.expectOne(`${base}/r1`);
    expect(update.request.method).toBe('PUT');
    expect(update.request.body.remarks).toBe('VIP');
    update.flush({ message: 'ok', registration: { id: 'r1' } });

    service.cancel('r1', 'Host cancelled').subscribe();
    const cancel = http.expectOne(`${base}/r1/cancel`);
    expect(cancel.request.method).toBe('PUT');
    expect(cancel.request.body).toEqual({ reason: 'Host cancelled' });
    cancel.flush({ message: 'ok', registration: { id: 'r1' } });

    service.arrive('r1').subscribe();
    expect(http.expectOne(`${base}/r1/arrive`).request.method).toBe('PUT');

    service.sendPass('r1', 'whatsapp').subscribe();
    const send = http.expectOne(`${base}/r1/send`);
    expect(send.request.method).toBe('PUT');
    expect(send.request.body).toEqual({ via: 'whatsapp' });
    send.flush({ message: 'ok', registration: { id: 'r1' } });
  });

  it('reads a pass, scans a code in the BODY (never the URL) and opens the public pass by token', () => {
    service.pass('r1').subscribe();
    expect(http.expectOne(`${base}/r1/pass`).request.method).toBe('GET');

    service.scan('https://app.example.com/guest-pass/abc').subscribe();
    const scan = http.expectOne(`${base}/scan`);
    expect(scan.request.method).toBe('PUT');
    expect(scan.request.body).toEqual({ code: 'https://app.example.com/guest-pass/abc' });
    scan.flush({ registration: { id: 'r1' } });

    service.publicPass('tok').subscribe();
    expect(http.expectOne('/api/membership/guest-pass/tok').request.method).toBe('GET');
  });

  it('asks the Guest Visits enquiry for a range and an optional member', () => {
    service.visits({ dateFrom: '2026-11-01', dateTo: '2026-11-30', memberNo: 'A0018' }).subscribe();
    const visits = http.expectOne((r) => r.url === '/api/membership/guest-visits');
    expect(visits.request.params.get('dateFrom')).toBe('2026-11-01');
    expect(visits.request.params.get('dateTo')).toBe('2026-11-30');
    expect(visits.request.params.get('memberNo')).toBe('A0018');
    visits.flush({ byMember: [], byGuest: [], totalVisits: 0, lineCount: 0, capped: false, dateFrom: '2026-11-01', dateTo: '2026-11-30' });
  });
});
