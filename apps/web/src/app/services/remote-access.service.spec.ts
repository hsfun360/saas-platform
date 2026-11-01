import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RemoteAccessService } from './remote-access.service';
import { environment } from '../../environments/environment';
import { RemoteAccessList } from '../models/auth.models';

const BASE = `${environment.apiUrl}/auth/account/remote-access`;
const EMPTY: RemoteAccessList = { pending: [], active: [], history: [], maxDays: 30 };

// One test per endpoint shape of the Access Requests screen, so a backend
// contract change fails here rather than on the screen.
describe('RemoteAccessService', () => {
  let service: RemoteAccessService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(RemoteAccessService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists the three groups and the ceiling from GET', () => {
    let got: RemoteAccessList | undefined;
    service.list().subscribe((r) => (got = r));
    const req = http.expectOne(BASE);
    expect(req.request.method).toBe('GET');
    req.flush(EMPTY);
    expect(got).toEqual(EMPTY);
  });

  it('approves with the days and note on the request id', () => {
    service.approve('g-1', 5, 'Until Friday').subscribe();
    const req = http.expectOne(`${BASE}/g-1/approve`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ days: 5, note: 'Until Friday' });
    req.flush({ message: 'ok', ...EMPTY });
  });

  it('rejects with the note only', () => {
    service.reject('g-1', null).subscribe();
    const req = http.expectOne(`${BASE}/g-1/reject`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ note: null });
    req.flush({ message: 'ok', ...EMPTY });
  });

  it('grants in advance with the user, days and note', () => {
    service.grant('u-1', 3, 'Conference').subscribe();
    const req = http.expectOne(`${BASE}/grants`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ userId: 'u-1', days: 3, note: 'Conference' });
    req.flush({ message: 'ok', ...EMPTY });
  });

  it('revokes with DELETE on the grant id', () => {
    service.revoke('g-2').subscribe();
    const req = http.expectOne(`${BASE}/g-2`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ message: 'ok', ...EMPTY });
  });
});
