import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ClassificationCode } from '../models/auth.models';

// Malaysia LHDN e-Invoice classification codes (MyInvois reference data).
// Maintenance (sync / list-all / add / edit / delete) is System Admin only under
// /admin/classification-codes; the active list for pickers is available to any
// authenticated user under /classification-codes.
@Injectable({ providedIn: 'root' })
export class ClassificationCodeService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  // System Admin: sync from LHDN's published JSON (bundled fallback; idempotent).
  sync(): Observable<{ message: string; total: number; source: 'lhdn' | 'bundled'; syncedAt: string }> {
    return this.http.post<{ message: string; total: number; source: 'lhdn' | 'bundled'; syncedAt: string }>(
      `${this.apiUrl}/admin/classification-codes/sync`, {},
    );
  }

  // System Admin: every code (for the maintenance screen).
  listAll(): Observable<ClassificationCode[]> {
    return this.http.get<ClassificationCode[]>(`${this.apiUrl}/admin/classification-codes`);
  }

  // System Admin: add a code manually (a new LHDN code published before the next sync).
  create(payload: { code: string; description: string }): Observable<{ message: string; classificationCode: ClassificationCode }> {
    return this.http.post<{ message: string; classificationCode: ClassificationCode }>(
      `${this.apiUrl}/admin/classification-codes`, payload,
    );
  }

  // System Admin: edit the description or enable/disable a code.
  update(code: string, patch: { description?: string; isActive?: boolean }): Observable<{ message: string; classificationCode: ClassificationCode }> {
    return this.http.patch<{ message: string; classificationCode: ClassificationCode }>(
      `${this.apiUrl}/admin/classification-codes/${code}`, patch,
    );
  }

  // System Admin: remove a mistaken manual add (synced codes reappear on the next sync).
  delete(code: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/admin/classification-codes/${code}`);
  }

  // Any authenticated user: active codes for e-Invoice pickers.
  listActive(): Observable<ClassificationCode[]> {
    return this.http.get<ClassificationCode[]>(`${this.apiUrl}/classification-codes`);
  }
}
