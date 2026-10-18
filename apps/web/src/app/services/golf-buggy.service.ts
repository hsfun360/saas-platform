import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { MembershipStatusOption } from '../models/auth.models';
import { GolfMaintenanceJob } from './golf-buggy-maintenance.service';

// Buggy management (user decisions 2026-10-17): the fleet register
// (golf.Buggy) and the outings the Buggy Station records (golf.BuggyIssue +
// riders). Issuing never bills anything - the buggy fee is a bill line; the
// station derives who is owed a buggy from those lines.

export type GolfBuggyStatus = 'active' | 'retired';
export type GolfBuggyLocation = 'in-depot' | 'on-course' | 'maintenance';
export type GolfBuggyIssueStatus = 'out' | 'returned' | 'swapped';
export type GolfBuggyConditionOut = 'good' | 'fault';
export type GolfBuggyConditionIn = 'good' | 'fault' | 'damaged';

export interface GolfBuggyRider {
  playerId: string;
  golferId: string | null;
  playerName: string;
  memberNo: string | null;
  billItemId: string | null;
  withFee: boolean;
}

export interface GolfBuggyIssue {
  id: string;
  buggyId: string;
  buggyNo: string;
  playDate: string;
  courseId: string | null;
  bookingProfileId: string | null;
  teeTime: string | null;
  issuedAt: string;
  conditionOut: GolfBuggyConditionOut;
  remarksOut: string | null;
  returnedAt: string | null;
  conditionIn: GolfBuggyConditionIn | null;
  remarksIn: string | null;
  status: GolfBuggyIssueStatus;
  swapReason: string | null;
  swapHole: number | null;
  replacedByIssueId: string | null;
  replacesIssueId: string | null;
  riders: GolfBuggyRider[];
}

export interface GolfBuggyTypeRef {
  id: string;
  code: string;
  name: string;
  seats: number;
}

export interface GolfBuggy {
  id: string;
  buggyNo: string;
  buggyTypeId: string;
  buggyType: GolfBuggyTypeRef | null;
  model: string | null;
  serialNo: string | null;
  purchaseDate: string | null;
  qrToken: string;
  status: GolfBuggyStatus;
  retiredAt: string | null;
  retireReason: string | null;
  location: GolfBuggyLocation;
  remarks: string | null;
  openIssue: GolfBuggyIssue | null;
  // Slice 2 (2026-10-18): the open service / repair parking the unit.
  openJob?: GolfMaintenanceJob | null;
  canModify?: boolean;
}

export interface GolfBuggyPayload {
  buggyNo: string;
  buggyTypeId: string;
  model: string | null;
  serialNo: string | null;
  purchaseDate: string | null;
  remarks: string | null;
}

export interface GolfFleetCounts {
  active: number;
  inDepot: number;
  onCourse: number;
  maintenance: number;
}

export interface GolfBuggyMeta {
  buggyTypes: GolfBuggyTypeRef[];
  statuses: MembershipStatusOption[];
  locations: MembershipStatusOption[];
  issueStatuses: MembershipStatusOption[];
  conditionsOut: MembershipStatusOption[];
  conditionsIn: MembershipStatusOption[];
  enabled: boolean;
}

// Buggies - the fleet register (Golf Management → Common Setup → Buggies).
@Injectable({ providedIn: 'root' })
export class GolfBuggyService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/golf/buggies`;

  meta(): Observable<GolfBuggyMeta> {
    return this.http.get<GolfBuggyMeta>(`${this.base}/meta`);
  }

  list(): Observable<{ buggies: GolfBuggy[]; fleet: GolfFleetCounts; enabled: boolean }> {
    return this.http.get<{ buggies: GolfBuggy[]; fleet: GolfFleetCounts; enabled: boolean }>(this.base);
  }

  create(payload: GolfBuggyPayload): Observable<{ message: string; buggy: GolfBuggy }> {
    return this.http.post<{ message: string; buggy: GolfBuggy }>(this.base, payload);
  }

  update(id: string, payload: GolfBuggyPayload): Observable<{ message: string; buggy: GolfBuggy }> {
    return this.http.put<{ message: string; buggy: GolfBuggy }>(`${this.base}/${id}`, payload);
  }

  retire(id: string, reason: string): Observable<{ message: string; buggy: GolfBuggy }> {
    return this.http.post<{ message: string; buggy: GolfBuggy }>(`${this.base}/${id}/retire`, { reason });
  }

  reinstate(id: string): Observable<{ message: string; buggy: GolfBuggy }> {
    return this.http.post<{ message: string; buggy: GolfBuggy }>(`${this.base}/${id}/reinstate`, {});
  }

  regenerateQr(id: string): Observable<{ message: string; buggy: GolfBuggy }> {
    return this.http.post<{ message: string; buggy: GolfBuggy }>(`${this.base}/${id}/regenerate-qr`, {});
  }

  remove(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/${id}`);
  }

  history(id: string): Observable<{ buggy: GolfBuggy; issues: GolfBuggyIssue[] }> {
    return this.http.get<{ buggy: GolfBuggy; issues: GolfBuggyIssue[] }>(`${this.base}/${id}/history`);
  }

  // The printable QR label sheet (every active unit, or the named ids) -
  // fetched with the token and opened as a blob by the caller.
  labelsHtml(ids: string[] = []): Observable<string> {
    const params: Record<string, string> = ids.length ? { ids: ids.join(',') } : {};
    return this.http.get(`${this.base}/labels/html`, { params, responseType: 'text' });
  }
}
