import { Component, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { ConfirmDialogComponent, ConfirmRequest } from '../shared/confirm-dialog/confirm-dialog';
import { UnsavedChangesAware } from '../shared/unsaved-changes.guard';
import { FieldInfoComponent } from '../shared/field-info/field-info';
import { CanDirective } from '../shared/can.directive';
import { formatLocalDate, localDateOnly } from '../shared/local-date.pipe';
import { SecurityPolicyService } from '../services/security-policy.service';
import { SecurityPolicyState } from '../models/auth.models';

// System Setup -> Security Policy (approved 2026-10-30). The subscriber's
// account-wide security settings; today one: whether two-factor
// authentication is required for EVERY user of the subscription, optionally
// from a date so staff can be told first. Administrator roles are forced
// regardless - this extends the same login gate to everyone else.
//
// Show-expected-results: the card states how many users have not enrolled
// and exactly what will happen to them, before Save.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-security-policy',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ScreenTitlePipe, ScreenSubtitlePipe, FavStarComponent, ConfirmDialogComponent, FieldInfoComponent, CanDirective],
  templateUrl: './security-policy.html',
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class SecurityPolicyComponent implements OnInit, UnsavedChangesAware {
  private readonly service = inject(SecurityPolicyService);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');
  readonly state = signal<SecurityPolicyState | null>(null);
  readonly collapsedSections = signal<Record<string, boolean>>({});

  readonly today = localDateOnly();

  readonly form = this.fb.nonNullable.group({
    mfaRequired: [false],
    mfaRequiredFrom: [''],
  });
  readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  // The long explanation behind the (i); the inline hint stays one line.
  readonly hint = {
    required: 'When on, every user of your subscription must set up an authenticator app: anyone without it is taken to the setup screen at their next sign-in (password or single sign-on alike, and when they switch into one of your companies) and cannot turn it off afterwards. Administrator roles are always required, whatever this switch says. Give a start date to announce the change first; leave it blank to start now.',
  };

  // What Save will do, stated before it is pressed.
  readonly expected = computed(() => {
    const s = this.state();
    const v = this.formValue();
    if (!s) return '';
    if (!v.mfaRequired) {
      return `${s.enrolled} of ${s.users} users have two-factor authentication on. With the policy off they keep it as a personal choice; administrators are required regardless.`;
    }
    const starts = v.mfaRequiredFrom && v.mfaRequiredFrom > this.today ? ` from ${formatLocalDate(v.mfaRequiredFrom)}` : '';
    if (s.notEnrolled === 0) {
      return `All ${s.users} users already have two-factor authentication on - nobody will be interrupted${starts ? ', and the policy takes effect' + starts : ''}.`;
    }
    return `${s.notEnrolled} of ${s.users} users have not set up two-factor authentication. Each will be asked to set it up at their next sign-in${starts}, and none can turn it off while the policy is on.`;
  });

  // ---- Route-leave guard (unsavedChangesGuard on the route) ----
  readonly leaveConfirm = signal<ConfirmRequest | null>(null);
  private leaveResolve: ((leave: boolean) => void) | null = null;

  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.saving();
  }

  confirmLeave(): Promise<boolean> {
    return new Promise((resolve) => {
      this.leaveResolve = resolve;
      this.leaveConfirm.set({
        title: 'Discard unsaved changes?',
        message: 'Your security policy changes have not been saved and will be lost if you leave this screen.',
        confirmLabel: 'Discard changes',
        cancelLabel: 'Keep editing',
        run: () => this.resolveLeave(true),
      });
    });
  }

  cancelLeave(): void {
    this.resolveLeave(false);
  }

  private resolveLeave(leave: boolean): void {
    this.leaveConfirm.set(null);
    this.leaveResolve?.(leave);
    this.leaveResolve = null;
  }

  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  toggleSection(id: string): void {
    this.collapsedSections.update((c) => ({ ...c, [id]: !c[id] }));
  }

  isExpanded(id: string): boolean {
    return !this.collapsedSections()[id];
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.service.get().subscribe({
      next: (s) => {
        this.applyState(s);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err?.error?.message || 'Failed to load the security policy.');
      },
    });
  }

  // The save bar's "Discard changes": re-load resets everything pristine.
  discard(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
    this.load();
  }

  save(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.service.update({
      mfaPolicy: v.mfaRequired ? 'required' : 'optional',
      mfaRequiredFrom: v.mfaRequired && v.mfaRequiredFrom ? v.mfaRequiredFrom : null,
    }).subscribe({
      next: (s) => {
        this.applyState(s);
        this.successMessage.set(s.message || 'Security policy updated.');
        this.saving.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err?.error?.message || 'Failed to update the security policy.');
        this.saving.set(false);
      },
    });
  }

  private applyState(s: SecurityPolicyState): void {
    this.state.set(s);
    this.form.reset({
      mfaRequired: s.mfaPolicy === 'required',
      mfaRequiredFrom: s.mfaRequiredFrom || '',
    });
  }
}
