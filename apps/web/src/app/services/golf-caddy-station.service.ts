import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { MembershipStatusOption } from '../models/auth.models';
import { GolfStationFeeLine, GolfStationSlot } from './golf-buggy-station.service';

// The Caddy Station (Golf Management → Front Desk → Caddy Station; user
// decisions 2026-10-17): the day's check-in queue (FIFO, back of the queue
// after a round), the flights with the caddy SLOTS derived from the paid
// caddy-fee lines, and the assign / complete / swap doors.

export type GolfCaddyAttendanceStatus = 'present' | 'out' | 'off';
export type GolfCaddyAssignmentStatus = 'assigned' | 'completed' | 'swapped';
export type GolfCaddySwapReason = 'unwell' | 'player-request' | 'complaint' | 'other';

export interface GolfStationCaddy {
  id: string;
  caddyNo: string;
  name: string;
  status: string;
  photo: string | null;
  languages: string | null;
  grade: { id: string; code: string; name: string; playersPerCaddy: number } | null;
  onLeaveType?: string | null;
}

export interface GolfCaddyAttendance {
  id: string;
  caddyId: string;
  caddyNo: string;
  workDate: string;
  checkedInAt: string;
  checkedOutAt: string | null;
  queuedAt: string;
  status: GolfCaddyAttendanceStatus;
  remarks: string | null;
  caddy?: GolfStationCaddy;
}

export interface GolfCaddyAssignment {
  id: string;
  caddyId: string;
  caddyNo: string;
  caddyName?: string;
  playDate: string;
  courseId: string | null;
  bookingProfileId: string | null;
  teeTime: string | null;
  holes: number;
  assignedAt: string;
  requestedByName: boolean;
  status: GolfCaddyAssignmentStatus;
  holesPlayed: number | null;
  completedAt: string | null;
  completionNote: string | null;
  swapReason: GolfCaddySwapReason | null;
  swapHole: number | null;
  countsAsRound: boolean | null;
  replacedByAssignmentId: string | null;
  replacesAssignmentId: string | null;
  players: { playerId: string; golferId: string | null; playerName: string; memberNo: string | null; billItemId: string }[];
}

export interface GolfCaddyStationFlight {
  key: string;
  courseId: string;
  courseCode: string;
  courseDescription: string | null;
  playDate: string;
  teeTime: string;
  players: { playerId: string; playerName: string; memberNo: string | null; bookingProfileId: string | null; withCaddy: boolean }[];
  slots: GolfStationSlot[];
  noFee: { playerId: string; playerName: string; memberNo: string | null }[];
  assignments: GolfCaddyAssignment[];
  feeLines: GolfStationFeeLine[];
  bookingNos: string[];
  groupName: string | null;
}

export interface GolfCaddyStationBoard {
  checkedIn: number;
  available: number;
  onCourse: number;
  checkedOut: number;
  queue: GolfCaddyAttendance[];
  out: GolfCaddyAttendance[];
}

export interface GolfCaddyStationDay {
  enabled: boolean;
  playDate: string;
  courses: { id: string; courseCode: string; description: string | null; isActive: boolean }[];
  flights: GolfCaddyStationFlight[];
  board: GolfCaddyStationBoard;
  notCheckedIn: GolfStationCaddy[];
  swapReasons: (MembershipStatusOption & { countsAsRound: boolean })[];
}

export interface GolfCaddyRef {
  id?: string;
  code?: string;
}

@Injectable({ providedIn: 'root' })
export class GolfCaddyStationService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/golf/caddy-station`;

  day(playDate: string, courseId = ''): Observable<GolfCaddyStationDay> {
    const params: Record<string, string> = { playDate };
    if (courseId) params['courseId'] = courseId;
    return this.http.get<GolfCaddyStationDay>(`${this.base}/day`, { params });
  }

  resolve(code: string, playDate: string): Observable<{ caddy: GolfStationCaddy; attendance: GolfCaddyAttendance | null; openAssignment: GolfCaddyAssignment | null; workDate: string }> {
    return this.http.get<{ caddy: GolfStationCaddy; attendance: GolfCaddyAttendance | null; openAssignment: GolfCaddyAssignment | null; workDate: string }>(`${this.base}/resolve`, { params: { code, playDate } });
  }

  checkIn(payload: { caddy: GolfCaddyRef; workDate: string; remarks?: string | null }): Observable<{ message: string; attendance: GolfCaddyAttendance }> {
    return this.http.post<{ message: string; attendance: GolfCaddyAttendance }>(`${this.base}/check-in`, payload);
  }

  checkOut(payload: { attendanceId?: string; caddy?: GolfCaddyRef; workDate?: string }): Observable<{ message: string; attendance: GolfCaddyAttendance }> {
    return this.http.post<{ message: string; attendance: GolfCaddyAttendance }>(`${this.base}/check-out`, payload);
  }

  assign(payload: { caddy?: GolfCaddyRef; next?: boolean; playerIds: string[]; requestedByName?: boolean }): Observable<{ message: string; assignment: GolfCaddyAssignment }> {
    return this.http.post<{ message: string; assignment: GolfCaddyAssignment }>(`${this.base}/assign`, payload);
  }

  complete(payload: { assignmentId: string; holesPlayed?: number | null; note?: string | null; checkOut?: boolean }): Observable<{ message: string; assignment: GolfCaddyAssignment }> {
    return this.http.post<{ message: string; assignment: GolfCaddyAssignment }>(`${this.base}/complete`, payload);
  }

  swap(payload: { assignmentId: string; newCaddy?: GolfCaddyRef; next?: boolean; swapReason: GolfCaddySwapReason; swapHole?: number | null; requestedByName?: boolean }): Observable<{ message: string; assignment: GolfCaddyAssignment; swappedAssignment: GolfCaddyAssignment }> {
    return this.http.post<{ message: string; assignment: GolfCaddyAssignment; swappedAssignment: GolfCaddyAssignment }>(`${this.base}/swap`, payload);
  }
}
