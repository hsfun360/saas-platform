import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  UnitCourse,
  UnitCourseClosureDay,
  UnitCourseClosureDayPreview,
  UnitCourseClosurePlan,
  UnitCourseHole,
  UnitCourseMeta,
  UnitCourseTeeBox,
} from '../models/auth.models';

// Unit Course (9-hole) master file for the active company (club). All endpoints
// sit behind the Golf Management module entitlement on the API. Enable/disable
// via update({ isActive }) rather than delete.
@Injectable({ providedIn: 'root' })
export class UnitCourseService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/golf/unit-courses`;

  // Fixed course-type list (OUT / IN / COMPOSITE) for the dropdown.
  meta(): Observable<UnitCourseMeta> {
    return this.http.get<UnitCourseMeta>(`${this.base}/meta`);
  }

  // Every unit course for the active company.
  list(): Observable<UnitCourse[]> {
    return this.http.get<UnitCourse[]>(this.base);
  }

  create(payload: Partial<UnitCourse>): Observable<{ message: string; unitCourse: UnitCourse }> {
    return this.http.post<{ message: string; unitCourse: UnitCourse }>(this.base, payload);
  }

  update(id: string, patch: Partial<UnitCourse>): Observable<{ message: string; unitCourse: UnitCourse }> {
    return this.http.patch<{ message: string; unitCourse: UnitCourse }>(`${this.base}/${id}`, patch);
  }

  // Hard delete for a mis-keyed nine - refused server-side while any course
  // references it.
  delete(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/${id}`);
  }

  // Saved hole rows of a unit course (may be empty until first save).
  holes(id: string): Observable<UnitCourseHole[]> {
    return this.http.get<UnitCourseHole[]>(`${this.base}/${id}/holes`);
  }

  // Replace the unit course's hole set atomically. The numbers must be exactly
  // the range the course type dictates - the API enforces it.
  saveHoles(id: string, holes: UnitCourseHole[]): Observable<{ message: string; holes: UnitCourseHole[] }> {
    return this.http.put<{ message: string; holes: UnitCourseHole[] }>(`${this.base}/${id}/holes`, { holes });
  }

  // Tee boxes of a unit course, each with its per-gender rating rows.
  teeBoxes(id: string): Observable<UnitCourseTeeBox[]> {
    return this.http.get<UnitCourseTeeBox[]>(`${this.base}/${id}/tee-boxes`);
  }

  // Replace the unit course's tee-box set (headers + ratings) atomically.
  saveTeeBoxes(id: string, teeBoxes: UnitCourseTeeBox[]): Observable<{ message: string; teeBoxes: UnitCourseTeeBox[] }> {
    return this.http.put<{ message: string; teeBoxes: UnitCourseTeeBox[] }>(`${this.base}/${id}/tee-boxes`, { teeBoxes });
  }

  // --- Closure plans (per NINE, spec 2.2.8 re-keyed 2026-09-30) ---
  closurePlans(id: string): Observable<UnitCourseClosurePlan[]> {
    return this.http.get<UnitCourseClosurePlan[]>(`${this.base}/${id}/closure-plans`);
  }

  // `alsoUnitCourseIds` fans the same header out to extra nines (whole-course
  // closure keyed once) - one plan per nine comes back.
  createClosurePlan(
    id: string,
    payload: Partial<UnitCourseClosurePlan> & { alsoUnitCourseIds?: string[] },
  ): Observable<{ message: string; plan: UnitCourseClosurePlan; plans: UnitCourseClosurePlan[] }> {
    return this.http.post<{ message: string; plan: UnitCourseClosurePlan; plans: UnitCourseClosurePlan[] }>(
      `${this.base}/${id}/closure-plans`,
      payload,
    );
  }

  updateClosurePlan(id: string, planId: string, patch: Partial<UnitCourseClosurePlan>): Observable<{ message: string; plan: UnitCourseClosurePlan }> {
    return this.http.patch<{ message: string; plan: UnitCourseClosurePlan }>(`${this.base}/${id}/closure-plans/${planId}`, patch);
  }

  // Server-side generation PREVIEW: classifies each date of the plan's period
  // (weekday/weekend, holidays count as weekend) and returns the matching day
  // rows without saving them.
  generateClosureDays(id: string, planId: string): Observable<{ days: UnitCourseClosureDayPreview[]; totalInPeriod: number }> {
    return this.http.post<{ days: UnitCourseClosureDayPreview[]; totalInPeriod: number }>(
      `${this.base}/${id}/closure-plans/${planId}/generate-days`,
      {},
    );
  }

  // Replace a plan's day list atomically.
  saveClosureDays(id: string, planId: string, days: UnitCourseClosureDay[]): Observable<{ message: string; days: UnitCourseClosureDay[] }> {
    return this.http.put<{ message: string; days: UnitCourseClosureDay[] }>(`${this.base}/${id}/closure-plans/${planId}/days`, { days });
  }
}
