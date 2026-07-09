import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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
@Injectable({ providedIn: 'root' })
export class AccountEmailTemplateService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/auth/account/email-templates`;

  list(): Observable<AccountEmailTemplateSummary[]> {
    return this.http.get<AccountEmailTemplateSummary[]>(this.base);
  }

  get(key: string): Observable<AccountEmailTemplateDetail> {
    return this.http.get<AccountEmailTemplateDetail>(`${this.base}/${key}`);
  }

  save(
    key: string,
    body: {
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

  // Delete the override -> revert to the platform default.
  revert(key: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/${key}`);
  }

  preview(
    key: string,
    subject: string,
    bodyHtml: string,
    brand?: { brandColor?: string | null; includeLogo?: boolean },
  ): Observable<EmailPreview> {
    return this.http.post<EmailPreview>(`${this.base}/${key}/preview`, { subject, bodyHtml, ...brand });
  }

  sendTest(
    key: string,
    to: string,
    subject: string,
    bodyHtml: string,
    fromName?: string | null,
    brand?: { brandColor?: string | null; includeLogo?: boolean },
  ): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.base}/${key}/test`, { to, subject, bodyHtml, fromName, ...brand });
  }
}
