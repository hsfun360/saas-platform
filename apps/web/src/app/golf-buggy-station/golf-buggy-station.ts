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
import {
  GolfBuggyStationService, GolfStationDay, GolfStationFlight, GolfStationSlot, GolfStationBuggy,
} from '../services/golf-buggy-station.service';
import { GolfBuggyConditionIn, GolfBuggyIssue } from '../services/golf-buggy.service';
import { GolfDamageAssessment, GolfDamageReasonType } from '../services/golf-buggy-maintenance.service';

type DialogMode = 'return' | 'swap';

// Golf Management → Front Desk → Buggy Station (/golf/buggy-station; user
// decisions 2026-10-17). The starter hut's screen: the day's registered
// flights with the buggy SLOTS the paid buggy-fee lines define (a single fee
// = one slot, two shared fees = one slot for both riders), and the units out
// on the course. The operator's input per buggy is ONE scan: pick a slot and
// scan the unit (camera or handheld scanner), or scan first and tap the slot.
// Scanning a unit that is already out opens Return / Swap. A unit is never
// issued against a slot the server deems not issuable (unpaid, or a shared
// fee without its partner) - the reason is shown on the slot.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-golf-buggy-station',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ScreenTitlePipe, ScreenSubtitlePipe, FavStarComponent, CanDirective,
    DialogComponent, LocalDatePipe, QrScannerComponent],
  templateUrl: './golf-buggy-station.html',
  // membership-types.css supplies the shared .mt-chip pill.
  styleUrls: ['../membership-types/membership-types.css', './golf-buggy-station.css'],
})
export class GolfBuggyStationComponent implements OnInit {
  private readonly service = inject(GolfBuggyStationService);
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
  readonly day = signal<GolfStationDay | null>(null);
  readonly cameraOn = signal(false);
  readonly code = signal('');

  // The scan-then-tap / tap-then-scan handshake.
  readonly selectedSlotKey = signal<string | null>(null);
  readonly selectedFlightKey = signal<string | null>(null);
  readonly selectedNoFee = signal<Set<string>>(new Set());
  readonly pendingBuggy = signal<GolfStationBuggy | null>(null);

  // Return / Swap dialog.
  readonly dialogOpen = signal(false);
  readonly mode = signal<DialogMode>('return');
  readonly targetIssue = signal<GolfBuggyIssue | null>(null);
  // Slice 2 (2026-10-18): the desk assesses the unit on return - a fault or
  // damage opens the repair and parks the unit; damage also names who or
  // what caused it and the rider held responsible.
  readonly returnForm = this.fb.nonNullable.group({
    conditionIn: ['good' as GolfBuggyConditionIn],
    remarksIn: ['', [Validators.maxLength(255)]],
    reasonType: ['player' as GolfDamageReasonType],
    playerId: [''],
  });
  readonly swapForm = this.fb.nonNullable.group({
    newCode: ['', [Validators.required, Validators.maxLength(512)]],
    swapReason: ['', [Validators.required, Validators.maxLength(255)]],
    swapHole: this.fb.control<number | null>(null, [Validators.min(1), Validators.max(18)]),
    conditionIn: ['fault' as GolfBuggyConditionIn],
    remarksIn: ['', [Validators.maxLength(255)]],
    reasonType: ['player' as GolfDamageReasonType],
    playerId: [''],
  });
  readonly reasonTypes: { key: GolfDamageReasonType; label: string }[] = [
    { key: 'player', label: 'Player' },
    { key: 'staff', label: 'Staff' },
    { key: 'non-human', label: 'Not caused by a person' },
  ];

  readonly flights = computed(() => this.day()?.flights || []);
  readonly out = computed(() => this.day()?.out || []);
  readonly enabled = computed(() => this.day()?.enabled === true);
  readonly fleet = computed(() => this.day()?.fleet || { active: 0, inDepot: 0, onCourse: 0, maintenance: 0 });
  readonly pendingSlots = computed(() => this.flights().reduce((n, f) => n + f.slots.filter((s) => !this.slotIssued(f, s)).length, 0));
  readonly readySlots = computed(() => this.flights().reduce((n, f) => n + f.slots.filter((s) => s.issuable && !this.slotIssued(f, s)).length, 0));

  readonly selectedFlight = computed(() => this.flights().find((f) => f.key === this.selectedFlightKey()) || null);
  readonly selectedSlot = computed(() => {
    const f = this.selectedFlight();
    const key = this.selectedSlotKey();
    return f && key ? f.slots.find((s) => s.key === key) || null : null;
  });

  // The riders a scan would issue to right now (a slot, or fee-less players).
  readonly targetRiderIds = computed<string[]>(() => {
    const slot = this.selectedSlot();
    if (slot) return slot.riders.map((r) => r.playerId);
    return [...this.selectedNoFee()];
  });
  readonly targetLabel = computed(() => {
    const slot = this.selectedSlot();
    const f = this.selectedFlight();
    if (slot) return `${slot.riders.map((r) => r.playerName).join(' and ')}${f ? ` (${f.teeTime} ${f.courseCode})` : ''}`;
    const ids = this.selectedNoFee();
    if (!ids.size || !f) return '';
    return `${f.noFee.filter((p) => ids.has(p.playerId)).map((p) => p.playerName).join(' and ')} (${f.teeTime} ${f.courseCode}, no buggy fee)`;
  });

  readonly dialogTitle = computed(() => {
    const i = this.targetIssue();
    return this.mode() === 'swap' ? `Swap buggy ${i?.buggyNo || ''}` : `Return buggy ${i?.buggyNo || ''}`;
  });

  ngOnInit(): void {
    const fromDate = this.route.snapshot.queryParamMap.get('date');
    if (fromDate && /^\d{4}-\d{2}-\d{2}$/.test(fromDate)) this.playDate.set(fromDate);
    this.load();
    // A QR label scanned with a phone camera lands here with ?b=<token>.
    const token = this.route.snapshot.queryParamMap.get('b');
    if (token) {
      this.handleCode(token);
      void this.router.navigate([], { relativeTo: this.route, queryParams: { b: null }, queryParamsHandling: 'merge', replaceUrl: true });
    }
  }

  load(): void {
    this.loading.set(true);
    this.service.day(this.playDate(), this.courseId()).subscribe({
      next: (d) => {
        this.day.set(d);
        this.loading.set(false);
        // Drop a selection that no longer exists after a reload.
        if (this.selectedSlot() === null && this.selectedSlotKey()) this.selectedSlotKey.set(null);
      },
      error: (err) => { this.loading.set(false); this.errorMessage.set(err.error?.message || 'Failed to load the buggy station.'); },
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

  slotIssued(f: GolfStationFlight, s: GolfStationSlot): boolean {
    return s.riders.every((r) => f.players.find((p) => p.playerId === r.playerId)?.onBuggy);
  }

  slotBuggy(f: GolfStationFlight, s: GolfStationSlot): string {
    const ids = new Set(s.riders.map((r) => r.playerId));
    const i = f.issues.find((x) => x.status === 'out' && x.riders.some((r) => ids.has(r.playerId)));
    return i ? i.buggyNo : '';
  }

  slotState(f: GolfStationFlight, s: GolfStationSlot): 'issued' | 'ready' | 'blocked' {
    if (this.slotIssued(f, s)) return 'issued';
    return s.issuable ? 'ready' : 'blocked';
  }

  usageLabel(u: string): string {
    return u === 'shared' ? 'Shared' : 'Single';
  }

  isSelected(f: GolfStationFlight, s: GolfStationSlot): boolean {
    return this.selectedFlightKey() === f.key && this.selectedSlotKey() === s.key;
  }

  // Tap a slot: select it, or - when a scanned unit is waiting - issue at once.
  pickSlot(f: GolfStationFlight, s: GolfStationSlot): void {
    this.clearMessages();
    if (this.slotState(f, s) !== 'ready') {
      if (s.blockReason) this.errorMessage.set(s.blockReason);
      return;
    }
    this.selectedNoFee.set(new Set());
    if (this.isSelected(f, s)) {
      this.selectedSlotKey.set(null);
      return;
    }
    this.selectedFlightKey.set(f.key);
    this.selectedSlotKey.set(s.key);
    const pending = this.pendingBuggy();
    if (pending) this.issueTo(pending, s.riders.map((r) => r.playerId));
  }

  toggleNoFee(f: GolfStationFlight, playerId: string): void {
    this.clearMessages();
    if (f.buggyCompulsory) {
      this.errorMessage.set(`${f.courseCode} is buggy-compulsory - add the buggy fee to the player's bill first.`);
      return;
    }
    if (this.selectedFlightKey() !== f.key) this.selectedNoFee.set(new Set());
    this.selectedFlightKey.set(f.key);
    this.selectedSlotKey.set(null);
    const next = new Set(this.selectedNoFee());
    if (next.has(playerId)) next.delete(playerId); else next.add(playerId);
    this.selectedNoFee.set(next);
    const pending = this.pendingBuggy();
    if (pending && next.size) this.issueTo(pending, [...next]);
  }

  isNoFeeSelected(f: GolfStationFlight, playerId: string): boolean {
    return this.selectedFlightKey() === f.key && this.selectedNoFee().has(playerId);
  }

  clearSelection(): void {
    this.selectedSlotKey.set(null);
    this.selectedFlightKey.set(null);
    this.selectedNoFee.set(new Set());
    this.pendingBuggy.set(null);
  }

  // ---- codes ----

  // The code box: a handheld scanner types the code and Enter; the operator
  // may type a buggy number too.
  submitCode(): void {
    const v = this.code().trim();
    if (!v) return;
    this.code.set('');
    this.handleCode(v);
  }

  onScanned(text: string): void {
    this.handleCode(text);
  }

  // Resolve a code: a unit that is OUT opens Return / Swap; a free unit
  // issues to the selected riders, or waits for a tap.
  handleCode(raw: string): void {
    this.clearMessages();
    if (this.dialogOpen() && this.mode() === 'swap') {
      this.swapForm.controls.newCode.setValue(raw);
      this.swapForm.controls.newCode.markAsDirty();
      return;
    }
    this.busy.set(true);
    this.service.resolve(raw).subscribe({
      next: (res) => {
        this.busy.set(false);
        if (res.openIssue) {
          this.pendingBuggy.set(null);
          this.openReturn(res.openIssue);
          return;
        }
        if (res.buggy.status !== 'active' || res.buggy.location !== 'in-depot') {
          this.errorMessage.set(`Buggy ${res.buggy.buggyNo} is ${res.buggy.status === 'retired' ? 'retired' : res.buggy.location.replace('-', ' ')}.`);
          return;
        }
        const riders = this.targetRiderIds();
        if (riders.length) {
          this.issueTo(res.buggy, riders);
        } else {
          this.pendingBuggy.set(res.buggy);
          this.successMessage.set(`Buggy ${res.buggy.buggyNo} ready - tap the slot it goes to.`);
        }
      },
      error: (err) => { this.busy.set(false); this.errorMessage.set(err.error?.message || 'That code did not match a buggy.'); },
    });
  }

  issueTo(buggy: GolfStationBuggy, playerIds: string[]): void {
    this.busy.set(true);
    this.service.issue({ buggy: { id: buggy.id }, playerIds }).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.successMessage.set(res.message);
        this.clearSelection();
        this.scanner()?.reset();
        this.load();
      },
      error: (err) => {
        this.busy.set(false);
        this.pendingBuggy.set(null);
        this.scanner()?.reset();
        this.errorMessage.set(err.error?.message || 'The buggy could not be issued.');
      },
    });
  }

  // ---- return / swap ----

  openReturn(i: GolfBuggyIssue): void {
    this.clearMessages();
    this.targetIssue.set(i);
    this.mode.set('return');
    this.returnForm.reset({ conditionIn: 'good', remarksIn: '', reasonType: 'player', playerId: i.riders.length === 1 ? i.riders[0].playerId : '' });
    this.dialogOpen.set(true);
  }

  openSwap(i: GolfBuggyIssue): void {
    this.clearMessages();
    this.targetIssue.set(i);
    this.mode.set('swap');
    this.swapForm.reset({ newCode: '', swapReason: '', swapHole: null, conditionIn: 'fault', remarksIn: '', reasonType: 'player', playerId: i.riders.length === 1 ? i.riders[0].playerId : '' });
    this.dialogOpen.set(true);
  }

  // The damage assessment to send when the condition is damaged (else null).
  private assessment(v: { conditionIn: GolfBuggyConditionIn; remarksIn: string; reasonType: GolfDamageReasonType; playerId: string }): GolfDamageAssessment | null {
    if (v.conditionIn !== 'damaged') return null;
    return { reasonType: v.reasonType, description: v.remarksIn.trim() || null, playerId: v.reasonType === 'player' && v.playerId ? v.playerId : null };
  }

  switchToSwap(): void {
    const i = this.targetIssue();
    if (i) this.openSwap(i);
  }

  closeDialog(): void {
    this.dialogOpen.set(false);
    this.scanner()?.reset();
  }

  ridersOf(i: GolfBuggyIssue): string {
    return i.riders.map((r) => r.playerName).join(' and ');
  }

  runReturn(): void {
    const i = this.targetIssue();
    if (!i) return;
    const v = this.returnForm.getRawValue();
    if (v.conditionIn !== 'good' && !v.remarksIn.trim()) {
      this.errorMessage.set('Describe the fault or damage.');
      return;
    }
    this.busy.set(true);
    this.service.returnBuggy({ issueId: i.id, conditionIn: v.conditionIn, remarksIn: v.remarksIn.trim() || null, damage: this.assessment(v) }).subscribe({
      next: (res) => { this.busy.set(false); this.dialogOpen.set(false); this.successMessage.set(res.message); this.scanner()?.reset(); this.load(); },
      error: (err) => { this.busy.set(false); this.errorMessage.set(err.error?.message || 'The buggy could not be returned.'); },
    });
  }

  runSwap(): void {
    const i = this.targetIssue();
    if (!i) return;
    if (this.swapForm.invalid) {
      this.swapForm.markAllAsTouched();
      return;
    }
    const v = this.swapForm.getRawValue();
    this.busy.set(true);
    this.service.swap({
      issueId: i.id,
      newBuggy: { code: v.newCode.trim() },
      swapReason: v.swapReason.trim(),
      swapHole: v.swapHole,
      conditionIn: v.conditionIn,
      remarksIn: v.remarksIn.trim() || null,
      damage: this.assessment(v),
    }).subscribe({
      next: (res) => { this.busy.set(false); this.dialogOpen.set(false); this.successMessage.set(res.message); this.scanner()?.reset(); this.load(); },
      error: (err) => { this.busy.set(false); this.errorMessage.set(err.error?.message || 'The buggy could not be swapped.'); },
    });
  }

  private clearMessages(): void {
    this.successMessage.set('');
    this.errorMessage.set('');
  }
}
