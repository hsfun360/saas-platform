import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// One advance-booking override line (a membership type booking earlier).
export interface GolfAdvanceBookingOverride {
  membershipTypeId: string;
  advanceBookingDays: number;
}

// One minimum-players exception rule (course/day/time scoped; most specific
// wins at booking time; null courseId = every course, null times = whole day).
export interface GolfMinPlayerRule {
  courseId: string | null;
  dayScope: 'all' | 'weekday' | 'weekend';
  startTime: string | null;
  endTime: string | null;
  minPlayers: number;
}

// One guest-control exception rule (same scoping as the minimum-players
// rules; two switches per scope - visitor guests vs members-as-guests).
export interface GolfGuestControlRule {
  courseId: string | null;
  dayScope: 'all' | 'weekday' | 'weekend';
  startTime: string | null;
  endTime: string | null;
  allowGuest: boolean;
  allowMemberGuest: boolean;
}

// One handicap LIMIT rule (Tropicana procedure 2.1): the maximum handicap
// index allowed, scoped by day/course/holes/gender, with an optional latest
// tee-off for the targeted players.
export interface GolfHandicapLimitRule {
  courseId: string | null;
  dayScope: string;
  holes: number | null;
  gender: 'men' | 'women' | 'any';
  maxHandicap: number;
  latestTeeOff: string | null;
}

// One handicap ACCOMPANIMENT rule (procedure 2.2/2.3): beginners/provisional
// golfers need an ESTABLISHED companion under the per-gender caps.
export interface GolfHandicapAccompanimentRule {
  courseId: string | null;
  dayScope: string;
  holes: number | null;
  startTime: string | null;
  endTime: string | null;
  appliesToBeginner: boolean;
  appliesToProvisional: boolean;
  minCompanions: number;
  companionMaxHandicapMen: number;
  companionMaxHandicapWomen: number;
  latestTeeOff: string | null;
}

// A named day part ('Morning' 08:00-11:59, ...) - the per-session booking
// limit's bands, and future session analysis. End exclusive.
export interface GolfSessionBand {
  name: string;
  startTime: string; // 'HH:MM'
  endTime: string;
}

// Booking limit per day type: no limit / one per day / one per session.
export type GolfBookingLimit = 'none' | 'day' | 'session';

// Cancellation notice + no-show penalty (Tropicana procedure; 2026-10-06):
// what a cancel inside the notice window does, and how the penalty counts.
export type GolfLateCancellationAction = 'charge' | 'refuse';
export type GolfNoShowChargeBasis = 'player' | 'booking';

export interface GolfNoShowTypeOption {
  id: string;
  transactionType: string;
  description?: string | null;
  isActive: boolean;
}

export interface GolfSettingDoc {
  setting: {
    advanceBookingDays: number;
    advanceBookingHours: number;
    allowMembershipTypeOverride: boolean;
    allowBookingMerge: boolean;
    minPlayersWeekday: number;
    minPlayersWeekend: number;
    bookingLockMinutes: number;
    bookingLimitWeekday: GolfBookingLimit;
    bookingLimitWeekend: GolfBookingLimit;
    allowSameDayBooking: boolean;
    guestControlEnabled: boolean;
    allowGuestWeekday: boolean;
    allowMemberGuestWeekday: boolean;
    allowGuestWeekend: boolean;
    allowMemberGuestWeekend: boolean;
    handicapControlEnabled: boolean;
    juniorBookingControlEnabled: boolean;
    noShowControlEnabled: boolean;
    cancellationNoticeHours: number;
    lateCancellationAction: GolfLateCancellationAction;
    noShowTransactionTypeId: string | null;
    noShowChargeBasis: GolfNoShowChargeBasis;
    teeSheetColorBooked: string;
    teeSheetColorRegistered: string;
    teeSheetColorBilled: string;
    teeSheetColorSettled: string;
    saved: boolean;
  };
  overrides: GolfAdvanceBookingOverride[];
  minPlayerRules: GolfMinPlayerRule[];
  guestControlRules: GolfGuestControlRule[];
  handicapLimitRules: GolfHandicapLimitRule[];
  handicapAccompanimentRules: GolfHandicapAccompanimentRule[];
  sessions: GolfSessionBand[];
}

export interface GolfMembershipTypeOption {
  id: string;
  category: string;
  description?: string | null;
  isGolfAllow?: boolean;
}

export interface GolfCourseOption {
  id: string;
  courseCode: string;
  description?: string | null;
  isActive: boolean;
}

// Golf Specification (per-company settings singleton) for the active company.
@Injectable({ providedIn: 'root' })
export class GolfSettingService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/golf/settings`;

  get(): Observable<GolfSettingDoc> {
    return this.http.get<GolfSettingDoc>(this.base);
  }

  // Membership-type picker for the override editor (served via the membership
  // seam - no Membership menu grant needed).
  membershipTypes(): Observable<{ membershipTypes: GolfMembershipTypeOption[] }> {
    return this.http.get<{ membershipTypes: GolfMembershipTypeOption[] }>(`${this.base}/membership-types`);
  }

  // Course picker for the minimum-players exception editor (served under the
  // settings route - no /golf/courses menu grant needed).
  courses(): Observable<{ courses: GolfCourseOption[] }> {
    return this.http.get<{ courses: GolfCourseOption[] }>(`${this.base}/courses`);
  }

  // No-show transaction types (chargeType 'no-show') for the Cancellation &
  // No-show picker - served under the settings route, no Transaction Type
  // menu grant needed.
  noShowTypes(): Observable<{ types: GolfNoShowTypeOption[] }> {
    return this.http.get<{ types: GolfNoShowTypeOption[] }>(`${this.base}/no-show-types`);
  }

  save(payload: {
    advanceBookingDays: number;
    advanceBookingHours: number;
    allowMembershipTypeOverride: boolean;
    allowBookingMerge: boolean;
    minPlayersWeekday: number;
    minPlayersWeekend: number;
    bookingLockMinutes: number;
    bookingLimitWeekday: GolfBookingLimit;
    bookingLimitWeekend: GolfBookingLimit;
    allowSameDayBooking: boolean;
    guestControlEnabled: boolean;
    allowGuestWeekday: boolean;
    allowMemberGuestWeekday: boolean;
    allowGuestWeekend: boolean;
    allowMemberGuestWeekend: boolean;
    handicapControlEnabled: boolean;
    juniorBookingControlEnabled: boolean;
    noShowControlEnabled: boolean;
    cancellationNoticeHours: number;
    lateCancellationAction: GolfLateCancellationAction;
    noShowTransactionTypeId: string | null;
    noShowChargeBasis: GolfNoShowChargeBasis;
    teeSheetColorBooked: string;
    teeSheetColorRegistered: string;
    teeSheetColorBilled: string;
    teeSheetColorSettled: string;
    overrides: GolfAdvanceBookingOverride[];
    minPlayerRules: GolfMinPlayerRule[];
    guestControlRules: GolfGuestControlRule[];
    handicapLimitRules: GolfHandicapLimitRule[];
    handicapAccompanimentRules: GolfHandicapAccompanimentRule[];
    sessions: GolfSessionBand[];
  }): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(this.base, payload);
  }
}
