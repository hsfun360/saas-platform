import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Race } from '../models/auth.models';

// Race - subscriber-owned reference data. Maintenance (Tenant Admin) lives under
// /auth/account/races; the active list for product pickers is /races (any
// workspace user). Enable/disable rather than delete.
@Injectable({ providedIn: 'root' })
export class RaceService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  // Tenant Admin: every race of the caller's account.
  listAll(): Observable<Race[]> {
    return this.http.get<Race[]>(`${this.apiUrl}/auth/account/races`);
  }

  create(payload: { raceCode: string; description?: string | null }): Observable<{ message: string; race: Race }> {
    return this.http.post<{ message: string; race: Race }>(`${this.apiUrl}/auth/account/races`, payload);
  }

  update(id: string, patch: Partial<Race>): Observable<{ message: string; race: Race }> {
    return this.http.patch<{ message: string; race: Race }>(`${this.apiUrl}/auth/account/races/${id}`, patch);
  }

  // Any workspace user: active races for dropdowns.
  listActive(): Observable<Pick<Race, 'raceCode' | 'description'>[]> {
    return this.http.get<Pick<Race, 'raceCode' | 'description'>[]>(`${this.apiUrl}/races`);
  }
}
