import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ClubNumbering, ClubSettings, ClubSpecification } from '../models/auth.models';

// Club Specification (SRS 2.1.1 - membership system master). A per-company
// singleton, modify-only: GET find-or-creates it with safe defaults.
// The numbering block reads/writes Numbering Control through the API's
// gateway seam - it is surfaced here, not duplicated here.
@Injectable({ providedIn: 'root' })
export class ClubSpecificationService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/membership/settings`;

  get(): Observable<ClubSpecification> {
    return this.http.get<ClubSpecification>(this.base);
  }

  save(payload: Partial<ClubSettings> & { isMembershipAutoNumber?: boolean }):
    Observable<{ message: string; settings: ClubSettings; numbering: ClubNumbering }> {
    return this.http.put<{ message: string; settings: ClubSettings; numbering: ClubNumbering }>(this.base, payload);
  }

  saveNumbering(payload: { prefix: string | null; format: string; seqPadLength: number; startingNumber: number; resetRule: string }):
    Observable<{ message: string; numbering: ClubNumbering }> {
    return this.http.put<{ message: string; numbering: ClubNumbering }>(`${this.base}/numbering`, payload);
  }
}
