import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Currency, AccountCurrencyState } from '../models/auth.models';

// Currency reference data (ISO 4217). Maintenance (seed / list-all / add / edit /
// delete) is System Admin only under /admin/currencies; the active list for
// pickers is available to any authenticated user under /currencies.
@Injectable({ providedIn: 'root' })
export class CurrencyService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  // System Admin: load the bundled ISO 4217 default set (idempotent).
  seed(): Observable<{ message: string; total: number }> {
    return this.http.post<{ message: string; total: number }>(`${this.apiUrl}/admin/currencies/seed`, {});
  }

  // System Admin: every currency (for the maintenance screen).
  listAll(): Observable<Currency[]> {
    return this.http.get<Currency[]>(`${this.apiUrl}/admin/currencies`);
  }

  // System Admin: add a currency manually.
  create(payload: { code: string; name: string; symbol?: string; numericCode?: number; minorUnit?: number }): Observable<{ message: string; currency: Currency }> {
    return this.http.post<{ message: string; currency: Currency }>(`${this.apiUrl}/admin/currencies`, payload);
  }

  // System Admin: edit fields or enable/disable a currency.
  update(code: string, patch: { name?: string; symbol?: string; minorUnit?: number; numericCode?: number; isActive?: boolean }): Observable<{ message: string; currency: Currency }> {
    return this.http.patch<{ message: string; currency: Currency }>(`${this.apiUrl}/admin/currencies/${code}`, patch);
  }

  // Any authenticated user: active currencies for dropdowns.
  listActive(): Observable<Currency[]> {
    return this.http.get<Currency[]>(`${this.apiUrl}/currencies`);
  }

  // --- Subscriber (Account) selection: Tenant Admin self-service ---
  getAccountCurrencies(): Observable<AccountCurrencyState> {
    return this.http.get<AccountCurrencyState>(`${this.apiUrl}/auth/account/currencies`);
  }

  updateAccountCurrencies(
    currencyCodes: string[],
    defaultCurrencyCode: string | null,
  ): Observable<AccountCurrencyState & { message: string }> {
    return this.http.put<AccountCurrencyState & { message: string }>(
      `${this.apiUrl}/auth/account/currencies`, { currencyCodes, defaultCurrencyCode },
    );
  }

}
