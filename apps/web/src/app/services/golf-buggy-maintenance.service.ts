import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { MembershipStatusOption } from '../models/auth.models';

// Buggy maintenance + the damage register (slice 2, user decisions
// 2026-10-18): a service or repair parks the unit until it is completed, an
// inspection ticks the five systems and is done on the spot (a fault opens a
// repair), a fault or damaged return at the station opens the repair by
// itself, and damage is a register only - compensation stays outside the
// system.

export type GolfMaintenanceKind = 'service' | 'repair' | 'inspection';
export type GolfMaintenanceStatus = 'open' | 'done';
export type GolfMaintenanceSource = 'manual' | 'station-return' | 'inspection';
export type GolfDamageReasonType = 'player' | 'staff' | 'non-human';
export type GolfInspectionSystem = 'steeringOk' | 'brakesOk' | 'electricalOk' | 'driveOk' | 'bodyOk';
export type GolfInspectionChecks = Record<GolfInspectionSystem, boolean>;

export interface GolfMaintenanceJob {
  id: string;
  buggyId: string;
  buggyNo: string;
  buggyType: { code: string; name: string } | null;
  buggyLocation: string | null;
  kind: GolfMaintenanceKind;
  kindLabel: string;
  status: GolfMaintenanceStatus;
  openedAt: string;
  source: GolfMaintenanceSource;
  buggyIssueId: string | null;
  buggyDamageId: string | null;
  findings: string | null;
  workDone: string | null;
  cost: number | null;
  checks: GolfInspectionChecks | null;
  faulty: string[];
  completedAt: string | null;
  remarks: string | null;
}

export interface GolfMaintenanceUnit {
  id: string;
  buggyNo: string;
  location: string;
  buggyType: { code: string; name: string; seats: number } | null;
  openJob: GolfMaintenanceJob | null;
}

export interface GolfMaintenanceList {
  jobs: GolfMaintenanceJob[];
  fleet: GolfMaintenanceUnit[];
  kinds: MembershipStatusOption[];
  statuses: MembershipStatusOption[];
  sources: MembershipStatusOption[];
  systems: MembershipStatusOption[];
  reasonTypes: MembershipStatusOption[];
}

export interface GolfInspectionItem extends Partial<GolfInspectionChecks> {
  buggyId: string;
  findings?: string | null;
}

export interface GolfBuggyDamage {
  id: string;
  buggyId: string;
  buggyNo: string;
  buggyType: { code: string; name: string } | null;
  buggyIssueId: string | null;
  playDate: string;
  golferId: string | null;
  playerId: string | null;
  golferName: string | null;
  memberNo: string | null;
  reasonType: GolfDamageReasonType;
  reasonTypeLabel: string;
  description: string;
  maintenanceId: string | null;
  resolvedAt: string | null;
  status: 'open' | 'resolved';
  remarks: string | null;
  createdAt: string;
}

export interface GolfBuggyDamagePayload {
  buggyId: string;
  playDate: string;
  reasonType: GolfDamageReasonType;
  description: string;
  golferName?: string | null;
  memberNo?: string | null;
  remarks?: string | null;
  openRepair?: boolean;
}

// The desk's assessment on a damaged return / swap.
export interface GolfDamageAssessment {
  reasonType: GolfDamageReasonType;
  description?: string | null;
  playerId?: string | null;
}

@Injectable({ providedIn: 'root' })
export class GolfBuggyMaintenanceService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/golf/buggy-maintenance`;
  private readonly damages = `${environment.apiUrl}/golf/buggy-damages`;

  list(filter: { status?: string; kind?: string; dateFrom?: string; dateTo?: string; buggyId?: string } = {}): Observable<GolfMaintenanceList> {
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(filter)) if (v) params[k] = v;
    return this.http.get<GolfMaintenanceList>(this.base, { params });
  }

  open(payload: { buggyIds: string[]; kind: 'service' | 'repair'; findings?: string | null; remarks?: string | null }): Observable<{ message: string; jobs: GolfMaintenanceJob[] }> {
    return this.http.post<{ message: string; jobs: GolfMaintenanceJob[] }>(this.base, payload);
  }

  inspect(payload: { items: GolfInspectionItem[]; remarks?: string | null }): Observable<{ message: string; passed: string[]; faulted: string[]; skipped: string[] }> {
    return this.http.post<{ message: string; passed: string[]; faulted: string[]; skipped: string[] }>(`${this.base}/inspect`, payload);
  }

  complete(id: string, payload: { workDone?: string | null; cost?: number | null }): Observable<{ message: string; job: GolfMaintenanceJob }> {
    return this.http.post<{ message: string; job: GolfMaintenanceJob }>(`${this.base}/${id}/complete`, payload);
  }

  cancel(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.base}/${id}`);
  }

  // ---- the damage register ----

  listDamages(filter: { status?: string; dateFrom?: string; dateTo?: string; buggyId?: string } = {}): Observable<{ damages: GolfBuggyDamage[]; fleet: GolfMaintenanceUnit[]; reasonTypes: MembershipStatusOption[] }> {
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(filter)) if (v) params[k] = v;
    return this.http.get<{ damages: GolfBuggyDamage[]; fleet: GolfMaintenanceUnit[]; reasonTypes: MembershipStatusOption[] }>(this.damages, { params });
  }

  recordDamage(payload: GolfBuggyDamagePayload): Observable<{ message: string; damage: GolfBuggyDamage }> {
    return this.http.post<{ message: string; damage: GolfBuggyDamage }>(this.damages, payload);
  }

  updateDamage(id: string, payload: GolfBuggyDamagePayload): Observable<{ message: string; damage: GolfBuggyDamage }> {
    return this.http.put<{ message: string; damage: GolfBuggyDamage }>(`${this.damages}/${id}`, payload);
  }

  resolveDamage(id: string): Observable<{ message: string; damage: GolfBuggyDamage }> {
    return this.http.post<{ message: string; damage: GolfBuggyDamage }>(`${this.damages}/${id}/resolve`, {});
  }
}
