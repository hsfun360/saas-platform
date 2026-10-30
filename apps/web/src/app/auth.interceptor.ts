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

  const logoutToLogin = () => {
    console.warn('Unauthorized request - Logging out');
    localStorage.clear();
    router.navigate(['/login']);
  };

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      const status = error.status;
      const refreshable = (status === 401 || status === 403)
        && !NO_REFRESH.some(u => req.url.includes(u));

      // Access tokens are only 1h now - an expired one is NORMAL, not a
      // logout. Rotate the refresh cookie for a fresh token and replay the
      // request; only when THAT fails is the session really over.
      if (refreshable && isTokenProblem(error)) {
        return refreshThenRetry(session, req, next).pipe(
          catchError(() => {
            logoutToLogin();
            return throwError(() => error);
          }),
        );
      }

      // A 401 from the refresh endpoint itself is the refresh CALLER's verdict
      // to act on (the replay above logs out; the route guard's boot restore
      // falls through to /login on its own) - not a second logout here.
      if (status === 401 && !req.url.includes('/auth/refresh')) {
        logoutToLogin();
      }
      return throwError(() => error);
    })
  );
};

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
