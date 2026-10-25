import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { MembershipStatusOption } from '../models/auth.models';

export type FacilityBaseIdentity = 'member' | 'member-guest' | 'guest';

// One row of facility.ParticipantType (structure approved 2026-10-25): the
// club's participant categories; the code is the key every participant line
// and rate cell carries.
export interface FacilityParticipantType {
  id: string;
  code: string;
  description: string;
  baseIdentity: FacilityBaseIdentity;
  requiresApproval: boolean;
  isSystem: boolean;
  isActive: boolean;
  sortOrder: number;
  canModify?: boolean;
}

export interface FacilityParticipantTypeOption extends MembershipStatusOption {
  baseIdentity?: FacilityBaseIdentity;
  requiresApproval?: boolean;
}

export interface FacilityParticipantTypePayload {
  code: string;
  description: string;
  baseIdentity: FacilityBaseIdentity | '';
  requiresApproval: boolean;
  sortOrder: number;
}

@Injectable({ providedIn: 'root' })
export class FacilityParticipantTypeService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/facility/participant-types`;

  list(): Observable<{ participantTypes: FacilityParticipantType[]; baseIdentities: MembershipStatusOption[] }> {
    return this.http.get<{ participantTypes: FacilityParticipantType[]; baseIdentities: MembershipStatusOption[] }>(this.base);
  }

  create(payload: FacilityParticipantTypePayload): Observable<{ message: string; participantType: FacilityParticipantType }> {
    return this.http.post<{ message: string; participantType: FacilityParticipantType }>(this.base, payload);
  }

  update(id: string, payload: FacilityParticipantTypePayload): Observable<{ message: string; participantType: FacilityParticipantType }> {
    return this.http.put<{ message: string; participantType: FacilityParticipantType }>(`${this.base}/${id}`, payload);
  }

  setActive(id: string, isActive: boolean): Observable<{ message: string; participantType: FacilityParticipantType }> {
    return this.http.patch<{ message: string; participantType: FacilityParticipantType }>(`${this.base}/${id}`, { isActive });
  }

  remove(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/${id}`);
  }
}
