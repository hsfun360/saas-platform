import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Currency, MembershipType, MembershipTypeMeta, TransactionTypePickerRow } from '../models/auth.models';

// Membership Type master file (main table) for the active company. Enable/disable
// via setActive rather than delete.
@Injectable({ providedIn: 'root' })
export class MembershipTypeService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/membership/types`;

  meta(): Observable<MembershipTypeMeta> {
    return this.http.get<MembershipTypeMeta>(`${this.base}/meta`);
  }

  // The subscriber's currency set for the additional-fee money fields.
  currencies(): Observable<Currency[]> {
    return this.http.get<Currency[]>(`${this.base}/currencies`);
  }

  // The company's ACTIVE Transaction Type master rows for the Joining-fees /
  // Standing-charges pickers (served on this router to avoid cross-menu RBAC).
  transactionTypes(): Observable<TransactionTypePickerRow[]> {
    return this.http.get<TransactionTypePickerRow[]>(`${this.base}/transaction-types`);
  }

  list(): Observable<MembershipType[]> {
    return this.http.get<MembershipType[]>(this.base);
  }

  create(payload: Partial<MembershipType>): Observable<{ message: string; type: MembershipType }> {
    return this.http.post<{ message: string; type: MembershipType }>(this.base, payload);
  }

  update(id: string, payload: Partial<MembershipType>): Observable<{ message: string; type: MembershipType }> {
    return this.http.put<{ message: string; type: MembershipType }>(`${this.base}/${id}`, payload);
  }

  setActive(id: string, isActive: boolean): Observable<{ message: string; type: MembershipType }> {
    return this.http.patch<{ message: string; type: MembershipType }>(`${this.base}/${id}`, { isActive });
  }

  // Joining fees (one-time charges on joining) - replaced wholesale.
  updateAdditionalFees(id: string, additionalFees: MembershipType['additionalFees']): Observable<{ message: string; type: MembershipType }> {
    return this.http.put<{ message: string; type: MembershipType }>(`${this.base}/${id}/additional-fees`, { additionalFees });
  }

  // Standing charges (per-status recurring charges) - replaced wholesale.
  updateStandingCharges(id: string, standingCharges: MembershipType['standingCharges']): Observable<{ message: string; type: MembershipType }> {
    return this.http.put<{ message: string; type: MembershipType }>(`${this.base}/${id}/standing-charges`, { standingCharges });
  }
}
