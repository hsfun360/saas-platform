import { Component, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { ConfirmDialogComponent, ConfirmRequest } from '../shared/confirm-dialog/confirm-dialog';
import { DialogComponent } from '../shared/dialog/dialog';
import { ComboboxComponent, ComboOption } from '../shared/combobox/combobox';
import { CanDirective } from '../shared/can.directive';
import { LocalDatePipe, formatLocalDate } from '../shared/local-date.pipe';
import { AuthService } from '../auth.service';
import { RemoteAccessService } from '../services/remote-access.service';
import { RemoteAccessGrant, RemoteAccessList } from '../models/auth.models';

// System Setup -> Access Requests (approved 2026-11-01): the time-boxed
// exceptions to the registered-workstation lock. A staff member whose role
// signs in only from the front desk asks, from the sign-in screen, to sign in
// from elsewhere; whoever holds this screen decides for a number of days
// (bounded by Security Policy), declines, or grants access in advance. A
// grant lifts the LOCATION lock only - password and two-factor code still
// apply - so the Approve / Reject pair here is a decision UI like My
// Approvals, not record CRUD.
//
// Show-expected-results: every button states the window ("Approve for 5
// days"), the revoke confirm says what happens at the next sign-in, and the
// screen says how many requests wait.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-access-requests',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ScreenTitlePipe, ScreenSubtitlePipe, FavStarComponent, ConfirmDialogComponent, DialogComponent, ComboboxComponent, CanDirective, LocalDatePipe],
  templateUrl: './access-requests.html',
  styleUrl: './access-requests.css',
})
export class AccessRequestsComponent implements OnInit {
  private readonly service = inject(RemoteAccessService);
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(false);
  readonly busyId = signal<string | null>(null);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');
  readonly pending = signal<RemoteAccessGrant[]>([]);
  readonly active = signal<RemoteAccessGrant[]>([]);
  readonly history = signal<RemoteAccessGrant[]>([]);
  readonly maxDays = signal(30);
  readonly collapsedSections = signal<Record<string, boolean>>({ history: true });

  // ---- Decision dialog (approve / reject a pending request) ----
  readonly decisionTarget = signal<RemoteAccessGrant | null>(null);
  readonly decisionMode = signal<'approve' | 'reject'>('approve');
  readonly deciding = signal(false);
  readonly decisionForm = this.fb.nonNullable.group({
    days: [7, [Validators.required]],
    note: ['', [Validators.maxLength(500)]],
  });
  readonly decisionValue = toSignal(this.decisionForm.valueChanges, { initialValue: this.decisionForm.getRawValue() });

  // ---- Grant-in-advance drawer ----
  readonly grantOpen = signal(false);
  readonly granting = signal(false);
  readonly grantForm = this.fb.nonNullable.group({
    userId: ['', [Validators.required]],
    days: [7, [Validators.required]],
    note: ['', [Validators.maxLength(500)]],
  });
  readonly grantValue = toSignal(this.grantForm.valueChanges, { initialValue: this.grantForm.getRawValue() });
  readonly userOptions = signal<ComboOption[]>([]);

  readonly confirmAction = signal<ConfirmRequest | null>(null);

  readonly defaultDays = computed(() => Math.min(7, this.maxDays()));

  // The window as typed, NaN when not a whole number.
  private daysOf(raw: unknown): number {
    const n = Number(raw);
    return Number.isInteger(n) ? n : NaN;
  }

  daysInvalid(raw: unknown): boolean {
    const n = this.daysOf(raw);
    return !(n >= 1 && n <= this.maxDays());
  }

  // Buttons state the concrete outcome.
  readonly approveLabel = computed(() => {
    const n = this.daysOf(this.decisionValue().days);
    return Number.isInteger(n) && n >= 1 ? `Approve for ${n} ${n === 1 ? 'day' : 'days'}` : 'Approve';
  });

  readonly grantLabel = computed(() => {
    const n = this.daysOf(this.grantValue().days);
    return Number.isInteger(n) && n >= 1 ? `Grant for ${n} ${n === 1 ? 'day' : 'days'}` : 'Grant';
  });

  readonly decisionExpected = computed(() => {
    const t = this.decisionTarget();
    if (!t) return '';
    if (this.decisionMode() === 'reject') {
      return `${t.userName || t.userEmail} is told the request was declined and keeps signing in from a registered workstation only.`;
    }
    const n = this.daysOf(this.decisionValue().days);
    if (!(n >= 1 && n <= this.maxDays())) return `Enter a whole number of days from 1 to ${this.maxDays()}.`;
    return `${t.userName || t.userEmail} may sign in from anywhere until ${this.untilLabel(n)}; their password and two-factor code still apply. Any earlier grant for them ends now.`;
  });

  readonly grantExpected = computed(() => {
    const v = this.grantValue();
    const n = this.daysOf(v.days);
    const who = this.userOptions().find((o) => o.value === v.userId)?.label || 'The person';
    if (!(n >= 1 && n <= this.maxDays())) return `Enter a whole number of days from 1 to ${this.maxDays()}.`;
    return `${who} may sign in from anywhere until ${this.untilLabel(n)} and is told by email; their password and two-factor code still apply.`;
  });

  private untilLabel(days: number): string {
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return formatLocalDate(until.toISOString(), 'datetime');
  }

  toggleSection(id: string): void {
    this.collapsedSections.update((c) => ({ ...c, [id]: !c[id] }));
  }

  isExpanded(id: string): boolean {
    return !this.collapsedSections()[id];
  }

  ngOnInit(): void {
    this.load();
    this.loadUsers();
  }

  load(): void {
    this.loading.set(true);
    this.service.list().subscribe({
      next: (res) => {
        this.apply(res);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err?.error?.message || 'Failed to load the access requests.');
      },
    });
  }

  private apply(res: RemoteAccessList): void {
    this.pending.set(res.pending || []);
    this.active.set(res.active || []);
    this.history.set(res.history || []);
    if (res.maxDays) this.maxDays.set(res.maxDays);
  }

  // The user picker of the grant drawer: everyone in the organisation.
  loadUsers(): void {
    this.authService.getAccountUsers().subscribe({
      next: (res) => {
        const options = (res.people || [])
          .map((p) => ({ value: p.id, label: p.full_name ? `${p.full_name} - ${p.email}` : p.email }))
          .sort((a, b) => a.label.localeCompare(b.label));
        this.userOptions.set(options);
      },
      error: () => this.userOptions.set([]),
    });
  }

  statusChip(g: RemoteAccessGrant): { cls: string; label: string } {
    switch (g.status) {
      case 'pending': return { cls: 'status-chip--info', label: 'Waiting' };
      case 'approved': return { cls: 'status-chip--on', label: 'In force' };
      case 'rejected': return { cls: 'status-chip--off', label: 'Declined' };
      case 'revoked': return { cls: 'status-chip--off', label: 'Revoked' };
      default: return { cls: 'status-chip--off', label: 'Expired' };
    }
  }

  // ---- Decisions ----

  openDecision(g: RemoteAccessGrant, mode: 'approve' | 'reject'): void {
    this.successMessage.set('');
    this.errorMessage.set('');
    this.decisionMode.set(mode);
    this.decisionForm.reset({ days: this.defaultDays(), note: '' });
    this.decisionTarget.set(g);
  }

  closeDecision(): void {
    this.decisionTarget.set(null);
  }

  submitDecision(): void {
    const t = this.decisionTarget();
    if (!t) return;
    const { days, note } = this.decisionForm.getRawValue();
    if (this.decisionMode() === 'approve' && this.daysInvalid(days)) {
      this.errorMessage.set(`Days must be a whole number from 1 to ${this.maxDays()}.`);
      return;
    }
    this.deciding.set(true);
    const call = this.decisionMode() === 'approve'
      ? this.service.approve(t.id, Number(days), note.trim() || null)
      : this.service.reject(t.id, note.trim() || null);
    call.subscribe({
      next: (res) => {
        this.deciding.set(false);
        this.decisionTarget.set(null);
        this.apply(res);
        this.successMessage.set(res.message);
      },
      error: (err) => {
        this.deciding.set(false);
        this.errorMessage.set(err?.error?.message || 'The decision could not be saved.');
      },
    });
  }

  // ---- Grant in advance ----

  openGrant(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
    this.grantForm.reset({ userId: '', days: this.defaultDays(), note: '' });
    this.grantOpen.set(true);
  }

  closeGrant(): void {
    this.grantOpen.set(false);
  }

  setGrantUser(userId: string): void {
    this.grantForm.controls.userId.setValue(userId);
    this.grantForm.controls.userId.markAsDirty();
  }

  submitGrant(): void {
    if (this.grantForm.invalid) {
      this.grantForm.markAllAsTouched();
      return;
    }
    const { userId, days, note } = this.grantForm.getRawValue();
    if (this.daysInvalid(days)) {
      this.errorMessage.set(`Days must be a whole number from 1 to ${this.maxDays()}.`);
      return;
    }
    this.granting.set(true);
    this.service.grant(userId, Number(days), note.trim() || null).subscribe({
      next: (res) => {
        this.granting.set(false);
        this.grantOpen.set(false);
        this.apply(res);
        this.successMessage.set(res.message);
      },
      error: (err) => {
        this.granting.set(false);
        this.errorMessage.set(err?.error?.message || 'The grant could not be saved.');
      },
    });
  }

  // ---- Revoke ----

  askRevoke(g: RemoteAccessGrant): void {
    this.confirmAction.set({
      title: 'Revoke remote access?',
      message: `Revoke remote access for ${g.userName || g.userEmail}? From their next sign-in they are back to registered workstations only.`,
      confirmLabel: 'Revoke',
      run: () => this.performRevoke(g.id),
    });
  }

  private performRevoke(id: string): void {
    this.confirmAction.set(null);
    this.successMessage.set('');
    this.errorMessage.set('');
    this.busyId.set(id);
    this.service.revoke(id).subscribe({
      next: (res) => {
        this.busyId.set(null);
        this.apply(res);
        this.successMessage.set(res.message);
      },
      error: (err) => {
        this.busyId.set(null);
        this.errorMessage.set(err?.error?.message || 'The grant could not be revoked.');
        this.load();
      },
    });
  }
}
