import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { EInvoiceStateCode } from '../models/auth.models';

// Malaysia LHDN e-Invoice state codes (MyInvois document code list). Maintenance
// (sync / list-all / add / edit / delete) is System Admin only under
// /admin/e-invoice-state-codes; the active list for pickers is available to any
// authenticated user under /e-invoice-state-codes.
@Injectable({ providedIn: 'root' })
export class EInvoiceStateCodeService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  // System Admin: sync from LHDN's published JSON (bundled fallback; idempotent).
  sync(): Observable<{ message: string; total: number; source: 'lhdn' | 'bundled'; syncedAt: string }> {
    return this.http.post<{ message: string; total: number; source: 'lhdn' | 'bundled'; syncedAt: string }>(
      `${this.apiUrl}/admin/e-invoice-state-codes/sync`, {},
    );
  }

  // System Admin: every state code (for the maintenance screen).
  listAll(): Observable<EInvoiceStateCode[]> {
    return this.http.get<EInvoiceStateCode[]>(`${this.apiUrl}/admin/e-invoice-state-codes`);
  }

  // System Admin: add a state code manually (a new LHDN code published before the next sync).
  create(payload: { code: string; description: string }): Observable<{ message: string; eInvoiceStateCode: EInvoiceStateCode }> {
    return this.http.post<{ message: string; eInvoiceStateCode: EInvoiceStateCode }>(
      `${this.apiUrl}/admin/e-invoice-state-codes`, payload,
    );
  }

  // System Admin: edit the description or enable/disable a state code.
  update(code: string, patch: { description?: string; isActive?: boolean }): Observable<{ message: string; eInvoiceStateCode: EInvoiceStateCode }> {
    return this.http.patch<{ message: string; eInvoiceStateCode: EInvoiceStateCode }>(
      `${this.apiUrl}/admin/e-invoice-state-codes/${code}`, patch,
    );
  }

  // System Admin: remove a mistaken manual add (synced codes reappear on the next sync).
  delete(code: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/admin/e-invoice-state-codes/${code}`);
  }

  // Any authenticated user: active state codes for e-Invoice pickers.
  listActive(): Observable<EInvoiceStateCode[]> {
    return this.http.get<EInvoiceStateCode[]>(`${this.apiUrl}/e-invoice-state-codes`);
  }
}
