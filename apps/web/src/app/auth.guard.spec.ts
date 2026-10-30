import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { Observable, isObservable } from 'rxjs';

import { authGuard } from './auth.guard';
import { SessionRefreshService } from './session-refresh.service';

// Fake JWT: only the payload is decoded (base64 JSON), the signature is never
// checked client-side.
function jwt(payload: Record<string, unknown>): string {
  return `h.${btoa(JSON.stringify(payload))}.sig`;
}
const inAnHour = () => Math.floor(Date.now() / 1000) + 3600;
const anHourAgo = () => Math.floor(Date.now() / 1000) - 3600;

type Verdict = boolean | UrlTree;

// The shell gate: a valid token enters (purpose-scoped ones are routed to
// their flow); no valid token makes ONE silent refresh from the cookie and
// enters on success, else /login - and a failed restore is not retried on the
// next evaluation within the page load.
describe('authGuard', () => {
  let router: Router;
  let http: HttpTestingController;

  // The guard is sync when a token is valid and an Observable when it has to
  // ask the API; `run` normalises both so each test reads the same way.
  function run(): { sync: Verdict | undefined; async: () => Verdict | undefined } {
    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, { url: '/home' } as RouterStateSnapshot),
    ) as Verdict | Observable<Verdict>;
    let settled: Verdict | undefined;
    if (isObservable(result)) {
      result.subscribe((v) => (settled = v));
      return { sync: undefined, async: () => settled };
    }
    return { sync: result, async: () => result };
  }

  function expectRedirect(result: Verdict | undefined, url: string): void {
    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe(url);
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    router = TestBed.inject(Router);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  describe('with a valid token', () => {
    it('allows the route without touching the API', () => {
      localStorage.setItem('token', jwt({ exp: inAnHour() }));

      expect(run().sync).toBe(true);
      http.expectNone('/api/auth/refresh');
    });

    it('treats a token without exp as non-expiring', () => {
      localStorage.setItem('token', jwt({ sub: 'u1' }));

      expect(run().sync).toBe(true);
    });

    it('sends an onboarding-scoped token to the wizard', () => {
      localStorage.setItem('token', jwt({ exp: inAnHour(), purpose: 'onboarding' }));

      expectRedirect(run().sync, '/onboarding');
    });

    it('sends an mfa-enroll token to forced enrollment', () => {
      localStorage.setItem('token', jwt({ exp: inAnHour(), purpose: 'mfa-enroll' }));

      expectRedirect(run().sync, '/mfa-setup');
    });

    it('drops a token with an unknown purpose and goes to login', () => {
      localStorage.setItem('token', jwt({ exp: inAnHour(), purpose: 'something-else' }));

      expectRedirect(run().sync, '/login');
      expect(localStorage.getItem('token')).toBeNull();
      http.expectNone('/api/auth/refresh');
    });
  });

  describe('without a valid token', () => {
    it('restores the session from the refresh cookie when the token has expired', () => {
      localStorage.setItem('token', jwt({ exp: anHourAgo() }));
      const fresh = jwt({ exp: inAnHour() });

      const r = run();
      expect(r.sync).toBeUndefined();
      // The stale token is gone BEFORE the call, so no stale header rides along.
      expect(localStorage.getItem('token')).toBeNull();

      const req = http.expectOne('/api/auth/refresh');
      expect(req.request.method).toBe('POST');
      expect(req.request.withCredentials).toBe(true);
      req.flush({ token: fresh });

      expect(r.async()).toBe(true);
      expect(localStorage.getItem('token')).toBe(fresh);
    });

    it('restores when there is no token at all (the key was cleared)', () => {
      const r = run();
      http.expectOne('/api/auth/refresh').flush({ token: jwt({ exp: inAnHour() }) });

      expect(r.async()).toBe(true);
    });

    it('restores when the token is malformed', () => {
      localStorage.setItem('token', 'not-a-jwt');

      const r = run();
      http.expectOne('/api/auth/refresh').flush({ token: jwt({ exp: inAnHour() }) });

      expect(r.async()).toBe(true);
    });

    it('applies the purpose rules to the restored token too', () => {
      const r = run();
      http.expectOne('/api/auth/refresh').flush({ token: jwt({ exp: inAnHour(), purpose: 'onboarding' }) });

      expectRedirect(r.async(), '/onboarding');
    });

    it('falls through to /login when the cookie is gone or dead', () => {
      localStorage.setItem('token', jwt({ exp: anHourAgo() }));

      const r = run();
      http.expectOne('/api/auth/refresh').flush({ message: 'Session expired. Please log in again.' }, { status: 401, statusText: 'Unauthorized' });

      expectRedirect(r.async(), '/login');
      expect(localStorage.getItem('token')).toBeNull();
    });

    it('goes to /login on a network failure as well', () => {
      const r = run();
      http.expectOne('/api/auth/refresh').error(new ProgressEvent('error'));

      expectRedirect(r.async(), '/login');
    });

    it('does not retry a failed restore on the next evaluation', () => {
      run();
      http.expectOne('/api/auth/refresh').flush(null, { status: 401, statusText: 'Unauthorized' });

      const again = run();
      http.expectNone('/api/auth/refresh');
      expectRedirect(again.async(), '/login');
    });

    it('allows one more attempt once a new sign-in has been seen', () => {
      run();
      http.expectOne('/api/auth/refresh').flush(null, { status: 401, statusText: 'Unauthorized' });

      // The user signs in: a valid token appears and the guard sees it.
      localStorage.setItem('token', jwt({ exp: inAnHour() }));
      expect(run().sync).toBe(true);
      expect(TestBed.inject(SessionRefreshService).restoreFailed()).toBe(false);

      // ...an hour later it has expired again: one silent restore is allowed.
      localStorage.setItem('token', jwt({ exp: anHourAgo() }));
      const r = run();
      http.expectOne('/api/auth/refresh').flush({ token: jwt({ exp: inAnHour() }) });
      expect(r.async()).toBe(true);
    });

    it('shares the in-flight refresh with a concurrent caller (one rotation, not two)', () => {
      const r = run();
      let shared: string | undefined;
      TestBed.inject(SessionRefreshService).refresh().subscribe((t) => (shared = t));

      const fresh = jwt({ exp: inAnHour() });
      http.expectOne('/api/auth/refresh').flush({ token: fresh });

      expect(r.async()).toBe(true);
      expect(shared).toBe(fresh);
    });
  });
});
