import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Country } from '../models/auth.models';

// Country reference data. Maintenance (sync / list-all / enable-disable) is System
// Admin only under /admin/countries; the active list for pickers is available to
// any authenticated user under /countries.
@Injectable({ providedIn: 'root' })
export class CountryService {
  private readonly apiUrl = environment.apiUrl;

  // System Admin: re-pull the dataset from world_countries (all languages).
  sync(): Observable<{ message: string; total: number; languages: number; syncedAt: string }> {
    return this.http.post<{ message: string; total: number; languages: number; syncedAt: string }>(
      `${this.apiUrl}/admin/countries/sync`, {},
    );
  }

  // System Admin: every country (for the maintenance screen).
  listAll(): Observable<Country[]> {
    return this.http.get<Country[]>(`${this.apiUrl}/admin/countries`);
  }

  // System Admin: enable/disable a country in the pickers.
  setActive(alpha2: string, isActive: boolean): Observable<{ message: string; country: Country }> {
    return this.http.patch<{ message: string; country: Country }>(
      `${this.apiUrl}/admin/countries/${alpha2}`, { isActive },
    );
  }

  // System Admin: edit editable fields (dial code, localized names). `names` is a
  // partial map keyed by language code - a non-empty value sets that translation,
  // an empty value clears it; unlisted languages are left untouched.
  updateCountry(
    alpha2: string,
    patch: { isActive?: boolean; dialCode?: string; names?: Record<string, string> },
  ): Observable<{ message: string; country: Country }> {
    return this.http.patch<{ message: string; country: Country }>(
      `${this.apiUrl}/admin/countries/${alpha2}`, patch,
    );
  }

  // Any authenticated user: active countries for dropdowns/comboboxes.
  listActive(): Observable<Country[]> {
    return this.http.get<Country[]>(`${this.apiUrl}/countries`);
  }

  constructor(private http: HttpClient) {}
}
