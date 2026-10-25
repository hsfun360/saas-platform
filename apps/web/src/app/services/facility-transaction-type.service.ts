import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { MembershipStatusOption, TaxSchemeRef } from '../models/auth.models';
import { FacilityParticipantTypeOption } from './facility-participant-type.service';
import { FacilityUsageMode } from './facility-type.service';

export type FacilityFeeBasis = 'per-slot' | 'per-participant' | 'per-booking';

// One row of facility.TransactionType (structure approved 2026-10-25): the
// billing-item catalog with its fee basis, owning facility type, default
// participant category and THE tax scheme.
export interface FacilityTransactionType {
  id: string;
  canModify?: boolean;
  transactionType: string;
  chargeType: string;
  feeBasis: FacilityFeeBasis;
  facilityTypeId: string | null;
  description: string | null;
  participantType: string | null;
  taxSchemeCode: string | null;
  allowPriceOverride: boolean;
  iconUrl: string | null;
  isActive: boolean;
  isMatrix: boolean;
  rateCount: number;
}

export type FacilityTransactionTypePayload = Partial<Omit<FacilityTransactionType, 'id' | 'canModify' | 'isMatrix' | 'rateCount'>>;

// One price cell of a matrix card: participant x day scope x session.
export interface FacilityRateCell {
  id?: string;
  participantType: string;
  dayScope: string; // 'all' | 'weekday' | 'weekend'
  sessionId: string | null;
  amount: number;
}

// One effective-dated price card.
export interface FacilityTransactionTypeRate {
  id: string;
  canModify?: boolean;
  effectiveDate: string; // 'YYYY-MM-DD'
  flatAmount: number | null;
  isActive: boolean;
  cells: FacilityRateCell[];
}

export interface FacilityRatePayload {
  effectiveDate: string;
  flatAmount?: number | null;
  cells?: FacilityRateCell[];
}

export interface FacilityTransactionTypeMeta {
  chargeTypes: MembershipStatusOption[];
  matrixChargeTypes: string[];
  defaultTypedChargeTypes: string[];
  reservedChargeTypes: string[];
  feeBases: (MembershipStatusOption & { hint?: string })[];
  dayScopes: MembershipStatusOption[];
  participantTypes: FacilityParticipantTypeOption[];
  facilityTypes: { id: string; code: string; description: string; usageMode: FacilityUsageMode; isActive: boolean }[];
  sessions: { id: string; name: string; startTime: string; endTime: string }[];
}

@Injectable({ providedIn: 'root' })
export class FacilityTransactionTypeService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/facility/transaction-types`;

  meta(): Observable<FacilityTransactionTypeMeta> {
    return this.http.get<FacilityTransactionTypeMeta>(`${this.base}/meta`);
  }

  taxSchemes(): Observable<{ schemes: TaxSchemeRef[]; countrySet: boolean }> {
    return this.http.get<{ schemes: TaxSchemeRef[]; countrySet: boolean }>(`${this.base}/tax-schemes`);
  }

  list(): Observable<FacilityTransactionType[]> {
    return this.http.get<FacilityTransactionType[]>(this.base);
  }

  create(payload: FacilityTransactionTypePayload): Observable<{ message: string; transactionType: FacilityTransactionType }> {
    return this.http.post<{ message: string; transactionType: FacilityTransactionType }>(this.base, payload);
  }

  update(id: string, payload: FacilityTransactionTypePayload): Observable<{ message: string; transactionType: FacilityTransactionType }> {
    return this.http.put<{ message: string; transactionType: FacilityTransactionType }>(`${this.base}/${id}`, payload);
  }

  setActive(id: string, isActive: boolean): Observable<{ message: string; transactionType: FacilityTransactionType }> {
    return this.http.patch<{ message: string; transactionType: FacilityTransactionType }>(`${this.base}/${id}`, { isActive });
  }

  uploadIcon(file: File): Observable<{ message: string; url: string }> {
    const form = new FormData();
    form.append('icon', file);
    return this.http.post<{ message: string; url: string }>(`${this.base}/icon`, form);
  }

  // Pricing - the effective-dated price cards of one transaction type.
  rates(id: string): Observable<FacilityTransactionTypeRate[]> {
    return this.http.get<FacilityTransactionTypeRate[]>(`${this.base}/${id}/rates`);
  }

  createRate(id: string, payload: FacilityRatePayload): Observable<{ message: string; rate: FacilityTransactionTypeRate }> {
    return this.http.post<{ message: string; rate: FacilityTransactionTypeRate }>(`${this.base}/${id}/rates`, payload);
  }

  updateRate(id: string, rateId: string, payload: FacilityRatePayload): Observable<{ message: string; rate: FacilityTransactionTypeRate }> {
    return this.http.put<{ message: string; rate: FacilityTransactionTypeRate }>(`${this.base}/${id}/rates/${rateId}`, payload);
  }

  setRateActive(id: string, rateId: string, isActive: boolean): Observable<{ message: string; rate: FacilityTransactionTypeRate }> {
    return this.http.patch<{ message: string; rate: FacilityTransactionTypeRate }>(`${this.base}/${id}/rates/${rateId}`, { isActive });
  }

  deleteRate(id: string, rateId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/${id}/rates/${rateId}`);
  }
}
