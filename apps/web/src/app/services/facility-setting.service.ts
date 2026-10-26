import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { FacilityUsageMode } from './facility-type.service';

// A Facility Session band (Morning / Afternoon / Evening / Peak) - the club's
// named day parts, end exclusive. The peak / off-peak axis of the rate card
// and the unit of the per-session booking limit.
export interface FacilitySessionBand {
  id?: string;
  name: string;
  startTime: string; // 'HH:MM'
  endTime: string;
  sequence?: number;
}

// One advance-booking override line (a membership type booking earlier).
export interface FacilityAdvanceBookingOverride {
  membershipTypeId: string;
  advanceBookingDays: number;
}

// One guest-control exception rule (facility type / day scope / time band
// scoped; the most specific wins; null facilityTypeId = every type).
export interface FacilityGuestControlRule {
  facilityTypeId: string | null;
  dayScope: string;
  startTime: string | null;
  endTime: string | null;
  allowGuest: boolean;
  allowMemberGuest: boolean;
}

export interface FacilityMembershipTypeOption {
  id: string;
  category: string;
  description?: string | null;
}

export interface FacilityTypeOption {
  id: string;
  code: string;
  description: string;
  usageMode: FacilityUsageMode;
  isActive: boolean;
}

// Facility Specification - the per-company settings singleton with its row
// sets and the pickers the editors need. `saved` is false until first saved.
export interface FacilitySettingDoc {
  advanceBookingDays: number;
  advanceBookingHours: number;
  allowSameDayBooking: boolean;
  bookingLockMinutes: number;
  allowMembershipTypeOverride: boolean;
  guestControlEnabled: boolean;
  allowGuestWeekday: boolean;
  allowMemberGuestWeekday: boolean;
  allowGuestWeekend: boolean;
  allowMemberGuestWeekend: boolean;
  noShowControlEnabled: boolean;
  cancellationNoticeHours: number;
  // slice 3: Control Station
  checkInOpenMinutes: number;
  autoSignOutAtClose: boolean;
  saved: boolean;
  sessions: FacilitySessionBand[];
  overrides: FacilityAdvanceBookingOverride[];
  guestControlRules: FacilityGuestControlRule[];
  membershipTypes: FacilityMembershipTypeOption[];
  facilityTypes: FacilityTypeOption[];
}

export type FacilitySettingPayload = Omit<FacilitySettingDoc, 'saved' | 'membershipTypes' | 'facilityTypes'>;

// Facility Specification (/facility/settings) for the active company. All
// endpoints sit behind the Facility Management entitlement + the
// '/facility/settings' menu grant on the API.
@Injectable({ providedIn: 'root' })
export class FacilitySettingService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/facility/settings`;

  get(): Observable<FacilitySettingDoc> {
    return this.http.get<FacilitySettingDoc>(this.base);
  }

  // PUT upserts the singleton and replaces the sessions, overrides and
  // guest rules atomically.
  save(payload: FacilitySettingPayload): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(this.base, payload);
  }
}
