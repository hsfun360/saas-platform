import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { MembershipStatusOption } from '../models/auth.models';

// The caddy register (golf.Caddy, 2026-10-17) with its leave records and the
// notes on a caddy's record. Caddies are the club's own master, not users.

export type GolfCaddyStatus = 'active' | 'inactive' | 'blacklisted';
export type GolfCaddyLeaveType = 'annual' | 'sick' | 'injury' | 'unpaid' | 'other';
export type GolfCaddyNoteKind = 'commendation' | 'complaint' | 'penalty' | 'evaluation';

export interface GolfCaddy {
  id: string;
  caddyNo: string;
  name: string;
  caddyGradeId: string;
  grade: { id: string; code: string; name: string; playersPerCaddy: number } | null;
  caddyGroupId: string | null;
  group: { id: string; code: string; name: string } | null;
  isLeader: boolean;
  staffNo: string | null;
  identityNo: string | null;
  gender: 'male' | 'female' | null;
  dateOfBirth: string | null;
  mobile: string | null;
  email: string | null;
  languages: string | null;
  nationalityCode: string | null;
  raceCode: string | null;
  photo: string | null;
  qrToken: string;
  status: GolfCaddyStatus;
  statusReason: string | null;
  joinedDate: string | null;
  leftDate: string | null;
  remarks: string | null;
  // Listing extras: the leave type in force on the listing date, the note points total and count.
  onLeaveType?: GolfCaddyLeaveType | null;
  notePoints?: number;
  noteCount?: number;
  canModify?: boolean;
}

export interface GolfCaddyPayload {
  caddyNo: string;
  name: string;
  caddyGradeId: string;
  caddyGroupId: string | null;
  isLeader: boolean;
  staffNo: string | null;
  identityNo: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  mobile: string | null;
  email: string | null;
  languages: string | null;
  nationalityCode: string | null;
  raceCode: string | null;
  photo: string | null;
  joinedDate: string | null;
  leftDate: string | null;
  remarks: string | null;
}

export interface GolfCaddyLeave {
  id: string;
  caddyId: string;
  leaveType: GolfCaddyLeaveType;
  dateFrom: string;
  dateTo: string;
  remarks: string | null;
}

export interface GolfCaddyLeavePayload {
  leaveType: GolfCaddyLeaveType | '';
  dateFrom: string;
  dateTo: string;
  remarks: string | null;
}

export interface GolfCaddyNote {
  id: string;
  caddyId: string;
  noteDate: string;
  kind: GolfCaddyNoteKind;
  points: number;
  description: string;
  followUp: string | null;
}

export interface GolfCaddyNotePayload {
  kind: GolfCaddyNoteKind | '';
  noteDate: string;
  points: number;
  description: string;
  followUp: string | null;
}

export interface GolfCaddyMeta {
  grades: { id: string; code: string; name: string; playersPerCaddy: number }[];
  groups: { id: string; code: string; name: string; maxCaddies: number | null }[];
  statuses: MembershipStatusOption[];
  leaveTypes: MembershipStatusOption[];
  noteKinds: MembershipStatusOption[];
  genders: MembershipStatusOption[];
}

@Injectable({ providedIn: 'root' })
export class GolfCaddyService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/golf/caddies`;

  meta(): Observable<GolfCaddyMeta> {
    return this.http.get<GolfCaddyMeta>(`${this.base}/meta`);
  }

  list(): Observable<{ caddies: GolfCaddy[]; asOf: string }> {
    return this.http.get<{ caddies: GolfCaddy[]; asOf: string }>(this.base);
  }

  create(payload: GolfCaddyPayload): Observable<{ message: string; caddy: GolfCaddy }> {
    return this.http.post<{ message: string; caddy: GolfCaddy }>(this.base, payload);
  }

  update(id: string, payload: GolfCaddyPayload): Observable<{ message: string; caddy: GolfCaddy }> {
    return this.http.put<{ message: string; caddy: GolfCaddy }>(`${this.base}/${id}`, payload);
  }

  setStatus(id: string, status: GolfCaddyStatus, reason: string | null): Observable<{ message: string; caddy: GolfCaddy }> {
    return this.http.patch<{ message: string; caddy: GolfCaddy }>(`${this.base}/${id}/status`, { status, reason });
  }

  regenerateQr(id: string): Observable<{ message: string; caddy: GolfCaddy }> {
    return this.http.post<{ message: string; caddy: GolfCaddy }>(`${this.base}/${id}/regenerate-qr`, {});
  }

  remove(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/${id}`);
  }

  // Upload the caddy photo; returns the public URL to store via create/update.
  uploadPhoto(file: File): Observable<{ message: string; url: string }> {
    const form = new FormData();
    form.append('photo', file);
    return this.http.post<{ message: string; url: string }>(`${this.base}/photo`, form);
  }

  // The printable badge sheet (every active caddy, or the named ids).
  badgesHtml(ids: string[] = []): Observable<string> {
    const params: Record<string, string> = ids.length ? { ids: ids.join(',') } : {};
    return this.http.get(`${this.base}/badges/html`, { params, responseType: 'text' });
  }

  // --- leave records ---
  leaves(id: string): Observable<{ leaves: GolfCaddyLeave[] }> {
    return this.http.get<{ leaves: GolfCaddyLeave[] }>(`${this.base}/${id}/leaves`);
  }

  createLeave(id: string, payload: GolfCaddyLeavePayload): Observable<{ message: string; leave: GolfCaddyLeave }> {
    return this.http.post<{ message: string; leave: GolfCaddyLeave }>(`${this.base}/${id}/leaves`, payload);
  }

  updateLeave(id: string, leaveId: string, payload: GolfCaddyLeavePayload): Observable<{ message: string; leave: GolfCaddyLeave }> {
    return this.http.put<{ message: string; leave: GolfCaddyLeave }>(`${this.base}/${id}/leaves/${leaveId}`, payload);
  }

  removeLeave(id: string, leaveId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/${id}/leaves/${leaveId}`);
  }

  // --- notes ---
  notes(id: string): Observable<{ notes: GolfCaddyNote[]; points: number }> {
    return this.http.get<{ notes: GolfCaddyNote[]; points: number }>(`${this.base}/${id}/notes`);
  }

  createNote(id: string, payload: GolfCaddyNotePayload): Observable<{ message: string; note: GolfCaddyNote }> {
    return this.http.post<{ message: string; note: GolfCaddyNote }>(`${this.base}/${id}/notes`, payload);
  }

  updateNote(id: string, noteId: string, payload: GolfCaddyNotePayload): Observable<{ message: string; note: GolfCaddyNote }> {
    return this.http.put<{ message: string; note: GolfCaddyNote }>(`${this.base}/${id}/notes/${noteId}`, payload);
  }

  removeNote(id: string, noteId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/${id}/notes/${noteId}`);
  }
}
