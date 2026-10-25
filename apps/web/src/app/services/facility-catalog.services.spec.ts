import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FacilityParticipantTypeService } from './facility-participant-type.service';
import { FacilityTransactionTypeService } from './facility-transaction-type.service';
import { FacilityPaymentTypeService } from './facility-payment-type.service';

// The three slice-2a catalog services (one endpoint-shape test per call).
describe('Facility catalog services', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('participant types: list, create, update, toggle, delete', () => {
    const s = TestBed.inject(FacilityParticipantTypeService);
    const base = '/api/facility/participant-types';
    s.list().subscribe();
    expect(http.expectOne(base).request.method).toBe('GET');
    s.create({ code: 'JUNIOR', description: 'Junior', baseIdentity: 'member', requiresApproval: false, sortOrder: 10 }).subscribe();
    const post = http.expectOne(base);
    expect(post.request.method).toBe('POST');
    expect(post.request.body.baseIdentity).toBe('member');
    s.update('p1', { code: 'JUNIOR', description: 'Junior member', baseIdentity: 'member', requiresApproval: true, sortOrder: 10 }).subscribe();
    expect(http.expectOne(`${base}/p1`).request.method).toBe('PUT');
    s.setActive('p1', false).subscribe();
    const patch = http.expectOne(`${base}/p1`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ isActive: false });
    s.remove('p1').subscribe();
    expect(http.expectOne(`${base}/p1`).request.method).toBe('DELETE');
  });

  it('transaction types: meta, tax schemes, CRUD, icon and the rate cards with cells', () => {
    const s = TestBed.inject(FacilityTransactionTypeService);
    const base = '/api/facility/transaction-types';
    s.meta().subscribe();
    expect(http.expectOne(`${base}/meta`).request.method).toBe('GET');
    s.taxSchemes().subscribe();
    expect(http.expectOne(`${base}/tax-schemes`).request.method).toBe('GET');
    s.list().subscribe();
    expect(http.expectOne(base).request.method).toBe('GET');
    s.create({ transactionType: 'BADM', chargeType: 'facility-fee', feeBasis: 'per-slot' }).subscribe();
    const post = http.expectOne(base);
    expect(post.request.method).toBe('POST');
    expect(post.request.body.feeBasis).toBe('per-slot');
    s.update('t1', { description: 'Badminton court' }).subscribe();
    expect(http.expectOne(`${base}/t1`).request.method).toBe('PUT');
    s.setActive('t1', false).subscribe();
    expect(http.expectOne(`${base}/t1`).request.method).toBe('PATCH');
    s.uploadIcon(new File(['x'], 'i.png', { type: 'image/png' })).subscribe();
    expect((http.expectOne(`${base}/icon`).request.body as FormData).has('icon')).toBe(true);

    s.rates('t1').subscribe();
    expect(http.expectOne(`${base}/t1/rates`).request.method).toBe('GET');
    s.createRate('t1', { effectiveDate: '2026-11-01', cells: [{ participantType: 'member', dayScope: 'all', sessionId: null, amount: 12 }] }).subscribe();
    const rate = http.expectOne(`${base}/t1/rates`);
    expect(rate.request.method).toBe('POST');
    expect(rate.request.body.cells[0].amount).toBe(12);
    s.updateRate('t1', 'r1', { effectiveDate: '2026-11-01', flatAmount: 5 }).subscribe();
    expect(http.expectOne(`${base}/t1/rates/r1`).request.method).toBe('PUT');
    s.setRateActive('t1', 'r1', false).subscribe();
    expect(http.expectOne(`${base}/t1/rates/r1`).request.method).toBe('PATCH');
    s.deleteRate('t1', 'r1').subscribe();
    expect(http.expectOne(`${base}/t1/rates/r1`).request.method).toBe('DELETE');
  });

  it('payment types: meta, list, create, update, toggle, icon', () => {
    const s = TestBed.inject(FacilityPaymentTypeService);
    const base = '/api/facility/payment-types';
    s.meta().subscribe();
    expect(http.expectOne(`${base}/meta`).request.method).toBe('GET');
    s.list().subscribe();
    expect(http.expectOne(base).request.method).toBe('GET');
    s.create({ paymentType: 'CASH', paymentClass: 'cash' }).subscribe();
    const post = http.expectOne(base);
    expect(post.request.method).toBe('POST');
    expect(post.request.body.paymentClass).toBe('cash');
    s.update('y1', { description: 'Cash drawer' }).subscribe();
    expect(http.expectOne(`${base}/y1`).request.method).toBe('PUT');
    s.setActive('y1', true).subscribe();
    expect(http.expectOne(`${base}/y1`).request.method).toBe('PATCH');
    s.uploadIcon(new File(['x'], 'i.png', { type: 'image/png' })).subscribe();
    expect((http.expectOne(`${base}/icon`).request.body as FormData).has('icon')).toBe(true);
  });
});
