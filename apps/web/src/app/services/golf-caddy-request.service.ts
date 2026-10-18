import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// Named-caddy requests (user decisions 2026-10-18): a player asks for a
// PARTICULAR caddy ahead of play. The request is keyed on the booking (Golf
// Booking) or at the desk on a booked / registered golfer (Tee Time Sheet),
// confirmed when the caddy checks in on the day, fulfilled when the Caddy
// Station assigns that caddy to that flight, cancelled by the player (or
// with the booking) or by the caddy, or lapsed once the tee time passed.
// ONE live request per caddy per play date.

export type GolfCaddyRequestStatus = 'requested' | 'confirmed' | 'fulfilled' | 'cancelled-by-player' | 'cancelled-by-caddy' | 'lapsed';

export interface GolfCaddyRequest {
  id: string;
  caddyId: string;
  caddyNo: string;
  caddyName?: string;
  bookingProfileId: string | null;
  playerId: string | null;
  playDate: string;
  teeTime: string | null;
  courseId: string | null;
  source: 'booking' | 'desk' | 'portal';
  status: GolfCaddyRequestStatus;
  statusLabel: string;
  requestedAt: string;
  confirmedAt: string | null;
  fulfilledAt: string | null;
  caddyAssignmentId: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  remarks: string | null;
  live: boolean;
}

// A caddy that may be requested for a date: active, not on leave; `requestedAt`
// names the tee time of the live request already holding them (or null).
export interface GolfCaddyRequestCandidate {
  id: string;
  caddyNo: string;
  name: string;
  languages: string | null;
  grade: { code: string; name: string; playersPerCaddy: number } | null;
  requestedAt: string | null;
}

export interface GolfCaddyRequestPayload {
  caddyId?: string;
  caddyNo?: string;
  playerId?: string | null;
  remarks?: string | null;
}

@Injectable({ providedIn: 'root' })
export class GolfCaddyRequestService {
  private readonly http = inject(HttpClient);
  private readonly bookings = `${environment.apiUrl}/golf/bookings`;
  private readonly desk = `${environment.apiUrl}/golf/front-desk`;
  private readonly station = `${environment.apiUrl}/golf/caddy-station`;

  // ---- from Golf Booking (the booking's grant) ----

  candidatesForBooking(playDate: string): Observable<{ playDate: string; caddies: GolfCaddyRequestCandidate[] }> {
    return this.http.get<{ playDate: string; caddies: GolfCaddyRequestCandidate[] }>(`${this.bookings}/caddy-request-candidates`, { params: { playDate } });
  }

  requestForBooking(bookingId: string, payload: GolfCaddyRequestPayload): Observable<{ message: string; request: GolfCaddyRequest }> {
    return this.http.post<{ message: string; request: GolfCaddyRequest }>(`${this.bookings}/${bookingId}/caddy-requests`, payload);
  }

  cancelFromBooking(requestId: string, reason?: string | null): Observable<{ message: string; request: GolfCaddyRequest }> {
    return this.http.post<{ message: string; request: GolfCaddyRequest }>(`${this.bookings}/caddy-requests/${requestId}/cancel`, { reason: reason || null });
  }

  // ---- from the Tee Time Sheet (the front desk's grant) ----

  candidatesForDesk(playDate: string): Observable<{ playDate: string; caddies: GolfCaddyRequestCandidate[] }> {
    return this.http.get<{ playDate: string; caddies: GolfCaddyRequestCandidate[] }>(`${this.desk}/caddy-request-candidates`, { params: { playDate } });
  }

  requestForPlayer(payload: GolfCaddyRequestPayload & { playerId: string }): Observable<{ message: string; request: GolfCaddyRequest }> {
    return this.http.post<{ message: string; request: GolfCaddyRequest }>(`${this.desk}/caddy-requests`, payload);
  }

  cancelFromDesk(requestId: string, reason?: string | null): Observable<{ message: string; request: GolfCaddyRequest }> {
    return this.http.post<{ message: string; request: GolfCaddyRequest }>(`${this.desk}/caddy-requests/${requestId}/cancel`, { reason: reason || null });
  }

  // ---- from the Caddy Station: the caddy cannot serve ----

  cancelByCaddy(requestId: string, reason: string): Observable<{ message: string; request: GolfCaddyRequest }> {
    return this.http.post<{ message: string; request: GolfCaddyRequest }>(`${this.station}/requests/${requestId}/cancel-by-caddy`, { reason });
  }
}
