import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FacilitySettingService } from './facility-setting.service';

describe('FacilitySettingService', () => {
  let service: FacilitySettingService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(FacilitySettingService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads the specification document from GET /api/facility/settings', () => {
    let doc: { saved: boolean } | undefined;
    service.get().subscribe((d) => (doc = d));
    const req = http.expectOne('/api/facility/settings');
    expect(req.request.method).toBe('GET');
    req.flush({ advanceBookingDays: 7, saved: false, sessions: [] });
    expect(doc?.saved).toBe(false);
  });

  it('saves the whole document with PUT, sessions included', () => {
    service.save({
      advanceBookingDays: 10, advanceBookingHours: 2, allowSameDayBooking: true, bookingLockMinutes: 5,
      guestControlEnabled: true, allowGuestWeekday: true, allowMemberGuestWeekday: true, allowGuestWeekend: false, allowMemberGuestWeekend: true,
      noShowControlEnabled: false, cancellationNoticeHours: 24,
      sessions: [{ name: 'Morning', startTime: '07:00', endTime: '12:00' }],
    }).subscribe();
    const req = http.expectOne('/api/facility/settings');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.advanceBookingDays).toBe(10);
    expect(req.request.body.sessions[0].name).toBe('Morning');
    req.flush({ message: 'Facility specification saved.' });
  });
});
