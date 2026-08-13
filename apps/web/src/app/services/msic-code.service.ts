import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { MsicCode } from '../models/auth.models';

// Malaysia LHDN e-Invoice MSIC codes (MSIC 2008 sub-category; MyInvois reference
// data). Maintenance (sync / list-all / add / edit / delete) is System Admin only
// under /admin/msic-codes; the active list for pickers is available to any
// authenticated user under /msic-codes.
@Injectable({ providedIn: 'root' })
export class MsicCodeService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  // System Admin: sync from LHDN's published JSON (bundled fallback; idempotent).
  sync(): Observable<{ message: string; total: number; source: 'lhdn' | 'bundled'; syncedAt: string }> {
    return this.http.post<{ message: string; total: number; source: 'lhdn' | 'bundled'; syncedAt: string }>(
      `${this.apiUrl}/admin/msic-codes/sync`, {},
    );
  }

  // System Admin: every code (for the maintenance screen).
  listAll(): Observable<MsicCode[]> {
    return this.http.get<MsicCode[]>(`${this.apiUrl}/admin/msic-codes`);
  }

  // System Admin: add a code manually (a new LHDN code published before the next sync).
  create(payload: { code: string; description: string; categoryReference?: string }): Observable<{ message: string; msicCode: MsicCode }> {
    return this.http.post<{ message: string; msicCode: MsicCode }>(`${this.apiUrl}/admin/msic-codes`, payload);
  }

  // System Admin: edit the description/category or enable/disable a code.
  update(code: string, patch: { description?: string; categoryReference?: string; isActive?: boolean }): Observable<{ message: string; msicCode: MsicCode }> {
    return this.http.patch<{ message: string; msicCode: MsicCode }>(`${this.apiUrl}/admin/msic-codes/${code}`, patch);
  }

  // System Admin: remove a mistaken manual add (synced codes reappear on the next sync).
  delete(code: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/admin/msic-codes/${code}`);
  }

  // Any authenticated user: active codes for e-Invoice pickers.
  listActive(): Observable<MsicCode[]> {
    return this.http.get<MsicCode[]>(`${this.apiUrl}/msic-codes`);
  }
}
