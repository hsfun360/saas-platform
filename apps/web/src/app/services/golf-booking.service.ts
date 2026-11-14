import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { GolfPlayerTypeOption } from './golf-player-type.service';
import { GolfCaddyRequest } from './golf-caddy-request.service';

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

// The booker's guest standing (2026-11-13): the per-booking guest quota of
// the membership type (null = no limit, 0 = no guests) and the monthly guest
// allowance in the month of `date` (allowance null = no limit), counted
// club-wide on Membership's guest ledger.
export interface GolfGuestStanding {
  quota: number | null;
  allowance: number | null;
  used: number;
  remaining: number | null;
  date: string;
}

// One of the booker's guest passes for the play date (Guest Registration).
export interface GolfGuestPass {
  guestId: string;
  guestName: string;
  registrationNo: string | null;
  status: string;
}

// The class a member line will take on the flight (the save re-derives it).
export interface GolfLineCheck {
  memberNo: string;
  name: string;
  playerType: string;
  playerTypeLabel: string;
  playsAsGuest: boolean;
  reason: string | null;
}

export interface GolfBookingContext {
  member: GolfBookingMember;
  window: { dateFrom: string; dateTo: string; effectiveDays: number };
  guests?: GolfGuestStanding;
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
  // The membership.Guest of one of the booker's passes for the date.
  guestId?: string;
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
  // Named-caddy requests (2026-10-18): the live and fulfilled ones.
  caddyRequests?: GolfCaddyRequest[];
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
  guestId?: string;
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
  // playsAsGuestReason: the engine turned this added member into the booker's
  // guest (no playing right of their own on the flight).
  added: { playerName: string; memberNo: string | null; playerType: string; playsAsGuestReason?: string | null }[];
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

  // `playDate` names the month the guest allowance is read for.
  context(memberNo: string, playDate?: string): Observable<GolfBookingContext> {
    return this.http.get<GolfBookingContext>(`${this.base}/context`, { params: playDate ? { memberNo, playDate } : { memberNo } });
  }

  // The booker's guest passes for the play date + their guest standing in
  // that month - shown on the Players step before guests are keyed.
  guestPasses(memberNo: string, playDate: string): Observable<{ passes: GolfGuestPass[]; guests: GolfGuestStanding }> {
    return this.http.get<{ passes: GolfGuestPass[]; guests: GolfGuestStanding }>(`${this.base}/guest-passes`, { params: { memberNo, playDate } });
  }

  // The class a member line will take on the flight: Member, or - when the
  // member holds no playing right of their own - Member as Guest with the reason.
  lineCheck(q: { memberNo: string; lineMemberNo: string; playerType: string; lockGroupId?: string; bookingId?: string }): Observable<GolfLineCheck> {
    const params: Record<string, string> = { memberNo: q.memberNo, lineMemberNo: q.lineMemberNo, playerType: q.playerType };
    if (q.lockGroupId) params['lockGroupId'] = q.lockGroupId;
    if (q.bookingId) params['bookingId'] = q.bookingId;
    return this.http.get<GolfLineCheck>(`${this.base}/line-check`, { params });
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

  // `playerTypes` = the types the booking screen may pick (code, label, base
  // identity); `allPlayerTypes` = every type, for the labels of stored lines
  // (a derived Member as Guest line carries a type nobody picks);
  // `caddyManagementEnabled` = whether a caddy may be requested on a booking.
  list(playDate: string): Observable<{ bookings: GolfBookingRow[]; playerTypes: GolfPlayerTypeOption[]; allPlayerTypes?: GolfPlayerTypeOption[]; caddyManagementEnabled?: boolean }> {
    return this.http.get<{ bookings: GolfBookingRow[]; playerTypes: GolfPlayerTypeOption[]; allPlayerTypes?: GolfPlayerTypeOption[]; caddyManagementEnabled?: boolean }>(this.base, { params: { playDate } });
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
