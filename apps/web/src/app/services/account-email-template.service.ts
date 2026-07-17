import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  AccountEmailTemplateSummary,
  AccountEmailTemplateDetail,
  EmailPreview,
} from '../models/auth.models';

// Tenant Admin self-service: a subscriber's own versions of the platform
// templates the platform marked tenant-overridable. Gated to Tenant Admins
// server-side under /auth/account/email-templates.
//
// Overrides are SCOPED and resolve as a cascade at send time:
//   company row -> subscriber-wide row -> platform default.
// `companyId` selects the scope on every call; null/omitted means the
// subscriber-wide row ("All companies").
@Injectable({ providedIn: 'root' })
export class AccountEmailTemplateService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/auth/account/email-templates`;

  private scopeParams(companyId: string | null): HttpParams {
    return companyId ? new HttpParams().set('companyId', companyId) : new HttpParams();
  }

  list(): Observable<AccountEmailTemplateSummary[]> {
    return this.http.get<AccountEmailTemplateSummary[]>(this.base);
  }

  get(key: string, companyId: string | null = null): Observable<AccountEmailTemplateDetail> {
    return this.http.get<AccountEmailTemplateDetail>(`${this.base}/${key}`, { params: this.scopeParams(companyId) });
  }

  save(
    key: string,
    body: {
      companyId?: string | null;
      subject: string;
      bodyHtml: string;
      fromName?: string | null;
      isActive?: boolean;
      brandColor?: string | null;
      includeLogo?: boolean;
    },
  ): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${this.base}/${key}`, body);
  }

  // Delete THIS scope's row -> it falls back to what it inherits.
  revert(key: string, companyId: string | null = null): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/${key}`, { params: this.scopeParams(companyId) });
  }

  preview(
    key: string,
    subject: string,
    bodyHtml: string,
    brand?: { brandColor?: string | null; includeLogo?: boolean; companyId?: string | null },
  ): Observable<EmailPreview> {
    return this.http.post<EmailPreview>(`${this.base}/${key}/preview`, { subject, bodyHtml, ...brand });
  }

  sendTest(
    key: string,
    to: string,
    subject: string,
    bodyHtml: string,
    fromName?: string | null,
    brand?: { brandColor?: string | null; includeLogo?: boolean; companyId?: string | null },
  ): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.base}/${key}/test`, { to, subject, bodyHtml, fromName, ...brand });
  }
}
