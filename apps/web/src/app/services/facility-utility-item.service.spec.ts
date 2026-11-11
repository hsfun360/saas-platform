import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FacilityUtilityItemService } from './facility-utility-item.service';

describe('FacilityUtilityItemService', () => {
  let service: FacilityUtilityItemService;
  let http: HttpTestingController;
  const base = '/api/facility/utility-items';

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(FacilityUtilityItemService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists the items with their fee picker, and creates, patches and deletes one', () => {
    service.list().subscribe();
    expect(http.expectOne(base).request.method).toBe('GET');

    service.create({ code: 'TOWEL', description: 'Towels', trackUnits: false, returnRequired: true }).subscribe();
    const post = http.expectOne(base);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ code: 'TOWEL', description: 'Towels', trackUnits: false, returnRequired: true });

    service.update('i1', { isActive: false }).subscribe();
    const patch = http.expectOne(`${base}/i1`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ isActive: false });

    service.remove('i1').subscribe();
    expect(http.expectOne(`${base}/i1`).request.method).toBe('DELETE');
  });

  it('keeps the numbered units under their item', () => {
    service.units('i1').subscribe();
    expect(http.expectOne(`${base}/i1/units`).request.method).toBe('GET');

    service.createUnit('i1', { code: 'L001', location: 'Row A' }).subscribe();
    const post = http.expectOne(`${base}/i1/units`);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ code: 'L001', location: 'Row A' });

    service.updateUnit('i1', 'u1', { isActive: false }).subscribe();
    expect(http.expectOne(`${base}/i1/units/u1`).request.method).toBe('PATCH');

    service.removeUnit('i1', 'u1').subscribe();
    expect(http.expectOne(`${base}/i1/units/u1`).request.method).toBe('DELETE');
  });

  it('previews a generated range before adding it: the same route, told apart by the preview flag', () => {
    service.previewUnits('i1', { prefix: 'L', from: 1, to: 20, pad: 3 }).subscribe();
    const preview = http.expectOne(`${base}/i1/units/generate`);
    expect(preview.request.method).toBe('POST');
    expect(preview.request.body).toEqual({ prefix: 'L', from: 1, to: 20, pad: 3, preview: true });
    preview.flush({ codes: [], fresh: 0, existing: 0 });

    service.generateUnits('i1', { prefix: 'L', from: 1, to: 20, pad: 3 }).subscribe();
    expect(http.expectOne(`${base}/i1/units/generate`).request.body.preview).toBe(false);
  });
});
