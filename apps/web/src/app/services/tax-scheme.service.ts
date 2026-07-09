import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { TaxMeta, TaxScheme, TaxRate, CompanyTaxAdoption } from '../models/auth.models';

// Subscriber-owned tax-scheme catalog (header + effective-dated rate lines). All
// endpoints resolve the caller's account server-side; the screen never passes an
// accountId. Enable/disable a scheme via update({ isActive }); rate lines have
// their own add/update/delete endpoints.
@Injectable({ providedIn: 'root' })
export class TaxSchemeService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/tax`;

  // Fixed option lists for the inclusive/exclusive + class dropdowns.
  meta(): Observable<TaxMeta> {
    return this.http.get<TaxMeta>(`${this.base}/meta`);
  }

  // The subscriber's schemes (with rate lines), optionally filtered by country.
  list(countryCode?: string): Observable<TaxScheme[]> {
    const qs = countryCode ? `?countryCode=${encodeURIComponent(countryCode)}` : '';
    return this.http.get<TaxScheme[]>(`${this.base}/schemes${qs}`);
  }

  createScheme(payload: Partial<TaxScheme>): Observable<{ message: string; scheme: TaxScheme }> {
    return this.http.post<{ message: string; scheme: TaxScheme }>(`${this.base}/schemes`, payload);
  }

  // Copy the platform's starter schemes for a country into this subscriber's catalog.
  loadDefaults(countryCode: string): Observable<{ created: number; skipped: number; message: string }> {
    return this.http.post<{ created: number; skipped: number; message: string }>(`${this.base}/load-defaults`, { countryCode });
  }

  updateScheme(id: string, patch: Partial<TaxScheme>): Observable<{ message: string; scheme: TaxScheme }> {
    return this.http.patch<{ message: string; scheme: TaxScheme }>(`${this.base}/schemes/${id}`, patch);
  }

  addRate(schemeId: string, payload: Partial<TaxRate>): Observable<{ message: string; rateId: string }> {
    return this.http.post<{ message: string; rateId: string }>(`${this.base}/schemes/${schemeId}/rates`, payload);
  }

  updateRate(rateId: string, patch: Partial<TaxRate>): Observable<{ message: string }> {
    return this.http.patch<{ message: string }>(`${this.base}/rates/${rateId}`, patch);
  }

  deleteRate(rateId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/rates/${rateId}`);
  }

  // ---- Per-company adoption (active workspace) ----

  // Schemes available to the active company, with adoption state + GL per component.
  companyAdoption(): Observable<CompanyTaxAdoption[]> {
    return this.http.get<CompanyTaxAdoption[]>(`${this.base}/company/schemes`);
  }

  // Enable/disable a scheme for the active company and replace its GL overrides.
  setCompanyAdoption(
    taxSchemeId: string,
    payload: { isEnabled: boolean; glOverrides: Record<string, string> },
  ): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${this.base}/company/schemes/${taxSchemeId}`, payload);
  }
}
