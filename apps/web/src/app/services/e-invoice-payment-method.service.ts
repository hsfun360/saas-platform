import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { EInvoicePaymentMethod } from '../models/auth.models';

// Malaysia LHDN e-Invoice payment methods (MyInvois document code list). Maintenance
// (sync / list-all / add / edit / delete) is System Admin only under
// /admin/e-invoice-payment-methods; the active list for pickers is available to any
// authenticated user under /e-invoice-payment-methods.
@Injectable({ providedIn: 'root' })
export class EInvoicePaymentMethodService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  // System Admin: sync from LHDN's published JSON (bundled fallback; idempotent).
  sync(): Observable<{ message: string; total: number; source: 'lhdn' | 'bundled'; syncedAt: string }> {
    return this.http.post<{ message: string; total: number; source: 'lhdn' | 'bundled'; syncedAt: string }>(
      `${this.apiUrl}/admin/e-invoice-payment-methods/sync`, {},
    );
  }

  // System Admin: every payment method (for the maintenance screen).
  listAll(): Observable<EInvoicePaymentMethod[]> {
    return this.http.get<EInvoicePaymentMethod[]>(`${this.apiUrl}/admin/e-invoice-payment-methods`);
  }

  // System Admin: add a payment method manually (a new LHDN code published before the next sync).
  create(payload: { code: string; description: string }): Observable<{ message: string; eInvoicePaymentMethod: EInvoicePaymentMethod }> {
    return this.http.post<{ message: string; eInvoicePaymentMethod: EInvoicePaymentMethod }>(
      `${this.apiUrl}/admin/e-invoice-payment-methods`, payload,
    );
  }

  // System Admin: edit the description or enable/disable a payment method.
  update(code: string, patch: { description?: string; isActive?: boolean }): Observable<{ message: string; eInvoicePaymentMethod: EInvoicePaymentMethod }> {
    return this.http.patch<{ message: string; eInvoicePaymentMethod: EInvoicePaymentMethod }>(
      `${this.apiUrl}/admin/e-invoice-payment-methods/${code}`, patch,
    );
  }

  // System Admin: remove a mistaken manual add (synced codes reappear on the next sync).
  delete(code: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/admin/e-invoice-payment-methods/${code}`);
  }

  // Any authenticated user: active payment methods for e-Invoice pickers.
  listActive(): Observable<EInvoicePaymentMethod[]> {
    return this.http.get<EInvoicePaymentMethod[]>(`${this.apiUrl}/e-invoice-payment-methods`);
  }
}
