import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  EmailTemplateSummary,
  EmailTemplateDetail,
  EmailPreview,
} from '../models/auth.models';

// System-Admin maintenance of the PLATFORM email templates. All endpoints are
// under /admin and gated to System Admins server-side.
@Injectable({ providedIn: 'root' })
export class EmailTemplateService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/admin/email-templates`;

  list(): Observable<EmailTemplateSummary[]> {
    return this.http.get<EmailTemplateSummary[]>(this.base);
  }

  get(key: string): Observable<EmailTemplateDetail> {
    return this.http.get<EmailTemplateDetail>(`${this.base}/${key}`);
  }

  update(
    key: string,
    body: {
      subject: string;
      bodyHtml: string;
      fromName?: string | null;
      tenantOverridable?: boolean;
      isActive?: boolean;
      brandColor?: string | null;
      includeLogo?: boolean;
    },
  ): Observable<{ message: string; template: EmailTemplateDetail }> {
    return this.http.put<{ message: string; template: EmailTemplateDetail }>(`${this.base}/${key}`, body);
  }

  reset(key: string): Observable<{ message: string; template: EmailTemplateDetail }> {
    return this.http.post<{ message: string; template: EmailTemplateDetail }>(`${this.base}/${key}/reset`, {});
  }

  // Compile (possibly unsaved) content against sample data — no send. Brand
  // settings are sent so the preview reflects the current (unsaved) header/colour.
  preview(
    key: string,
    subject: string,
    bodyHtml: string,
    brand?: { brandColor?: string | null; includeLogo?: boolean },
  ): Observable<EmailPreview> {
    return this.http.post<EmailPreview>(`${this.base}/${key}/preview`, { subject, bodyHtml, ...brand });
  }

  // Queue a test email (rendered from the current editor content) to an address.
  // Brand settings are sent so the test reflects the current (unsaved) header/colour.
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
