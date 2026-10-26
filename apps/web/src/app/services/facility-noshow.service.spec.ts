import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FacilityNoShowService } from './facility-noshow.service';

describe('FacilityNoShowService', () => {
  let service: FacilityNoShowService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(FacilityNoShowService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists charges with the filters as query params and drives post, waive and re-price', () => {
    service.listCharges({ status: 'pending', from: '2026-10-01', q: 'FB' }).subscribe();
    const list = http.expectOne((r) => r.url === '/api/facility/no-show-charges');
    expect(list.request.params.get('status')).toBe('pending');
    expect(list.request.params.get('from')).toBe('2026-10-01');
    expect(list.request.params.get('q')).toBe('FB');
    list.flush({ charges: [], controlled: true, basis: 'booking' });

    service.postCharge('c1').subscribe();
    expect(http.expectOne('/api/facility/no-show-charges/c1/post').request.method).toBe('POST');

    service.waiveCharge('c1', 'Court was flooded', true).subscribe();
    const waive = http.expectOne('/api/facility/no-show-charges/c1/waive');
    expect(waive.request.body).toEqual({ reason: 'Court was flooded', clearStrike: true });
    waive.flush({ message: 'waived', charge: { id: 'c1' } });

    service.repriceCharge('c1').subscribe();
    expect(http.expectOne('/api/facility/no-show-charges/c1/reprice').request.method).toBe('POST');
  });

  it('lists, creates and lifts suspensions', () => {
    service.listSuspensions('active').subscribe();
    const list = http.expectOne((r) => r.url === '/api/facility/suspensions');
    expect(list.request.params.get('status')).toBe('active');
    list.flush({ suspensions: [], facilityTypes: [] });

    service.createSuspension({ memberNo: 'A1', fromDate: '2026-11-01', toDate: '2026-11-30', reason: 'Repeated no-shows' }).subscribe();
    const create = http.expectOne('/api/facility/suspensions');
    expect(create.request.method).toBe('POST');
    expect(create.request.body.toDate).toBe('2026-11-30');
    create.flush({ message: 'suspended', suspension: { id: 's1' } });

    service.liftSuspension('s1', 'Appeal upheld').subscribe();
    const lift = http.expectOne('/api/facility/suspensions/s1/lift');
    expect(lift.request.body.reason).toBe('Appeal upheld');
    lift.flush({ message: 'lifted', suspension: { id: 's1' } });
  });
});
