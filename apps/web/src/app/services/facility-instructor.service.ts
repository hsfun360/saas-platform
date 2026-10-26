import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// One row of facility.Instructor (slice 5, structure approved 2026-10-26): a
// person who leads class sessions; no login of their own in this slice.
export interface FacilityInstructor {
  id: string;
  code: string;
  name: string;
  mobile: string | null;
  email: string | null;
  specialities: string | null;
  photoUrl: string | null;
  remarks: string | null;
  isActive: boolean;
  sessionCount: number;
  classCount: number;
  canModify?: boolean;
}

export type FacilityInstructorPayload = Partial<Pick<FacilityInstructor, 'code' | 'name' | 'mobile' | 'email' | 'specialities' | 'photoUrl' | 'remarks' | 'isActive'>>;

// Instructors master (/facility/instructors). Reads pass on the Classes and
// Class Schedule menu grants too; writes need the Instructors grant.
@Injectable({ providedIn: 'root' })
export class FacilityInstructorService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/facility/instructors`;

  list(): Observable<FacilityInstructor[]> {
    return this.http.get<FacilityInstructor[]>(this.base);
  }

  create(payload: FacilityInstructorPayload): Observable<{ message: string; instructor: FacilityInstructor }> {
    return this.http.post<{ message: string; instructor: FacilityInstructor }>(this.base, payload);
  }

  update(id: string, payload: FacilityInstructorPayload): Observable<{ message: string; instructor: FacilityInstructor }> {
    return this.http.patch<{ message: string; instructor: FacilityInstructor }>(`${this.base}/${id}`, payload);
  }

  remove(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/${id}`);
  }

  uploadPhoto(file: File): Observable<{ message: string; url: string }> {
    const form = new FormData();
    form.append('photo', file);
    return this.http.post<{ message: string; url: string }>(`${this.base}/photo`, form);
  }
}
