import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { GolfBuggyConditionIn, GolfBuggyConditionOut, GolfBuggyIssue, GolfBuggyTypeRef, GolfFleetCounts } from './golf-buggy.service';

// The Buggy Station (Golf Management → Front Desk → Buggy Station; user
// decisions 2026-10-17): the day's flights with the buggy SLOTS derived from
// the paid buggy-fee lines, and the issue / return / swap doors.

export type GolfBuggyUsageType = 'single' | 'shared';

export interface GolfStationPlayer {
  playerId: string;
  playerName: string;
  memberNo: string | null;
  golferId: string | null;
  bookingProfileId: string | null;
  registrationNo: string | null;
  status: string;
  onBuggy: boolean;
}

// One buggy owed to a flight: a single fee line, or two paired shared lines.
export interface GolfStationSlot {
  key: string;
  usageType: GolfBuggyUsageType;
  riders: { playerId: string; playerName: string; memberNo: string | null; golferId: string | null }[];
  billItemIds: string[];
  paid: boolean;
  complete: boolean;
  issuable: boolean;
  blockReason: string | null;
}

export interface GolfStationFeeLine {
  billItemId: string;
  playerId: string;
  usageType: GolfBuggyUsageType;
  quantity: number;
  paid: boolean;
  billNo: string;
  code: string;
  consumed: boolean;
}

export interface GolfStationFlight {
  key: string;
  courseId: string;
  courseCode: string;
  courseDescription: string | null;
  buggyCompulsory: boolean;
  playDate: string;
  teeTime: string;
  players: GolfStationPlayer[];
  slots: GolfStationSlot[];
  noFee: { playerId: string; playerName: string; memberNo: string | null; onBuggy: boolean }[];
  issues: GolfBuggyIssue[];
  feeLines: GolfStationFeeLine[];
  bookingNos: string[];
  groupName: string | null;
}

export interface GolfStationDay {
  enabled: boolean;
  playDate: string;
  courses: { id: string; courseCode: string; description: string | null; buggyCompulsory: boolean; isActive: boolean }[];
  flights: GolfStationFlight[];
  fleet: GolfFleetCounts;
  out: GolfBuggyIssue[];
}

export interface GolfStationBuggy {
  id: string;
  buggyNo: string;
  status: string;
  location: string;
  buggyTypeId: string;
  buggyType: GolfBuggyTypeRef | null;
}

// A unit named by its id or by a scanned / typed code (QR token, the station
// URL carrying it, or the buggy number).
export interface GolfBuggyRef {
  id?: string;
  code?: string;
}

@Injectable({ providedIn: 'root' })
export class GolfBuggyStationService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/golf/buggy-station`;

  day(playDate: string, courseId = ''): Observable<GolfStationDay> {
    const params: Record<string, string> = { playDate };
    if (courseId) params['courseId'] = courseId;
    return this.http.get<GolfStationDay>(`${this.base}/day`, { params });
  }

  available(): Observable<{ buggies: GolfStationBuggy[] }> {
    return this.http.get<{ buggies: GolfStationBuggy[] }>(`${this.base}/available`);
  }

  resolve(code: string): Observable<{ buggy: GolfStationBuggy; openIssue: GolfBuggyIssue | null }> {
    return this.http.get<{ buggy: GolfStationBuggy; openIssue: GolfBuggyIssue | null }>(`${this.base}/resolve`, { params: { code } });
  }

  issue(payload: { buggy: GolfBuggyRef; playerIds: string[]; conditionOut?: GolfBuggyConditionOut; remarksOut?: string | null }): Observable<{ message: string; issue: GolfBuggyIssue; warnings: string[] }> {
    return this.http.post<{ message: string; issue: GolfBuggyIssue; warnings: string[] }>(`${this.base}/issue`, payload);
  }

  returnBuggy(payload: { buggy?: GolfBuggyRef; issueId?: string; conditionIn: GolfBuggyConditionIn; remarksIn?: string | null }): Observable<{ message: string; issue: GolfBuggyIssue }> {
    return this.http.post<{ message: string; issue: GolfBuggyIssue }>(`${this.base}/return`, payload);
  }

  swap(payload: { buggy?: GolfBuggyRef; issueId?: string; newBuggy: GolfBuggyRef; swapReason: string; swapHole?: number | null; conditionIn?: GolfBuggyConditionIn; remarksIn?: string | null }): Observable<{ message: string; issue: GolfBuggyIssue; swappedIssue: GolfBuggyIssue }> {
    return this.http.post<{ message: string; issue: GolfBuggyIssue; swappedIssue: GolfBuggyIssue }>(`${this.base}/swap`, payload);
  }
}
