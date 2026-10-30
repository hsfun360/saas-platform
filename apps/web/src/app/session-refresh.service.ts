import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, finalize, map, of, shareReplay, tap } from 'rxjs';
import { environment } from '../environments/environment';

// The ONE place the app exchanges the httpOnly refresh cookie for a fresh 1h
// access token (POST /api/auth/refresh). Two callers share it:
//
//   - the auth interceptor, when a request fails with an expired token while
//     the app is running (it then replays the request);
//   - the route guard, when a page load finds no valid token in localStorage
//     (a tab reopened hours later) - the silent "restore on boot".
//
// Sharing matters: the cookie ROTATES on every use and a replayed rotated
// token revokes the whole session family server-side, so simultaneous callers
// must wait on one in-flight call instead of racing the rotation.
@Injectable({ providedIn: 'root' })
export class SessionRefreshService {
  private readonly http = inject(HttpClient);

  // Single-flight: the HttpClient observable of the refresh in progress, or
  // null when none is. (An HttpClient stream is the sanctioned RxJS seam; the
  // state the app reads - below - is a signal.)
  private inFlight: Observable<string> | null = null;

  // Boot restore bookkeeping: true once a guard-driven restore has failed and
  // no valid token has been seen since. It stops the guard from calling the
  // API again on every navigation of a dead session (the user is on /login by
  // then); a later sign-in - which the guard observes as a valid token - arms
  // the next expiry for one more attempt.
  private readonly restoreFailedState = signal(false);
  readonly restoreFailed = this.restoreFailedState.asReadonly();

  // Rotate the cookie and store the new access token. Concurrent callers get
  // the same request; the stored token is written once, before any of them
  // sees the value.
  refresh(): Observable<string> {
    if (!this.inFlight) {
      this.inFlight = this.http
        .post<{ token: string }>(`${environment.apiUrl}/auth/refresh`, {}, { withCredentials: true })
        .pipe(
          map(({ token }) => token),
          tap((token) => localStorage.setItem('token', token)),
          shareReplay(1),
          finalize(() => { this.inFlight = null; }),
        );
    }
    return this.inFlight;
  }

  // The guard's silent restore: ONE attempt per signed-in session. Emits true
  // when a fresh token is now in localStorage, false when the cookie is gone
  // or dead (or a previous attempt already failed) - never errors.
  restoreSession(): Observable<boolean> {
    if (this.restoreFailedState()) return of(false);
    return this.refresh().pipe(
      map(() => true),
      catchError(() => {
        this.restoreFailedState.set(true);
        return of(false);
      }),
    );
  }

  // The guard found a valid token: a sign-in (or a successful refresh) has
  // happened since any failed restore, so the next expiry earns one attempt.
  noteValidToken(): void {
    if (this.restoreFailedState()) this.restoreFailedState.set(false);
  }
}
