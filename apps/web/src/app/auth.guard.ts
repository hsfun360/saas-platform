import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, map } from 'rxjs';
import { SessionRefreshService } from './session-refresh.service';

// Gate for the authenticated shell: requires a token that is present AND not
// expired. (HTTP 401s are also handled by the interceptor, which logs out - this
// rejects a stale token up front so the shell never even renders for it.)
//
// No valid token is NOT yet 'signed out': the 1h access token routinely expires
// between visits while the httpOnly refresh cookie (24h / 30 days) is still
// good. The guard then makes ONE silent POST /api/auth/refresh - the same
// single-flight call the interceptor uses - and lets the route through on
// success; on failure it falls through to /login exactly as before. A failed
// restore is remembered for the page load (SessionRefreshService), so a dead
// session never re-asks the API on every navigation.
export const authGuard: CanActivateFn = () => {
  const router = inject(Router);
  const session = inject(SessionRefreshService);
  const token = localStorage.getItem('token');

  if (token && !isTokenExpired(token)) {
    session.noteValidToken();
    return enterShell(token, router);
  }

  // No token, or expired / malformed - drop it, then try the refresh cookie.
  localStorage.removeItem('token');
  return restoreThenEnter(session, router);
};

// A valid token in hand: purpose-scoped tokens must never enter the shell -
// each goes to its own flow (onboarding wizard / forced MFA enrollment);
// anything else unknown → login.
function enterShell(token: string, router: Router): boolean | UrlTree {
  const purpose = tokenPurpose(token);
  if (purpose === 'onboarding') {
    return router.parseUrl('/onboarding');
  }
  if (purpose === 'mfa-enroll') {
    return router.parseUrl('/mfa-setup');
  }
  if (purpose) {
    localStorage.removeItem('token');
    return router.parseUrl('/login');
  }
  return true;
}

function restoreThenEnter(session: SessionRefreshService, router: Router): Observable<boolean | UrlTree> {
  return session.restoreSession().pipe(
    map((restored) => {
      const fresh = restored ? localStorage.getItem('token') : null;
      return fresh ? enterShell(fresh, router) : router.parseUrl('/login');
    }),
  );
}

// Gate for the forced-enrollment /mfa-setup page: only the 'mfa-enroll' token
// belongs there (self-service enrollment lives in Profile → Security instead).
export const mfaSetupGuard: CanActivateFn = () => {
  const router = inject(Router);
  const token = localStorage.getItem('token');

  if (token && !isTokenExpired(token)) {
    if (tokenPurpose(token) === 'mfa-enroll') {
      return true;
    }
    return router.parseUrl('/home');
  }

  localStorage.removeItem('token');
  return router.parseUrl('/login');
};

// Gate for the /onboarding wizard: only an onboarding-scoped token belongs
// there. A full workspace token goes to the app; anything else to login.
export const onboardingGuard: CanActivateFn = () => {
  const router = inject(Router);
  const token = localStorage.getItem('token');

  if (token && !isTokenExpired(token)) {
    if (tokenPurpose(token) === 'onboarding') {
      return true;
    }
    return router.parseUrl('/home');
  }

  localStorage.removeItem('token');
  return router.parseUrl('/login');
};

function decodePayload(token: string): Record<string, unknown> | null {
  try {
    return JSON.parse(atob(token.split('.')[1])) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function tokenPurpose(token: string): string | null {
  const payload = decodePayload(token);
  return payload && typeof payload['purpose'] === 'string' ? (payload['purpose'] as string) : null;
}

function isTokenExpired(token: string): boolean {
  const payload = decodePayload(token);
  if (!payload) return true; // malformed token → treat as invalid
  // `exp` is seconds since epoch. A token with no exp is treated as non-expiring.
  return typeof payload['exp'] === 'number' && Date.now() >= (payload['exp'] as number) * 1000;
}
