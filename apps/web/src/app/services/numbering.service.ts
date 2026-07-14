import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { NumberingScheme, NumberingSchemeMeta } from '../models/auth.models';

// Numbering Control - per-company document numbering config (Tenant Admin, active
// company). Consumed by products via the server-side numbering gateway.
@Injectable({ providedIn: 'root' })
export class NumberingService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/auth/company/numbering-schemes`;

  meta(): Observable<NumberingSchemeMeta> {
    return this.http.get<NumberingSchemeMeta>(`${this.base}/meta`);
  }

  list(): Observable<NumberingScheme[]> {
    return this.http.get<NumberingScheme[]>(this.base);
  }

  create(payload: Partial<NumberingScheme>): Observable<{ message: string; scheme: NumberingScheme }> {
    return this.http.post<{ message: string; scheme: NumberingScheme }>(this.base, payload);
  }

  update(id: string, payload: Partial<NumberingScheme>): Observable<{ message: string; scheme: NumberingScheme }> {
    return this.http.patch<{ message: string; scheme: NumberingScheme }>(`${this.base}/${id}`, payload);
  }
}
