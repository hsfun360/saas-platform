import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';

import { authInterceptor } from './auth.interceptor';

// The interceptor's contract: Bearer + credentials on every call, a silent
// refresh-and-replay on an expired token (one refresh for any number of
// simultaneous failures), business 403s untouched, logout only when the
// session is really over.
describe('authInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let navigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    navigate = vi.fn().mockResolvedValue(true);
    TestBed.inject(Router).navigate = navigate as unknown as Router['navigate'];
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    backend.verify();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('outgoing requests', () => {
    it('attaches the stored token as a Bearer header and sends credentials', () => {
      localStorage.setItem('token', 'abc');
      http.get('/api/things').subscribe();

      const req = backend.expectOne('/api/things');
      expect(req.request.headers.get('Authorization')).toBe('Bearer abc');
      expect(req.request.withCredentials).toBe(true);
      req.flush([]);
    });

    it('sends credentials but no Authorization header when there is no token', () => {
      http.get('/api/things').subscribe();

      const req = backend.expectOne('/api/things');
      expect(req.request.headers.has('Authorization')).toBe(false);
      expect(req.request.withCredentials).toBe(true);
      req.flush([]);
    });

    it('never puts a stale token on the login call', () => {
      localStorage.setItem('token', 'stale');
      http.post('/api/auth/login', {}).subscribe();

      const req = backend.expectOne('/api/auth/login');
      expect(req.request.headers.has('Authorization')).toBe(false);
      expect(req.request.withCredentials).toBe(true);
      req.flush({});
    });
  });

  describe('expired token', () => {
    it('refreshes once and replays the request with the new token', () => {
      localStorage.setItem('token', 'old');
      let body: unknown;
      http.get('/api/things').subscribe((b) => (body = b));

      backend.expectOne('/api/things').flush({ message: 'Invalid or expired token' }, { status: 401, statusText: 'Unauthorized' });

      const refresh = backend.expectOne('/api/auth/refresh');
      expect(refresh.request.method).toBe('POST');
      expect(refresh.request.withCredentials).toBe(true);
      refresh.flush({ token: 'new' });

      const replay = backend.expectOne('/api/things');
      expect(replay.request.headers.get('Authorization')).toBe('Bearer new');
      replay.flush({ ok: true });

      expect(body).toEqual({ ok: true });
      expect(localStorage.getItem('token')).toBe('new');
      expect(navigate).not.toHaveBeenCalled();
    });

    it('treats a 403 "Invalid or expired token" like a 401', () => {
      localStorage.setItem('token', 'old');
      http.get('/api/things').subscribe();

      backend.expectOne('/api/things').flush({ message: 'Invalid or expired token.' }, { status: 403, statusText: 'Forbidden' });
      backend.expectOne('/api/auth/refresh').flush({ token: 'new' });
      backend.expectOne('/api/things').flush({});
    });

    it('makes ONE refresh for simultaneous failures and replays each request', () => {
      localStorage.setItem('token', 'old');
      http.get('/api/a').subscribe();
      http.get('/api/b').subscribe();

      backend.expectOne('/api/a').flush(null, { status: 401, statusText: 'Unauthorized' });
      backend.expectOne('/api/b').flush(null, { status: 401, statusText: 'Unauthorized' });

      backend.expectOne('/api/auth/refresh').flush({ token: 'new' });
      backend.expectNone('/api/auth/refresh');

      expect(backend.expectOne('/api/a').request.headers.get('Authorization')).toBe('Bearer new');
      expect(backend.expectOne('/api/b').request.headers.get('Authorization')).toBe('Bearer new');
    });

    it('logs out and surfaces the original error when the refresh itself fails', () => {
      localStorage.setItem('token', 'old');
      localStorage.setItem('userMenus', '[]');
      let error: HttpErrorResponse | undefined;
      http.get('/api/things').subscribe({ error: (e) => (error = e) });

      backend.expectOne('/api/things').flush(null, { status: 401, statusText: 'Unauthorized' });
      backend.expectOne('/api/auth/refresh').flush(null, { status: 401, statusText: 'Unauthorized' });

      expect(error?.status).toBe(401);
      expect(error?.url).toContain('/api/things');
      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('userMenus')).toBeNull();
      expect(navigate).toHaveBeenCalledWith(['/login']);
    });
  });

  describe('errors that are not about the token', () => {
    it('passes a business 403 (no permission) straight to the caller', () => {
      localStorage.setItem('token', 'ok');
      let error: HttpErrorResponse | undefined;
      http.get('/api/things').subscribe({ error: (e) => (error = e) });

      backend.expectOne('/api/things').flush({ message: 'You do not have permission.' }, { status: 403, statusText: 'Forbidden' });

      expect(error?.status).toBe(403);
      backend.expectNone('/api/auth/refresh');
      expect(navigate).not.toHaveBeenCalled();
    });

    it('leaves a 401 from the refresh endpoint to its caller (no logout here)', () => {
      let error: HttpErrorResponse | undefined;
      http.post('/api/auth/refresh', {}).subscribe({ error: (e) => (error = e) });

      backend.expectOne('/api/auth/refresh').flush(null, { status: 401, statusText: 'Unauthorized' });

      expect(error?.status).toBe(401);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('logs out on a 401 from an auth flow that cannot refresh (e.g. logout)', () => {
      localStorage.setItem('token', 'ok');
      http.post('/api/auth/logout', {}).subscribe({ error: () => undefined });

      backend.expectOne('/api/auth/logout').flush(null, { status: 401, statusText: 'Unauthorized' });

      backend.expectNone('/api/auth/refresh');
      expect(navigate).toHaveBeenCalledWith(['/login']);
    });
  });
});
