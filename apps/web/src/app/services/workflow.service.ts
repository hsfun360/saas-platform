import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  WorkflowChainPreview,
  WorkflowDefinition,
  WorkflowHistoryInstance,
  WorkflowMeta,
  WorkflowMyTask,
  WorkflowStep,
} from '../models/workflow.models';

// Workflow (user-definable approval chains) - the /api/workflow seam.
// Definition designer endpoints are RBAC-gated on the /admin/workflows menu;
// inbox/act/history endpoints are assignee/submitter-personal (any valid token,
// ownership enforced server-side).
@Injectable({ providedIn: 'root' })
export class WorkflowService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/workflow`;

  // --- Designer (Workflow Setup screen) ---
  getMeta(): Observable<WorkflowMeta> {
    return this.http.get<WorkflowMeta>(`${this.base}/meta`);
  }

  listDefinitions(): Observable<WorkflowDefinition[]> {
    return this.http.get<WorkflowDefinition[]>(`${this.base}/definitions`);
  }

  createDefinition(payload: {
    purpose: string;
    name: string;
    description?: string;
    companyId?: string | null;
    isActive?: boolean;
    steps: Partial<WorkflowStep>[];
  }): Observable<{ message: string; definition: WorkflowDefinition }> {
    return this.http.post<{ message: string; definition: WorkflowDefinition }>(`${this.base}/definitions`, payload);
  }

  updateDefinition(id: string, patch: {
    name?: string;
    description?: string;
    companyId?: string | null;
    isActive?: boolean;
    steps?: Partial<WorkflowStep>[];
  }): Observable<{ message: string; definition: WorkflowDefinition }> {
    return this.http.patch<{ message: string; definition: WorkflowDefinition }>(`${this.base}/definitions/${id}`, patch);
  }

  previewDefinition(id: string): Observable<WorkflowChainPreview> {
    return this.http.get<WorkflowChainPreview>(`${this.base}/definitions/${id}/preview`);
  }

  // --- My Approvals inbox ---
  listMyTasks(): Observable<WorkflowMyTask[]> {
    return this.http.get<WorkflowMyTask[]>(`${this.base}/my-tasks`);
  }

  countMyTasks(): Observable<{ count: number }> {
    return this.http.get<{ count: number }>(`${this.base}/my-tasks/count`);
  }

  approveTask(id: string, comment: string): Observable<{ message: string; instanceStatus: string }> {
    return this.http.post<{ message: string; instanceStatus: string }>(`${this.base}/tasks/${id}/approve`, { comment });
  }

  rejectTask(id: string, comment: string): Observable<{ message: string; instanceStatus: string }> {
    return this.http.post<{ message: string; instanceStatus: string }>(`${this.base}/tasks/${id}/reject`, { comment });
  }

  // --- Per-document approval history ---
  listEntityInstances(entityType: string, entityId: string): Observable<WorkflowHistoryInstance[]> {
    return this.http.get<WorkflowHistoryInstance[]>(`${this.base}/instances`, { params: { entityType, entityId } });
  }

  cancelInstance(id: string): Observable<{ message: string; instanceStatus: string }> {
    return this.http.post<{ message: string; instanceStatus: string }>(`${this.base}/instances/${id}/cancel`, {});
  }
}
