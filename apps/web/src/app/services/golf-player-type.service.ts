import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { MembershipStatusOption } from '../models/auth.models';

// The engine class a player type behaves as (fixed vocabulary, native select).
export type GolfPlayerBaseIdentity = 'member' | 'member-guest' | 'guest' | 'affiliate';

// One row of the club's Player Type master (golf.PlayerType, spec 2.3.1).
export interface GolfPlayerType {
  id: string;
  code: string;
  description: string;
  baseIdentity: GolfPlayerBaseIdentity;
  requiresApproval: boolean;
  isSystem: boolean;
  isActive: boolean;
  sortOrder: number;
  canModify?: boolean;
}

// The vocabulary shape every /meta endpoint ships for the pickers: the code
// as the key, the description as the label, plus the base identity so a
// screen decides "member number or guest name" by class, not by code.
export interface GolfPlayerTypeOption extends MembershipStatusOption {
  baseIdentity?: GolfPlayerBaseIdentity;
  requiresApproval?: boolean;
}

// Whether a picked type takes a guest name (guest or affiliate base) rather
// than a member number; an unknown code falls back to its own value as the
// base (the three system codes equal their base).
export function playerTypeNeedsGuestName(options: GolfPlayerTypeOption[] | null | undefined, code: string): boolean {
  const base = (options || []).find((o) => o.key === code)?.baseIdentity || code;
  return base === 'guest' || base === 'affiliate';
}

export function playerTypeLabel(options: GolfPlayerTypeOption[] | null | undefined, code: string): string {
  return (options || []).find((o) => o.key === code)?.label || code;
}

export interface GolfPlayerTypePayload {
  code: string;
  description: string;
  baseIdentity: GolfPlayerBaseIdentity | '';
  requiresApproval: boolean;
  sortOrder: number;
}

// Player Type master file (Golf Management → Common Setup) for the active company.
@Injectable({ providedIn: 'root' })
export class GolfPlayerTypeService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/golf/player-types`;

  list(): Observable<{ playerTypes: GolfPlayerType[]; baseIdentities: MembershipStatusOption[] }> {
    return this.http.get<{ playerTypes: GolfPlayerType[]; baseIdentities: MembershipStatusOption[] }>(this.base);
  }

  create(payload: GolfPlayerTypePayload): Observable<{ message: string; playerType: GolfPlayerType }> {
    return this.http.post<{ message: string; playerType: GolfPlayerType }>(this.base, payload);
  }

  update(id: string, payload: GolfPlayerTypePayload): Observable<{ message: string; playerType: GolfPlayerType }> {
    return this.http.put<{ message: string; playerType: GolfPlayerType }>(`${this.base}/${id}`, payload);
  }

  setActive(id: string, isActive: boolean): Observable<{ message: string; playerType: GolfPlayerType }> {
    return this.http.patch<{ message: string; playerType: GolfPlayerType }>(`${this.base}/${id}`, { isActive });
  }

  remove(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/${id}`);
  }
}
