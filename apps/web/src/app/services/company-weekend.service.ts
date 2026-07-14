import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { CompanyWeekendDays } from '../models/auth.models';

// CompanyWeekendDay - company-level weekend/rest-day setup. Maintenance (Tenant
// Admin) lives under /auth/companies/:companyId/weekend-days (a dialog on the
// Companies screen, like SMTP); the caller's own company's set for pricing
// matrices is /weekend-days (any workspace user). The set is saved whole (PUT
// replaces); an empty set means "not configured".
@Injectable({ providedIn: 'root' })
export class CompanyWeekendService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  // Tenant Admin: the weekend-day set of one company.
  get(companyId: string): Observable<CompanyWeekendDays> {
    return this.http.get<CompanyWeekendDays>(`${this.apiUrl}/auth/companies/${companyId}/weekend-days`);
  }

  // Tenant Admin: replace the whole set (ISO weekday numbers, 1 = Monday ... 7 = Sunday).
  save(companyId: string, weekendDays: number[]): Observable<{ message: string; weekendDays: number[] }> {
    return this.http.put<{ message: string; weekendDays: number[] }>(`${this.apiUrl}/auth/companies/${companyId}/weekend-days`, { weekendDays });
  }

  // Any workspace user: the weekend days of their own company (for pricing).
  listMine(): Observable<number[]> {
    return this.http.get<number[]>(`${this.apiUrl}/weekend-days`);
  }
}
