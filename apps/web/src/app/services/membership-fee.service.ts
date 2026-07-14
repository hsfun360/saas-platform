import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { MembershipFee, MembershipFeeMeta, TaxSchemeRef } from '../models/auth.models';

// Membership Fee master file for the active company. Header + installment
// stages are saved together. Enable/disable via setActive rather than delete.
@Injectable({ providedIn: 'root' })
export class MembershipFeeService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/membership/fees`;

  // Installment interval options for the dropdown.
  meta(): Observable<MembershipFeeMeta> {
    return this.http.get<MembershipFeeMeta>(`${this.base}/meta`);
  }

  // The active company's available tax schemes (via the tax seam).
  taxSchemes(): Observable<{ schemes: TaxSchemeRef[]; countrySet: boolean }> {
    return this.http.get<{ schemes: TaxSchemeRef[]; countrySet: boolean }>(`${this.base}/tax-schemes`);
  }

  list(): Observable<MembershipFee[]> {
    return this.http.get<MembershipFee[]>(this.base);
  }

  create(payload: Partial<MembershipFee>): Observable<{ message: string; fee: MembershipFee }> {
    return this.http.post<{ message: string; fee: MembershipFee }>(this.base, payload);
  }

  // Full update (header + replaces the installment schedule).
  update(id: string, payload: Partial<MembershipFee>): Observable<{ message: string; fee: MembershipFee }> {
    return this.http.put<{ message: string; fee: MembershipFee }>(`${this.base}/${id}`, payload);
  }

  // Quick enable/disable.
  setActive(id: string, isActive: boolean): Observable<{ message: string; fee: MembershipFee }> {
    return this.http.patch<{ message: string; fee: MembershipFee }>(`${this.base}/${id}`, { isActive });
  }
}
