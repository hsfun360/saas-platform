import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { SessionRefreshService } from './session-refresh.service';

// The one refresh seam: POST /api/auth/refresh single-flighted app-wide, the
// new token stored before anyone sees it, and the guard's one-attempt restore.
describe('SessionRefreshService', () => {
  let service: SessionRefreshService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SessionRefreshService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  describe('refresh', () => {
    it('POSTs an empty body to /auth/refresh with credentials, stores the token and emits it', () => {
      let emitted: string | undefined;
      service.refresh().subscribe((t) => (emitted = t));

      const req = http.expectOne('/api/auth/refresh');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      expect(req.request.withCredentials).toBe(true);
      req.flush({ token: 'fresh.token' });

      expect(emitted).toBe('fresh.token');
      expect(localStorage.getItem('token')).toBe('fresh.token');
    });

    it('shares ONE request between concurrent callers (the cookie rotates per call)', () => {
      const seen: string[] = [];
      service.refresh().subscribe((t) => seen.push(t));
      service.refresh().subscribe((t) => seen.push(t));

      http.expectOne('/api/auth/refresh').flush({ token: 'once' });

      expect(seen).toEqual(['once', 'once']);
    });

    it('makes a new request once the previous one has settled', () => {
      service.refresh().subscribe();
      http.expectOne('/api/auth/refresh').flush({ token: 'first' });

      service.refresh().subscribe();
      http.expectOne('/api/auth/refresh').flush({ token: 'second' });

      expect(localStorage.getItem('token')).toBe('second');
    });

    it('lets a failure through to the caller and does not store anything', () => {
      let failed = false;
      service.refresh().subscribe({ error: () => (failed = true) });
      http.expectOne('/api/auth/refresh').flush({ message: 'Session expired.' }, { status: 401, statusText: 'Unauthorized' });

      expect(failed).toBe(true);
      expect(localStorage.getItem('token')).toBeNull();
    });
  });

  describe('restoreSession', () => {
    it('emits true when the cookie yields a token', () => {
      let out: boolean | undefined;
      service.restoreSession().subscribe((v) => (out = v));
      http.expectOne('/api/auth/refresh').flush({ token: 'restored' });

      expect(out).toBe(true);
      expect(localStorage.getItem('token')).toBe('restored');
      expect(service.restoreFailed()).toBe(false);
    });

    it('emits false (never errors) when the refresh is refused, and remembers the failure', () => {
      let out: boolean | undefined;
      service.restoreSession().subscribe((v) => (out = v));
      http.expectOne('/api/auth/refresh').flush({ message: 'Session expired.' }, { status: 401, statusText: 'Unauthorized' });

      expect(out).toBe(false);
      expect(service.restoreFailed()).toBe(true);
    });

    it('does not call the API again after a failure', () => {
      service.restoreSession().subscribe();
      http.expectOne('/api/auth/refresh').flush(null, { status: 401, statusText: 'Unauthorized' });

      let out: boolean | undefined;
      service.restoreSession().subscribe((v) => (out = v));
      http.expectNone('/api/auth/refresh');
      expect(out).toBe(false);
    });

    it('re-arms one attempt after a valid token has been seen (a new sign-in)', () => {
      service.restoreSession().subscribe();
      http.expectOne('/api/auth/refresh').flush(null, { status: 401, statusText: 'Unauthorized' });

      service.noteValidToken();
      expect(service.restoreFailed()).toBe(false);

      let out: boolean | undefined;
      service.restoreSession().subscribe((v) => (out = v));
      http.expectOne('/api/auth/refresh').flush({ token: 'again' });
      expect(out).toBe(true);
    });
  });
});
