import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { HolidayCountry, PublicHoliday } from '../models/auth.models';

// PublicHoliday - subscriber-owned reference data, scoped by country.
// Maintenance (Tenant Admin) lives under /auth/account/public-holidays; the
// active list for product calendars is /public-holidays (any workspace user,
// resolved to the caller's company country). Enable/disable rather than delete.
@Injectable({ providedIn: 'root' })
export class PublicHolidayService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  // Tenant Admin: the countries holidays can be set up for (the account's
  // active companies' address countries).
  listCountries(): Observable<HolidayCountry[]> {
    return this.http.get<HolidayCountry[]>(`${this.apiUrl}/auth/account/public-holidays/countries`);
  }

  // Tenant Admin: every holiday of the caller's account, across all countries.
  listAll(): Observable<PublicHoliday[]> {
    return this.http.get<PublicHoliday[]>(`${this.apiUrl}/auth/account/public-holidays`);
  }

  create(payload: { countryCode: string; holidayDate: string; description: string }): Observable<{ message: string; publicHoliday: PublicHoliday }> {
    return this.http.post<{ message: string; publicHoliday: PublicHoliday }>(`${this.apiUrl}/auth/account/public-holidays`, payload);
  }

  update(id: string, patch: Partial<PublicHoliday>): Observable<{ message: string; publicHoliday: PublicHoliday }> {
    return this.http.patch<{ message: string; publicHoliday: PublicHoliday }>(`${this.apiUrl}/auth/account/public-holidays/${id}`, patch);
  }

  // Any workspace user: active holidays for the caller's company's country.
  listActive(year?: number): Observable<Pick<PublicHoliday, 'holidayDate' | 'description'>[]> {
    const query = year ? `?year=${year}` : '';
    return this.http.get<Pick<PublicHoliday, 'holidayDate' | 'description'>[]>(`${this.apiUrl}/public-holidays${query}`);
  }
}
