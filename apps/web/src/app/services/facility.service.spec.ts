import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FacilityService } from './facility.service';

describe('FacilityService', () => {
  let service: FacilityService;
  let http: HttpTestingController;
  const base = '/api/facility/facilities';

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(FacilityService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists all units, or one type\'s units through the query string', () => {
    service.list().subscribe();
    expect(http.expectOne(base).request.method).toBe('GET');
    service.list('t1').subscribe();
    const req = http.expectOne((r) => r.url === base && r.params.get('facilityTypeId') === 't1');
    expect(req.request.method).toBe('GET');
  });

  it('creates, patches and deletes a unit', () => {
    service.create({ facilityTypeId: 't1', code: 'BC1', name: 'Badminton Court 1' }).subscribe();
    const post = http.expectOne(base);
    expect(post.request.method).toBe('POST');
    expect(post.request.body.code).toBe('BC1');

    service.update('f1', { isActive: false }).subscribe();
    const patch = http.expectOne(`${base}/f1`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ isActive: false });

    service.remove('f1').subscribe();
    expect(http.expectOne(`${base}/f1`).request.method).toBe('DELETE');
  });

  it('uploads the picture as multipart form data', () => {
    service.uploadPicture(new File(['x'], 'court.jpg', { type: 'image/jpeg' })).subscribe();
    const req = http.expectOne(`${base}/picture`);
    expect(req.request.method).toBe('POST');
    expect((req.request.body as FormData).has('picture')).toBe(true);
  });
});
