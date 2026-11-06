import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../environments/environment';

// Session heartbeat (2026-11-06). The API signs a superseded session out on
// its NEXT request (session.service.sessionIsLive), and an idle screen's only
// self-initiated request was the bell poll, once a minute - so a device ended
// by a newer sign-in elsewhere could sit for up to a minute before it learnt
// why. The shell starts this with the app: GET /api/auth/session (204) every
// HEARTBEAT_MS while the tab is visible, and once more the moment the tab
// regains focus. The response itself is ignored: a 401 goes through the auth
// interceptor like any other, which is what signs the device out and tells
// the sign-in screen the reason. A hidden tab is left alone (browsers throttle
// its timers anyway); it catches up on focus.
export const HEARTBEAT_MS = 15 * 1000;

@Injectable({ providedIn: 'root' })
export class SessionHeartbeatService {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);

  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly runningState = signal(false);
  readonly running = this.runningState.asReadonly();

  private readonly onVisible = () => {
    if (this.document.visibilityState === 'visible') this.ping();
  };

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.ping(), HEARTBEAT_MS);
    this.document.addEventListener('visibilitychange', this.onVisible);
    this.document.defaultView?.addEventListener('focus', this.onVisible);
    this.runningState.set(true);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.document.removeEventListener('visibilitychange', this.onVisible);
    this.document.defaultView?.removeEventListener('focus', this.onVisible);
    this.runningState.set(false);
  }

  // One heartbeat. Skipped when the tab is hidden or there is no session to
  // check (signed out already); errors are the interceptor's business.
  ping(): void {
    if (this.document.visibilityState === 'hidden') return;
    let token: string | null = null;
    try { token = localStorage.getItem('token'); } catch { return; }
    if (!token) return;
    this.http.get(`${environment.apiUrl}/auth/session`, { observe: 'response' }).subscribe({ error: () => {} });
  }
}
