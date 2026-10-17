import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// One row of the club's Buggy Type master (golf.BuggyType, 2026-10-17): the
// kinds of buggy the club runs; `seats` caps the riders one unit carries.
export interface GolfBuggyType {
  id: string;
  code: string;
  name: string;
  seats: number;
  isActive: boolean;
  sortOrder: number;
  buggyCount?: number;
  canModify?: boolean;
}

export interface GolfBuggyTypePayload {
  code: string;
  name: string;
  seats: number;
  sortOrder: number;
}

// Buggy Type master file (Golf Management → Common Setup) for the active company.
@Injectable({ providedIn: 'root' })
export class GolfBuggyTypeService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/golf/buggy-types`;

  list(): Observable<{ buggyTypes: GolfBuggyType[]; minSeats: number; maxSeats: number }> {
    return this.http.get<{ buggyTypes: GolfBuggyType[]; minSeats: number; maxSeats: number }>(this.base);
  }

  create(payload: GolfBuggyTypePayload): Observable<{ message: string; buggyType: GolfBuggyType }> {
    return this.http.post<{ message: string; buggyType: GolfBuggyType }>(this.base, payload);
  }

  update(id: string, payload: GolfBuggyTypePayload): Observable<{ message: string; buggyType: GolfBuggyType }> {
    return this.http.put<{ message: string; buggyType: GolfBuggyType }>(`${this.base}/${id}`, payload);
  }

  setActive(id: string, isActive: boolean): Observable<{ message: string; buggyType: GolfBuggyType }> {
    return this.http.patch<{ message: string; buggyType: GolfBuggyType }>(`${this.base}/${id}`, { isActive });
  }

  remove(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/${id}`);
  }
}
