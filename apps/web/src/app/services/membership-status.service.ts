import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { MembershipStatus, MembershipStatusMeta, MembershipStatusCopySource } from '../models/auth.models';

// Membership Status master file for the active company (club). All endpoints sit
// behind the Membership Management module entitlement on the API. Enable/disable
// via update({ isActive }) rather than delete.
@Injectable({ providedIn: 'root' })
export class MembershipStatusService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/membership/statuses`;

  // Fixed option lists for the class / system-control dropdowns.
  meta(): Observable<MembershipStatusMeta> {
    return this.http.get<MembershipStatusMeta>(`${this.base}/meta`);
  }

  // Every status for the active company.
  list(): Observable<MembershipStatus[]> {
    return this.http.get<MembershipStatus[]>(this.base);
  }

  create(payload: Partial<MembershipStatus>): Observable<{ message: string; status: MembershipStatus }> {
    return this.http.post<{ message: string; status: MembershipStatus }>(this.base, payload);
  }

  update(id: string, patch: Partial<MembershipStatus>): Observable<{ message: string; status: MembershipStatus }> {
    return this.http.patch<{ message: string; status: MembershipStatus }>(`${this.base}/${id}`, patch);
  }

  // Sibling companies (same subscription) with statuses available to copy.
  copySources(): Observable<MembershipStatusCopySource[]> {
    return this.http.get<MembershipStatusCopySource[]>(`${this.base}/copy-sources`);
  }

  // Clone the selected statuses from a sibling company into the active company.
  copy(fromCompanyId: string, statusIds: string[]): Observable<{ message: string; total: number }> {
    return this.http.post<{ message: string; total: number }>(`${this.base}/copy`, { fromCompanyId, statusIds });
  }
}
