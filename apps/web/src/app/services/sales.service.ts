import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { SalesAgency, SalesAgent, SalesAgentMeta } from '../models/auth.models';

// Sales Management (SRS 2.2): agency + agent masters, and the agent portal
// (public registration via invite token; /me lists every engagement of the
// caller's login across clubs).

export interface AgentRegistrationContext {
  agentName: string;
  agentCode: string;
  email: string;
  companyName: string | null;
  agencyName: string | null;
  alreadyRegistered: boolean;
}

export interface AgentRegisterResult {
  linked: boolean;
  message: string;
  token?: string;
  email?: string;
  fullName?: string;
}

export interface AgentEngagement {
  agentId: string;
  agentCode: string;
  name: string;
  agentKind: string;
  agentKindLabel: string;
  companyName: string | null;
  agencyName: string | null;
  joinedDate: string | null;
  isActive: boolean;
}

@Injectable({ providedIn: 'root' })
export class SalesService {
  private readonly http = inject(HttpClient);
  private readonly agenciesBase = `${environment.apiUrl}/membership/sales-agencies`;
  private readonly agentsBase = `${environment.apiUrl}/membership/sales-agents`;
  private readonly portalBase = `${environment.apiUrl}/membership/agent-portal`;

  // --- Agencies ---
  listAgencies(): Observable<SalesAgency[]> {
    return this.http.get<SalesAgency[]>(this.agenciesBase);
  }

  createAgency(payload: Record<string, unknown>): Observable<{ message: string; agency: SalesAgency }> {
    return this.http.post<{ message: string; agency: SalesAgency }>(this.agenciesBase, payload);
  }

  updateAgency(id: string, payload: Record<string, unknown>): Observable<{ message: string; agency: SalesAgency }> {
    return this.http.put<{ message: string; agency: SalesAgency }>(`${this.agenciesBase}/${id}`, payload);
  }

  setAgencyActive(id: string, isActive: boolean): Observable<{ message: string; agency: SalesAgency }> {
    return this.http.patch<{ message: string; agency: SalesAgency }>(`${this.agenciesBase}/${id}`, { isActive });
  }

  // --- Agents ---
  agentsMeta(): Observable<SalesAgentMeta> {
    return this.http.get<SalesAgentMeta>(`${this.agentsBase}/meta`);
  }

  listAgents(kind = ''): Observable<SalesAgent[]> {
    let params = new HttpParams();
    if (kind) params = params.set('kind', kind);
    return this.http.get<SalesAgent[]>(this.agentsBase, { params });
  }

  createAgent(payload: Record<string, unknown>): Observable<{ message: string; agent: SalesAgent }> {
    return this.http.post<{ message: string; agent: SalesAgent }>(this.agentsBase, payload);
  }

  updateAgent(id: string, payload: Record<string, unknown>): Observable<{ message: string; agent: SalesAgent }> {
    return this.http.put<{ message: string; agent: SalesAgent }>(`${this.agentsBase}/${id}`, payload);
  }

  setAgentActive(id: string, isActive: boolean): Observable<{ message: string; agent: SalesAgent }> {
    return this.http.patch<{ message: string; agent: SalesAgent }>(`${this.agentsBase}/${id}`, { isActive });
  }

  inviteAgent(id: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.agentsBase}/${id}/invite`, {});
  }

  // --- Agent portal (public registration + own view) ---
  registrationContext(token: string): Observable<AgentRegistrationContext> {
    return this.http.get<AgentRegistrationContext>(`${this.portalBase}/register/context`, { params: { token } });
  }

  register(token: string, password: string): Observable<AgentRegisterResult> {
    return this.http.post<AgentRegisterResult>(`${this.portalBase}/register`, { token, password });
  }

  me(): Observable<{ engagements: AgentEngagement[] }> {
    return this.http.get<{ engagements: AgentEngagement[] }>(`${this.portalBase}/me`);
  }
}
