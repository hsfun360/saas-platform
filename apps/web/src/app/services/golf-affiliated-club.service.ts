import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { MembershipStatusOption } from '../models/auth.models';

export type GolfAffiliatedClubKind = 'affiliate' | 'reciprocal';
export type GolfVisitCapPeriod = 'week' | 'month' | 'year';

// One affiliated association or reciprocal club (golf.AffiliatedClub) with
// the arrangement's terms the visit document and the desk enforce.
export interface GolfAffiliatedClub {
  id: string;
  code: string;
  name: string;
  kind: GolfAffiliatedClubKind;
  playerTypeId: string;
  playerTypeCode: string | null;
  playerTypeLabel: string | null;
  agreementFrom: string | null;
  agreementTo: string | null;
  allowChargeToHomeClub: boolean;
  maxGuestsPerVisit: number | null;
  maxVisitsPerPlayer: number | null;
  maxVisitsPeriod: GolfVisitCapPeriod | null;
  requiresApproval: boolean;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: { line1: string | null; line2: string | null; city: string | null; state: string | null; postcode: string | null; countryCode: string | null; country: string | null };
  remarks: string | null;
  isActive: boolean;
  sortOrder: number;
  canModify?: boolean;
}

export interface GolfAffiliatedClubPayload {
  code: string;
  name: string;
  kind: GolfAffiliatedClubKind | '';
  playerTypeId: string;
  agreementFrom: string | null;
  agreementTo: string | null;
  allowChargeToHomeClub: boolean;
  maxGuestsPerVisit: number | null;
  maxVisitsPerPlayer: number | null;
  maxVisitsPeriod: GolfVisitCapPeriod | '' | null;
  requiresApproval: boolean;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  countryCode: string | null;
  remarks: string | null;
  sortOrder: number;
}

export interface GolfAffiliatedClubMeta {
  kinds: MembershipStatusOption[];
  periods: MembershipStatusOption[];
  // The affiliate-base player types (served here, no Player Types grant needed).
  playerTypes: { id: string; code: string; description: string; isActive: boolean }[];
}

// Affiliated / Reciprocal Club master file (Golf Management → Common Setup).
@Injectable({ providedIn: 'root' })
export class GolfAffiliatedClubService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/golf/affiliated-clubs`;

  meta(): Observable<GolfAffiliatedClubMeta> {
    return this.http.get<GolfAffiliatedClubMeta>(`${this.base}/meta`);
  }

  list(): Observable<{ clubs: GolfAffiliatedClub[]; kinds: MembershipStatusOption[]; periods: MembershipStatusOption[] }> {
    return this.http.get<{ clubs: GolfAffiliatedClub[]; kinds: MembershipStatusOption[]; periods: MembershipStatusOption[] }>(this.base);
  }

  create(payload: GolfAffiliatedClubPayload): Observable<{ message: string; club: GolfAffiliatedClub }> {
    return this.http.post<{ message: string; club: GolfAffiliatedClub }>(this.base, payload);
  }

  update(id: string, payload: GolfAffiliatedClubPayload): Observable<{ message: string; club: GolfAffiliatedClub }> {
    return this.http.put<{ message: string; club: GolfAffiliatedClub }>(`${this.base}/${id}`, payload);
  }

  setActive(id: string, isActive: boolean): Observable<{ message: string; club: GolfAffiliatedClub }> {
    return this.http.patch<{ message: string; club: GolfAffiliatedClub }>(`${this.base}/${id}`, { isActive });
  }

  remove(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/${id}`);
  }
}
