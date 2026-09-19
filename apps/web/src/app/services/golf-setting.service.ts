import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// One advance-booking override line (a membership type booking earlier).
export interface GolfAdvanceBookingOverride {
  membershipTypeId: string;
  advanceBookingDays: number;
}

export interface GolfSettingDoc {
  setting: {
    advanceBookingDays: number;
    advanceBookingHours: number;
    allowMembershipTypeOverride: boolean;
    allowBookingMerge: boolean;
    saved: boolean;
  };
  overrides: GolfAdvanceBookingOverride[];
}

export interface GolfMembershipTypeOption {
  id: string;
  category: string;
  description?: string | null;
  isGolfAllow?: boolean;
}

// Golf Specification (per-company settings singleton) for the active company.
@Injectable({ providedIn: 'root' })
export class GolfSettingService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/golf/settings`;

  get(): Observable<GolfSettingDoc> {
    return this.http.get<GolfSettingDoc>(this.base);
  }

  // Membership-type picker for the override editor (served via the membership
  // seam - no Membership menu grant needed).
  membershipTypes(): Observable<{ membershipTypes: GolfMembershipTypeOption[] }> {
    return this.http.get<{ membershipTypes: GolfMembershipTypeOption[] }>(`${this.base}/membership-types`);
  }

  save(payload: {
    advanceBookingDays: number;
    advanceBookingHours: number;
    allowMembershipTypeOverride: boolean;
    allowBookingMerge: boolean;
    overrides: GolfAdvanceBookingOverride[];
  }): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(this.base, payload);
  }
}
