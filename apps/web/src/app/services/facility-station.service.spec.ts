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

  it('scans a code or redraws a person, issues to a pass holder with the panel, and undoes a tap', () => {
    service.scan({ code: 'https://club/guest-pass/abc' }).subscribe();
    const scan = http.expectOne('/api/facility/station/scan');
    expect(scan.request.method).toBe('POST');
    expect(scan.request.body).toEqual({ code: 'https://club/guest-pass/abc' });
    scan.flush({ panel: { kind: 'guest', tiles: [] } });

    service.scan({ guestRegistrationId: 'g1' }).subscribe();
    expect(http.expectOne('/api/facility/station/scan').request.body).toEqual({ guestRegistrationId: 'g1' });

    service.issue({ utilityItemId: 'i2', utilityUnitId: 'u1', quantity: 1, guestRegistrationId: 'g1', memberNo: null, panel: true }).subscribe();
    const issue = http.expectOne('/api/facility/station/issues');
    expect(issue.request.body).toEqual({ utilityItemId: 'i2', utilityUnitId: 'u1', quantity: 1, guestRegistrationId: 'g1', memberNo: null, panel: true });
    issue.flush({ message: 'issued', issueId: 'x1', panel: null });

    service.undoIssue('x1').subscribe();
    const undo = http.expectOne('/api/facility/station/issues/x1/undo');
    expect(undo.request.method).toBe('POST');
    undo.flush({ message: 'undone' });

    service.returnIssue('x1', { condition: 'good', panel: true }).subscribe();
    expect(http.expectOne('/api/facility/station/issues/x1/return').request.body).toEqual({ condition: 'good', panel: true });
  });

  it('issues, returns, clears a unit and runs the end of day', () => {
    service.issue({ utilityItemId: 'i2', utilityUnitId: 'u1', memberNo: 'A1' }).subscribe();
    const issue = http.expectOne('/api/facility/station/issues');
    expect(issue.request.body).toEqual({ utilityItemId: 'i2', utilityUnitId: 'u1', memberNo: 'A1' });
    issue.flush({ message: 'issued', issueId: 'i1' });

    service.returnIssue('i1', { condition: 'damaged', remarks: 'door bent' }).subscribe();
    const ret = http.expectOne('/api/facility/station/issues/i1/return');
    expect(ret.request.body.condition).toBe('damaged');
    ret.flush({ message: 'returned' });

    service.clearUnit('u1').subscribe();
    expect(http.expectOne('/api/facility/station/units/u1/clear').request.method).toBe('POST');

    service.markNoShows(['s9']).subscribe();
    const ns = http.expectOne('/api/facility/station/no-shows');
    expect(ns.request.body).toEqual({ slotIds: ['s9'] });
    ns.flush({ message: 'marked', marked: 1 });

    service.enrolWalkIn({ classId: 'c1', sessionId: 'x1', memberNo: 'A1' }).subscribe();
    const walk = http.expectOne('/api/facility/station/class-enrolments');
    expect(walk.request.method).toBe('POST');
    expect(walk.request.body.sessionId).toBe('x1');
    walk.flush({ message: 'enrolled' });

    service.endOfDay('t2', '2026-11-02').subscribe();
    const eod = http.expectOne('/api/facility/station/end-of-day');
    expect(eod.request.body).toEqual({ facilityTypeId: 't2', date: '2026-11-02' });
    eod.flush({ message: 'done', signedOut: 0, overdue: 0 });
  });
});
