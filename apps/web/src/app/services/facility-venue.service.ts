import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { FacilityUsageMode } from './facility-type.service';

// One row of facility.Venue (slice 5, structure approved 2026-10-26): where a
// class is held - a place of its own with an optional link to one facility
// unit. The link decides the blocking: a slot-type unit is blocked whole
// while a session runs, an entry-type unit and an unlinked venue block nothing.
export interface FacilityVenue {
  id: string;
  code: string;
  name: string;
  description: string | null;
  facilityId: string | null;
  capacity: number;
  location: string | null;
  remarks: string | null;
  isActive: boolean;
  facility: { id: string; code: string; name: string; usageMode: FacilityUsageMode | null; facilityTypeCode: string | null } | null;
  blocksUnit: boolean;
  blockingText: string;
  sessionCount: number;
  classCount: number;
  canModify?: boolean;
}

export type FacilityVenuePayload = Partial<Pick<FacilityVenue, 'code' | 'name' | 'description' | 'facilityId' | 'capacity' | 'location' | 'remarks' | 'isActive'>>;

// The active units of every type, for the link picker.
export interface VenueUnitOption {
  id: string;
  code: string;
  name: string;
  usageMode: FacilityUsageMode;
  facilityTypeCode: string;
}

export interface FacilityVenueListing {
  venues: FacilityVenue[];
  facilities: VenueUnitOption[];
}

// Venues master (/facility/venues). Reads pass on the Classes and Class
// Schedule menu grants too; writes need the Venues grant.
@Injectable({ providedIn: 'root' })
export class FacilityVenueService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/facility/venues`;

  list(): Observable<FacilityVenueListing> {
    return this.http.get<FacilityVenueListing>(this.base);
  }

  create(payload: FacilityVenuePayload): Observable<{ message: string; venue: FacilityVenue }> {
    return this.http.post<{ message: string; venue: FacilityVenue }>(this.base, payload);
  }

  update(id: string, payload: FacilityVenuePayload): Observable<{ message: string; venue: FacilityVenue }> {
    return this.http.patch<{ message: string; venue: FacilityVenue }>(`${this.base}/${id}`, payload);
  }

  remove(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/${id}`);
  }
}
