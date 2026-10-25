import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FacilityTypeService } from './facility-type.service';

describe('FacilityTypeService', () => {
  let service: FacilityTypeService;
  let http: HttpTestingController;
  const base = '/api/facility/facility-types';

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(FacilityTypeService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the vocabularies from GET /api/facility/meta', () => {
    service.meta().subscribe();
    expect(http.expectOne('/api/facility/meta').request.method).toBe('GET');
  });

  it('lists, creates, patches and deletes facility types', () => {
    service.list().subscribe();
    expect(http.expectOne(base).request.method).toBe('GET');

    service.create({ code: 'BADMINTON', description: 'Badminton', usageMode: 'slot' }).subscribe();
    const post = http.expectOne(base);
    expect(post.request.method).toBe('POST');
    expect(post.request.body.usageMode).toBe('slot');

    service.update('t1', { isActive: false }).subscribe();
    const patch = http.expectOne(`${base}/t1`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ isActive: false });

    service.remove('t1').subscribe();
    expect(http.expectOne(`${base}/t1`).request.method).toBe('DELETE');
  });

  it('uploads the icon as multipart form data', () => {
    service.uploadIcon(new File(['x'], 'icon.png', { type: 'image/png' })).subscribe();
    const req = http.expectOne(`${base}/icon`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBe(true);
    expect((req.request.body as FormData).has('icon')).toBe(true);
  });

  it('drives the slot-set endpoints under the type', () => {
    const header = { dayScope: 'all', effectiveDate: '2026-11-01', firstSlotTime: '08:00', lastSlotTime: '21:00', slotMinutes: 60 };
    service.slotSets('t1').subscribe();
    expect(http.expectOne(`${base}/t1/slot-sets`).request.method).toBe('GET');

    service.previewSlots('t1', header).subscribe();
    const preview = http.expectOne(`${base}/t1/slot-sets/preview`);
    expect(preview.request.method).toBe('POST');
    expect(preview.request.body.slotMinutes).toBe(60);

    service.createSlotSet('t1', header).subscribe();
    expect(http.expectOne(`${base}/t1/slot-sets`).request.method).toBe('POST');

    service.updateSlotSet('t1', 's1', { slotMinutes: 90, regenerate: true }).subscribe();
    const patch = http.expectOne(`${base}/t1/slot-sets/s1`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body.regenerate).toBe(true);

    service.saveSlots('t1', 's1', [{ slotNumber: 1, startTime: '08:00', endTime: '09:00', isFrontDesk: false, isActive: true }]).subscribe();
    const put = http.expectOne(`${base}/t1/slot-sets/s1/slots`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body.slots.length).toBe(1);

    service.removeSlotSet('t1', 's1').subscribe();
    expect(http.expectOne(`${base}/t1/slot-sets/s1`).request.method).toBe('DELETE');
  });
});
