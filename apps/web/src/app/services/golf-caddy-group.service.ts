import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// One row of the club's Caddy Group master (golf.CaddyGroup, 2026-10-17): an
// optional team of caddies with a size cap and a rotation order.
export interface GolfCaddyGroup {
  id: string;
  code: string;
  name: string;
  maxCaddies: number | null;
  rotationOrder: number;
  isActive: boolean;
  caddyCount?: number;
  canModify?: boolean;
}

export interface GolfCaddyGroupPayload {
  code: string;
  name: string;
  maxCaddies: number | null;
  rotationOrder: number;
}

@Injectable({ providedIn: 'root' })
export class GolfCaddyGroupService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/golf/caddy-groups`;

  list(): Observable<{ caddyGroups: GolfCaddyGroup[] }> {
    return this.http.get<{ caddyGroups: GolfCaddyGroup[] }>(this.base);
  }

  create(payload: GolfCaddyGroupPayload): Observable<{ message: string; caddyGroup: GolfCaddyGroup }> {
    return this.http.post<{ message: string; caddyGroup: GolfCaddyGroup }>(this.base, payload);
  }

  update(id: string, payload: GolfCaddyGroupPayload): Observable<{ message: string; caddyGroup: GolfCaddyGroup }> {
    return this.http.put<{ message: string; caddyGroup: GolfCaddyGroup }>(`${this.base}/${id}`, payload);
  }

  setActive(id: string, isActive: boolean): Observable<{ message: string; caddyGroup: GolfCaddyGroup }> {
    return this.http.patch<{ message: string; caddyGroup: GolfCaddyGroup }>(`${this.base}/${id}`, { isActive });
  }

  remove(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/${id}`);
  }
}
