import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { EInvoiceTaxType } from '../models/auth.models';

// Malaysia LHDN e-Invoice tax types (MyInvois document code list). Maintenance
// (sync / list-all / add / edit / delete) is System Admin only under
// /admin/e-invoice-tax-types; the active list for pickers is available to any
// authenticated user under /e-invoice-tax-types.
@Injectable({ providedIn: 'root' })
export class EInvoiceTaxTypeService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  // System Admin: sync from LHDN's published JSON (bundled fallback; idempotent).
  sync(): Observable<{ message: string; total: number; source: 'lhdn' | 'bundled'; syncedAt: string }> {
    return this.http.post<{ message: string; total: number; source: 'lhdn' | 'bundled'; syncedAt: string }>(
      `${this.apiUrl}/admin/e-invoice-tax-types/sync`, {},
    );
  }

  // System Admin: every tax type (for the maintenance screen).
  listAll(): Observable<EInvoiceTaxType[]> {
    return this.http.get<EInvoiceTaxType[]>(`${this.apiUrl}/admin/e-invoice-tax-types`);
  }

  // System Admin: add a tax type manually (a new LHDN code published before the next sync).
  create(payload: { code: string; description: string }): Observable<{ message: string; eInvoiceTaxType: EInvoiceTaxType }> {
    return this.http.post<{ message: string; eInvoiceTaxType: EInvoiceTaxType }>(
      `${this.apiUrl}/admin/e-invoice-tax-types`, payload,
    );
  }

  // System Admin: edit the description or enable/disable a tax type.
  update(code: string, patch: { description?: string; isActive?: boolean }): Observable<{ message: string; eInvoiceTaxType: EInvoiceTaxType }> {
    return this.http.patch<{ message: string; eInvoiceTaxType: EInvoiceTaxType }>(
      `${this.apiUrl}/admin/e-invoice-tax-types/${code}`, patch,
    );
  }

  // System Admin: remove a mistaken manual add (synced codes reappear on the next sync).
  delete(code: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/admin/e-invoice-tax-types/${code}`);
  }

  // Any authenticated user: active tax types for e-Invoice pickers.
  listActive(): Observable<EInvoiceTaxType[]> {
    return this.http.get<EInvoiceTaxType[]>(`${this.apiUrl}/e-invoice-tax-types`);
  }
}
