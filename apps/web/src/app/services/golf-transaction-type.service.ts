import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { GolfTransactionType, TransactionTypeMeta, TaxSchemeRef } from '../models/auth.models';

// Transaction Type master file (Golf Management) for the active company.
// The billing-item catalog: code + charge type + description + THE tax scheme.
@Injectable({ providedIn: 'root' })
export class GolfTransactionTypeService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/golf/transaction-types`;

  meta(): Observable<TransactionTypeMeta> {
    return this.http.get<TransactionTypeMeta>(`${this.base}/meta`);
  }

  taxSchemes(): Observable<{ schemes: TaxSchemeRef[]; countrySet: boolean }> {
    return this.http.get<{ schemes: TaxSchemeRef[]; countrySet: boolean }>(`${this.base}/tax-schemes`);
  }

  list(): Observable<GolfTransactionType[]> {
    return this.http.get<GolfTransactionType[]>(this.base);
  }

  create(payload: Partial<GolfTransactionType>): Observable<{ message: string; transactionType: GolfTransactionType }> {
    return this.http.post<{ message: string; transactionType: GolfTransactionType }>(this.base, payload);
  }

  update(id: string, payload: Partial<GolfTransactionType>): Observable<{ message: string; transactionType: GolfTransactionType }> {
    return this.http.put<{ message: string; transactionType: GolfTransactionType }>(`${this.base}/${id}`, payload);
  }

  setActive(id: string, isActive: boolean): Observable<{ message: string; transactionType: GolfTransactionType }> {
    return this.http.patch<{ message: string; transactionType: GolfTransactionType }>(`${this.base}/${id}`, { isActive });
  }
}
