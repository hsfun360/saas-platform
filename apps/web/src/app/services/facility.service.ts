import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { FacilityUsageMode } from './facility-type.service';

// One row of facility.Facility (structure approved 2026-10-25): one physical
// unit of a Facility Type - Badminton Court 1, the Gym, Locker 001.
export interface Facility {
  id: string;
  facilityTypeId: string;
  code: string;
  name: string;
  location: string | null;
  isIndoor: boolean;
  isFloodlit: boolean;
  capacity: number | null;
  pictureUrl: string | null;
  remarks: string | null;
  sortOrder: number;
  isActive: boolean;
  // Served with the listing: the unit's type.
  facilityType: { id: string; code: string; description: string; usageMode: FacilityUsageMode; trackUnits: boolean } | null;
  canModify?: boolean;
}

export type FacilityPayload = Partial<Omit<Facility, 'id' | 'facilityType' | 'canModify'>>;

// Facilities (units) master for the active company. Reads pass on the
// Closures menu grant too; writes need the Facilities grant.
@Injectable({ providedIn: 'root' })
export class FacilityService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/facility/facilities`;

  list(facilityTypeId?: string | null): Observable<Facility[]> {
    const params = facilityTypeId ? new HttpParams().set('facilityTypeId', facilityTypeId) : undefined;
    return this.http.get<Facility[]>(this.base, { params });
  }

  create(payload: FacilityPayload): Observable<{ message: string; facility: Facility }> {
    return this.http.post<{ message: string; facility: Facility }>(this.base, payload);
  }

  update(id: string, payload: FacilityPayload): Observable<{ message: string; facility: Facility }> {
    return this.http.patch<{ message: string; facility: Facility }>(`${this.base}/${id}`, payload);
  }

  remove(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/${id}`);
  }

  uploadPicture(file: File): Observable<{ message: string; url: string }> {
    const form = new FormData();
    form.append('picture', file);
    return this.http.post<{ message: string; url: string }>(`${this.base}/picture`, form);
  }
}
