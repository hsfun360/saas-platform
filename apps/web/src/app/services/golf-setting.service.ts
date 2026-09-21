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

export interface GolfSettingDoc {
  setting: {
    advanceBookingDays: number;
    advanceBookingHours: number;
    allowMembershipTypeOverride: boolean;
    allowBookingMerge: boolean;
    minPlayersWeekday: number;
    minPlayersWeekend: number;
    bookingLockMinutes: number;
    oneBookingPerDay: boolean;
    allowSameDayBooking: boolean;
    guestControlEnabled: boolean;
    allowGuestWeekday: boolean;
    allowMemberGuestWeekday: boolean;
    allowGuestWeekend: boolean;
    allowMemberGuestWeekend: boolean;
    saved: boolean;
  };
  overrides: GolfAdvanceBookingOverride[];
  minPlayerRules: GolfMinPlayerRule[];
  guestControlRules: GolfGuestControlRule[];
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

  save(payload: {
    advanceBookingDays: number;
    advanceBookingHours: number;
    allowMembershipTypeOverride: boolean;
    allowBookingMerge: boolean;
    minPlayersWeekday: number;
    minPlayersWeekend: number;
    bookingLockMinutes: number;
    oneBookingPerDay: boolean;
    allowSameDayBooking: boolean;
    guestControlEnabled: boolean;
    allowGuestWeekday: boolean;
    allowMemberGuestWeekday: boolean;
    allowGuestWeekend: boolean;
    allowMemberGuestWeekend: boolean;
    overrides: GolfAdvanceBookingOverride[];
    minPlayerRules: GolfMinPlayerRule[];
    guestControlRules: GolfGuestControlRule[];
  }): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(this.base, payload);
  }
}
