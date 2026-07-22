import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { WorkflowService } from '../services/workflow.service';
import { WorkflowMyTask } from '../models/workflow.models';
import { DialogComponent } from '../shared/dialog/dialog';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { LocalDatePipe } from '../shared/local-date.pipe';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';

// My Approvals (/approvals) - the caller's personal approval inbox: every
// pending workflow task assigned to them in the active workspace. Person-scoped
// like /home, so no RBAC menu gate of its own (the engine enforces that only
// the assignee can act). Approve/reject through ONE dialog with a decision
// mode; a comment is required to reject.
@Component({
  selector: 'app-approvals',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, DialogComponent, FavStarComponent, LocalDatePipe, ScreenTitlePipe, ScreenSubtitlePipe],
  templateUrl: './approvals.html',
  styleUrls: ['../system-setup/system-setup.css', './approvals.css'],
})
export class ApprovalsComponent implements OnInit {
  private readonly service = inject(WorkflowService);
  private readonly fb = inject(FormBuilder);

  readonly tasks = signal<WorkflowMyTask[]>([]);
  readonly loading = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  // --- Decision dialog ------------------------------------------------------
  readonly dialogOpen = signal(false);
  readonly decision = signal<'approve' | 'reject'>('approve');
  readonly acting = signal(false);
  readonly activeTask = signal<WorkflowMyTask | null>(null);
  readonly form = this.fb.nonNullable.group({
    comment: [''],
  });

  readonly dialogTitle = computed(() => {
    const t = this.activeTask();
    const label = t?.entityLabel || t?.entityType || '';
    return this.decision() === 'approve' ? `Approve — ${label}` : `Reject — ${label}`;
  });

  ngOnInit(): void {
    this.load();
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  load(): void {
    this.loading.set(true);
    this.service.listMyTasks().subscribe({
      next: (data) => { this.tasks.set(data); this.loading.set(false); },
      error: (err) => { this.loading.set(false); this.errorMessage.set(err.error?.message || 'Failed to load your approvals.'); },
    });
  }

  isOverdue(t: WorkflowMyTask): boolean {
    return !!t.dueAt && new Date(t.dueAt).getTime() < Date.now();
  }

  openDecision(t: WorkflowMyTask, decision: 'approve' | 'reject'): void {
    this.clearMessages();
    this.activeTask.set(t);
    this.decision.set(decision);
    // A rejection must carry a reason the submitter can act on.
    this.form.controls.comment.setValidators(decision === 'reject' ? [Validators.required] : []);
    this.form.reset({ comment: '' });
    this.dialogOpen.set(true);
  }

  closeDialog(): void {
    this.dialogOpen.set(false);
    this.activeTask.set(null);
  }

  onConfirm(): void {
    const task = this.activeTask();
    if (!task) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const comment = this.form.getRawValue().comment.trim();
    const decision = this.decision();

    this.acting.set(true);
    const req$ = decision === 'approve' ? this.service.approveTask(task.id, comment) : this.service.rejectTask(task.id, comment);
    req$.subscribe({
      next: (res) => {
        const label = task.entityLabel || task.entityType;
        const outcome =
          res.instanceStatus === 'approved' ? `${label} is fully approved.` :
          res.instanceStatus === 'rejected' ? `${label} was rejected.` :
          `${label} moved to the next step.`;
        this.successMessage.set(`${decision === 'approve' ? 'Approved' : 'Rejected'}. ${outcome}`);
        this.acting.set(false);
        this.dialogOpen.set(false);
        this.activeTask.set(null);
        this.load();
      },
      error: (err) => {
        this.acting.set(false);
        this.errorMessage.set(err.error?.message || 'The decision could not be recorded.');
        // A 409 means the approval moved on (a colleague acted first / it was
        // recalled) - refresh so the stale task leaves the inbox.
        if (err.status === 409) {
          this.dialogOpen.set(false);
          this.activeTask.set(null);
          this.load();
        }
      },
    });
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
