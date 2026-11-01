import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { AdminService } from './admin.service';
import { TenantUser } from '../models/auth.models';
import { environment } from '../../environments/environment';

const BASE = `${environment.apiUrl}/admin`;

// One test per endpoint shape of the Tenant Admin recovery surface, so a
// backend contract change fails here rather than on Subscriber Management.
describe('AdminService (Tenant Admin recovery)', () => {
  let service: AdminService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdminService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists a company\'s users, carrying the mfaEnabled flag the screen gates the reset on', () => {
    let users: TenantUser[] = [];
    service.getCompanyUsers('company-A').subscribe((u) => (users = u));

    const req = http.expectOne(`${BASE}/companies/company-A/users`);
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 'u-1', email: 'admin@acme.test', roleName: 'Tenant Admin', mfaEnabled: true }]);

    expect(users[0].mfaEnabled).toBe(true);
  });

  it('transfers the Tenant Admin with the chosen user id in the body', () => {
    service.setTenantAdmin('company-A', 'u-2').subscribe();

    const req = http.expectOne(`${BASE}/companies/company-A/tenant-admin`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ userId: 'u-2' });
    req.flush({ message: 'ok' });
  });

  it('resets a user\'s two-factor authentication with a POST to the platform reset endpoint', () => {
    let message = '';
    service.resetUserMfa('u-1').subscribe((r) => (message = r.message));

    const req = http.expectOne(`${BASE}/users/u-1/mfa/reset`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ message: 'Two-factor authentication has been reset for this user.' });

    expect(message).toContain('has been reset');
  });
});
