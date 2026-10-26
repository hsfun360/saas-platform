import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { FacilityUsageMode } from './facility-type.service';

// Classes, their schedules and the dated sessions (slice 5, structures
// approved 2026-10-26). A class is held at a Venue, led by an Instructor,
// enrolled per session or per term; a schedule header generates the
// sessions through a preview the user reviews.

export type EnrolmentMode = 'session' | 'term';
export type ScheduleStatus = 'active' | 'closed' | 'cancelled';
export type SessionStatus = 'scheduled' | 'held' | 'cancelled';

export interface ClassVenueOption {
  id: string;
  code: string;
  name: string;
  capacity: number;
  isActive: boolean;
  blocksUnit: boolean;
  facility: { id: string; code: string; name: string; usageMode: FacilityUsageMode | null } | null;
}

export interface ClassInstructorOption {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface ClassFeeItemOption {
  id: string;
  transactionType: string;
  description: string | null;
  isActive: boolean;
}

export interface FacilityClass {
  id: string;
  code: string;
  description: string;
  details: string | null;
  venueId: string | null;
  instructorId: string | null;
  capacity: number | null;
  enrolmentMode: EnrolmentMode;
  feeTransactionTypeId: string | null;
  visitorFeeTransactionTypeId: string | null;
  visitorsAllowed: boolean;
  walkInAllowed: boolean;
  cancellationNoticeHours: number | null;
  sortOrder: number;
  isActive: boolean;
  venue: { id: string; code: string; name: string; capacity: number; isActive: boolean } | null;
  instructor: { id: string; code: string; name: string; isActive: boolean } | null;
  feeItem: { id: string; transactionType: string; description: string | null } | null;
  visitorFeeItem: { id: string; transactionType: string; description: string | null } | null;
  scheduleCount: number;
  sessionCount: number;
  canModify?: boolean;
}

export type FacilityClassPayload = Partial<Pick<FacilityClass, 'code' | 'description' | 'details' | 'venueId' | 'instructorId' | 'capacity' | 'enrolmentMode'
  | 'feeTransactionTypeId' | 'visitorFeeTransactionTypeId' | 'visitorsAllowed' | 'walkInAllowed' | 'cancellationNoticeHours' | 'sortOrder' | 'isActive'>>;

export interface FacilityClassListing {
  classes: FacilityClass[];
  venues: ClassVenueOption[];
  instructors: ClassInstructorOption[];
  feeItems: ClassFeeItemOption[];
}

// The recurrence header of a class.
export interface FacilityClassSchedule {
  id: string;
  classId: string;
  name: string;
  dateFrom: string; // 'YYYY-MM-DD'
  dateTo: string;
  weekdays: number[]; // ISO 1 = Monday .. 7 = Sunday
  startTime: string; // 'HH:MM'
  endTime: string;
  venueId: string | null;
  instructorId: string | null;
  capacity: number | null;
  skipClosures: boolean;
  skipPublicHolidays: boolean;
  termFeeNote: string | null;
  status: ScheduleStatus;
  remarks: string | null;
  venue: { id: string; code: string; name: string } | null;
  instructor: { id: string; code: string; name: string } | null;
  sessionCounts: { scheduled: number; held: number; cancelled: number };
  nextSessionDate: string | null;
}

export interface FacilityScheduleHeader {
  name: string;
  dateFrom: string;
  dateTo: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  venueId: string | null;
  instructorId: string | null;
  capacity: number | null;
  skipClosures: boolean;
  skipPublicHolidays: boolean;
  termFeeNote: string | null;
  remarks: string | null;
}

// One previewed date of a schedule: generated, skipped (closed, holiday)
// or in conflict (the venue, the court, a booking, the instructor).
export interface SchedulePreviewRow {
  date: string;
  dayType: 'weekday' | 'weekend';
  isHoliday: boolean;
  status: 'ok' | 'skipped' | 'conflict';
  reason: string | null;
}

export interface SchedulePreview {
  rows: SchedulePreviewRow[];
  counts: { ok: number; skipped: number; conflict: number };
  facts: { venueId: string; instructorId: string; capacity: number; facilityId: string | null };
  blocksUnit: boolean;
}

export interface ScheduleSaveResult {
  message: string;
  schedule: FacilityClassSchedule;
  counts?: { ok: number; skipped: number; conflict: number };
  summary?: { updated: number; created: number; cancelled: number; restored: number };
}

// One dated meeting on the timetable.
export interface FacilityClassSession {
  id: string;
  classId: string;
  class: { id: string; code: string; description: string; enrolmentMode: EnrolmentMode; walkInAllowed: boolean; visitorsAllowed: boolean } | null;
  scheduleId: string | null;
  schedule: { id: string; name: string; status: ScheduleStatus } | null;
  sessionDate: string;
  startTime: string;
  endTime: string;
  venueId: string;
  venue: { id: string; code: string; name: string } | null;
  facilityId: string | null;
  facility: { id: string; code: string; name: string } | null;
  instructorId: string;
  instructor: { id: string; code: string; name: string } | null;
  capacity: number;
  status: SessionStatus;
  heldAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  remarks: string | null;
  canModify?: boolean;
}

export interface SessionListing {
  from: string;
  to: string;
  clubNow: { date: string; time: string };
  sessions: FacilityClassSession[];
  classes: { id: string; code: string; description: string; enrolmentMode: EnrolmentMode; isActive: boolean; venueId: string | null; instructorId: string | null; capacity: number | null }[];
  venues: ClassVenueOption[];
  instructors: ClassInstructorOption[];
}

export interface SessionPayload {
  classId?: string;
  scheduleId?: string | null;
  sessionDate?: string;
  startTime?: string;
  endTime?: string;
  venueId?: string | null;
  instructorId?: string | null;
  capacity?: number | null;
  remarks?: string | null;
}

@Injectable({ providedIn: 'root' })
export class FacilityClassService {
  private readonly http = inject(HttpClient);
  private readonly classes = `${environment.apiUrl}/facility/classes`;
  private readonly sessions = `${environment.apiUrl}/facility/class-sessions`;

  // --- Classes (/facility/classes) ---

  list(): Observable<FacilityClassListing> {
    return this.http.get<FacilityClassListing>(this.classes);
  }

  create(payload: FacilityClassPayload): Observable<{ message: string; class: FacilityClass }> {
    return this.http.post<{ message: string; class: FacilityClass }>(this.classes, payload);
  }

  update(id: string, payload: FacilityClassPayload): Observable<{ message: string; class: FacilityClass }> {
    return this.http.patch<{ message: string; class: FacilityClass }>(`${this.classes}/${id}`, payload);
  }

  remove(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.classes}/${id}`);
  }

  // --- Schedules of a class ---

  schedules(classId: string): Observable<FacilityClassSchedule[]> {
    return this.http.get<FacilityClassSchedule[]>(`${this.classes}/${classId}/schedules`);
  }

  // The dates a header would generate, each ok / skipped / conflict (nothing saved).
  previewSchedule(classId: string, header: Partial<FacilityScheduleHeader> & { scheduleId?: string | null }): Observable<SchedulePreview> {
    return this.http.post<SchedulePreview>(`${this.classes}/${classId}/schedules/preview`, header);
  }

  createSchedule(classId: string, header: FacilityScheduleHeader): Observable<ScheduleSaveResult> {
    return this.http.post<ScheduleSaveResult>(`${this.classes}/${classId}/schedules`, header);
  }

  // Re-plans the future sessions: on-pattern ones updated, off-pattern ones cancelled, new dates added.
  updateSchedule(classId: string, scheduleId: string, header: Partial<FacilityScheduleHeader>): Observable<ScheduleSaveResult> {
    return this.http.put<ScheduleSaveResult>(`${this.classes}/${classId}/schedules/${scheduleId}`, header);
  }

  closeSchedule(classId: string, scheduleId: string): Observable<ScheduleSaveResult> {
    return this.http.post<ScheduleSaveResult>(`${this.classes}/${classId}/schedules/${scheduleId}/close`, {});
  }

  cancelSchedule(classId: string, scheduleId: string, reason: string): Observable<ScheduleSaveResult> {
    return this.http.post<ScheduleSaveResult>(`${this.classes}/${classId}/schedules/${scheduleId}/cancel`, { reason });
  }

  // --- Sessions (/facility/class-schedule) ---

  sessionsBetween(from: string, to: string, filters: { classId?: string | null; instructorId?: string | null; venueId?: string | null } = {}): Observable<SessionListing> {
    let params = new HttpParams().set('from', from).set('to', to);
    for (const [k, v] of Object.entries(filters)) if (v) params = params.set(k, v);
    return this.http.get<SessionListing>(this.sessions, { params });
  }

  createSession(payload: SessionPayload): Observable<{ message: string; session: FacilityClassSession }> {
    return this.http.post<{ message: string; session: FacilityClassSession }>(this.sessions, payload);
  }

  updateSession(id: string, payload: SessionPayload): Observable<{ message: string; session: FacilityClassSession }> {
    return this.http.patch<{ message: string; session: FacilityClassSession }>(`${this.sessions}/${id}`, payload);
  }

  cancelSession(id: string, reason: string): Observable<{ message: string; session: FacilityClassSession }> {
    return this.http.post<{ message: string; session: FacilityClassSession }>(`${this.sessions}/${id}/cancel`, { reason });
  }
}
