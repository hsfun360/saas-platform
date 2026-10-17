import { Component, OnInit, computed, inject, signal, ChangeDetectionStrategy, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ScreenTitlePipe, ScreenSubtitlePipe } from '../i18n/screen-title.pipe';
import { FavStarComponent } from '../shared/fav-star/fav-star';
import { CanDirective } from '../shared/can.directive';
import { DialogComponent } from '../shared/dialog/dialog';
import { LocalDatePipe, localDateOnly } from '../shared/local-date.pipe';
import { QrScannerComponent } from '../shared/qr-scanner/qr-scanner';
import { GolfStationSlot } from '../services/golf-buggy-station.service';
import {
  GolfCaddyStationService, GolfCaddyStationDay, GolfCaddyStationFlight, GolfCaddyAssignment, GolfStationCaddy, GolfCaddyAttendance, GolfCaddySwapReason,
} from '../services/golf-caddy-station.service';

type DialogMode = 'complete' | 'swap' | 'out-of-turn' | 'check-in';

// Golf Management → Front Desk → Caddy Station (/golf/caddy-station; user
// decisions 2026-10-17). The starter hut's caddy screen: the day's check-in
// QUEUE (FIFO - first checked in is next up, back of the queue after each
// round), the registered flights with the caddy SLOTS the paid caddy-fee
// lines define (a single fee = one slot, two shared fees = one slot for both
// golfers), and the rounds out on the course. Assign = tap the slot and scan
// the badge, or tap Next up. A caddy who is not the head of the queue is
// assigned only when the player asked for them. Scanning a caddy on the
// course opens Complete / Swap; scanning one not yet checked in checks them
// in. No caddy is ever assigned without a caddy-fee line.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-golf-caddy-station',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ScreenTitlePipe, ScreenSubtitlePipe, FavStarComponent, CanDirective,
    DialogComponent, LocalDatePipe, QrScannerComponent],
  templateUrl: './golf-caddy-station.html',
  // membership-types.css supplies the shared .mt-chip pill; the buggy station's css the slot/scan chrome.
  styleUrls: ['../membership-types/membership-types.css', '../golf-buggy-station/golf-buggy-station.css', './golf-caddy-station.css'],
})
export class GolfCaddyStationComponent implements OnInit {
  private readonly service = inject(GolfCaddyStationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly scanner = viewChild(QrScannerComponent);

  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly successMessage = signal('');
  readonly errorMessage = signal('');

  readonly playDate = signal(localDateOnly());
  readonly courseId = signal('');
  readonly day = signal<GolfCaddyStationDay | null>(null);
  readonly cameraOn = signal(false);
  readonly code = signal('');
  readonly queueOpen = signal(true);

  // The tap-then-scan handshake.
  readonly selectedSlotKey = signal<string | null>(null);
  readonly selectedFlightKey = signal<string | null>(null);
  readonly pendingCaddy = signal<GolfStationCaddy | null>(null);

  // Dialog.
  readonly dialogOpen = signal(false);
  readonly mode = signal<DialogMode>('complete');
  readonly targetAssignment = signal<GolfCaddyAssignment | null>(null);
  readonly outOfTurnCaddy = signal<GolfStationCaddy | null>(null);
  readonly checkInSearch = signal('');
  readonly completeForm = this.fb.nonNullable.group({
    holesPlayed: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(18)]),
    note: ['', [Validators.maxLength(255)]],
    checkOut: [false],
  });
  readonly swapForm = this.fb.nonNullable.group({
    useNext: [true],
    newCode: ['', [Validators.maxLength(512)]],
    swapReason: ['' as GolfCaddySwapReason | '', [Validators.required]],
    swapHole: this.fb.control<number | null>(null, [Validators.min(1), Validators.max(18)]),
    requestedByName: [false],
  });

  readonly flights = computed(() => this.day()?.flights || []);
  readonly board = computed(() => this.day()?.board || { checkedIn: 0, available: 0, onCourse: 0, checkedOut: 0, queue: [], out: [] });
  readonly enabled = computed(() => this.day()?.enabled === true);
  readonly nextUp = computed(() => this.board().queue[0] || null);
  readonly readySlots = computed(() => this.flights().reduce((n, f) => n + f.slots.filter((s) => s.issuable && !this.slotAssigned(f, s)).length, 0));
  readonly pendingSlots = computed(() => this.flights().reduce((n, f) => n + f.slots.filter((s) => !this.slotAssigned(f, s)).length, 0));
  readonly openRounds = computed(() => this.flights().flatMap((f) => f.assignments.filter((a) => a.status === 'assigned')));

  readonly selectedFlight = computed(() => this.flights().find((f) => f.key === this.selectedFlightKey()) || null);
  readonly selectedSlot = computed(() => {
    const f = this.selectedFlight();
    const key = this.selectedSlotKey();
    return f && key ? f.slots.find((s) => s.key === key) || null : null;
  });
  readonly targetLabel = computed(() => {
    const slot = this.selectedSlot();
    const f = this.selectedFlight();
    return slot && f ? `${slot.riders.map((r) => r.playerName).join(' and ')} (${f.teeTime} ${f.courseCode})` : '';
  });
  readonly notCheckedInFiltered = computed(() => {
    const q = this.checkInSearch().trim().toLowerCase();
    const list = this.day()?.notCheckedIn || [];
    return q ? list.filter((c) => c.caddyNo.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)) : list;
  });

  readonly dialogTitle = computed(() => {
    const a = this.targetAssignment();
    switch (this.mode()) {
      case 'swap': return `Swap caddy ${a?.caddyNo || ''}`;
      case 'out-of-turn': return `Assign caddy ${this.outOfTurnCaddy()?.caddyNo || ''} out of turn`;
      case 'check-in': return 'Check in a caddy';
      default: return `Complete round - caddy ${a?.caddyNo || ''}`;
    }
  });

  ngOnInit(): void {
    const fromDate = this.route.snapshot.queryParamMap.get('date');
    if (fromDate && /^\d{4}-\d{2}-\d{2}$/.test(fromDate)) this.playDate.set(fromDate);
    this.load();
    const token = this.route.snapshot.queryParamMap.get('c');
    if (token) {
      this.handleCode(token);
      void this.router.navigate([], { relativeTo: this.route, queryParams: { c: null }, queryParamsHandling: 'merge', replaceUrl: true });
    }
  }

  load(): void {
    this.loading.set(true);
    this.service.day(this.playDate(), this.courseId()).subscribe({
      next: (d) => {
        this.day.set(d);
        this.loading.set(false);
        if (this.selectedSlot() === null && this.selectedSlotKey()) this.selectedSlotKey.set(null);
      },
      error: (err) => { this.loading.set(false); this.errorMessage.set(err.error?.message || 'Failed to load the caddy station.'); },
    });
  }

  setDate(v: string): void {
    if (!v) return;
    this.playDate.set(v);
    this.clearSelection();
    this.load();
  }

  setCourse(v: string): void {
    this.courseId.set(v);
    this.clearSelection();
    this.load();
  }

  toggleCamera(): void {
    this.cameraOn.update((on) => !on);
  }

  // ---- slots ----

  slotAssigned(f: GolfCaddyStationFlight, s: GolfStationSlot): boolean {
    return s.riders.every((r) => f.players.find((p) => p.playerId === r.playerId)?.withCaddy);
  }

  slotCaddy(f: GolfCaddyStationFlight, s: GolfStationSlot): string {
    const ids = new Set(s.riders.map((r) => r.playerId));
    const a = f.assignments.find((x) => x.status === 'assigned' && x.players.some((p) => ids.has(p.playerId)));
    return a ? `${a.caddyNo}${a.caddyName ? ' ' + a.caddyName : ''}` : '';
  }

  slotState(f: GolfCaddyStationFlight, s: GolfStationSlot): 'assigned' | 'ready' | 'blocked' {
    if (this.slotAssigned(f, s)) return 'assigned';
    return s.issuable ? 'ready' : 'blocked';
  }

  usageLabel(u: string): string {
    return u === 'shared' ? 'Shared' : 'Single';
  }

  isSelected(f: GolfCaddyStationFlight, s: GolfStationSlot): boolean {
    return this.selectedFlightKey() === f.key && this.selectedSlotKey() === s.key;
  }

  pickSlot(f: GolfCaddyStationFlight, s: GolfStationSlot): void {
    this.clearMessages();
    if (this.slotState(f, s) !== 'ready') {
      if (s.blockReason) this.errorMessage.set(s.blockReason);
      return;
    }
    if (this.isSelected(f, s)) {
      this.selectedSlotKey.set(null);
      return;
    }
    this.selectedFlightKey.set(f.key);
    this.selectedSlotKey.set(s.key);
    const pending = this.pendingCaddy();
    if (pending) this.assignCaddy(pending, s.riders.map((r) => r.playerId));
  }

  // Next up: the head of the queue takes the selected slot.
  assignNext(): void {
    const slot = this.selectedSlot();
    if (!slot) {
      this.errorMessage.set('Tap the slot first, then Next up.');
      return;
    }
    this.clearMessages();
    this.busy.set(true);
    this.service.assign({ next: true, playerIds: slot.riders.map((r) => r.playerId) }).subscribe({
      next: (res) => { this.busy.set(false); this.successMessage.set(res.message); this.clearSelection(); this.load(); },
      error: (err) => { this.busy.set(false); this.errorMessage.set(err.error?.message || 'The caddy could not be assigned.'); },
    });
  }

  clearSelection(): void {
    this.selectedSlotKey.set(null);
    this.selectedFlightKey.set(null);
    this.pendingCaddy.set(null);
  }

  // ---- codes ----

  submitCode(): void {
    const v = this.code().trim();
    if (!v) return;
    this.code.set('');
    this.handleCode(v);
  }

  onScanned(text: string): void {
    this.handleCode(text);
  }

  // Resolve a badge: on the course -> Complete / Swap; not checked in -> check
  // in; present -> assign to the selected slot (out of turn needs the
  // player's request) or wait for a tap.
  handleCode(raw: string): void {
    this.clearMessages();
    if (this.dialogOpen() && this.mode() === 'swap') {
      this.swapForm.patchValue({ newCode: raw, useNext: false });
      this.swapForm.markAsDirty();
      return;
    }
    this.busy.set(true);
    this.service.resolve(raw, this.playDate()).subscribe({
      next: (res) => {
        this.busy.set(false);
        if (res.openAssignment) {
          this.pendingCaddy.set(null);
          this.openComplete(res.openAssignment);
          return;
        }
        if (res.caddy.status !== 'active') {
          this.errorMessage.set(`Caddy ${res.caddy.caddyNo} is ${res.caddy.status}.`);
          return;
        }
        if (!res.attendance || res.attendance.status === 'off') {
          this.checkInCaddy(res.caddy);
          return;
        }
        const slot = this.selectedSlot();
        if (slot) {
          this.tryAssign(res.caddy, slot.riders.map((r) => r.playerId));
        } else {
          this.pendingCaddy.set(res.caddy);
          this.successMessage.set(`Caddy ${res.caddy.caddyNo} ${res.caddy.name} ready - tap the slot.`);
        }
      },
      error: (err) => { this.busy.set(false); this.errorMessage.set(err.error?.message || 'That code did not match a caddy.'); },
    });
  }

  // Out of turn? Ask whether the player requested the caddy before assigning.
  private tryAssign(caddy: GolfStationCaddy, playerIds: string[]): void {
    const head = this.nextUp();
    if (head && head.caddyId !== caddy.id) {
      this.pendingCaddy.set(caddy);
      this.outOfTurnCaddy.set(caddy);
      this.mode.set('out-of-turn');
      this.dialogOpen.set(true);
      return;
    }
    this.assignCaddy(caddy, playerIds, false);
  }

  confirmOutOfTurn(): void {
    const caddy = this.outOfTurnCaddy();
    const slot = this.selectedSlot();
    this.dialogOpen.set(false);
    if (!caddy || !slot) return;
    this.assignCaddy(caddy, slot.riders.map((r) => r.playerId), true);
  }

  assignCaddy(caddy: GolfStationCaddy, playerIds: string[], requestedByName = false): void {
    const head = this.nextUp();
    if (!requestedByName && head && head.caddyId !== caddy.id) {
      this.tryAssign(caddy, playerIds);
      return;
    }
    this.busy.set(true);
    this.service.assign({ caddy: { id: caddy.id }, playerIds, requestedByName }).subscribe({
      next: (res) => { this.busy.set(false); this.successMessage.set(res.message); this.clearSelection(); this.scanner()?.reset(); this.load(); },
      error: (err) => { this.busy.set(false); this.pendingCaddy.set(null); this.scanner()?.reset(); this.errorMessage.set(err.error?.message || 'The caddy could not be assigned.'); },
    });
  }

  // ---- check-in / out ----

  openCheckIn(): void {
    this.clearMessages();
    this.checkInSearch.set('');
    this.mode.set('check-in');
    this.dialogOpen.set(true);
  }

  checkInCaddy(c: GolfStationCaddy): void {
    this.clearMessages();
    this.busy.set(true);
    this.service.checkIn({ caddy: { id: c.id }, workDate: this.playDate() }).subscribe({
      next: (res) => { this.busy.set(false); this.successMessage.set(res.message); this.scanner()?.reset(); this.load(); },
      error: (err) => { this.busy.set(false); this.scanner()?.reset(); this.errorMessage.set(err.error?.message || 'The caddy could not be checked in.'); },
    });
  }

  checkOut(a: GolfCaddyAttendance): void {
    this.clearMessages();
    this.busy.set(true);
    this.service.checkOut({ attendanceId: a.id }).subscribe({
      next: (res) => { this.busy.set(false); this.successMessage.set(res.message); this.load(); },
      error: (err) => { this.busy.set(false); this.errorMessage.set(err.error?.message || 'The caddy could not be checked out.'); },
    });
  }

  // ---- complete / swap ----

  openComplete(a: GolfCaddyAssignment): void {
    this.clearMessages();
    this.targetAssignment.set(a);
    this.mode.set('complete');
    this.completeForm.reset({ holesPlayed: a.holes, note: '', checkOut: false });
    this.dialogOpen.set(true);
  }

  openSwap(a: GolfCaddyAssignment): void {
    this.clearMessages();
    this.targetAssignment.set(a);
    this.mode.set('swap');
    this.swapForm.reset({ useNext: true, newCode: '', swapReason: '', swapHole: null, requestedByName: false });
    this.dialogOpen.set(true);
  }

  switchToSwap(): void {
    const a = this.targetAssignment();
    if (a) this.openSwap(a);
  }

  closeDialog(): void {
    this.dialogOpen.set(false);
    this.pendingCaddy.set(null);
    this.scanner()?.reset();
  }

  golfersOf(a: GolfCaddyAssignment): string {
    return a.players.map((p) => p.playerName).join(' and ');
  }

  reasonLabel(key: string | null): string {
    return key ? (this.day()?.swapReasons.find((r) => r.key === key)?.label || key) : '';
  }

  runComplete(): void {
    const a = this.targetAssignment();
    if (!a) return;
    if (this.completeForm.invalid) {
      this.completeForm.markAllAsTouched();
      return;
    }
    const v = this.completeForm.getRawValue();
    this.busy.set(true);
    this.service.complete({ assignmentId: a.id, holesPlayed: v.holesPlayed, note: v.note.trim() || null, checkOut: v.checkOut }).subscribe({
      next: (res) => { this.busy.set(false); this.dialogOpen.set(false); this.successMessage.set(res.message); this.scanner()?.reset(); this.load(); },
      error: (err) => { this.busy.set(false); this.errorMessage.set(err.error?.message || 'The round could not be completed.'); },
    });
  }

  runSwap(): void {
    const a = this.targetAssignment();
    if (!a) return;
    if (this.swapForm.invalid) {
      this.swapForm.markAllAsTouched();
      return;
    }
    const v = this.swapForm.getRawValue();
    if (!v.useNext && !v.newCode.trim()) {
      this.errorMessage.set('Scan or type the replacement caddy, or use Next up.');
      return;
    }
    this.busy.set(true);
    this.service.swap({
      assignmentId: a.id,
      next: v.useNext,
      newCaddy: v.useNext ? undefined : { code: v.newCode.trim() },
      swapReason: v.swapReason as GolfCaddySwapReason,
      swapHole: v.swapHole,
      requestedByName: v.requestedByName,
    }).subscribe({
      next: (res) => { this.busy.set(false); this.dialogOpen.set(false); this.successMessage.set(res.message); this.scanner()?.reset(); this.load(); },
      error: (err) => { this.busy.set(false); this.errorMessage.set(err.error?.message || 'The caddy could not be swapped.'); },
    });
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
