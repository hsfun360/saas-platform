import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// Facility no-show (structures approved 2026-10-26, slice 4): the penalty
// charges (post, waive, re-price) and the booking suspensions (manual, lift).

export interface FacilityNoShowCharge {
  id: string;
  bookingId: string;
  bookingNo: string;
  facilityTypeId: string;
  bookingDate: string;
  chargeReason: 'no-show' | 'late-cancel';
  bookerPatronId: string;
  bookerName: string;
  bookerMemberNo: string | null;
  slotSummary: string;
  transactionTypeId: string | null;
  description: string;
  quantity: number;
  unitAmount: number;
  amount: number;
  taxAmount: number;
  totalAmount: number;
  strikeCounted: boolean;
  status: 'pending' | 'posted' | 'waived';
  arDocNo: string | null;
  postedAt: string | null;
  waivedAt: string | null;
  waiveReason: string | null;
  remarks: string | null;
  canModify?: boolean;
}

export interface FacilitySuspension {
  id: string;
  patronId: string;
  patronName: string;
  memberNo: string | null;
  facilityTypeId: string | null;
  facilityTypeCode?: string | null;
  reason: string;
  fromDate: string;
  toDate: string;
  strikeChargeIds: string[];
  status: 'active' | 'lifted' | 'expired';
  liftedAt: string | null;
  liftReason: string | null;
  createdAt: string;
  canModify?: boolean;
}

@Injectable({ providedIn: 'root' })
export class FacilityNoShowService {
  private readonly http = inject(HttpClient);
  private readonly charges = `${environment.apiUrl}/facility/no-show-charges`;
  private readonly suspensions = `${environment.apiUrl}/facility/suspensions`;

  listCharges(filter: { status?: string; from?: string; to?: string; q?: string } = {}): Observable<{ charges: FacilityNoShowCharge[]; controlled: boolean; basis: string | null }> {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(filter)) if (v) params = params.set(k, v);
    return this.http.get<{ charges: FacilityNoShowCharge[]; controlled: boolean; basis: string | null }>(this.charges, { params });
  }

  postCharge(id: string): Observable<{ message: string; charge: FacilityNoShowCharge }> {
    return this.http.post<{ message: string; charge: FacilityNoShowCharge }>(`${this.charges}/${id}/post`, {});
  }

  waiveCharge(id: string, reason: string, clearStrike: boolean): Observable<{ message: string; charge: FacilityNoShowCharge }> {
    return this.http.post<{ message: string; charge: FacilityNoShowCharge }>(`${this.charges}/${id}/waive`, { reason, clearStrike });
  }

  repriceCharge(id: string): Observable<{ message: string; charge: FacilityNoShowCharge }> {
    return this.http.post<{ message: string; charge: FacilityNoShowCharge }>(`${this.charges}/${id}/reprice`, {});
  }

  listSuspensions(status?: string | null): Observable<{ suspensions: FacilitySuspension[]; facilityTypes: { id: string; code: string; description: string }[] }> {
    const params = status ? new HttpParams().set('status', status) : new HttpParams();
    return this.http.get<{ suspensions: FacilitySuspension[]; facilityTypes: { id: string; code: string; description: string }[] }>(this.suspensions, { params });
  }

  createSuspension(payload: { memberNo: string; fromDate: string; toDate: string; reason: string; facilityTypeId?: string | null }): Observable<{ message: string; suspension: FacilitySuspension }> {
    return this.http.post<{ message: string; suspension: FacilitySuspension }>(this.suspensions, payload);
  }

  liftSuspension(id: string, reason: string): Observable<{ message: string; suspension: FacilitySuspension }> {
    return this.http.post<{ message: string; suspension: FacilitySuspension }>(`${this.suspensions}/${id}/lift`, { reason });
  }
}
