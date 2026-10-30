import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { SecurityPolicyState, SecurityPolicyUpdate } from '../models/auth.models';

// Tenant Admin self-service: the subscriber's security policy (today: whether
// two-factor authentication is required for every user, from a date). Same
// shape as the account-languages pair: GET the state, PUT the setting, the
// API answers with the full state either way.
@Injectable({ providedIn: 'root' })
export class SecurityPolicyService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  get(): Observable<SecurityPolicyState> {
    return this.http.get<SecurityPolicyState>(`${this.apiUrl}/auth/account/security-policy`);
  }

  update(body: SecurityPolicyUpdate): Observable<SecurityPolicyState & { message: string }> {
    return this.http.put<SecurityPolicyState & { message: string }>(`${this.apiUrl}/auth/account/security-policy`, body);
  }
}
