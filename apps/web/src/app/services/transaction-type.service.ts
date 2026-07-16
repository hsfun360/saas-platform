import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { MembershipTransactionType, TransactionTypeMeta, TaxSchemeRef } from '../models/auth.models';

// Transaction Type master file (Membership Management) for the active company.
// The billing-item catalog: code + charge type + description + THE tax scheme.
@Injectable({ providedIn: 'root' })
export class TransactionTypeService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/membership/transaction-types`;

  meta(): Observable<TransactionTypeMeta> {
    return this.http.get<TransactionTypeMeta>(`${this.base}/meta`);
  }

  taxSchemes(): Observable<{ schemes: TaxSchemeRef[]; countrySet: boolean }> {
    return this.http.get<{ schemes: TaxSchemeRef[]; countrySet: boolean }>(`${this.base}/tax-schemes`);
  }

  list(): Observable<MembershipTransactionType[]> {
    return this.http.get<MembershipTransactionType[]>(this.base);
  }

  create(payload: Partial<MembershipTransactionType>): Observable<{ message: string; transactionType: MembershipTransactionType }> {
    return this.http.post<{ message: string; transactionType: MembershipTransactionType }>(this.base, payload);
  }

  update(id: string, payload: Partial<MembershipTransactionType>): Observable<{ message: string; transactionType: MembershipTransactionType }> {
    return this.http.put<{ message: string; transactionType: MembershipTransactionType }>(`${this.base}/${id}`, payload);
  }

  setActive(id: string, isActive: boolean): Observable<{ message: string; transactionType: MembershipTransactionType }> {
    return this.http.patch<{ message: string; transactionType: MembershipTransactionType }>(`${this.base}/${id}`, { isActive });
  }
}
