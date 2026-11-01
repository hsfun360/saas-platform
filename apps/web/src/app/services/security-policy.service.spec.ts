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
  trustedDevicesAllowed: true,
  trustedDeviceDays: 30,
  trustedDevices: 3,
  workstationTrustEnabled: false,
  workstations: 0,
  lockedRoles: 0,
  remoteAccessGrantMaxDays: 30,
  activeGrants: 0,
  pendingRequests: 0,
};

const STATION = { id: 'ws-1', name: 'Front Desk 1', device: 'Chrome on Windows', registeredBy: 'Yap Soon Kum', createdAt: '2026-11-01T01:00:00.000Z', expiresAt: '2027-11-01T01:00:00.000Z', lastUsedAt: null, ip: '203.0.113.9', current: true };

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

  it('writes the policy with PUT carrying the MFA rule, the trusted-device rule and the workstation switch', () => {
    service.update({ mfaPolicy: 'required', mfaRequiredFrom: '2026-11-01', trustedDevicesAllowed: false, trustedDeviceDays: 7, workstationTrustEnabled: true, remoteAccessGrantMaxDays: 14 }).subscribe();
    const req = http.expectOne(`${environment.apiUrl}/auth/account/security-policy`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ mfaPolicy: 'required', mfaRequiredFrom: '2026-11-01', trustedDevicesAllowed: false, trustedDeviceDays: 7, workstationTrustEnabled: true, remoteAccessGrantMaxDays: 14 });
    req.flush({ message: 'Security policy updated.', ...STATE });
  });

  it('sends null for the date when the policy is optional', () => {
    service.update({ mfaPolicy: 'optional', mfaRequiredFrom: null, trustedDevicesAllowed: true, trustedDeviceDays: 30, workstationTrustEnabled: false, remoteAccessGrantMaxDays: 30 }).subscribe();
    const req = http.expectOne(`${environment.apiUrl}/auth/account/security-policy`);
    expect(req.request.body).toEqual({ mfaPolicy: 'optional', mfaRequiredFrom: null, trustedDevicesAllowed: true, trustedDeviceDays: 30, workstationTrustEnabled: false, remoteAccessGrantMaxDays: 30 });
    req.flush({ message: 'Security policy updated.', ...STATE, mfaPolicy: 'optional', mfaRequiredFrom: null });
  });

  // ---- Registered workstations ----

  it('lists the organisation\'s workstations from GET /auth/account/workstations', () => {
    let got: unknown;
    service.listWorkstations().subscribe((r) => (got = r.workstations));
    const req = http.expectOne(`${environment.apiUrl}/auth/account/workstations`);
    expect(req.request.method).toBe('GET');
    req.flush({ workstations: [STATION] });
    expect(got).toEqual([STATION]);
  });

  it('registers this browser with a POST carrying only the name', () => {
    service.registerWorkstation('Front Desk 1').subscribe();
    const req = http.expectOne(`${environment.apiUrl}/auth/account/workstations`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'Front Desk 1' });
    req.flush({ message: 'ok', workstations: [STATION] });
  });

  it('revokes a workstation with DELETE on its id', () => {
    service.revokeWorkstation('ws-1').subscribe();
    const req = http.expectOne(`${environment.apiUrl}/auth/account/workstations/ws-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ message: 'ok', workstations: [] });
  });
});
