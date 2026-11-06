import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { HEARTBEAT_MS, SessionHeartbeatService } from './session-heartbeat.service';

// The shell's session heartbeat: GET /api/auth/session every 15 s while the
// tab is visible, once more on focus, nothing when hidden or signed out.
describe('SessionHeartbeatService', () => {
  let service: SessionHeartbeatService;
  let http: HttpTestingController;
  let visibility: 'visible' | 'hidden';

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SessionHeartbeatService);
    http = TestBed.inject(HttpTestingController);
    localStorage.setItem('token', 'live.token');
  });

  afterEach(() => {
    service.stop();
    http.verify();
    localStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('pings GET /api/auth/session once per interval while running and stops cleanly', () => {
    service.start();
    expect(service.running()).toBe(true);
    http.expectNone('/api/auth/session');

    vi.advanceTimersByTime(HEARTBEAT_MS);
    const req = http.expectOne('/api/auth/session');
    expect(req.request.method).toBe('GET');
    req.flush(null, { status: 204, statusText: 'No Content' });

    vi.advanceTimersByTime(HEARTBEAT_MS);
    http.expectOne('/api/auth/session').flush(null, { status: 204, statusText: 'No Content' });

    service.stop();
    expect(service.running()).toBe(false);
    vi.advanceTimersByTime(HEARTBEAT_MS * 3);
    http.expectNone('/api/auth/session');
  });

  it('starting twice keeps ONE timer', () => {
    service.start();
    service.start();
    vi.advanceTimersByTime(HEARTBEAT_MS);
    http.expectOne('/api/auth/session').flush(null, { status: 204, statusText: 'No Content' });
  });

  it('a hidden tab is left alone and catches up the moment it is visible again', () => {
    service.start();
    visibility = 'hidden';
    vi.advanceTimersByTime(HEARTBEAT_MS * 2);
    http.expectNone('/api/auth/session');

    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    http.expectOne('/api/auth/session').flush(null, { status: 204, statusText: 'No Content' });
  });

  it('regaining window focus pings at once', () => {
    service.start();
    window.dispatchEvent(new Event('focus'));
    http.expectOne('/api/auth/session').flush(null, { status: 204, statusText: 'No Content' });
  });

  it('does not ping without a stored token (already signed out)', () => {
    localStorage.removeItem('token');
    service.start();
    vi.advanceTimersByTime(HEARTBEAT_MS);
    window.dispatchEvent(new Event('focus'));
    http.expectNone('/api/auth/session');
  });

  it('a failing heartbeat is swallowed here (the interceptor owns the sign-out)', () => {
    service.start();
    vi.advanceTimersByTime(HEARTBEAT_MS);
    expect(() => http.expectOne('/api/auth/session').flush({ message: 'ended', reason: 'session_superseded' }, { status: 401, statusText: 'Unauthorized' })).not.toThrow();
  });
});
