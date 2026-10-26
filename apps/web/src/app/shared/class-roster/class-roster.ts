import { Component, computed, inject, input, output, signal, ChangeDetectionStrategy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AttendanceStatus, CancelPreview, FacilityClassService, RosterRow, SessionRoster, WaitlistEntry } from '../../services/facility-class.service';
import { FacilityStationService } from '../../services/facility-station.service';
import { ConfirmDialogComponent, ConfirmRequest } from '../confirm-dialog/confirm-dialog';
import { formatLocalDate } from '../local-date.pipe';

// The ROSTER of one class session (slice 5b): the seats with their bills
// (UNPAID while the bill is open, with the bill link), the attendance marks
// the desk or the instructor sets, Hold session (previewing the rows it
// marks no-show), and the Enrol form (a member by number, or a visitor when
// the class allows). Slice 5c adds the seat's cancellation under the class
// notice (a preview names the bill outcome first), the WAITLIST of a full
// session (join through the same form, then Offer / Confirm / Withdraw per
// entry), and the seats held by open offers. Embedded by the Class Schedule
// drawer (channel desk) and the Control Station's Classes view (channel
// station, walk-ins only).
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-class-roster',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ConfirmDialogComponent],
  templateUrl: './class-roster.html',
  styleUrls: ['./class-roster.css'],
})
export class ClassRosterComponent {
  private readonly classes = inject(FacilityClassService);
  private readonly station = inject(FacilityStationService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  readonly sessionId = input.required<string>();
  readonly channel = input<'desk' | 'station'>('desk');
  readonly canEdit = input<boolean>(true);
  readonly message = output<string>();
  readonly error = output<string>();
  // Fires after any change the host may want to reflect (seats, status).
  readonly changed = output<void>();

  readonly roster = signal<SessionRoster | null>(null);
  readonly loading = signal(false);
  readonly busyId = signal<string | null>(null);
  readonly holding = signal(false);
  readonly enrolOpen = signal(false);
  readonly enrolling = signal(false);
  readonly confirmAction = signal<ConfirmRequest | null>(null);

  readonly rows = computed(() => (this.roster()?.rows || []).filter((r) => r.status !== 'cancelled'));
  readonly editable = computed(() => this.canEdit() && this.roster()?.session.status === 'scheduled');
  // The enrol form opens for a seat while one is free, or for a waitlist
  // entry once the session is full (slice 5c).
  readonly canEnrol = computed(() => {
    const r = this.roster();
    if (!r || !this.editable()) return false;
    if (this.channel() === 'station' && r.session.class?.walkInAllowed === false) return false;
    return r.seats.left > 0;
  });
  readonly isFull = computed(() => {
    const r = this.roster();
    return !!r && this.editable() && r.seats.left === 0;
  });
  readonly waitlist = computed(() => this.roster()?.waitlist || []);
  readonly held = computed(() => this.roster()?.seats.held || 0);
  readonly isTerm = computed(() => this.roster()?.session.class?.enrolmentMode === 'term');
  // What the open form does: 'enrol' takes a seat, 'waitlist' joins the queue.
  readonly formIntent = signal<'enrol' | 'waitlist'>('enrol');
  readonly waitBusyId = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    kind: ['member' as 'member' | 'visitor'],
    memberNo: ['', [Validators.maxLength(50)]],
    name: ['', [Validators.maxLength(255)]],
    mobile: ['', [Validators.maxLength(30)]],
    remarks: ['', [Validators.maxLength(255)]],
  });

  constructor() {
    effect(() => {
      const id = this.sessionId();
      if (id) this.load();
    });
  }

  showError(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  load(): void {
    this.loading.set(true);
    this.classes.roster(this.sessionId()).subscribe({
      next: (r) => {
        this.roster.set(r);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.emit(err.error?.message || 'Failed to load the roster.');
      },
    });
  }

  markLabel(status: AttendanceStatus): string {
    switch (status) {
      case 'attended': return 'Attended';
      case 'no-show': return 'No show';
      case 'excused': return 'Excused';
      case 'cancelled': return 'Cancelled';
      default: return 'Not marked';
    }
  }

  // One click sets or clears a mark on one row.
  mark(row: RosterRow, status: AttendanceStatus): void {
    if (!this.editable()) return;
    const next = row.status === status ? 'enrolled' : status;
    this.busyId.set(row.attendanceId);
    this.classes.markAttendance(this.sessionId(), [{ attendanceId: row.attendanceId, status: next }]).subscribe({
      next: () => {
        this.busyId.set(null);
        this.load();
        this.changed.emit();
      },
      error: (err) => {
        this.busyId.set(null);
        this.error.emit(err.error?.message || 'Failed to save the mark.');
      },
    });
  }

  openBill(row: RosterRow): void {
    if (row.bill) this.router.navigate(['/facility/bookings'], { queryParams: { billId: row.bill.id } });
  }

  // Hold: preview the rows it marks no-show, then confirm.
  askHold(): void {
    const r = this.roster();
    if (!r || !this.editable()) return;
    this.holding.set(true);
    this.classes.hold(this.sessionId(), false).subscribe({
      next: (res) => {
        this.holding.set(false);
        const p = res.preview;
        const names = p.unmarked.map((u) => u.name).join(', ');
        const label = `${r.session.class?.code || 'The session'} ${formatLocalDate(r.session.sessionDate, 'dayMonth')} ${r.session.startTime}`;
        this.confirmAction.set({
          title: 'Hold this session?',
          message: `${label} is recorded as held. ${p.attended} attended${p.excused ? `, ${p.excused} excused` : ''}${p.noShow ? `, ${p.noShow} already marked no-show` : ''}.${p.unmarked.length ? ` ${p.unmarked.length} unmarked seat${p.unmarked.length === 1 ? '' : 's'} will be marked no-show: ${names}.` : ' Every seat is marked.'} The marks are final after this.`,
          confirmLabel: p.unmarked.length ? `Hold and mark ${p.unmarked.length} no-show` : 'Hold session',
          cancelLabel: 'Not yet',
          danger: false,
          run: () => {
            this.confirmAction.set(null);
            this.holding.set(true);
            this.classes.hold(this.sessionId(), true).subscribe({
              next: (done) => {
                this.holding.set(false);
                this.message.emit(done.message || 'Session held.');
                this.load();
                this.changed.emit();
              },
              error: (err) => {
                this.holding.set(false);
                this.error.emit(err.error?.message || 'Failed to hold the session.');
              },
            });
          },
        });
      },
      error: (err) => {
        this.holding.set(false);
        this.error.emit(err.error?.message || 'Failed to preview the hold.');
      },
    });
  }

  // --- Cancel a seat (slice 5c): the preview names the bill outcome first ---

  askCancelSeat(row: RosterRow): void {
    const r = this.roster();
    if (!r || !this.editable() || !row.enrolment) return;
    this.busyId.set(row.attendanceId);
    this.classes.cancelPreview(row.enrolment.id).subscribe({
      next: (p) => {
        this.busyId.set(null);
        this.confirmAction.set({
          title: p.mode === 'term' ? `Withdraw ${p.enrolment.patronName} from the term?` : `Cancel ${p.enrolment.patronName}'s seat?`,
          message: this.cancelMessage(p),
          confirmLabel: p.mode === 'term' ? 'Withdraw from term' : p.late ? 'Cancel late, fee stands' : p.outcome === 'void' ? `Cancel and void ${p.bill?.billNo}` : 'Cancel seat',
          cancelLabel: 'Keep the seat',
          danger: true,
          run: () => {
            this.confirmAction.set(null);
            this.busyId.set(row.attendanceId);
            this.classes.cancelEnrolment(p.enrolment.id, null).subscribe({
              next: (res) => {
                this.busyId.set(null);
                this.message.emit(res.message);
                this.load();
                this.changed.emit();
              },
              error: (err) => {
                this.busyId.set(null);
                this.error.emit(err.error?.message || 'Failed to cancel the seat.');
              },
            });
          },
        });
      },
      error: (err) => {
        this.busyId.set(null);
        this.error.emit(err.error?.message || 'Failed to preview the cancellation.');
      },
    });
  }

  private cancelMessage(p: CancelPreview): string {
    const bill = p.bill ? `bill ${p.bill.billNo} (${p.bill.totalAmount.toFixed(2)}, ${p.bill.status})` : 'no bill';
    if (p.mode === 'term') {
      return `${p.enrolment.patronName} leaves the remaining ${p.remainingSessions} session${p.remainingSessions === 1 ? '' : 's'} of the term; the term fee stands (${bill}). A freed seat goes to the waitlist.`;
    }
    const when = p.session ? `${formatLocalDate(p.session.sessionDate, 'dayMonth')} ${p.session.startTime}` : 'the session';
    if (p.late) return `${when} starts inside the ${p.noticeHours}-hour notice, so this is a LATE cancellation: the seat is released but the fee stands (${bill}). A freed seat goes to the waitlist.`;
    const outcome = p.outcome === 'void' ? `${bill} is voided - nothing is owed.`
      : p.outcome === 'finance' ? `${bill} was settled - Finance refunds it; the bill stays as paid here.`
        : 'No fee was billed.';
    return `${when} is outside the ${p.noticeHours}-hour notice, so the seat cancels in time. ${outcome} A freed seat goes to the waitlist.`;
  }

  // --- Waitlist (slice 5c) ---

  waitLabel(w: WaitlistEntry): string {
    if (w.status === 'offered') return `Offered until ${formatLocalDate(w.offerExpiresAt || '', 'datetime')}`;
    return `Waiting since ${formatLocalDate(w.createdAt, 'datetime')}`;
  }

  offer(w: WaitlistEntry): void {
    this.waitAction(w, this.classes.offerSeat(w.id), 'Failed to offer the seat.');
  }

  confirmOffer(w: WaitlistEntry): void {
    this.waitAction(w, this.classes.confirmSeat(w.id), 'Failed to confirm the seat.');
  }

  withdraw(w: WaitlistEntry): void {
    this.confirmAction.set({
      title: `Withdraw ${w.patronName} from the waitlist?`,
      message: w.status === 'offered' ? `${w.patronName}'s offered seat is released and the next in the queue is offered it.` : `${w.patronName} leaves the queue; those behind move up.`,
      confirmLabel: 'Withdraw',
      cancelLabel: 'Keep waiting',
      danger: true,
      run: () => {
        this.confirmAction.set(null);
        this.waitAction(w, this.classes.withdrawSeat(w.id, null), 'Failed to withdraw.');
      },
    });
  }

  private waitAction(w: WaitlistEntry, req$: Observable<{ message: string; standingWarning?: string | null }>, fallback: string): void {
    this.waitBusyId.set(w.id);
    req$.subscribe({
      next: (res) => {
        this.waitBusyId.set(null);
        this.message.emit(res.standingWarning ? `${res.message} ${res.standingWarning}` : res.message);
        this.load();
        this.changed.emit();
      },
      error: (err) => {
        this.waitBusyId.set(null);
        this.error.emit(err.error?.message || fallback);
      },
    });
  }

  // --- Enrol (or join the waitlist, through the same form) ---

  openEnrol(intent: 'enrol' | 'waitlist' = 'enrol'): void {
    this.form.reset({ kind: 'member', memberNo: '', name: '', mobile: '', remarks: '' });
    this.formIntent.set(intent);
    this.enrolOpen.set(true);
  }

  closeEnrol(): void {
    this.enrolOpen.set(false);
  }

  submitEnrol(): void {
    const r = this.roster();
    if (!r || !r.session.class) return;
    const v = this.form.getRawValue();
    if (v.kind === 'member' && !v.memberNo.trim()) { this.form.controls.memberNo.markAsTouched(); this.error.emit('Key in the member number.'); return; }
    if (v.kind === 'visitor' && !v.name.trim()) { this.form.controls.name.markAsTouched(); this.error.emit('Key in the visitor\'s name.'); return; }
    const target = this.isTerm() ? { scheduleId: r.session.scheduleId } : { sessionId: r.session.id };
    const payload = {
      classId: r.session.class.id, ...target,
      memberNo: v.kind === 'member' ? v.memberNo.trim() : null,
      visitor: v.kind === 'visitor' ? { name: v.name.trim(), mobile: v.mobile.trim() || null } : null,
      remarks: v.remarks.trim() || null,
    };
    this.enrolling.set(true);
    const req$: Observable<{ message: string; standingWarning?: string | null }> = this.formIntent() === 'waitlist'
      ? this.classes.joinWaitlist(payload)
      : this.channel() === 'station'
        ? this.station.enrolWalkIn({ classId: payload.classId, sessionId: r.session.id, memberNo: payload.memberNo, visitor: payload.visitor })
        : this.classes.enrol(payload);
    req$.subscribe({
      next: (res) => {
        this.enrolling.set(false);
        this.enrolOpen.set(false);
        this.message.emit(res.standingWarning ? `${res.message} ${res.standingWarning}` : res.message);
        this.load();
        this.changed.emit();
      },
      error: (err) => {
        this.enrolling.set(false);
        this.error.emit(err.error?.message || 'Failed to enrol.');
      },
    });
  }
}
