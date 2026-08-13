import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { EInvoiceUnitType } from '../models/auth.models';

// Malaysia LHDN e-Invoice unit types (MyInvois document code list). Maintenance
// (sync / list-all / add / edit / delete) is System Admin only under
// /admin/e-invoice-unit-types; the active list for pickers is available to any
// authenticated user under /e-invoice-unit-types.
@Injectable({ providedIn: 'root' })
export class EInvoiceUnitTypeService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  // System Admin: sync from LHDN's published JSON (bundled fallback; idempotent).
  sync(): Observable<{ message: string; total: number; source: 'lhdn' | 'bundled'; syncedAt: string }> {
    return this.http.post<{ message: string; total: number; source: 'lhdn' | 'bundled'; syncedAt: string }>(
      `${this.apiUrl}/admin/e-invoice-unit-types/sync`, {},
    );
  }

  // System Admin: every unit type (for the maintenance screen).
  listAll(): Observable<EInvoiceUnitType[]> {
    return this.http.get<EInvoiceUnitType[]>(`${this.apiUrl}/admin/e-invoice-unit-types`);
  }

  // System Admin: add a unit type manually (a new LHDN code published before the next sync).
  create(payload: { code: string; description: string }): Observable<{ message: string; eInvoiceUnitType: EInvoiceUnitType }> {
    return this.http.post<{ message: string; eInvoiceUnitType: EInvoiceUnitType }>(
      `${this.apiUrl}/admin/e-invoice-unit-types`, payload,
    );
  }

  // System Admin: edit the description or enable/disable a unit type.
  update(code: string, patch: { description?: string; isActive?: boolean }): Observable<{ message: string; eInvoiceUnitType: EInvoiceUnitType }> {
    return this.http.patch<{ message: string; eInvoiceUnitType: EInvoiceUnitType }>(
      `${this.apiUrl}/admin/e-invoice-unit-types/${code}`, patch,
    );
  }

  // System Admin: remove a mistaken manual add (synced codes reappear on the next sync).
  delete(code: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/admin/e-invoice-unit-types/${code}`);
  }

  // Any authenticated user: active unit types for e-Invoice pickers.
  listActive(): Observable<EInvoiceUnitType[]> {
    return this.http.get<EInvoiceUnitType[]>(`${this.apiUrl}/e-invoice-unit-types`);
  }
}
