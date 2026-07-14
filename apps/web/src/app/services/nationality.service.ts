import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Nationality } from '../models/auth.models';

// Nationality - subscriber-owned reference data. Maintenance (Tenant Admin)
// lives under /auth/account/nationalities; the active list for product pickers
// is /nationalities (any workspace user). Enable/disable rather than delete.
@Injectable({ providedIn: 'root' })
export class NationalityService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  // Tenant Admin: every nationality of the caller's account.
  listAll(): Observable<Nationality[]> {
    return this.http.get<Nationality[]>(`${this.apiUrl}/auth/account/nationalities`);
  }

  create(payload: { nationalityCode: string; description?: string | null }): Observable<{ message: string; nationality: Nationality }> {
    return this.http.post<{ message: string; nationality: Nationality }>(`${this.apiUrl}/auth/account/nationalities`, payload);
  }

  update(id: string, patch: Partial<Nationality>): Observable<{ message: string; nationality: Nationality }> {
    return this.http.patch<{ message: string; nationality: Nationality }>(`${this.apiUrl}/auth/account/nationalities/${id}`, patch);
  }

  // Any workspace user: active nationalities for dropdowns.
  listActive(): Observable<Pick<Nationality, 'nationalityCode' | 'description'>[]> {
    return this.http.get<Pick<Nationality, 'nationalityCode' | 'description'>[]>(`${this.apiUrl}/nationalities`);
  }
}
