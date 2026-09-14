import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { GolfPaymentType, MembershipStatusOption } from '../models/auth.models';

// Payment Type master file (Golf Management) for the active company.
// The settlement-tender catalog: code + payment class + description + icon.
@Injectable({ providedIn: 'root' })
export class GolfPaymentTypeService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/golf/payment-types`;

  meta(): Observable<{ paymentClasses: MembershipStatusOption[] }> {
    return this.http.get<{ paymentClasses: MembershipStatusOption[] }>(`${this.base}/meta`);
  }

  list(): Observable<GolfPaymentType[]> {
    return this.http.get<GolfPaymentType[]>(this.base);
  }

  create(payload: Partial<GolfPaymentType>): Observable<{ message: string; paymentType: GolfPaymentType }> {
    return this.http.post<{ message: string; paymentType: GolfPaymentType }>(this.base, payload);
  }

  update(id: string, payload: Partial<GolfPaymentType>): Observable<{ message: string; paymentType: GolfPaymentType }> {
    return this.http.put<{ message: string; paymentType: GolfPaymentType }>(`${this.base}/${id}`, payload);
  }

  setActive(id: string, isActive: boolean): Observable<{ message: string; paymentType: GolfPaymentType }> {
    return this.http.patch<{ message: string; paymentType: GolfPaymentType }>(`${this.base}/${id}`, { isActive });
  }

  // Upload the settlement-tile icon; returns the public URL to store via create/update.
  uploadIcon(file: File): Observable<{ message: string; url: string }> {
    const form = new FormData();
    form.append('icon', file);
    return this.http.post<{ message: string; url: string }>(`${this.base}/icon`, form);
  }
}
