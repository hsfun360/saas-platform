import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { PlatformProfile, PlatformChargeQuote } from '../models/auth.models';

// The platform's own "company of record" (singleton), under SaaS Administration.
// Holds the invoice-issuer identity + the billing country/scheme that anchors the
// platform's own tax. `quote` computes a charge's tax via the profile.
@Injectable({ providedIn: 'root' })
export class PlatformProfileService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  get(): Observable<PlatformProfile> {
    return this.http.get<PlatformProfile>(`${this.apiUrl}/admin/platform-profile`);
  }

  save(payload: PlatformProfile): Observable<{ message: string; profile: PlatformProfile }> {
    return this.http.put<{ message: string; profile: PlatformProfile }>(`${this.apiUrl}/admin/platform-profile`, payload);
  }

  quote(amount: number, date?: string): Observable<PlatformChargeQuote> {
    return this.http.post<PlatformChargeQuote>(`${this.apiUrl}/admin/platform-profile/quote`, { amount, date });
  }

  // Upload the platform logo image; returns its public URL to store on the profile.
  uploadLogo(formData: FormData): Observable<{ message: string; url: string }> {
    return this.http.post<{ message: string; url: string }>(`${this.apiUrl}/admin/platform-profile/logo`, formData);
  }
}
