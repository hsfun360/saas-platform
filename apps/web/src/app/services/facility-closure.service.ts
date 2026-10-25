import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { FacilityUsageMode } from './facility-type.service';

// One concrete closure day of a plan (generated, then hand-adjusted).
export interface FacilityClosureDay {
  id?: string;
  closureDate: string; // 'YYYY-MM-DD'
  startTime?: string | null; // 'HH:MM', both null = whole day
  endTime?: string | null;
  isActive?: boolean;
}

// A generated (not yet saved) closure day, with the server's classification
// of the date so the review grid can explain WHY the day was included.
export interface FacilityClosureDayPreview extends FacilityClosureDay {
  dayType?: 'weekday' | 'weekend';
  isHoliday?: boolean;
}

// A facility closure plan (structure approved 2026-10-25): the rule header on
// a Facility Type - ONE unit (`facility`) or every unit of the type
// (`facility` null) - over a date period, on the matching day types, for a
// daily time window (both times null = whole day).
export interface FacilityClosurePlan {
  id: string;
  facilityTypeId: string;
  facilityId: string | null;
  description: string;
  dayScope: string; // 'all' | 'weekday' | 'weekend'
  dateFrom: string; // 'YYYY-MM-DD'
  dateTo: string;
  startTime: string | null; // 'HH:MM'
  endTime: string | null;
  isActive: boolean;
  facilityType: { id: string; code: string; description: string; usageMode: FacilityUsageMode } | null;
  facility: { id: string; code: string; name: string } | null;
  days: FacilityClosureDay[];
  canModify?: boolean;
}

export interface ClosureTypeOption {
  id: string;
  code: string;
  description: string;
  usageMode: FacilityUsageMode;
}

export interface ClosureUnitOption {
  id: string;
  facilityTypeId: string;
  code: string;
  name: string;
}

export interface FacilityClosureListing {
  plans: FacilityClosurePlan[];
  types: ClosureTypeOption[];
  facilities: ClosureUnitOption[];
}

export interface FacilityClosureHeader {
  description: string;
  dayScope: string;
  dateFrom: string;
  dateTo: string;
  startTime: string | null;
  endTime: string | null;
}

// Facility Closures - its own menu: plans across every type and unit in one
// listing, grantable without the setup screens. All endpoints sit behind the
// Facility Management entitlement + the '/facility/closures' menu grant.
@Injectable({ providedIn: 'root' })
export class FacilityClosureService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/facility/closure-plans`;

  list(): Observable<FacilityClosureListing> {
    return this.http.get<FacilityClosureListing>(this.base);
  }

  // One plan per picked unit, or ONE type-wide plan when `facilityIds` is empty.
  create(payload: FacilityClosureHeader & { facilityTypeId: string; facilityIds: string[] }): Observable<{ message: string; plans: FacilityClosurePlan[] }> {
    return this.http.post<{ message: string; plans: FacilityClosurePlan[] }>(this.base, payload);
  }

  update(planId: string, patch: Partial<FacilityClosureHeader> & { isActive?: boolean }): Observable<{ message: string; plan: FacilityClosurePlan }> {
    return this.http.patch<{ message: string; plan: FacilityClosurePlan }>(`${this.base}/${planId}`, patch);
  }

  remove(planId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/${planId}`);
  }

  // Server-side generation PREVIEW: classifies each date of the plan's period
  // (holidays count as weekend) and returns the matching day rows unsaved.
  generateDays(planId: string): Observable<{ days: FacilityClosureDayPreview[]; totalInPeriod: number }> {
    return this.http.post<{ days: FacilityClosureDayPreview[]; totalInPeriod: number }>(`${this.base}/${planId}/generate-days`, {});
  }

  saveDays(planId: string, days: FacilityClosureDay[]): Observable<{ message: string; days: FacilityClosureDay[] }> {
    return this.http.put<{ message: string; days: FacilityClosureDay[] }>(`${this.base}/${planId}/days`, { days });
  }
}
