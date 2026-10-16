import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { MembershipStatusOption } from '../models/auth.models';
import { GolfAffiliatedClubKind, GolfVisitCapPeriod } from './golf-affiliated-club.service';

export type GolfVisitStatus = 'requested' | 'pending-approval' | 'confirmed' | 'declined' | 'arrived' | 'completed' | 'cancelled' | 'expired';

// What the letter asks for; golf is the part the system books.
export interface GolfVisitFacilities {
  golf?: { courseId: string | null; teeTime: string | null; holes: number } | null;
  dining?: string | null;
  accommodation?: string | null;
  other?: string | null;
}

// One incoming Letter of Introduction and the visit it authorises (golf.AffiliatedVisit).
export interface GolfAffiliatedVisit {
  id: string;
  visitNo: string;
  affiliatedClubId: string;
  club: { id: string; code: string; name: string; kind: GolfAffiliatedClubKind; allowChargeToHomeClub: boolean } | null;
  status: GolfVisitStatus;
  visitorName: string;
  visitorMemberNo: string;
  visitorIdentityNo: string | null;
  visitorMobile: string | null;
  visitorEmail: string | null;
  golferId: string | null;
  loiReference: string | null;
  loiDocumentUrl: string | null;
  visitDate: string;
  alternateDate: string | null;
  facilities: GolfVisitFacilities;
  facilitiesText: string;
  playerCount: number;
  guestCount: number;
  bookingProfileId: string | null;
  bookingNo: string | null;
  confirmedAt: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  expiredAt: string | null;
  arrivedAt: string | null;
  completedAt: string | null;
  remarks: string | null;
  createdAt: string;
  isOpen: boolean;
  canModify?: boolean;
}

export interface GolfVisitPayload {
  affiliatedClubId: string;
  visitNo?: string;
  visitorName: string;
  visitorMemberNo: string;
  visitorIdentityNo: string | null;
  visitorMobile: string | null;
  visitorEmail: string | null;
  loiReference: string | null;
  loiDocumentUrl: string | null;
  visitDate: string;
  alternateDate: string | null;
  facilities: GolfVisitFacilities;
  playerCount: number;
  guestCount: number;
  remarks: string | null;
}

export interface GolfVisitClubOption {
  id: string;
  code: string;
  name: string;
  kind: GolfAffiliatedClubKind;
  agreementFrom: string | null;
  agreementTo: string | null;
  maxGuestsPerVisit: number | null;
  maxVisitsPerPlayer: number | null;
  maxVisitsPeriod: GolfVisitCapPeriod | null;
  requiresApproval: boolean;
  allowChargeToHomeClub: boolean;
  contactEmail: string | null;
}

export interface GolfVisitMeta {
  clubs: GolfVisitClubOption[];
  courses: { id: string; courseCode: string; description: string | null }[];
  statuses: MembershipStatusOption[];
  facilities: MembershipStatusOption[];
  kinds: MembershipStatusOption[];
}

// The confirm preview: what Confirm will do, stated before it runs.
export interface GolfVisitConfirmPreview {
  visit: GolfAffiliatedVisit;
  playerType: { code: string; description: string } | null;
  needsApproval: boolean;
  chain: { steps?: { stepNo?: number; name?: string; approvers?: string[] }[] } | null;
  flight: { courseId: string; courseCode: string; courseName: string; teeTime: string; crossTime: string | null; holes: number; seatsLeft: number; dayType: string } | null;
  visitsThisPeriod: number;
  summary: string;
}

// Affiliated Visits (Golf Management → Front Desk): the letter-of-introduction
// document on the HOST side. Behind the Golf entitlement + '/golf/affiliated-visits'.
@Injectable({ providedIn: 'root' })
export class GolfAffiliatedVisitService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/golf/affiliated-visits`;

  meta(): Observable<GolfVisitMeta> {
    return this.http.get<GolfVisitMeta>(`${this.base}/meta`);
  }

  list(filter: { dateFrom?: string; dateTo?: string; status?: string }): Observable<{ visits: GolfAffiliatedVisit[]; statuses: MembershipStatusOption[] }> {
    let params = new HttpParams();
    if (filter.dateFrom) params = params.set('dateFrom', filter.dateFrom);
    if (filter.dateTo) params = params.set('dateTo', filter.dateTo);
    if (filter.status) params = params.set('status', filter.status);
    return this.http.get<{ visits: GolfAffiliatedVisit[]; statuses: MembershipStatusOption[] }>(this.base, { params });
  }

  create(payload: GolfVisitPayload): Observable<{ message: string; visit: GolfAffiliatedVisit }> {
    return this.http.post<{ message: string; visit: GolfAffiliatedVisit }>(this.base, payload);
  }

  update(id: string, payload: GolfVisitPayload): Observable<{ message: string; visit: GolfAffiliatedVisit }> {
    return this.http.put<{ message: string; visit: GolfAffiliatedVisit }>(`${this.base}/${id}`, payload);
  }

  confirmPreview(id: string): Observable<GolfVisitConfirmPreview> {
    return this.http.get<GolfVisitConfirmPreview>(`${this.base}/${id}/confirm-preview`);
  }

  confirm(id: string): Observable<{ message: string; visit: GolfAffiliatedVisit }> {
    return this.http.post<{ message: string; visit: GolfAffiliatedVisit }>(`${this.base}/${id}/confirm`, {});
  }

  decline(id: string, reason: string): Observable<{ message: string; visit: GolfAffiliatedVisit }> {
    return this.http.post<{ message: string; visit: GolfAffiliatedVisit }>(`${this.base}/${id}/decline`, { reason });
  }

  cancel(id: string, reason: string): Observable<{ message: string; visit: GolfAffiliatedVisit }> {
    return this.http.post<{ message: string; visit: GolfAffiliatedVisit }>(`${this.base}/${id}/cancel`, { reason });
  }

  arrive(id: string, checks: { letterSighted: boolean; idSighted: boolean }): Observable<{ message: string; visit: GolfAffiliatedVisit }> {
    return this.http.post<{ message: string; visit: GolfAffiliatedVisit }>(`${this.base}/${id}/arrive`, checks);
  }

  complete(id: string): Observable<{ message: string; visit: GolfAffiliatedVisit }> {
    return this.http.post<{ message: string; visit: GolfAffiliatedVisit }>(`${this.base}/${id}/complete`, {});
  }

  // Upload the home club's letter; returns the URL to store via create / update.
  uploadLetter(file: File): Observable<{ message: string; url: string }> {
    const form = new FormData();
    form.append('letter', file);
    return this.http.post<{ message: string; url: string }>(`${this.base}/letter`, form);
  }
}
