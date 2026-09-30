import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  CourseTeeTimeSet,
  CourseTeeTimeSlot,
  GolfCourse,
  GolfCourseMeta,
} from '../models/auth.models';

// Course (18-hole) master file for the active company (club). All endpoints sit
// behind the Golf Management module entitlement on the API. Enable/disable via
// update({ isActive }) rather than delete.
@Injectable({ providedIn: 'root' })
export class GolfCourseService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/golf/courses`;

  // Every course for the active company.
  list(): Observable<GolfCourse[]> {
    return this.http.get<GolfCourse[]>(this.base);
  }

  create(payload: Partial<GolfCourse>): Observable<{ message: string; course: GolfCourse }> {
    return this.http.post<{ message: string; course: GolfCourse }>(this.base, payload);
  }

  // Hard delete for a mis-keyed course - refused server-side once bookings
  // or registrations reference it.
  delete(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/${id}`);
  }

  update(id: string, patch: Partial<GolfCourse>): Observable<{ message: string; course: GolfCourse }> {
    return this.http.patch<{ message: string; course: GolfCourse }>(`${this.base}/${id}`, patch);
  }

  // Upload the course picture; returns the public URL to store via create/update.
  uploadPhoto(file: File): Observable<{ message: string; url: string }> {
    const form = new FormData();
    form.append('photo', file);
    return this.http.post<{ message: string; url: string }>(`${this.base}/photo`, form);
  }

  // Fixed vocabularies (day scopes for tee-time sets).
  meta(): Observable<GolfCourseMeta> {
    return this.http.get<GolfCourseMeta>(`${this.base}/meta`);
  }

  // --- Tee-time sets (per course) ---
  teeTimeSets(courseId: string): Observable<CourseTeeTimeSet[]> {
    return this.http.get<CourseTeeTimeSet[]>(`${this.base}/${courseId}/tee-time-sets`);
  }

  createTeeTimeSet(courseId: string, payload: Partial<CourseTeeTimeSet>): Observable<{ message: string; set: CourseTeeTimeSet }> {
    return this.http.post<{ message: string; set: CourseTeeTimeSet }>(`${this.base}/${courseId}/tee-time-sets`, payload);
  }

  updateTeeTimeSet(courseId: string, setId: string, patch: Partial<CourseTeeTimeSet>): Observable<{ message: string; set: CourseTeeTimeSet }> {
    return this.http.patch<{ message: string; set: CourseTeeTimeSet }>(`${this.base}/${courseId}/tee-time-sets/${setId}`, patch);
  }

  // Replace a set's slot list atomically.
  saveTeeTimeSlots(courseId: string, setId: string, slots: CourseTeeTimeSlot[]): Observable<{ message: string; slots: CourseTeeTimeSlot[] }> {
    return this.http.put<{ message: string; slots: CourseTeeTimeSlot[] }>(`${this.base}/${courseId}/tee-time-sets/${setId}/slots`, { slots });
  }

  // Closure plans moved to the Unit Courses screen (2026-09-30): a closure is
  // a fact about the physical nine - see UnitCourseService.
}
