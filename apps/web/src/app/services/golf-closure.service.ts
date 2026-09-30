import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  UnitCourseClosureDay,
  UnitCourseClosureDayPreview,
  UnitCourseClosurePlan,
} from '../models/auth.models';

// The picker rows served with the listing (id + code + description).
export interface ClosureNineOption {
  id: string;
  unitCourseCode: string;
  description: string | null;
}

export interface ClosureListing {
  plans: UnitCourseClosurePlan[];
  nines: ClosureNineOption[];
}

// Course Closure - standalone menu (2026-09-30): closure plans across EVERY
// nine in one listing, grantable without the Unit Course setup screen. All
// endpoints sit behind the Golf Management entitlement + the
// '/golf/closures' menu grant on the API.
@Injectable({ providedIn: 'root' })
export class GolfClosureService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/golf/closures`;

  // Every closure plan of the active company (with days + nine info), plus
  // the active nines for the create dialog's picker.
  list(): Observable<ClosureListing> {
    return this.http.get<ClosureListing>(this.base);
  }

  // ONE plan per selected nine (whole-course closure keyed once).
  create(
    payload: Partial<UnitCourseClosurePlan> & { unitCourseIds: string[] },
  ): Observable<{ message: string; plans: UnitCourseClosurePlan[] }> {
    return this.http.post<{ message: string; plans: UnitCourseClosurePlan[] }>(this.base, payload);
  }

  update(planId: string, patch: Partial<UnitCourseClosurePlan>): Observable<{ message: string; plan: UnitCourseClosurePlan }> {
    return this.http.patch<{ message: string; plan: UnitCourseClosurePlan }>(`${this.base}/${planId}`, patch);
  }

  // Server-side generation PREVIEW: classifies each date of the plan's period
  // (weekday/weekend, holidays count as weekend) and returns the matching day
  // rows without saving them.
  generateDays(planId: string): Observable<{ days: UnitCourseClosureDayPreview[]; totalInPeriod: number }> {
    return this.http.post<{ days: UnitCourseClosureDayPreview[]; totalInPeriod: number }>(`${this.base}/${planId}/generate-days`, {});
  }

  // Replace a plan's day list atomically.
  saveDays(planId: string, days: UnitCourseClosureDay[]): Observable<{ message: string; days: UnitCourseClosureDay[] }> {
    return this.http.put<{ message: string; days: UnitCourseClosureDay[] }>(`${this.base}/${planId}/days`, { days });
  }
}
