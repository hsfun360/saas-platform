import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { TaxMeta, TaxScheme, TaxRate, CompanyTaxAdoption, TaxTemplateOption } from '../models/auth.models';

// Tax-scheme catalog. The SAME screen serves two scopes:
//   - subscriber (default): the tenant's own catalog at /api/tax (System Setup).
//   - platform: the platform-owned catalog (accountId NULL) at /api/admin/tax
//     (SaaS Administration), e.g. tax on the platform's Subscription Fee.
// Every scheme/rate method takes a `platform` flag selecting the base; the company
// adoption + load-defaults calls are subscriber-only.
@Injectable({ providedIn: 'root' })
export class TaxSchemeService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  private base(platform: boolean): string {
    return platform ? `${this.apiUrl}/admin/tax` : `${this.apiUrl}/tax`;
  }

  meta(platform = false): Observable<TaxMeta> {
    return this.http.get<TaxMeta>(`${this.base(platform)}/meta`);
  }

  list(countryCode?: string, platform = false): Observable<TaxScheme[]> {
    const qs = countryCode ? `?countryCode=${encodeURIComponent(countryCode)}` : '';
    return this.http.get<TaxScheme[]>(`${this.base(platform)}/schemes${qs}`);
  }

  createScheme(payload: Partial<TaxScheme>, platform = false): Observable<{ message: string; scheme: TaxScheme }> {
    return this.http.post<{ message: string; scheme: TaxScheme }>(`${this.base(platform)}/schemes`, payload);
  }

  updateScheme(id: string, patch: Partial<TaxScheme>, platform = false): Observable<{ message: string; scheme: TaxScheme }> {
    return this.http.patch<{ message: string; scheme: TaxScheme }>(`${this.base(platform)}/schemes/${id}`, patch);
  }

  addRate(schemeId: string, payload: Partial<TaxRate>, platform = false): Observable<{ message: string; rateId: string }> {
    return this.http.post<{ message: string; rateId: string }>(`${this.base(platform)}/schemes/${schemeId}/rates`, payload);
  }

  updateRate(rateId: string, patch: Partial<TaxRate>, platform = false): Observable<{ message: string }> {
    return this.http.patch<{ message: string }>(`${this.base(platform)}/rates/${rateId}`, patch);
  }

  deleteRate(rateId: string, platform = false): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base(platform)}/rates/${rateId}`);
  }

  // Subscriber-only: the loadable platform templates across the subscriber's company
  // countries (each carrying its country + details + an "already loaded" flag), for the
  // Load-defaults preview/select screen.
  defaultTemplates(): Observable<TaxTemplateOption[]> {
    return this.http.get<TaxTemplateOption[]>(`${this.base(false)}/default-templates`);
  }

  // Subscriber-only: copy the selected platform templates into the subscriber catalog,
  // across any mix of countries. Each selection is a (countryCode, taxSchemeCode) pair.
  loadDefaults(
    selections: { countryCode: string; taxSchemeCode: string }[],
  ): Observable<{ created: number; skipped: number; message: string }> {
    return this.http.post<{ created: number; skipped: number; message: string }>(`${this.base(false)}/load-defaults`, { selections });
  }

  // Subscriber-only: the alpha-2 codes of countries the subscriber's companies operate in.
  companyCountries(): Observable<string[]> {
    return this.http.get<string[]>(`${this.base(false)}/company-countries`);
  }

  // ---- Per-company adoption (active workspace, subscriber only) ----

  companyAdoption(): Observable<CompanyTaxAdoption[]> {
    return this.http.get<CompanyTaxAdoption[]>(`${this.base(false)}/company/schemes`);
  }

  setCompanyAdoption(
    taxSchemeId: string,
    payload: { isEnabled: boolean; glOverrides: Record<string, string> },
  ): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${this.base(false)}/company/schemes/${taxSchemeId}`, payload);
  }
}
