import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Language, AccountLanguageState, UserLanguageState } from '../models/auth.models';

// Language reference data. Maintenance (seed / list-all / add / edit / delete) is
// System Admin only under /admin/languages; the active list for pickers is
// available to any authenticated user under /languages.
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  // System Admin: load the bundled default language set (idempotent).
  seed(): Observable<{ message: string; total: number }> {
    return this.http.post<{ message: string; total: number }>(`${this.apiUrl}/admin/languages/seed`, {});
  }

  // System Admin: every language (for the maintenance screen).
  listAll(): Observable<Language[]> {
    return this.http.get<Language[]>(`${this.apiUrl}/admin/languages`);
  }

  // System Admin: add a language manually.
  create(payload: { languageCode: string; name: string }): Observable<{ message: string; language: Language }> {
    return this.http.post<{ message: string; language: Language }>(`${this.apiUrl}/admin/languages`, payload);
  }

  // System Admin: rename or enable/disable a language.
  update(languageCode: string, patch: { name?: string; isActive?: boolean }): Observable<{ message: string; language: Language }> {
    return this.http.patch<{ message: string; language: Language }>(`${this.apiUrl}/admin/languages/${languageCode}`, patch);
  }

  // Any authenticated user: active languages for dropdowns.
  listActive(): Observable<Language[]> {
    return this.http.get<Language[]>(`${this.apiUrl}/languages`);
  }

  // Public (no auth): active languages for the login screen's language switcher.
  listActivePublic(): Observable<Language[]> {
    return this.http.get<Language[]>(`${this.apiUrl}/public/languages`);
  }

  // --- Subscriber (Account) selection: Tenant Admin self-service ---
  getAccountLanguages(): Observable<AccountLanguageState> {
    return this.http.get<AccountLanguageState>(`${this.apiUrl}/auth/account/languages`);
  }

  updateAccountLanguages(
    languageCodes: string[],
    defaultLanguageCode: string | null,
  ): Observable<AccountLanguageState & { message: string }> {
    return this.http.put<AccountLanguageState & { message: string }>(
      `${this.apiUrl}/auth/account/languages`, { languageCodes, defaultLanguageCode },
    );
  }

  // --- Subscriber (Account) selection: System Admin, by subscriber (account) id ---
  getSubscriptionLanguages(accountId: string): Observable<AccountLanguageState> {
    return this.http.get<AccountLanguageState>(`${this.apiUrl}/admin/subscriptions/${accountId}/languages`);
  }

  updateSubscriptionLanguages(
    accountId: string,
    languageCodes: string[],
    defaultLanguageCode: string | null,
  ): Observable<AccountLanguageState & { message: string }> {
    return this.http.put<AccountLanguageState & { message: string }>(
      `${this.apiUrl}/admin/subscriptions/${accountId}/languages`, { languageCodes, defaultLanguageCode },
    );
  }

  // --- Per-user preferred language ---
  getMyLanguage(): Observable<UserLanguageState> {
    return this.http.get<UserLanguageState>(`${this.apiUrl}/auth/me/language`);
  }

  setMyLanguage(language: string | null): Observable<UserLanguageState & { message: string }> {
    return this.http.patch<UserLanguageState & { message: string }>(
      `${this.apiUrl}/auth/me/language`, { language },
    );
  }
}
