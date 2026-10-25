import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FacilityClosureService } from './facility-closure.service';

describe('FacilityClosureService', () => {
  let service: FacilityClosureService;
  let http: HttpTestingController;
  const base = '/api/facility/closure-plans';

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(FacilityClosureService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists plans with the picker options', () => {
    let got: { plans: unknown[] } | undefined;
    service.list().subscribe((l) => (got = l));
    const req = http.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush({ plans: [], types: [], facilities: [] });
    expect(got?.plans).toEqual([]);
  });

  it('creates a plan with the type and the picked units, patches and deletes it', () => {
    service.create({ facilityTypeId: 't1', facilityIds: ['f1', 'f2'], description: 'Resurfacing', dayScope: 'all', dateFrom: '2026-11-01', dateTo: '2026-11-03', startTime: null, endTime: null }).subscribe();
    const post = http.expectOne(base);
    expect(post.request.method).toBe('POST');
    expect(post.request.body.facilityIds).toEqual(['f1', 'f2']);

    service.update('p1', { isActive: false }).subscribe();
    const patch = http.expectOne(`${base}/p1`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ isActive: false });

    service.remove('p1').subscribe();
    expect(http.expectOne(`${base}/p1`).request.method).toBe('DELETE');
  });

  it('generates and saves the day rows under the plan', () => {
    service.generateDays('p1').subscribe();
    const gen = http.expectOne(`${base}/p1/generate-days`);
    expect(gen.request.method).toBe('POST');

    service.saveDays('p1', [{ closureDate: '2026-11-01', startTime: null, endTime: null, isActive: true }]).subscribe();
    const put = http.expectOne(`${base}/p1/days`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body.days.length).toBe(1);
  });
});
