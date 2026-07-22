// Workflow (approval chains) - types mirroring /api/workflow DTOs.

export interface WorkflowCondition {
  field: string;
  op: string; // eq | ne | gt | gte | lt | lte | in
  value: unknown;
}

export interface WorkflowStep {
  id?: string;
  stepNo: number;
  name: string;
  approverType: 'role' | 'department-position' | 'user';
  approverRoleId: string | null;
  approverDepartmentId: string | null;
  approverPositionId: string | null;
  approverUserId: string | null;
  approvalMode: 'any' | 'all' | 'count';
  requiredApprovals: number | null;
  condition: WorkflowCondition | null;
  slaHours: number | null;
}

export interface WorkflowDefinition {
  id: string;
  companyId: string | null; // null = all companies of the account
  purpose: string;
  name: string;
  description: string | null;
  version: number;
  isActive: boolean;
  steps: WorkflowStep[];
}

export interface WorkflowPurpose {
  key: string;
  name: string;
  entityType: string;
  contextFields: { name: string; label: string; type: string }[];
}

export interface WorkflowMeta {
  purposes: WorkflowPurpose[];
  approverTypes: string[];
  approvalModes: string[];
  conditionOps: string[];
  companies: { id: string; name: string; countryCode: string | null }[];
  roles: { id: string; name: string }[];
  departments: { id: string; code: string; name: string }[];
  positions: { id: string; code: string; name: string; rank: number }[];
  users: { id: string; name: string; email: string }[];
}

export interface WorkflowChainPreviewStep {
  stepNo: number;
  name: string;
  approvalMode: string;
  requiredApprovals: number | null;
  condition?: WorkflowCondition | null;
  slaHours?: number | null;
  approvers: string[];
}

export interface WorkflowChainPreview {
  definitionName: string;
  version: number;
  steps: WorkflowChainPreviewStep[];
}

export interface WorkflowMyTask {
  id: string;
  stepNo: number;
  stepName: string;
  dueAt: string | null;
  createdAt: string;
  instanceId: string;
  purpose: string;
  purposeName: string;
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  context: Record<string, unknown>;
  submittedBy: string | null;
  submittedAt: string;
}

export interface WorkflowHistoryTask {
  id: string;
  stepNo: number;
  stepName: string;
  assignee: string | null;
  status: string; // pending | approved | rejected | superseded | cancelled
  actedAt: string | null;
  comment: string | null;
}

export interface WorkflowHistoryInstance {
  id: string;
  status: string; // in-progress | approved | rejected | cancelled
  purpose: string;
  entityLabel: string | null;
  definitionVersion: number;
  currentStepNo: number | null;
  submittedBy: string | null;
  submittedAt: string;
  completedAt: string | null;
  steps: { stepNo: number; name: string }[];
  tasks: WorkflowHistoryTask[];
}
