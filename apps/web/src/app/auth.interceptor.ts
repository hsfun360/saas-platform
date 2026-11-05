import { HttpInterceptorFn, HttpErrorResponse, HttpRequest, HttpHandlerFn, HttpEvent } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError, Observable } from 'rxjs';
import { SessionRefreshService } from './session-refresh.service';

// Endpoints where a 401/expired token must NOT trigger a refresh attempt:
// the auth flows themselves (login, refresh, mfa, ...) handle their own errors.
const NO_REFRESH = ['/auth/login', '/auth/google', '/auth/microsoft-login', '/auth/refresh', '/auth/logout', '/auth/mfa/'];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Auth routes get no stale Authorization header - but they DO need
  // credentials (the refresh cookie is set/sent on them).
  if (req.url.includes('/auth/login') || req.url.includes('/auth/google')) {
    return next(req.clone({ withCredentials: true }));
  }

  const router = inject(Router);
  const session = inject(SessionRefreshService);
  const token = localStorage.getItem('token');

  // Attach the access token AND send credentials (the httpOnly refresh cookie
  // rides along on /api/auth/* thanks to its path scope).
  let authReq = req.clone({ withCredentials: true });
  if (token) {
    authReq = authReq.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }

  // Local sign-out. A session ended by a newer sign-in elsewhere (the
  // organisation's limit on devices signed in at once, 2026-11-05) arrives as
  // a 401 whose body says `reason: 'session_superseded'` - from the request
  // itself or from the refresh that followed it; the API also sends
  // Clear-Site-Data for the app's cache and storage. Everything of the ended
  // session goes (both storages), and the sign-in screen is told why.
  // A reason given on THIS failure, or the one remembered from the first
  // failure of the same cascade (the API's Clear-Site-Data empties the token
  // before the later requests go out, so they fail as plain "no token").
  const logoutToLogin = (reason?: string) => {
    console.warn('Unauthorized request - Logging out');
    const why = session.endedReason() || reason || undefined;
    localStorage.clear();
    try { sessionStorage.clear(); } catch { /* storage may be unavailable; nothing to clear then */ }
    if (why === SESSION_SUPERSEDED) {
      router.navigate(['/login'], { queryParams: { reason: why } });
    } else {
      router.navigate(['/login']);
    }
  };

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      const status = error.status;
      const refreshable = (status === 401 || status === 403)
        && !NO_REFRESH.some(u => req.url.includes(u));

      // A session ended by a newer sign-in elsewhere is final: the API has
      // already revoked the refresh family, so there is nothing to refresh.
      // Remember why for the rest of this cascade and sign out now.
      if (status === 401 && endedReason(error) === SESSION_SUPERSEDED) {
        session.noteEndedReason(SESSION_SUPERSEDED);
        logoutToLogin(SESSION_SUPERSEDED);
        return throwError(() => error);
      }

      // Access tokens are only 1h now - an expired one is NORMAL, not a
      // logout. Rotate the refresh cookie for a fresh token and replay the
      // request; only when THAT fails is the session really over.
      if (refreshable && isTokenProblem(error)) {
        return refreshThenRetry(session, req, next).pipe(
          catchError((refreshError: HttpErrorResponse) => {
            logoutToLogin(endedReason(refreshError) || endedReason(error));
            return throwError(() => error);
          }),
        );
      }

      // A 401 from the refresh endpoint itself is the refresh CALLER's verdict
      // to act on (the replay above logs out; the route guard's boot restore
      // falls through to /login on its own) - not a second logout here.
      if (status === 401 && !req.url.includes('/auth/refresh')) {
        logoutToLogin(endedReason(error));
      }
      return throwError(() => error);
    })
  );
};

// The API's reason for an ended session, when its 401 body carries one.
export const SESSION_SUPERSEDED = 'session_superseded';
function endedReason(error: HttpErrorResponse | undefined): string | undefined {
  const reason = error?.error?.reason;
  return typeof reason === 'string' ? reason : undefined;
}

// Only refresh when the failure is about the TOKEN (expired/invalid), not a
// business 403 (no permission) - those must surface to the screen as-is.
function isTokenProblem(error: HttpErrorResponse): boolean {
  if (error.status === 401) return true;
  const msg = String(error.error?.message || '');
  return error.status === 403 && /invalid or expired token/i.test(msg);
}

// One refresh at a time app-wide (SessionRefreshService single-flights it, so
// simultaneous 401s - and a guard restore - all wait on the same call), then
// replay the request with the new token.
function refreshThenRetry(session: SessionRefreshService, req: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> {
  return session.refresh().pipe(
    switchMap((token) => next(req.clone({
      withCredentials: true,
      setHeaders: { Authorization: `Bearer ${token}` },
    }))),
  );
}
