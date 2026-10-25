import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// A Facility Session band (Morning / Afternoon / Evening / Peak) - the club's
// named day parts, end exclusive. The peak / off-peak axis of the rate card
// and the unit of the per-session booking limit (slice 2).
export interface FacilitySessionBand {
  id?: string;
  name: string;
  startTime: string; // 'HH:MM'
  endTime: string;
  sequence?: number;
}

// Facility Specification - the per-company settings singleton (slice 1
// columns; later slices add theirs). `saved` is false until first saved.
export interface FacilitySettingDoc {
  advanceBookingDays: number;
  advanceBookingHours: number;
  allowSameDayBooking: boolean;
  bookingLockMinutes: number;
  guestControlEnabled: boolean;
  allowGuestWeekday: boolean;
  allowMemberGuestWeekday: boolean;
  allowGuestWeekend: boolean;
  allowMemberGuestWeekend: boolean;
  noShowControlEnabled: boolean;
  cancellationNoticeHours: number;
  saved: boolean;
  sessions: FacilitySessionBand[];
}

export type FacilitySettingPayload = Omit<FacilitySettingDoc, 'saved'>;

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

  // PUT upserts the singleton and replaces the sessions atomically.
  save(payload: FacilitySettingPayload): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(this.base, payload);
  }
}
