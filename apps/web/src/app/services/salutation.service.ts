import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Salutation } from '../models/auth.models';

// Salutation - subscriber-owned reference data. Maintenance (Tenant Admin) lives
// under /auth/account/salutations; the active list for product pickers is
// /salutations (any workspace user). Enable/disable rather than delete.
@Injectable({ providedIn: 'root' })
export class SalutationService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  // Tenant Admin: every salutation of the caller's account.
  listAll(): Observable<Salutation[]> {
    return this.http.get<Salutation[]>(`${this.apiUrl}/auth/account/salutations`);
  }

  create(payload: { salutationCode: string; description?: string | null }): Observable<{ message: string; salutation: Salutation }> {
    return this.http.post<{ message: string; salutation: Salutation }>(`${this.apiUrl}/auth/account/salutations`, payload);
  }

  update(id: string, patch: Partial<Salutation>): Observable<{ message: string; salutation: Salutation }> {
    return this.http.patch<{ message: string; salutation: Salutation }>(`${this.apiUrl}/auth/account/salutations/${id}`, patch);
  }

  // Any workspace user: active salutations for dropdowns.
  listActive(): Observable<Pick<Salutation, 'salutationCode' | 'description'>[]> {
    return this.http.get<Pick<Salutation, 'salutationCode' | 'description'>[]>(`${this.apiUrl}/salutations`);
  }
}
