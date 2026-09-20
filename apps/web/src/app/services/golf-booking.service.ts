import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// Golf Booking - the make-booking flow against the DYNAMIC tee sheet:
// context (member + window) → availability (5 nearest flights per course) →
// lock a flight → key players → confirm. All rules are re-validated
// server-side at save; the lock carries a countdown (expiresAt).

export interface GolfBookingMember {
  memberNo: string;
  name: string;
  membershipTypeCategory: string | null;
  isGolfAllow: boolean;
  statusLabel: string | null;
  actionControl: 'allow' | 'warning' | 'barred';
}

export interface GolfBookingContext {
  member: GolfBookingMember;
  window: { dateFrom: string; dateTo: string; effectiveDays: number };
  courses: { id: string; courseCode: string; description?: string | null }[];
  meta: { holesOptions: number[]; lockMinutes: number };
}

export interface GolfFlight {
  teeTime: string;
  crossTime: string | null;
  seatsLeft: number;
  maxPlayers: number;
  isFrontDesk: boolean;
  existingPlayers: number;
  minPlayers: number;
}

export interface GolfFlightGroup {
  courseId: string;
  courseCode: string;
  description?: string | null;
  flights: GolfFlight[];
}

export interface GolfFlightLock {
  groupId: string;
  expiresAt: string;
  lockMinutes: number;
  teeTime: string;
  crossTime: string | null;
  seatsLeft: number;
  existingPlayers: number;
  minPlayers: number;
}

export interface GolfBookingPlayerLine {
  playerType: 'member' | 'member-guest' | 'guest';
  memberNo?: string;
  guestName?: string;
}

export interface GolfBookingRow {
  id: string;
  bookingNo: string;
  courseId: string;
  courseCode: string | null;
  courseDescription: string | null;
  playDate: string;
  holes: number;
  startTime: string;
  crossTime: string | null;
  contactMobile: string | null;
  remarks: string | null;
  status: string;
  cancelReason: string | null;
  canModify?: boolean;
  players: { sortOrder: number; playerType: string; memberNo: string | null; playerName: string }[];
}

export interface GolfSearchPayload {
  memberNo: string;
  playDate: string;
  courseId: string | null;
  time: string;
  players: number;
  holes: number;
}

@Injectable({ providedIn: 'root' })
export class GolfBookingService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/golf/bookings`;

  context(memberNo: string): Observable<GolfBookingContext> {
    return this.http.get<GolfBookingContext>(`${this.base}/context`, { params: { memberNo } });
  }

  availability(payload: GolfSearchPayload): Observable<{ playDate: string; dayType: string; groups: GolfFlightGroup[]; memberWarning: string | null }> {
    return this.http.post<{ playDate: string; dayType: string; groups: GolfFlightGroup[]; memberWarning: string | null }>(`${this.base}/availability`, payload);
  }

  lock(payload: GolfSearchPayload & { teeTime: string }): Observable<GolfFlightLock> {
    return this.http.post<GolfFlightLock>(`${this.base}/locks`, payload);
  }

  releaseLock(groupId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/locks/${groupId}`);
  }

  create(payload: {
    lockGroupId: string;
    memberNo: string;
    holes: number;
    players: GolfBookingPlayerLine[];
    contactMobile?: string;
    remarks?: string;
    bookingNo?: string;
  }): Observable<{ message: string; booking: GolfBookingRow }> {
    return this.http.post<{ message: string; booking: GolfBookingRow }>(this.base, payload);
  }

  list(playDate: string): Observable<{ bookings: GolfBookingRow[] }> {
    return this.http.get<{ bookings: GolfBookingRow[] }>(this.base, { params: { playDate } });
  }

  cancel(id: string, reason: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.base}/${id}/cancel`, { reason });
  }
}
