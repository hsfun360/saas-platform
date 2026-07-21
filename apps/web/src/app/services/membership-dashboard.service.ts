import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// Membership Dashboard - read-only analytics over the membership base.
// Every aggregate the screen shows is drillable via drill() to the records
// behind it (the "show expected results" principle).

export interface DashStatus {
  id: string;
  membershipStatus: string;
  statusClass: string;
  statusColor?: string | null;
}

export interface DashType {
  id: string;
  category: string;
  membershipClass: string;
}

export interface DashAgent {
  id: string;
  agentCode: string;
  name: string;
  agentKind: string;
  salesAgencyId?: string | null;
}

export interface DashAgeBand {
  key: string;
  label: string;
  min: number | null;
  max: number | null;
}

export interface DashboardMeta {
  statuses: DashStatus[];
  types: DashType[];
  agents: DashAgent[];
  agencies: { id: string; agencyName: string }[];
  ageBands: DashAgeBand[];
}

export interface DashboardSummary {
  from: string;
  to: string;
  totalMemberships: number;
  activeMemberships: number;
  newJoins: number;
  expired: number;
  netMovement: number;
  totalMembers: number;
}

export interface MovementMonth {
  month: string; // 'YYYY-MM'
  joins: number;
  expiries: number;
}

export interface BreakdownBucket {
  key: string;
  count: number;
}

export type BreakdownDimension =
  | 'status'
  | 'memberStatus'
  | 'type'
  | 'ageBand'
  | 'country'
  | 'nationality';

export interface AgentPerfRow {
  agentId: string;
  agentCode: string | null;
  name: string;
  agentKind: string | null;
  agencyId: string | null;
  agencyName: string | null;
  count: number;
}

export interface AgentPerfResult {
  from: string;
  to: string;
  agents: AgentPerfRow[];
  unattributed: number;
}

export interface DrillMembershipRow {
  id: string;
  membershipNo: string;
  membershipClass: string;
  membershipTypeId: string;
  membershipStatusId: string;
  corporateName: string | null;
  joinDate: string | null;
  expiryDate: string | null;
  salesAgentId: string | null;
}

export interface DrillMemberRow {
  id: string;
  memberNo: string;
  memberKind: string;
  memberStatusId: string;
  firstName: string | null;
  lastName: string;
  localName: string | null;
  gender: string | null;
  birthDate: string | null;
  nationalityCode: string | null;
  joinDate: string | null;
  membershipId: string;
  membershipNo: string | null;
  membershipClass: string | null;
  corporateName: string | null;
}

export interface DrillResult {
  entity: 'memberships' | 'members';
  total: number;
  limit: number;
  offset: number;
  rows: (DrillMembershipRow | DrillMemberRow)[];
}

export interface DashboardPeriodParams {
  from?: string;
  to?: string;
  class?: string;
  kind?: string;
}

function toParams(obj: Record<string, string | number | undefined>): HttpParams {
  let params = new HttpParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== '') params = params.set(k, String(v));
  }
  return params;
}

@Injectable({ providedIn: 'root' })
export class MembershipDashboardService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/membership/dashboard`;

  meta(): Observable<DashboardMeta> {
    return this.http.get<DashboardMeta>(`${this.base}/meta`);
  }

  summary(p: DashboardPeriodParams): Observable<DashboardSummary> {
    return this.http.get<DashboardSummary>(`${this.base}/summary`, { params: toParams({ ...p }) });
  }

  movement(p: DashboardPeriodParams): Observable<{ from: string; to: string; months: MovementMonth[] }> {
    return this.http.get<{ from: string; to: string; months: MovementMonth[] }>(`${this.base}/movement`, {
      params: toParams({ ...p }),
    });
  }

  breakdown(
    dimension: BreakdownDimension,
    p: DashboardPeriodParams,
  ): Observable<{ dimension: string; buckets: BreakdownBucket[] }> {
    return this.http.get<{ dimension: string; buckets: BreakdownBucket[] }>(`${this.base}/breakdown`, {
      params: toParams({ dimension, ...p }),
    });
  }

  agents(p: DashboardPeriodParams): Observable<AgentPerfResult> {
    return this.http.get<AgentPerfResult>(`${this.base}/agents`, { params: toParams({ ...p }) });
  }

  drill(filters: Record<string, string>, offset = 0): Observable<DrillResult> {
    return this.http.get<DrillResult>(`${this.base}/drill`, {
      params: toParams({ ...filters, offset }),
    });
  }
}
