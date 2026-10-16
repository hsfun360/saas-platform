import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { GolfPlayerTypeOption } from './golf-player-type.service';

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
  // A player-type code of the club's catalog (the listing ships the pickable ones).
  playerType: string;
  memberNo?: string;
  guestName?: string;
}

export interface GolfBookingPlayer {
  playerId: string;
  sortOrder: number;
  playerType: string;
  memberNo: string | null;
  playerName: string;
  status: string;
  registrationNo: string | null;
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
  bookerMemberNo: string | null;
  bookerName: string | null;
  changeCount: number;
  players: GolfBookingPlayer[];
}

export interface GolfSearchPayload {
  memberNo: string;
  playDate: string;
  courseId: string | null;
  time: string;
  players: number;
  holes: number;
  // Change booking: the booking being moved is left out of the counts.
  excludeBookingId?: string;
}

// ---- change booking (2026-10-14) ----
export interface GolfChangeLine {
  playerId?: string;
  playerType?: string;
  memberNo?: string;
  guestName?: string;
}

export interface GolfChangePayload {
  lockGroupId?: string | null;
  players: GolfChangeLine[];
  contactMobile?: string | null;
  remarks?: string | null;
  reason?: string;
  waiveCharge?: boolean;
  waiveReason?: string;
}

export interface GolfChangeFlight {
  courseId: string;
  courseCode: string | null;
  courseName: string;
  playDate: string;
  teeTime: string;
  crossTime: string | null;
  holes: number;
}

export interface GolfChangePreview {
  bookingNo: string;
  changeType: 'move' | 'roster' | 'header' | 'mixed';
  summary: string;
  moved: boolean;
  before: GolfChangeFlight;
  after: GolfChangeFlight;
  kept: { playerId: string; playerName: string; memberNo: string | null; playerType: string; status: string }[];
  dropped: { playerId: string; playerName: string; memberNo: string | null; playerType: string }[];
  added: { playerName: string; memberNo: string | null; playerType: string }[];
  controlled: boolean;
  late: boolean;
  deadline: { date: string; time: string } | null;
  noticeHours: number | null;
  charge: {
    description: string; quantity: number; unitAmount: number; amount: number; taxAmount: number; totalAmount: number;
    players: string[]; booker: { name: string; memberNo: string | null };
  } | null;
}

export interface GolfBookingChange {
  id: string;
  changeNo: number;
  changeType: 'move' | 'roster' | 'header' | 'mixed';
  summary: string;
  reason: string | null;
  before: GolfChangeFlight & { contactMobile: string | null; remarks: string | null; players: { playerName: string; memberNo: string | null; playerType: string }[] };
  after: GolfChangeFlight & { contactMobile: string | null; remarks: string | null; players: { playerName: string; memberNo: string | null; playerType: string }[] };
  noShowChargeId: string | null;
  changedAt: string;
  changedBy: string | null;
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

  // `playerTypes` = the club's pickable player types (code, label, base identity).
  list(playDate: string): Observable<{ bookings: GolfBookingRow[]; playerTypes: GolfPlayerTypeOption[] }> {
    return this.http.get<{ bookings: GolfBookingRow[]; playerTypes: GolfPlayerTypeOption[] }>(this.base, { params: { playDate } });
  }

  // What cancelling NOW means under the cancellation-notice rule (show
  // expected results before the confirm): inside the notice window, charged
  // or refused, and the priced late-cancellation charge to the booker.
  cancelPreview(id: string): Observable<GolfCancelPreview> {
    return this.http.get<GolfCancelPreview>(`${this.base}/${id}/cancel-preview`);
  }

  cancel(id: string, reason: string, waive?: { waiveReason: string }): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.base}/${id}/cancel`, {
      reason,
      waiveCharge: !!waive,
      waiveReason: waive ? waive.waiveReason : undefined,
    });
  }

  // Change booking: the preview states the outcome (moved flight, players
  // added or dropped, the notice-window verdict and any late-change charge)
  // before the change is applied; apply re-judges it under the day lock.
  changePreview(id: string, payload: GolfChangePayload): Observable<GolfChangePreview> {
    return this.http.post<GolfChangePreview>(`${this.base}/${id}/change-preview`, payload);
  }

  change(id: string, payload: GolfChangePayload): Observable<{ message: string; changeId: string; summary: string }> {
    return this.http.post<{ message: string; changeId: string; summary: string }>(`${this.base}/${id}/change`, payload);
  }

  changes(id: string): Observable<{ changes: GolfBookingChange[] }> {
    return this.http.get<{ changes: GolfBookingChange[] }>(`${this.base}/${id}/changes`);
  }
}

export interface GolfCancelPreview {
  controlled: boolean;
  late: boolean;
  noticeHours?: number;
  deadline?: { date: string; time: string } | null;
  action?: 'charge' | 'refuse';
  booker?: { name: string; memberNo: string | null; isMember: boolean } | null;
  playerCount?: number;
  chargeError?: string;
  charge?: { description: string; quantity: number; unitAmount: number; amount: number; taxAmount: number; totalAmount: number };
}
