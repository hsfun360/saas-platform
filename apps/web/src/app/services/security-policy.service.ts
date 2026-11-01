import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { RegisteredWorkstation, SecurityPolicyState, SecurityPolicyUpdate } from '../models/auth.models';

// Tenant Admin self-service: the subscriber's security policy (whether
// two-factor authentication is required for every user, from a date; the
// trusted-device rule; the registered-workstation switch). Same shape as the
// account-languages pair: GET the state, PUT the setting, the API answers with
// the full state either way. The registered workstations themselves are
// managed through their own three calls; each answers with the fresh list.
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

  listWorkstations(): Observable<{ workstations: RegisteredWorkstation[] }> {
    return this.http.get<{ workstations: RegisteredWorkstation[] }>(`${this.apiUrl}/auth/account/workstations`);
  }

  // Registers the browser making the call (the cookie lands on it).
  registerWorkstation(name: string): Observable<{ message: string; workstations: RegisteredWorkstation[] }> {
    return this.http.post<{ message: string; workstations: RegisteredWorkstation[] }>(`${this.apiUrl}/auth/account/workstations`, { name });
  }

  revokeWorkstation(id: string): Observable<{ message: string; workstations: RegisteredWorkstation[] }> {
    return this.http.delete<{ message: string; workstations: RegisteredWorkstation[] }>(`${this.apiUrl}/auth/account/workstations/${encodeURIComponent(id)}`);
  }
}
