import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SecurityPolicyService } from './security-policy.service';
import { environment } from '../../environments/environment';
import { SecurityPolicyState } from '../models/auth.models';

const STATE: SecurityPolicyState = {
  mfaAvailable: true,
  mfaPolicy: 'required',
  mfaRequiredFrom: '2026-11-01',
  effective: false,
  users: 12,
  enrolled: 4,
  notEnrolled: 8,
};

describe('SecurityPolicyService', () => {
  let service: SecurityPolicyService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(SecurityPolicyService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads the policy from GET /auth/account/security-policy', () => {
    let got: SecurityPolicyState | undefined;
    service.get().subscribe((s) => (got = s));
    const req = http.expectOne(`${environment.apiUrl}/auth/account/security-policy`);
    expect(req.request.method).toBe('GET');
    req.flush(STATE);
    expect(got).toEqual(STATE);
  });

  it('writes the policy with PUT carrying exactly mfaPolicy and mfaRequiredFrom', () => {
    service.update({ mfaPolicy: 'required', mfaRequiredFrom: '2026-11-01' }).subscribe();
    const req = http.expectOne(`${environment.apiUrl}/auth/account/security-policy`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ mfaPolicy: 'required', mfaRequiredFrom: '2026-11-01' });
    req.flush({ message: 'Security policy updated.', ...STATE });
  });

  it('sends null for the date when the policy is optional', () => {
    service.update({ mfaPolicy: 'optional', mfaRequiredFrom: null }).subscribe();
    const req = http.expectOne(`${environment.apiUrl}/auth/account/security-policy`);
    expect(req.request.body).toEqual({ mfaPolicy: 'optional', mfaRequiredFrom: null });
    req.flush({ message: 'Security policy updated.', ...STATE, mfaPolicy: 'optional', mfaRequiredFrom: null });
  });
});
