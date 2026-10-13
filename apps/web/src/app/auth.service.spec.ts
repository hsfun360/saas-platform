import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { AuthService } from './auth.service';
import { MenuItem } from './models/auth.models';

// AuthService is a thin HTTP facade plus the login-time localStorage writes.
// Each test pins ONE endpoint's shape (method, URL, payload keys) so a backend
// contract change is caught here, not on the login screen.
describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  describe('login', () => {
    it('POSTs email, password, selectedCompanyId and rememberMe to /auth/login', () => {
      service.login('a@b.com', 'secret', 'company-1', true).subscribe();

      const req = http.expectOne('/api/auth/login');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        email: 'a@b.com',
        password: 'secret',
        selectedCompanyId: 'company-1',
        rememberMe: true,
      });
      req.flush({ token: 't' });
    });

    it('defaults rememberMe to false and leaves selectedCompanyId unset when no company was picked', () => {
      service.login('a@b.com', 'secret').subscribe();

      const req = http.expectOne('/api/auth/login');
      expect(req.request.body.rememberMe).toBe(false);
      expect(req.request.body.selectedCompanyId).toBeUndefined();
      expect(Object.keys(req.request.body)).toEqual(['email', 'password', 'selectedCompanyId', 'rememberMe']);
      req.flush({ token: 't' });
    });

    it('passes an explicit null selectedCompanyId through unchanged', () => {
      service.login('a@b.com', 'secret', null).subscribe();

      const req = http.expectOne('/api/auth/login');
      expect(req.request.body.selectedCompanyId).toBeNull();
      req.flush({ token: 't' });
    });
  });

  describe('googleLogin', () => {
    it('POSTs the Google access token and the chosen company to /auth/google', () => {
      service.googleLogin('google-access-token', 'company-2').subscribe();

      const req = http.expectOne('/api/auth/google');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ accessToken: 'google-access-token', selectedCompanyId: 'company-2' });
      req.flush({ token: 't' });
    });

    it('sends only the access token on a first (pre-picker) Google login', () => {
      service.googleLogin('google-access-token').subscribe();

      const req = http.expectOne('/api/auth/google');
      expect(req.request.body.accessToken).toBe('google-access-token');
      expect(req.request.body.selectedCompanyId).toBeUndefined();
      req.flush({ token: 't' });
    });
  });

  describe('other auth endpoints', () => {
    it('switchWorkspace POSTs the companyId to /auth/switch-workspace', () => {
      service.switchWorkspace('company-9').subscribe();

      const req = http.expectOne('/api/auth/switch-workspace');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ companyId: 'company-9' });
      req.flush({ token: 't' });
    });

    it('mfaVerify POSTs the mfa token, code and the remember-device flag', () => {
      service.mfaVerify('mfa-token', '123456', true).subscribe();

      const req = http.expectOne('/api/auth/mfa/verify');
      expect(req.request.body).toEqual({ mfaToken: 'mfa-token', code: '123456', rememberDevice: true });
      req.flush({ token: 't' });
    });

    it('logout POSTs an empty body to /auth/logout and does not touch local storage itself', () => {
      localStorage.setItem('token', 'jwt');
      service.logout().subscribe();

      const req = http.expectOne('/api/auth/logout');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush({ message: 'ok' });
      // Clearing storage is the interceptor's job on the 401 / explicit sign-out path.
      expect(localStorage.getItem('token')).toBe('jwt');
    });

    it('updateProfile PUTs camelCase fullName, phone and bio to /auth/profile (the API ignores full_name)', () => {
      service.updateProfile({ fullName: 'Ada Lovelace', phone: '+60123456789', bio: 'Analyst' }).subscribe();

      const req = http.expectOne('/api/auth/profile');
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ fullName: 'Ada Lovelace', phone: '+60123456789', bio: 'Analyst' });
      expect(Object.keys(req.request.body)).not.toContain('full_name');
      req.flush({ message: 'ok' });
    });

    it('getAccountAuditLog serialises only the filled filters as query params', () => {
      service.getAccountAuditLog({ tableName: 'Member', userEmail: '', page: 2, recordId: undefined }).subscribe();

      const req = http.expectOne((r) => r.url.startsWith('/api/auth/account/audit-log'));
      expect(req.request.method).toBe('GET');
      expect(req.request.url).toBe('/api/auth/account/audit-log?tableName=Member&page=2');
      req.flush({ rows: [], total: 0 });
    });
  });

  describe('local token and menu storage', () => {
    it('storeToken writes the JWT under "token"', () => {
      service.storeToken('jwt-value');
      expect(localStorage.getItem('token')).toBe('jwt-value');
    });

    it('setEmail writes the email under "userEmail"', () => {
      service.setEmail('me@example.com');
      expect(localStorage.getItem('userEmail')).toBe('me@example.com');
    });

    it('storeUserMenus writes the granted menus as JSON and ignores an undefined payload', () => {
      const menus: MenuItem[] = [{ name: 'Courses', route: '/golf/courses', moduleCode: 'GOLF' }];
      service.storeUserMenus(menus);
      expect(JSON.parse(localStorage.getItem('userMenus') || '[]')).toEqual(menus);

      service.storeUserMenus(undefined);
      expect(JSON.parse(localStorage.getItem('userMenus') || '[]')).toEqual(menus);
    });
  });

  describe('avatar state', () => {
    it('exposes and persists a new avatar URL as a signal', () => {
      service.updateAvatarState('https://cdn/avatar.png');

      expect(localStorage.getItem('profilePicture')).toBe('https://cdn/avatar.png');
      expect(service.avatar()).toBe('https://cdn/avatar.png');
    });

    it('resets to the default avatar and clears storage on an empty value (no lingering SSO picture)', () => {
      localStorage.setItem('profilePicture', 'https://cdn/old.png');

      service.updateAvatarState('');

      expect(localStorage.getItem('profilePicture')).toBeNull();
      expect(service.avatar()).toBe('assets/default-avatar.svg');
    });

    it('exposes the display name as a signal', () => {
      expect(service.fullName()).toBe('Loading...');
      service.updateFullNameState('Yap Soon Kum');
      expect(service.fullName()).toBe('Yap Soon Kum');
    });
  });
});
