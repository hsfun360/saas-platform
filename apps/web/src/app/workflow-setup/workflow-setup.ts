import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { WorkflowService } from '../services/workflow.service';
import {
  WorkflowChainPreview,
  WorkflowCondition,
  WorkflowDefinition,
  WorkflowMeta,
  WorkflowPurpose,
  WorkflowStep,
} from '../models/workflow.models';
import { DialogComponent } from '../shared/dialog/dialog';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { CanDirective } from '../shared/can.directive';

// System Setup → Workflow Setup (/admin/workflows). The approval-chain
// designer: one definition per document type (purpose) per scope (all
// companies, or one company overriding), each an ordered list of steps with an
// approver rule, a quorum, an optional entry condition and an optional SLA
// reminder. Definitions are edited in place (running approvals keep their
// frozen snapshot; the API bumps `version`).
//
// ONE <app-dialog> instance with a mode signal and @switch views (the
// single-dialog standard): 'definition' (fields + draggable step list) ->
// 'step' (add/edit one step) -> back; 'preview' shows the resolved chain with
// today's approver names (show-expected-results).
const OP_LABELS: Record<string, string> = {
  eq: '=', ne: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤', in: 'is one of',
};

type DialogMode = 'definition' | 'step' | 'preview';

@Component({
  selector: 'app-workflow-setup',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, ReactiveFormsModule, DialogComponent, FavStarComponent,
    ScreenTitlePipe, ScreenSubtitlePipe, CanDirective,
    CdkDropList, CdkDrag, CdkDragHandle,
  ],
  templateUrl: './workflow-setup.html',
  styleUrls: ['../system-setup/system-setup.css', './workflow-setup.css'],
})
export class WorkflowSetupComponent implements OnInit {
  private readonly service = inject(WorkflowService);
  private readonly fb = inject(FormBuilder);

  readonly meta = signal<WorkflowMeta | null>(null);
  readonly definitions = signal<WorkflowDefinition[]>([]);
  readonly loading = signal(false);
  readonly togglingId = signal<string | null>(null);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');
  readonly search = signal('');

  // --- Dialog (single instance, mode-switched) ------------------------------
  readonly dialogOpen = signal(false);
  readonly dialogMode = signal<DialogMode>('definition');
  readonly saving = signal(false);
  readonly editId = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    purpose: ['', [Validators.required]],
    name: ['', [Validators.required, Validators.maxLength(255)]],
    description: [''],
    companyId: [''], // '' = all companies of the account
    isActive: [true],
  });
  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  // Working copy of the chain's steps while the dialog is open.
  readonly steps = signal<WorkflowStep[]>([]);
  private originalStepsJson = '[]';
  readonly stepsDirty = computed(() => JSON.stringify(this.steps()) !== this.originalStepsJson);
  readonly dialogDirty = computed(() =>
    this.dialogMode() === 'preview' ? false : this.form.dirty || this.stepsDirty() || this.stepForm.dirty,
  );

  // --- Step editor (the 'step' view) ----------------------------------------
  readonly editingStepIndex = signal<number | null>(null); // null = adding
  readonly stepError = signal('');
  readonly stepForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    approverType: ['role'],
    approverRoleId: [''],
    approverDepartmentId: [''],
    approverPositionId: [''],
    approverUserId: [''],
    approvalMode: ['any'],
    requiredApprovals: [2],
    hasCondition: [false],
    conditionField: [''],
    conditionOp: ['gte'],
    conditionValue: [''],
    slaHours: [''],
  });
  private readonly stepFormValue = toSignal(this.stepForm.valueChanges, { initialValue: this.stepForm.getRawValue() });

  // --- Preview (the 'preview' view) -----------------------------------------
  readonly preview = signal<WorkflowChainPreview | null>(null);
  readonly previewLoading = signal(false);

  // --- Derived --------------------------------------------------------------
  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const list = [...this.definitions()].sort((a, b) => {
      if ((a.isActive !== false) !== (b.isActive !== false)) return a.isActive !== false ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    if (!q) return list;
    return list.filter((d) =>
      d.name.toLowerCase().includes(q) ||
      this.purposeName(d.purpose).toLowerCase().includes(q) ||
      this.scopeName(d).toLowerCase().includes(q));
  });

  readonly selectedPurpose = computed<WorkflowPurpose | null>(() => {
    const key = this.formValue().purpose;
    return this.meta()?.purposes.find((p) => p.key === key) || null;
  });

  readonly dialogTitle = computed(() => {
    switch (this.dialogMode()) {
      case 'step': {
        const i = this.editingStepIndex();
        return i === null ? 'Add step' : `Edit step ${i + 1}`;
      }
      case 'preview': return `Preview — ${this.preview()?.definitionName ?? 'approval chain'}`;
      default: return this.editId() ? `Edit — ${this.formValue().name ?? ''}` : 'New approval workflow';
    }
  });

  ngOnInit(): void {
    this.load();
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  load(): void {
    this.loading.set(true);
    this.service.getMeta().subscribe({
      next: (m) => this.meta.set(m),
      error: (err) => this.errorMessage.set(err.error?.message || 'Failed to load workflow options.'),
    });
    this.service.listDefinitions().subscribe({
      next: (data) => { this.definitions.set(data); this.loading.set(false); },
      error: (err) => { this.loading.set(false); this.errorMessage.set(err.error?.message || 'Failed to load workflows.'); },
    });
  }

  // --- Label helpers --------------------------------------------------------
  purposeName(key: string): string {
    return this.meta()?.purposes.find((p) => p.key === key)?.name || key;
  }

  scopeName(d: WorkflowDefinition): string {
    if (!d.companyId) return 'All companies';
    return this.meta()?.companies.find((c) => c.id === d.companyId)?.name || 'One company';
  }

  approverSummary(s: WorkflowStep): string {
    const m = this.meta();
    if (s.approverType === 'role') {
      return `Role: ${m?.roles.find((r) => r.id === s.approverRoleId)?.name || '?'}`;
    }
    if (s.approverType === 'department-position') {
      const dept = m?.departments.find((d) => d.id === s.approverDepartmentId)?.name || '?';
      const pos = s.approverPositionId ? m?.positions.find((p) => p.id === s.approverPositionId)?.name : null;
      return pos ? `${dept} · ${pos}` : `${dept} (any position)`;
    }
    return m?.users.find((u) => u.id === s.approverUserId)?.name || '?';
  }

  quorumLabel(s: { approvalMode: string; requiredApprovals: number | null }): string {
    if (s.approvalMode === 'all') return 'All must approve';
    if (s.approvalMode === 'count') return `${s.requiredApprovals} approvals needed`;
    return 'First decision counts';
  }

  conditionLabel(c: WorkflowCondition | null | undefined): string {
    if (!c) return '';
    const field = this.selectedPurpose()?.contextFields.find((f) => f.name === c.field)?.label || c.field;
    const value = Array.isArray(c.value) ? (c.value as unknown[]).join(', ') : String(c.value);
    return `${field} ${OP_LABELS[c.op] || c.op} ${value}`;
  }

  opLabel(op: string): string {
    return OP_LABELS[op] || op;
  }

  // --- Definition dialog ----------------------------------------------------
  openAdd(): void {
    this.clearMessages();
    this.editId.set(null);
    const firstPurpose = this.meta()?.purposes[0]?.key || '';
    this.form.reset({ purpose: firstPurpose, name: '', description: '', companyId: '', isActive: true });
    this.form.controls.purpose.enable();
    this.steps.set([]);
    this.originalStepsJson = '[]';
    this.stepForm.reset();
    this.dialogMode.set('definition');
    this.dialogOpen.set(true);
  }

  openEdit(d: WorkflowDefinition): void {
    this.clearMessages();
    this.editId.set(d.id);
    this.form.reset({
      purpose: d.purpose,
      name: d.name,
      description: d.description || '',
      companyId: d.companyId || '',
      isActive: d.isActive !== false,
    });
    // The purpose IS the definition's identity (one chain per purpose+scope) -
    // it is not editable after creation.
    this.form.controls.purpose.disable();
    const steps = d.steps.map((s) => ({ ...s, condition: s.condition ? { ...s.condition } : null }));
    this.steps.set(steps);
    this.originalStepsJson = JSON.stringify(steps);
    this.stepForm.reset();
    this.dialogMode.set('definition');
    this.dialogOpen.set(true);
  }

  closeDialog(): void {
    this.dialogOpen.set(false);
    this.preview.set(null);
  }

  dropStep(event: CdkDragDrop<WorkflowStep[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const next = [...this.steps()];
    moveItemInArray(next, event.previousIndex, event.currentIndex);
    this.steps.set(next.map((s, i) => ({ ...s, stepNo: i + 1 })));
  }

  removeStep(index: number): void {
    this.steps.set(this.steps().filter((_, i) => i !== index).map((s, i) => ({ ...s, stepNo: i + 1 })));
  }

  onSaveDefinition(): void {
    this.clearMessages();
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.steps().length === 0) {
      this.errorMessage.set('Add at least one approval step before saving.');
      return;
    }
    const v = this.form.getRawValue();
    const payload = {
      purpose: v.purpose,
      name: v.name.trim(),
      description: v.description.trim(),
      companyId: v.companyId || null,
      isActive: v.isActive,
      steps: this.steps(),
    };

    this.saving.set(true);
    const id = this.editId();
    const req$ = id ? this.service.updateDefinition(id, payload) : this.service.createDefinition(payload);
    req$.subscribe({
      next: () => {
        this.successMessage.set(`${payload.name} ${id ? 'updated' : 'created'} with ${payload.steps.length} step${payload.steps.length === 1 ? '' : 's'}.`);
        this.saving.set(false);
        this.form.markAsPristine();
        this.stepForm.markAsPristine();
        this.originalStepsJson = JSON.stringify(this.steps());
        this.dialogOpen.set(false);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to save the workflow.');
        this.saving.set(false);
      },
    });
  }

  toggleActive(d: WorkflowDefinition): void {
    this.clearMessages();
    const next = !(d.isActive !== false);
    this.togglingId.set(d.id);
    this.service.updateDefinition(d.id, { isActive: next }).subscribe({
      next: () => {
        this.successMessage.set(`${d.name} ${next ? 'enabled' : 'disabled'}. ${next ? `New ${this.purposeName(d.purpose).toLowerCase()} submissions will route through it.` : 'New submissions will auto-approve; running approvals finish unchanged.'}`);
        this.togglingId.set(null);
        this.load();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Failed to update the workflow.');
        this.togglingId.set(null);
      },
    });
  }

  // --- Step view ------------------------------------------------------------
  openAddStep(): void {
    this.editingStepIndex.set(null);
    this.stepError.set('');
    this.stepForm.reset({
      name: '', approverType: 'role', approverRoleId: '', approverDepartmentId: '',
      approverPositionId: '', approverUserId: '', approvalMode: 'any', requiredApprovals: 2,
      hasCondition: false, conditionField: this.selectedPurpose()?.contextFields[0]?.name || '',
      conditionOp: 'gte', conditionValue: '', slaHours: '',
    });
    this.dialogMode.set('step');
  }

  openEditStep(index: number): void {
    const s = this.steps()[index];
    this.editingStepIndex.set(index);
    this.stepError.set('');
    this.stepForm.reset({
      name: s.name,
      approverType: s.approverType,
      approverRoleId: s.approverRoleId || '',
      approverDepartmentId: s.approverDepartmentId || '',
      approverPositionId: s.approverPositionId || '',
      approverUserId: s.approverUserId || '',
      approvalMode: s.approvalMode,
      requiredApprovals: s.requiredApprovals ?? 2,
      hasCondition: !!s.condition,
      conditionField: s.condition?.field || this.selectedPurpose()?.contextFields[0]?.name || '',
      conditionOp: s.condition?.op || 'gte',
      conditionValue: s.condition ? (Array.isArray(s.condition.value) ? (s.condition.value as unknown[]).join(', ') : String(s.condition.value)) : '',
      slaHours: s.slaHours === null || s.slaHours === undefined ? '' : String(s.slaHours),
    });
    this.dialogMode.set('step');
  }

  backToDefinition(): void {
    this.stepForm.markAsPristine();
    this.dialogMode.set('definition');
  }

  saveStep(): void {
    this.stepError.set('');
    if (this.stepForm.controls.name.invalid) {
      this.stepForm.markAllAsTouched();
      return;
    }
    const v = this.stepForm.getRawValue();

    const step: WorkflowStep = {
      stepNo: 0, // re-sequenced below
      name: v.name.trim(),
      approverType: v.approverType as WorkflowStep['approverType'],
      approverRoleId: null,
      approverDepartmentId: null,
      approverPositionId: null,
      approverUserId: null,
      approvalMode: v.approvalMode as WorkflowStep['approvalMode'],
      requiredApprovals: null,
      condition: null,
      slaHours: null,
    };

    if (v.approverType === 'role') {
      if (!v.approverRoleId) { this.stepError.set('Pick the approving role.'); return; }
      step.approverRoleId = v.approverRoleId;
    } else if (v.approverType === 'department-position') {
      if (!v.approverDepartmentId) { this.stepError.set('Pick the approving department.'); return; }
      step.approverDepartmentId = v.approverDepartmentId;
      step.approverPositionId = v.approverPositionId || null;
    } else {
      if (!v.approverUserId) { this.stepError.set('Pick the approving user.'); return; }
      step.approverUserId = v.approverUserId;
    }

    if (v.approvalMode === 'count') {
      const n = Number(v.requiredApprovals);
      if (!Number.isInteger(n) || n < 1) { this.stepError.set('Enter how many approvals are needed (1 or more).'); return; }
      step.requiredApprovals = n;
    }

    if (v.hasCondition) {
      const raw = String(v.conditionValue).trim();
      if (!v.conditionField) { this.stepError.set('Pick the condition field.'); return; }
      if (!raw) { this.stepError.set('Enter the condition value.'); return; }
      const fieldType = this.selectedPurpose()?.contextFields.find((f) => f.name === v.conditionField)?.type;
      let value: unknown = raw;
      if (v.conditionOp === 'in') {
        value = raw.split(',').map((x) => x.trim()).filter((x) => x !== '');
      } else if (fieldType === 'number') {
        const n = Number(raw);
        if (Number.isNaN(n)) { this.stepError.set('The condition value must be a number.'); return; }
        value = n;
      }
      step.condition = { field: v.conditionField, op: v.conditionOp, value };
    }

    const slaRaw = String(v.slaHours).trim();
    if (slaRaw !== '') {
      const sla = Number(slaRaw);
      if (!Number.isInteger(sla) || sla < 1) { this.stepError.set('Reminder must be a whole number of hours (1 or more).'); return; }
      step.slaHours = sla;
    }

    const i = this.editingStepIndex();
    const next = i === null ? [...this.steps(), step] : this.steps().map((s, idx) => (idx === i ? step : s));
    this.steps.set(next.map((s, idx) => ({ ...s, stepNo: idx + 1 })));
    this.stepForm.markAsPristine();
    this.dialogMode.set('definition');
  }

  // --- Preview --------------------------------------------------------------
  openPreview(d: WorkflowDefinition): void {
    this.clearMessages();
    this.editId.set(d.id);
    this.preview.set(null);
    this.previewLoading.set(true);
    this.dialogMode.set('preview');
    this.dialogOpen.set(true);
    this.service.previewDefinition(d.id).subscribe({
      next: (p) => { this.preview.set(p); this.previewLoading.set(false); },
      error: (err) => {
        this.previewLoading.set(false);
        this.dialogOpen.set(false);
        this.errorMessage.set(err.error?.message || 'Failed to preview the workflow.');
      },
    });
  }

  clearSearch(): void {
    this.search.set('');
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
