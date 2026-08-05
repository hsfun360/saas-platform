import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ArDebtor, ArDebtorListResult, ArDebtorsMeta, ArOtherDebtor } from '../models/ar.models';

// Account Receivable (slice 1): the shared Debtor Listing (all three debtor
// types in one query), ledger-account maintenance, and the Other Debtor party
// master. The membership-side backfill utility also lives here - it is an AR
// operations task even though its endpoint sits on the producer.
@Injectable({ providedIn: 'root' })
export class ArService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/ar`;

  meta(): Observable<ArDebtorsMeta> {
    return this.http.get<ArDebtorsMeta>(`${this.base}/debtors/meta`);
  }

  // Server-side search + pagination (party masters are searched server-side
  // through the membership seam; the browser only ever receives one page).
  listDebtors(opts: { q?: string; type?: string; status?: string; offset?: number } = {}): Observable<ArDebtorListResult> {
    let params = new HttpParams();
    if (opts.q) params = params.set('q', opts.q);
    if (opts.type) params = params.set('type', opts.type);
    if (opts.status) params = params.set('status', opts.status);
    if (opts.offset) params = params.set('offset', String(opts.offset));
    return this.http.get<ArDebtorListResult>(`${this.base}/debtors`, { params });
  }

  updateDebtor(id: string, payload: Record<string, unknown>): Observable<{ message: string; debtor: ArDebtor }> {
    return this.http.patch<{ message: string; debtor: ArDebtor }>(`${this.base}/debtors/${id}`, payload);
  }

  getOtherDebtor(id: string): Observable<{ otherDebtor: ArOtherDebtor }> {
    return this.http.get<{ otherDebtor: ArOtherDebtor }>(`${this.base}/other-debtors/${id}`);
  }

  createOtherDebtor(payload: Record<string, unknown>): Observable<{ message: string; otherDebtor: ArOtherDebtor }> {
    return this.http.post<{ message: string; otherDebtor: ArOtherDebtor }>(`${this.base}/other-debtors`, payload);
  }

  updateOtherDebtor(id: string, payload: Record<string, unknown>): Observable<{ message: string; otherDebtor: ArOtherDebtor }> {
    return this.http.patch<{ message: string; otherDebtor: ArOtherDebtor }>(`${this.base}/other-debtors/${id}`, payload);
  }

  // Producer-side utility: enqueue provisioning for every currently-active
  // contract/nominee (idempotent; for data that predates the AR module).
  backfillDebtors(): Observable<{ message: string; memberships: number; nominees: number }> {
    return this.http.post<{ message: string; memberships: number; nominees: number }>(
      `${environment.apiUrl}/membership/debtor-backfill`, {},
    );
  }
}
