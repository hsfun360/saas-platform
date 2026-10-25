import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { MembershipStatusOption } from '../models/auth.models';

// One row of facility.PaymentType (structure approved 2026-10-25): the
// settlement-tender catalog of the facility desk.
export interface FacilityPaymentType {
  id: string;
  canModify?: boolean;
  paymentType: string;
  paymentClass: string;
  description: string | null;
  iconUrl: string | null;
  isActive: boolean;
}

export type FacilityPaymentTypePayload = Partial<Omit<FacilityPaymentType, 'id' | 'canModify' | 'isActive'>>;

@Injectable({ providedIn: 'root' })
export class FacilityPaymentTypeService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/facility/payment-types`;

  meta(): Observable<{ paymentClasses: MembershipStatusOption[] }> {
    return this.http.get<{ paymentClasses: MembershipStatusOption[] }>(`${this.base}/meta`);
  }

  list(): Observable<FacilityPaymentType[]> {
    return this.http.get<FacilityPaymentType[]>(this.base);
  }

  create(payload: FacilityPaymentTypePayload): Observable<{ message: string; paymentType: FacilityPaymentType }> {
    return this.http.post<{ message: string; paymentType: FacilityPaymentType }>(this.base, payload);
  }

  update(id: string, payload: FacilityPaymentTypePayload): Observable<{ message: string; paymentType: FacilityPaymentType }> {
    return this.http.put<{ message: string; paymentType: FacilityPaymentType }>(`${this.base}/${id}`, payload);
  }

  setActive(id: string, isActive: boolean): Observable<{ message: string; paymentType: FacilityPaymentType }> {
    return this.http.patch<{ message: string; paymentType: FacilityPaymentType }>(`${this.base}/${id}`, { isActive });
  }

  uploadIcon(file: File): Observable<{ message: string; url: string }> {
    const form = new FormData();
    form.append('icon', file);
    return this.http.post<{ message: string; url: string }>(`${this.base}/icon`, form);
  }
}
