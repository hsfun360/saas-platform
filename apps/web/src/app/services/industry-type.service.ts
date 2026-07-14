import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { IndustryType } from '../models/auth.models';

// Industry Type - subscriber-owned reference data. Maintenance (Tenant Admin)
// lives under /auth/account/industry-types; the active list for product pickers
// is /industry-types (any workspace user). Enable/disable rather than delete.
@Injectable({ providedIn: 'root' })
export class IndustryTypeService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  // Tenant Admin: every industry type of the caller's account.
  listAll(): Observable<IndustryType[]> {
    return this.http.get<IndustryType[]>(`${this.apiUrl}/auth/account/industry-types`);
  }

  create(payload: { industryTypeCode: string; description?: string | null }): Observable<{ message: string; industryType: IndustryType }> {
    return this.http.post<{ message: string; industryType: IndustryType }>(`${this.apiUrl}/auth/account/industry-types`, payload);
  }

  update(id: string, patch: Partial<IndustryType>): Observable<{ message: string; industryType: IndustryType }> {
    return this.http.patch<{ message: string; industryType: IndustryType }>(`${this.apiUrl}/auth/account/industry-types/${id}`, patch);
  }

  // Any workspace user: active industry types for dropdowns.
  listActive(): Observable<Pick<IndustryType, 'industryTypeCode' | 'description'>[]> {
    return this.http.get<Pick<IndustryType, 'industryTypeCode' | 'description'>[]>(`${this.apiUrl}/industry-types`);
  }
}
