import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// The Member Portal - the member's own surface, distinct from the staff app.
// Registration is public (the signed link token is the credential); /me uses
// the standard bearer token.

export interface PortalRegistrationContext {
  memberName: string;
  memberNo: string;
  email: string | null;
  companyName: string | null;
  alreadyRegistered: boolean;
}

export interface PortalRegisterResult {
  linked: boolean;
  message: string;
  token?: string;
  email?: string;
  fullName?: string;
}

export interface PortalMembershipCard {
  memberId: string;
  memberNo: string;
  memberName: string;
  memberKind: string;
  companyName: string | null;
  membershipNo: string | null;
  membershipTypeName: string | null;
  statusName: string | null;
  statusColor: string | null;
  joinDate: string | null;
}

@Injectable({ providedIn: 'root' })
export class PortalService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/membership/portal`;

  registrationContext(token: string): Observable<PortalRegistrationContext> {
    return this.http.get<PortalRegistrationContext>(`${this.base}/register/context`, { params: { token } });
  }

  register(token: string, password: string): Observable<PortalRegisterResult> {
    return this.http.post<PortalRegisterResult>(`${this.base}/register`, { token, password });
  }

  me(): Observable<{ memberships: PortalMembershipCard[] }> {
    return this.http.get<{ memberships: PortalMembershipCard[] }>(`${this.base}/me`);
  }
}
