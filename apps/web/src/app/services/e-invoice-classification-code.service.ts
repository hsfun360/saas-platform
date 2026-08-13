import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { EInvoiceClassificationCode } from '../models/auth.models';

// Malaysia LHDN e-Invoice classification codes (MyInvois reference data).
// Maintenance (sync / list-all / add / edit / delete) is System Admin only under
// /admin/e-invoice-classification-codes; the active list for pickers is available to any
// authenticated user under /e-invoice-classification-codes.
@Injectable({ providedIn: 'root' })
export class EInvoiceClassificationCodeService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  // System Admin: sync from LHDN's published JSON (bundled fallback; idempotent).
  sync(): Observable<{ message: string; total: number; source: 'lhdn' | 'bundled'; syncedAt: string }> {
    return this.http.post<{ message: string; total: number; source: 'lhdn' | 'bundled'; syncedAt: string }>(
      `${this.apiUrl}/admin/e-invoice-classification-codes/sync`, {},
    );
  }

  // System Admin: every code (for the maintenance screen).
  listAll(): Observable<EInvoiceClassificationCode[]> {
    return this.http.get<EInvoiceClassificationCode[]>(`${this.apiUrl}/admin/e-invoice-classification-codes`);
  }

  // System Admin: add a code manually (a new LHDN code published before the next sync).
  create(payload: { code: string; description: string }): Observable<{ message: string; eInvoiceClassificationCode: EInvoiceClassificationCode }> {
    return this.http.post<{ message: string; eInvoiceClassificationCode: EInvoiceClassificationCode }>(
      `${this.apiUrl}/admin/e-invoice-classification-codes`, payload,
    );
  }

  // System Admin: edit the description or enable/disable a code.
  update(code: string, patch: { description?: string; isActive?: boolean }): Observable<{ message: string; eInvoiceClassificationCode: EInvoiceClassificationCode }> {
    return this.http.patch<{ message: string; eInvoiceClassificationCode: EInvoiceClassificationCode }>(
      `${this.apiUrl}/admin/e-invoice-classification-codes/${code}`, patch,
    );
  }

  // System Admin: remove a mistaken manual add (synced codes reappear on the next sync).
  delete(code: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/admin/e-invoice-classification-codes/${code}`);
  }

  // Any authenticated user: active codes for e-Invoice pickers.
  listActive(): Observable<EInvoiceClassificationCode[]> {
    return this.http.get<EInvoiceClassificationCode[]>(`${this.apiUrl}/e-invoice-classification-codes`);
  }
}
