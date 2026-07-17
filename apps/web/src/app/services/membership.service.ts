import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  Member,
  MemberSearchResult,
  MembersMeta,
  Membership,
  MembershipListResult,
  MembershipMeta,
  MembershipOptions,
} from '../models/auth.models';

// Membership / Member CRM (SRS 2.3). Memberships own all member CRUD (nominees
// and dependents are managed from the Memberships screen); /members is the flat
// read-only search.
@Injectable({ providedIn: 'root' })
export class MembershipService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/membership/memberships`;
  private readonly membersBase = `${environment.apiUrl}/membership/members`;

  meta(): Observable<MembershipMeta> {
    return this.http.get<MembershipMeta>(`${this.base}/meta`);
  }

  options(): Observable<MembershipOptions> {
    return this.http.get<MembershipOptions>(`${this.base}/options`);
  }

  // Server-side search + pagination (a club can hold tens of thousands of
  // memberships; the browser only ever receives one page).
  list(opts: { q?: string; class?: string; status?: string; offset?: number } = {}): Observable<MembershipListResult> {
    let params = new HttpParams();
    if (opts.q) params = params.set('q', opts.q);
    if (opts.class) params = params.set('class', opts.class);
    if (opts.status) params = params.set('status', opts.status);
    if (opts.offset) params = params.set('offset', String(opts.offset));
    return this.http.get<MembershipListResult>(this.base, { params });
  }

  get(id: string): Observable<Membership> {
    return this.http.get<Membership>(`${this.base}/${id}`);
  }

  create(payload: Record<string, unknown>): Observable<{ message: string; membership: Membership }> {
    return this.http.post<{ message: string; membership: Membership }>(this.base, payload);
  }

  update(id: string, payload: Record<string, unknown>): Observable<{ message: string; membership: Membership }> {
    return this.http.put<{ message: string; membership: Membership }>(`${this.base}/${id}`, payload);
  }

  suggestMemberNo(membershipId: string, parentNo: string): Observable<{ memberNo: string }> {
    const params = new HttpParams().set('parentNo', parentNo);
    return this.http.get<{ memberNo: string }>(`${this.base}/${membershipId}/members/suggest-no`, { params });
  }

  createNominee(membershipId: string, payload: Record<string, unknown>): Observable<{ message: string; member: Member }> {
    return this.http.post<{ message: string; member: Member }>(`${this.base}/${membershipId}/members`, payload);
  }

  createDependent(
    membershipId: string,
    principalMemberId: string,
    payload: Record<string, unknown>,
  ): Observable<{ message: string; member: Member }> {
    return this.http.post<{ message: string; member: Member }>(
      `${this.base}/${membershipId}/members/${principalMemberId}/dependents`,
      payload,
    );
  }

  updateMember(membershipId: string, memberId: string, payload: Record<string, unknown>): Observable<{ message: string; member: Member }> {
    return this.http.put<{ message: string; member: Member }>(`${this.base}/${membershipId}/members/${memberId}`, payload);
  }

  // --- Flat member search (read-only Members screen) ---

  membersMeta(): Observable<MembersMeta> {
    return this.http.get<MembersMeta>(`${this.membersBase}/meta`);
  }

  searchMembers(q: string, kind: string, status = '', offset = 0): Observable<MemberSearchResult> {
    let params = new HttpParams();
    if (q) params = params.set('q', q);
    if (kind) params = params.set('kind', kind);
    if (status) params = params.set('status', status);
    if (offset) params = params.set('offset', String(offset));
    return this.http.get<MemberSearchResult>(this.membersBase, { params });
  }
}
