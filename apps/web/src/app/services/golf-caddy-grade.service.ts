import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// One row of the club's Caddy Grade master (golf.CaddyGrade, 2026-10-17):
// code, name and how many golfers one caddy of the grade serves at once.
export interface GolfCaddyGrade {
  id: string;
  code: string;
  name: string;
  playersPerCaddy: number;
  isActive: boolean;
  sortOrder: number;
  caddyCount?: number;
  canModify?: boolean;
}

export interface GolfCaddyGradePayload {
  code: string;
  name: string;
  playersPerCaddy: number;
  sortOrder: number;
}

@Injectable({ providedIn: 'root' })
export class GolfCaddyGradeService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/golf/caddy-grades`;

  list(): Observable<{ caddyGrades: GolfCaddyGrade[]; minPlayersPerCaddy: number; maxPlayersPerCaddy: number }> {
    return this.http.get<{ caddyGrades: GolfCaddyGrade[]; minPlayersPerCaddy: number; maxPlayersPerCaddy: number }>(this.base);
  }

  create(payload: GolfCaddyGradePayload): Observable<{ message: string; caddyGrade: GolfCaddyGrade }> {
    return this.http.post<{ message: string; caddyGrade: GolfCaddyGrade }>(this.base, payload);
  }

  update(id: string, payload: GolfCaddyGradePayload): Observable<{ message: string; caddyGrade: GolfCaddyGrade }> {
    return this.http.put<{ message: string; caddyGrade: GolfCaddyGrade }>(`${this.base}/${id}`, payload);
  }

  setActive(id: string, isActive: boolean): Observable<{ message: string; caddyGrade: GolfCaddyGrade }> {
    return this.http.patch<{ message: string; caddyGrade: GolfCaddyGrade }>(`${this.base}/${id}`, { isActive });
  }

  remove(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/${id}`);
  }
}
