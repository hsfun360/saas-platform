import { Component, computed, inject, input, output, signal, ChangeDetectionStrategy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AttendanceStatus, FacilityClassService, RosterRow, SessionRoster } from '../../services/facility-class.service';
import { FacilityStationService } from '../../services/facility-station.service';
import { ConfirmDialogComponent, ConfirmRequest } from '../confirm-dialog/confirm-dialog';
import { LocalDatePipe, formatLocalDate } from '../local-date.pipe';

// The ROSTER of one class session (slice 5b): the seats with their bills
// (UNPAID while the bill is open, with the bill link), the attendance marks
// the desk or the instructor sets, Hold session (previewing the rows it
// marks no-show), and the Enrol form (a member by number, or a visitor when
// the class allows). Embedded by the Class Schedule drawer (channel desk)
// and the Control Station's Classes view (channel station, walk-ins only).
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-class-roster',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ConfirmDialogComponent, LocalDatePipe],
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
  readonly canEnrol = computed(() => {
    const r = this.roster();
    if (!r || !this.editable()) return false;
    if (this.channel() === 'station' && r.session.class?.walkInAllowed === false) return false;
    return r.seats.left > 0;
  });
  readonly isTerm = computed(() => this.roster()?.session.class?.enrolmentMode === 'term');

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

  // --- Enrol ---

  openEnrol(): void {
    this.form.reset({ kind: 'member', memberNo: '', name: '', mobile: '', remarks: '' });
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
    const req$: Observable<{ message: string; standingWarning?: string | null }> = this.channel() === 'station'
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
