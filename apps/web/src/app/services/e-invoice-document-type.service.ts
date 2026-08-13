import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { EInvoiceDocumentType } from '../models/auth.models';

// Malaysia LHDN e-Invoice document types (MyInvois document code list). Maintenance
// (sync / list-all / add / edit / delete) is System Admin only under
// /admin/e-invoice-document-types; the active list for pickers is available to any
// authenticated user under /e-invoice-document-types.
@Injectable({ providedIn: 'root' })
export class EInvoiceDocumentTypeService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  // System Admin: sync from LHDN's published JSON (bundled fallback; idempotent).
  sync(): Observable<{ message: string; total: number; source: 'lhdn' | 'bundled'; syncedAt: string }> {
    return this.http.post<{ message: string; total: number; source: 'lhdn' | 'bundled'; syncedAt: string }>(
      `${this.apiUrl}/admin/e-invoice-document-types/sync`, {},
    );
  }

  // System Admin: every document type (for the maintenance screen).
  listAll(): Observable<EInvoiceDocumentType[]> {
    return this.http.get<EInvoiceDocumentType[]>(`${this.apiUrl}/admin/e-invoice-document-types`);
  }

  // System Admin: add a document type manually (a new LHDN code published before the next sync).
  create(payload: { code: string; description: string }): Observable<{ message: string; eInvoiceDocumentType: EInvoiceDocumentType }> {
    return this.http.post<{ message: string; eInvoiceDocumentType: EInvoiceDocumentType }>(
      `${this.apiUrl}/admin/e-invoice-document-types`, payload,
    );
  }

  // System Admin: edit the description or enable/disable a document type.
  update(code: string, patch: { description?: string; isActive?: boolean }): Observable<{ message: string; eInvoiceDocumentType: EInvoiceDocumentType }> {
    return this.http.patch<{ message: string; eInvoiceDocumentType: EInvoiceDocumentType }>(
      `${this.apiUrl}/admin/e-invoice-document-types/${code}`, patch,
    );
  }

  // System Admin: remove a mistaken manual add (synced codes reappear on the next sync).
  delete(code: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/admin/e-invoice-document-types/${code}`);
  }

  // Any authenticated user: active document types for e-Invoice pickers.
  listActive(): Observable<EInvoiceDocumentType[]> {
    return this.http.get<EInvoiceDocumentType[]>(`${this.apiUrl}/e-invoice-document-types`);
  }
}
