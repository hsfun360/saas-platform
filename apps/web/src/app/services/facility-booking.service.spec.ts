import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FacilityBookingService } from './facility-booking.service';

describe('FacilityBookingService', () => {
  let service: FacilityBookingService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(FacilityBookingService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads the day grid from GET /availability with the type and date as query params', () => {
    service.availability('t1', '2026-11-02').subscribe();
    const req = http.expectOne((r) => r.url === '/api/facility/bookings/availability');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('facilityTypeId')).toBe('t1');
    expect(req.request.params.get('date')).toBe('2026-11-02');
    req.flush({ columns: [], slots: [] });
  });

  it('reads the member context with the member number, type and date', () => {
    service.context('A0018', 't1', '2026-11-02').subscribe();
    const req = http.expectOne((r) => r.url === '/api/facility/bookings/context');
    expect(req.request.params.get('memberNo')).toBe('A0018');
    expect(req.request.params.get('facilityTypeId')).toBe('t1');
    req.flush({ member: { memberNo: 'A0018' }, window: {}, heldSlots: 0 });
  });

  it('claims slots with POST /locks and releases a group with DELETE /locks/:groupId', () => {
    service.claim({ facilityId: 'f1', bookingDate: '2026-11-02', startTimes: ['19:00', '20:00'], groupId: 'g1' }).subscribe();
    const claim = http.expectOne('/api/facility/bookings/locks');
    expect(claim.request.method).toBe('POST');
    expect(claim.request.body.startTimes).toEqual(['19:00', '20:00']);
    expect(claim.request.body.groupId).toBe('g1');
    claim.flush({ groupId: 'g1', expiresAt: '2026-11-02T10:00:00Z', slots: [] });

    service.release('g1').subscribe();
    const release = http.expectOne('/api/facility/bookings/locks/g1');
    expect(release.request.method).toBe('DELETE');
    release.flush({ message: 'Slots released.' });
  });

  it('creates a booking from the lock group with the booker, roster and contact', () => {
    service.create({
      lockGroupId: 'g1',
      booker: { kind: 'member', memberNo: 'A0018' },
      participants: [{ participantType: 'member', memberNo: 'A0018' }, { participantType: 'guest', name: 'Jane' }],
      hostMemberNo: null,
      contactMobile: '+60123456789',
      remarks: 'Doubles',
    }).subscribe();
    const req = http.expectOne('/api/facility/bookings');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.lockGroupId).toBe('g1');
    expect(req.request.body.booker.memberNo).toBe('A0018');
    expect(req.request.body.participants.length).toBe(2);
    req.flush({ message: 'Booking FB-00001 confirmed.', booking: { id: 'b1' } });
  });

  it('lists a day, searches, reads one booking, previews and posts a cancel, and saves participants', () => {
    service.list('2026-11-02', 't1').subscribe();
    const list = http.expectOne((r) => r.url === '/api/facility/bookings' && r.method === 'GET');
    expect(list.request.params.get('date')).toBe('2026-11-02');
    expect(list.request.params.get('facilityTypeId')).toBe('t1');
    list.flush({ bookings: [] });

    service.search('FB-0').subscribe();
    const search = http.expectOne((r) => r.url === '/api/facility/bookings/search');
    expect(search.request.params.get('q')).toBe('FB-0');
    search.flush({ bookings: [] });

    service.get('b1').subscribe();
    http.expectOne('/api/facility/bookings/b1').flush({ id: 'b1' });

    service.cancelPreview('b1').subscribe();
    http.expectOne('/api/facility/bookings/b1/cancel-preview').flush({ late: false });

    service.cancel('b1', 'Rain').subscribe();
    const cancel = http.expectOne('/api/facility/bookings/b1/cancel');
    expect(cancel.request.method).toBe('POST');
    expect(cancel.request.body.reason).toBe('Rain');
    cancel.flush({ message: 'Cancelled.', booking: { id: 'b1' } });

    service.saveParticipants('b1', { participants: [{ participantType: 'member', memberNo: 'A0018' }] }).subscribe();
    const roster = http.expectOne('/api/facility/bookings/b1/participants');
    expect(roster.request.method).toBe('PUT');
    expect(roster.request.body.participants[0].participantType).toBe('member');
    roster.flush({ message: 'Participants saved.', booking: { id: 'b1' } });
  });
});
