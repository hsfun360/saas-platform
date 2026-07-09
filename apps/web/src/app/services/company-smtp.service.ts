import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { CompanySmtp } from '../models/auth.models';

// Tenant Admin: a company's own outgoing SMTP server. Gated server-side to the
// admins of that company under /auth/companies/:companyId/smtp.
@Injectable({ providedIn: 'root' })
export class CompanySmtpService {
  private readonly http = inject(HttpClient);
  private base(companyId: string): string {
    return `${environment.apiUrl}/auth/companies/${companyId}/smtp`;
  }

  get(companyId: string): Observable<CompanySmtp> {
    return this.http.get<CompanySmtp>(this.base(companyId));
  }

  save(
    companyId: string,
    body: {
      host: string;
      port: number;
      secure: boolean;
      username: string;
      password?: string; // blank keeps the stored one
      fromEmail: string;
      fromName: string;
      isActive: boolean;
    },
  ): Observable<{ message: string; smtp: CompanySmtp }> {
    return this.http.put<{ message: string; smtp: CompanySmtp }>(this.base(companyId), body);
  }

  remove(companyId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(this.base(companyId));
  }

  test(
    companyId: string,
    body: {
      host: string;
      port: number;
      secure: boolean;
      username: string;
      password?: string;
      fromEmail: string;
      fromName: string;
      to: string;
    },
  ): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.base(companyId)}/test`, body);
  }
}
