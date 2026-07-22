import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { WorkflowService } from '../../services/workflow.service';
import { WorkflowHistoryInstance } from '../../models/workflow.models';
import { LocalDatePipe } from '../local-date.pipe';

// Approval history panel - drop into any DOCUMENT screen whose records route
// through a workflow: <app-approval-history entityType="Membership"
// [entityId]="row.id" />. Renders every approval run of the document (newest
// first) with its full task trail; renders NOTHING when the document never
// went through a workflow, so it is safe to embed unconditionally.
@Component({
  selector: 'app-approval-history',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LocalDatePipe],
  template: `
    @if (instances().length > 0) {
      <section class="ah" aria-label="Approval history">
        <h3 class="ah__title">
          <span class="material-icons" aria-hidden="true">fact_check</span>
          Approval history
        </h3>
        @for (inst of instances(); track inst.id) {
          <div class="ah__run">
            <div class="ah__run-head">
              <span class="ah__chip" [class.ah__chip--ok]="inst.status === 'approved'"
                    [class.ah__chip--bad]="inst.status === 'rejected'"
                    [class.ah__chip--live]="inst.status === 'in-progress'">
                {{ statusLabel(inst.status) }}
              </span>
              <span class="ah__meta">
                @if (inst.submittedBy) { Submitted by {{ inst.submittedBy }} · }
                {{ inst.submittedAt | localDate:'datetime' }}
                @if (inst.completedAt) { · completed {{ inst.completedAt | localDate:'datetime' }} }
              </span>
            </div>
            <ol class="ah__trail">
              @for (t of inst.tasks; track t.id) {
                <li class="ah__task">
                  <span class="material-icons ah__task-icon" [class.ah__task-icon--ok]="t.status === 'approved'"
                        [class.ah__task-icon--bad]="t.status === 'rejected'" aria-hidden="true">
                    {{ taskIcon(t.status) }}
                  </span>
                  <span class="ah__task-text">
                    <span class="ah__task-line">
                      <strong>Step {{ t.stepNo }}: {{ t.stepName }}</strong>
                      · {{ t.assignee || 'Unassigned' }} · {{ taskStatusLabel(t.status) }}
                      @if (t.actedAt) { · {{ t.actedAt | localDate:'datetime' }} }
                    </span>
                    @if (t.comment) {
                      <span class="ah__comment">"{{ t.comment }}"</span>
                    }
                  </span>
                </li>
              }
            </ol>
          </div>
        }
      </section>
    }
  `,
  styles: `
    .ah { margin-top: var(--space-lg); }
    .ah__title {
      display: flex; align-items: center; gap: var(--space-sm);
      margin: 0 0 var(--space-sm); font-size: var(--font-h3);
      font-weight: var(--weight-semibold, 600); color: var(--text-primary);
    }
    .ah__run {
      border: 1px solid var(--border); border-radius: 8px;
      padding: var(--space-md); margin-bottom: var(--space-sm);
      background: var(--surface-card);
    }
    .ah__run-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-sm); margin-bottom: var(--space-sm); }
    .ah__chip {
      display: inline-flex; padding: 2px var(--space-sm); border-radius: 12px;
      font-size: var(--font-overline); font-weight: var(--weight-bold, 700);
      text-transform: uppercase; letter-spacing: 0.5px;
      background: var(--chip-off-surface, var(--surface-sunken)); color: var(--chip-off-text, var(--text-muted));
    }
    .ah__chip--ok { background: var(--success-surface); color: var(--success-text); }
    .ah__chip--bad { background: var(--danger-surface); color: var(--danger-text); }
    .ah__chip--live { background: var(--info-surface); color: var(--info-text); }
    .ah__meta { font-size: var(--font-body-2); color: var(--text-secondary); }
    .ah__trail { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-xs); }
    .ah__task { display: flex; gap: var(--space-sm); align-items: flex-start; }
    .ah__task-icon { font-size: 18px; color: var(--text-muted); margin-top: 2px; }
    .ah__task-icon--ok { color: var(--success-text); }
    .ah__task-icon--bad { color: var(--danger-text); }
    .ah__task-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .ah__task-line { font-size: var(--font-body-2); color: var(--text-primary); overflow-wrap: anywhere; }
    .ah__comment { font-size: var(--font-body-2); color: var(--text-secondary); font-style: italic; }
  `,
})
export class ApprovalHistoryComponent {
  private readonly service = inject(WorkflowService);

  readonly entityType = input.required<string>();
  readonly entityId = input.required<string>();

  readonly instances = signal<WorkflowHistoryInstance[]>([]);

  constructor() {
    // Reload whenever the bound document changes (e.g. paging through records).
    effect(() => {
      const type = this.entityType();
      const id = this.entityId();
      if (!type || !id) {
        this.instances.set([]);
        return;
      }
      this.service.listEntityInstances(type, id).subscribe({
        next: (data) => this.instances.set(data),
        error: () => this.instances.set([]), // history is auxiliary - never break the host screen
      });
    });
  }

  statusLabel(status: string): string {
    switch (status) {
      case 'in-progress': return 'In progress';
      case 'approved': return 'Approved';
      case 'rejected': return 'Rejected';
      case 'cancelled': return 'Recalled';
      default: return status;
    }
  }

  taskStatusLabel(status: string): string {
    switch (status) {
      case 'pending': return 'awaiting decision';
      case 'approved': return 'approved';
      case 'rejected': return 'rejected';
      case 'superseded': return 'decided by a colleague';
      case 'cancelled': return 'cancelled';
      default: return status;
    }
  }

  taskIcon(status: string): string {
    switch (status) {
      case 'approved': return 'check_circle';
      case 'rejected': return 'cancel';
      case 'pending': return 'schedule';
      default: return 'remove_circle_outline';
    }
  }
}
