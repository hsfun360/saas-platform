import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Title } from '../models/auth.models';

// Title (honorific) - subscriber-owned reference data. Maintenance (Tenant Admin)
// lives under /auth/account/titles; the active list for product pickers is
// /titles (any workspace user). Enable/disable rather than delete.
@Injectable({ providedIn: 'root' })
export class TitleService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  // Tenant Admin: every title of the caller's account.
  listAll(): Observable<Title[]> {
    return this.http.get<Title[]>(`${this.apiUrl}/auth/account/titles`);
  }

  create(payload: { titleCode: string; description?: string | null; countryCode?: string | null }): Observable<{ message: string; title: Title }> {
    return this.http.post<{ message: string; title: Title }>(`${this.apiUrl}/auth/account/titles`, payload);
  }

  update(id: string, patch: Partial<Title>): Observable<{ message: string; title: Title }> {
    return this.http.patch<{ message: string; title: Title }>(`${this.apiUrl}/auth/account/titles/${id}`, patch);
  }

  // Any workspace user: active titles for dropdowns. Optional countryCode filters
  // to universal + that country's titles.
  listActive(countryCode?: string): Observable<Pick<Title, 'titleCode' | 'description' | 'countryCode'>[]> {
    const q = countryCode ? `?countryCode=${encodeURIComponent(countryCode)}` : '';
    return this.http.get<Pick<Title, 'titleCode' | 'description' | 'countryCode'>[]>(`${this.apiUrl}/titles${q}`);
  }
}
