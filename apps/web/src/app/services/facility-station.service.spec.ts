import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FacilityStationService } from './facility-station.service';

describe('FacilityStationService', () => {
  let service: FacilityStationService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(FacilityStationService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads the day picture from GET /today with the date', () => {
    service.today('2026-11-02').subscribe();
    const req = http.expectOne((r) => r.url === '/api/facility/station/today');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('date')).toBe('2026-11-02');
    req.flush({ date: '2026-11-02', types: [] });
  });

  it('checks a slot in with the dropped guest ids', () => {
    service.checkIn('s1', ['p2']).subscribe();
    const req = http.expectOne('/api/facility/station/check-ins');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ bookingSlotId: 's1', droppedParticipantIds: ['p2'] });
    req.flush({ message: 'checked in' });
  });

  it('registers an entry, signs out, saves guests', () => {
    service.register({ facilityTypeId: 't1', memberNo: 'A1', guests: [{ participantType: 'guest', name: 'Jane' }] }).subscribe();
    const reg = http.expectOne('/api/facility/station/registrations');
    expect(reg.request.body.guests[0].name).toBe('Jane');
    reg.flush({ message: 'registered', registrationId: 'r1' });

    service.signOut('r1').subscribe();
    expect(http.expectOne('/api/facility/station/registrations/r1/sign-out').request.method).toBe('POST');

    service.saveGuests('r1', []).subscribe();
    const g = http.expectOne('/api/facility/station/registrations/r1/guests');
    expect(g.request.method).toBe('PUT');
    g.flush({ message: 'saved' });
  });

  it('issues, returns, clears a unit and runs the end of day', () => {
    service.issue({ facilityTypeId: 't2', facilityId: 'u1', memberNo: 'A1' }).subscribe();
    http.expectOne('/api/facility/station/issues').flush({ message: 'issued', issueId: 'i1' });

    service.returnIssue('i1', { condition: 'damaged', remarks: 'door bent' }).subscribe();
    const ret = http.expectOne('/api/facility/station/issues/i1/return');
    expect(ret.request.body.condition).toBe('damaged');
    ret.flush({ message: 'returned' });

    service.clearUnit('u1').subscribe();
    expect(http.expectOne('/api/facility/station/units/u1/clear').request.method).toBe('POST');

    service.endOfDay('t2', '2026-11-02').subscribe();
    const eod = http.expectOne('/api/facility/station/end-of-day');
    expect(eod.request.body).toEqual({ facilityTypeId: 't2', date: '2026-11-02' });
    eod.flush({ message: 'done', signedOut: 0, overdue: 0 });
  });
});
